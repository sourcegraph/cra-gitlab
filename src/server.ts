// Load environment variables first
import 'dotenv/config';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { Config, getConfig } from './config.js';
import { GitLabClient } from './gitlab/client.js';
import { ReviewJobQueue } from './review/review-queue.js';
import { reviewDiff } from './review/reviewer.js';
import { MRDetails } from './gitlab/types.js';
import { gitlab, setReviewQueue } from './routes/gitlab.js';
import { InstallationStore } from './services/installation-store.js';
import { GitLabOAuthService } from './services/oauth.js';
import { createMCPRoutes } from './mcp/http-server.js';

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

// Set the review queue for the gitlab routes
setReviewQueue(reviewQueue);

// Mount GitLab routes (including OAuth and webhook)
app.route('/gitlab', gitlab);

// Mount MCP routes
app.route('/mcp', createMCPRoutes());

// Routes
app.get('/', (c) => {
  return c.json({
    service: 'GitLab Code Review Agent',
    version: '2.0.0',
    mode: 'GitLab App',
    endpoints: {
      install: '/gitlab/install',
      webhook: '/gitlab/webhook',
      health: '/health',
      queue_status: '/queue/status',
      mcp: '/mcp'
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
