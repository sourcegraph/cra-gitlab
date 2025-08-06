# GitLab Code Review Agent

A TypeScript Hono.js server that automatically performs code reviews on GitLab merge requests using Amp AI.

## Features

- **GitLab Integration**: Listens for merge request webhooks and reviews code changes
- **Amp AI Reviews**: Uses Sourcegraph Amp for intelligent code analysis
- **Multi-threaded Processing**: Handles large diffs by splitting them into manageable chunks
- **Async Queue**: Non-blocking job processing with configurable concurrency
- **TypeScript**: Full type safety and modern JavaScript features
- **Hono.js**: Fast, lightweight web framework

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your GitLab token and other settings
   ```

3. **Update config.yml**:
   - Set your GitLab base URL and authentication
   - Configure Amp settings
   - Adjust queue and diff splitting parameters

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Build for production**:
   ```bash
   npm run build
   npm start
   ```

## Environment Variables

- `GITLAB_BASE_URL`: GitLab instance URL (default: https://gitlab.com)
- `GITLAB_TOKEN`: GitLab personal access token with API access
- `SERVER_PORT`: Server port (default: 5051)
- `SERVER_DEBUG`: Enable debug mode (default: true)
- `AMP_TIMEOUT`: Amp review timeout in seconds (default: 300)
- `AMP_SERVER_URL`: Amp server URL (default: https://ampcode.com)
- `MCP_AUTH_TOKEN`: MCP authentication token
- `CRA_PUBLIC_URL`: Public URL for MCP integration

## GitLab Webhook Setup

1. Go to your GitLab project → Settings → Webhooks
2. Add webhook URL: `http://your-server:5051/gitlab/webhook`
3. Select trigger: "Merge request events"
4. Save the webhook

## API Endpoints

- `GET /` - Service information
- `GET /health` - Health check
- `POST /gitlab/webhook` - GitLab webhook handler
- `GET /queue/status` - Queue statistics
- `GET /jobs/:jobId` - Job status

## Configuration

The `config.yml` file controls:

- **GitLab API settings**: Base URL, authentication, status reporting
- **Amp configuration**: Command, timeout, prompt template
- **Queue settings**: Max workers, queue size, retry behavior
- **Diff splitting**: Chunk size and concurrency limits

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm test` - Run tests

## Architecture

The service follows the same architecture as the Bitbucket version:

1. **Webhook Receiver**: Hono.js routes handle incoming GitLab webhooks
2. **Job Queue**: Async processing prevents webhook timeouts
3. **Diff Splitter**: Large diffs are split into manageable chunks
4. **Amp Integration**: Each chunk is reviewed by Amp AI
5. **Result Aggregation**: Multiple review results are combined
6. **GitLab Updates**: Commit statuses and comments are posted back

## Error Handling

- Webhook timeouts are prevented by immediate 202 Accepted responses
- Queue overflow returns 503 Service Unavailable with retry timing
- Failed reviews post error commit statuses to GitLab
- Partial failures are handled gracefully with detailed logging

## Monitoring

Check these endpoints for service health:

- `/health` - Basic health check
- `/queue/status` - Queue metrics and job counts
- Server logs for detailed debugging information
