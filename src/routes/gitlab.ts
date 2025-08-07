import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { GitLabOAuthService } from '../services/oauth.js';
import { InstallationStore } from '../services/installation-store.js';
import { WebhookManager } from '../services/webhook-manager.js';
import { GitLabInstallation } from '../types/installation.js';
import { GitLabMergeRequestEvent } from '../gitlab/types.js';
import { GitLabClient } from '../gitlab/client.js';
import { QueueFullError } from '../review/review-queue.js';
import { Config, getConfig } from '../config.js';

const gitlab = new Hono();
const oauthService = new GitLabOAuthService();
const installationStore = new InstallationStore();
const webhookManager = new WebhookManager();

// Initialize config and client for webhook route
const config: Config = getConfig();
const gitlabClient = new GitLabClient(config);

// We'll need to receive the reviewQueue from the main server
let reviewQueue: any = null;

// Function to set the review queue from the main server
export function setReviewQueue(queue: any) {
  reviewQueue = queue;
}

/**
 * GitLab webhook endpoint
 */
gitlab.post('/webhook', async (c) => {
  try {
    console.log('Received GitLab webhook request');
    
    const payload = await c.req.json() as GitLabMergeRequestEvent;
    
    if (!payload) {
      return c.json({ error: 'No JSON payload' }, 400);
    }

    // Check if this is a merge request event we care about
    if (payload.object_kind !== 'merge_request') {
      console.log(`Ignoring non-merge_request event: ${payload.object_kind}`);
      return c.json({ message: 'Event ignored' }, 200);
    }

    // Check if this is an action we care about (opened, updated)
    const action = payload.object_attributes.action;
    if (!['open', 'reopen', 'update'].includes(action)) {
      console.log(`Ignoring MR action: ${action}`);
      return c.json({ message: 'Action ignored' }, 200);
    }

    console.log(`Processing MR ${payload.object_attributes.iid} action: ${action}`);

    // Look up installation for this project
    const projectId = payload.project.id;
    const installation = await installationStore.getInstallationByProjectId(projectId);
    
    let clientToUse = gitlabClient;
    
    if (installation) {
      // Use installation-specific client with OAuth token
      const installationConfig = { ...config };
      installationConfig.gitlab.token = installation.accessToken;
      clientToUse = new GitLabClient(installationConfig, installation, oauthService, installationStore);
      console.log(`Using OAuth token for project ${projectId}, installation ${installation.id}`);
    } else {
      console.log(`No installation found for project ${projectId}, using default configuration`);
    }

    if (!reviewQueue) {
      throw new Error('Review queue not initialized');
    }

    // Enqueue review job
    const jobId = reviewQueue.enqueueReview(clientToUse, payload);
    console.log(`Enqueued review job ${jobId}`);

    // Return immediate response
    return c.json({
      jobId,
      status: 'queued',
      message: 'Review job enqueued successfully'
    }, 202); // 202 Accepted

  } catch (error) {
    if (error instanceof QueueFullError) {
      const queueConfig = config.queue;
      console.warn(`Queue full: ${error.message}`);
      return c.json({
        error: 'Review queue is full',
        message: 'The system is currently overloaded. Please try again later.',
        retry_after: queueConfig.retry_after_seconds
      }, 503); // 503 Service Unavailable
    }

    console.error('Webhook error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

/**
 * Start OAuth flow - redirect to GitLab authorization
 */
gitlab.get('/install', async (c) => {
  const state = uuidv4();
  const authUrl = oauthService.getAuthorizationUrl(state);
  
  // Store state for validation (in production, use Redis or similar)
  c.set('oauth_state', state);
  
  // Redirect to GitLab authorization page
  return c.redirect(authUrl);
});

/**
 * Handle OAuth callback from GitLab
 */
gitlab.get('/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.text(`Authorization failed: ${error}`, 400);
    }

    if (!code) {
      return c.text('Authorization code not provided', 400);
    }

    // Exchange code for token
    const tokenResponse = await oauthService.exchangeCodeForToken(code);
    
    // Get user info
    const user = await oauthService.getUserInfo(tokenResponse.access_token);

    // Check if installation already exists
    let installation = await installationStore.getInstallationByUserId(user.id);
    
    if (!installation) {
      // Create new installation
      installation = {
        id: uuidv4(),
        gitlabUserId: user.id,
        gitlabUsername: user.username,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        scopes: tokenResponse.scope.split(' '),
        installedAt: new Date(),
      };
    } else {
      // Update existing installation
      installation.accessToken = tokenResponse.access_token;
      installation.refreshToken = tokenResponse.refresh_token;
      installation.lastUsed = new Date();
    }

    await installationStore.storeInstallation(installation);

    // Return success page with next steps
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitLab Code Review Agent - Installation Complete</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { color: #22c55e; }
            .info { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .code { background: #1f2937; color: #f9fafb; padding: 10px; border-radius: 5px; font-family: monospace; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Installation Complete!</h1>
          <p>Hello <strong>${user.name}</strong>, your GitLab Code Review Agent is now installed.</p>
          
          <div class="info">
            <h3>🚀 Next Steps:</h3>
            <ol>
              <li><strong>Choose a project:</strong> Go to any GitLab project you want to enable code reviews for</li>
              <li><strong>Set up webhook:</strong> Visit the project's webhook setup page</li>
              <li><strong>Use this URL:</strong> 
                <div class="code">${webhookManager.getWebhookUrl()}</div>
              </li>
              <li><strong>Enable merge request events</strong> in the webhook configuration</li>
            </ol>
          </div>

          <p><a href="/setup/${installation.id}">🔧 Automatic Project Setup</a> - Let us set up webhooks automatically</p>
          
          <div class="info">
            <strong>Installation ID:</strong> ${installation.id}<br>
            <strong>Connected as:</strong> ${user.username}
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.text('Installation failed. Please try again.', 500);
  }
});

/**
 * Project setup page - automatically configure webhooks
 */
gitlab.get('/setup/:installationId', async (c) => {
  const installationId = c.req.param('installationId');
  const installation = await installationStore.getInstallation(installationId);
  
  if (!installation) {
    return c.text('Installation not found', 404);
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Project Setup - GitLab Code Review Agent</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .form-group { margin: 15px 0; }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input, select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
          button { background: #3b82f6; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #2563eb; }
          .info { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>🔧 Project Setup</h1>
        <p>Automatically configure code reviews for your GitLab project.</p>
        
        <form action="/gitlab/setup" method="post">
          <input type="hidden" name="installationId" value="${installationId}">
          
          <div class="form-group">
            <label for="projectId">GitLab Project ID:</label>
            <input type="number" id="projectId" name="projectId" required 
                   placeholder="e.g., 12345 (found in project settings)">
          </div>
          
          <div class="form-group">
            <label for="setupType">Setup Type:</label>
            <select id="setupType" name="setupType">
              <option value="project">Project Webhook (recommended)</option>
              <option value="group">Group Webhook (all projects in group)</option>
            </select>
          </div>
          
          <button type="submit">🚀 Setup Code Reviews</button>
        </form>

        <div class="info">
          <strong>How to find your Project ID:</strong><br>
          1. Go to your GitLab project<br>
          2. Look at Settings → General<br>
          3. The Project ID is shown at the top
        </div>
      </body>
    </html>
  `);
});

/**
 * Handle project setup form submission
 */
gitlab.post('/setup', async (c) => {
  try {
    const formData = await c.req.formData();
    const installationId = formData.get('installationId') as string;
    const projectId = parseInt(formData.get('projectId') as string);
    const setupType = formData.get('setupType') as string;

    const installation = await installationStore.getInstallation(installationId);
    if (!installation) {
      return c.text('Installation not found', 404);
    }

    // Generate webhook token
    const webhookToken = webhookManager.generateWebhookToken();
    
    // Create webhook
    const webhookConfig = {
      url: webhookManager.getWebhookUrl(),
      token: webhookToken,
      merge_request_events: true,
      push_events: false,
      issues_events: false,
    };

    console.log('Webhook config being passed:', webhookConfig);

    let webhookId: number;
    
    if (setupType === 'group') {
      webhookId = await webhookManager.createGroupWebhook(
        projectId, 
        installation.accessToken, 
        webhookConfig
      );
      installation.groupId = projectId;
    } else {
      webhookId = await webhookManager.createProjectWebhook(
        projectId, 
        installation.accessToken, 
        webhookConfig
      );
      installation.projectId = projectId;
    }

    // Update installation with webhook info
    installation.webhookId = webhookId;
    await installationStore.storeInstallation(installation);

    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Setup Complete - GitLab Code Review Agent</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { color: #22c55e; }
            .info { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Setup Complete!</h1>
          <p>Your GitLab ${setupType} is now configured for automatic code reviews.</p>
          
          <div class="info">
            <strong>What happens next:</strong><br>
            • Create a merge request in your project<br>
            • The Code Review Agent will automatically analyze the changes<br>
            • Review comments will appear in your merge request<br>
            • Commit status will show review completion
          </div>

          <p><a href="/dashboard/${installationId}">📊 View Dashboard</a></p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Setup error:', error);
    return c.text(`Setup failed: ${error.message}`, 500);
  }
});

export { gitlab };
