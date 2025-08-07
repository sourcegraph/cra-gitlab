// Load environment variables first
import 'dotenv/config';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { GitLabMergeRequestEvent } from './gitlab/types.js';
import { Config, getConfig } from './config.js';
import { GitLabClient } from './gitlab/client.js';
import { ReviewJobQueue, QueueFullError } from './review/review-queue.js';
import { reviewDiff } from './review/reviewer.js';
import { MRDetails } from './gitlab/types.js';
import { oauth } from './routes/oauth.js';
import { InstallationStore } from './services/installation-store.js';
import { GitLabOAuthService } from './services/oauth.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());
app.use('*', prettyJSON());

// Initialize components
const config: Config = getConfig();
const installationStore = new InstallationStore();
const oauthService = new GitLabOAuthService();

// For backward compatibility, keep the default GitLab client
const gitlabClient = new GitLabClient(config);

const queueConfig = config.queue;
const reviewQueue = new ReviewJobQueue(
  gitlabClient,
  config,
  queueConfig.max_queue_size
);

// Mount OAuth routes
app.route('/oauth', oauth);

// Routes
app.get('/', (c) => {
  return c.json({
    service: 'GitLab Code Review Agent',
    version: '2.0.0',
    mode: 'GitLab App',
    endpoints: {
      install: '/oauth/install',
      webhook: '/gitlab/webhook',
      health: '/health',
      queue_status: '/queue/status'
    }
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'gitlab-code-review-agent',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// GitLab webhook endpoint
app.post('/gitlab/webhook', async (c) => {
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

// Queue status endpoint
app.get('/queue/status', (c) => {
  const stats = reviewQueue.getQueueStats();
  return c.json(stats);
});

// Job status endpoint
app.get('/jobs/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const jobInfo = reviewQueue.getJobStatus(jobId);
  
  if (!jobInfo) {
    return c.json({ error: 'Job not found' }, 404);
  }
  
  return c.json(jobInfo);
});

// Test endpoint for reviewDiff function
app.post('/test/review', async (c) => {
  try {
    const body = await c.req.json();
    const { diffContent, mrDetails } = body;
    
    if (!diffContent || !mrDetails) {
      return c.json({ error: 'Missing diffContent or mrDetails' }, 400);
    }
    
    const result = await reviewDiff(diffContent, mrDetails as MRDetails);
    
    return c.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Test review error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Error handling
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    error: 'Internal server error',
    message: err.message
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not found',
    message: 'The requested endpoint was not found'
  }, 404);
});

// Start server
const serverConfig = config.server;
const port = Number(serverConfig.port) || 5050;

console.log(`Starting GitLab Code Review Agent on port ${port}`);
console.log(`Debug mode: ${serverConfig.debug}`);

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`🚀 Server running at http://localhost:${info.port}`);
});

export default app;
