# GitLab Code Review Agent

A TypeScript Hono.js server that automatically performs code reviews on GitLab merge requests using Amp AI. Now available as both a GitLab OAuth App and traditional webhook service.

## Features

- **GitLab OAuth App**: Easy one-click installation for users with automatic webhook setup
- **Traditional Webhooks**: Manual webhook configuration for advanced users
- **Amp AI Reviews**: Uses Sourcegraph Amp for intelligent code analysis with MCP tools
- **Async Queue**: Non-blocking job processing with configurable concurrency and retry logic
- **Multi-tenant**: Supports multiple GitLab users and organizations
- **MCP Integration**: Model Context Protocol support for external tool integration
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

### Core Configuration
- `SERVER_PORT`: Server port (default: 5052)
- `SERVER_DEBUG`: Enable debug mode (default: true)
- `APP_BASE_URL`: Public URL for the application (required for OAuth)

### GitLab Configuration
- `GITLAB_BASE_URL`: GitLab instance URL (default: https://gitlab.com)
- `GITLAB_TOKEN`: GitLab personal access token (for webhook mode)
- `GITLAB_CLIENT_ID`: OAuth application client ID (for app mode)
- `GITLAB_CLIENT_SECRET`: OAuth application client secret (for app mode)
- `GITLAB_REDIRECT_URI`: OAuth redirect URI (for app mode)

### Amp & MCP Configuration
- `AMP_TIMEOUT`: Amp review timeout in seconds (default: 300)
- `AMP_SERVER_URL`: Amp server URL (default: https://ampcode.com)
- `MCP_AUTH_TOKEN`: MCP authentication token for tool integration
- `CRA_PUBLIC_URL`: Public URL for MCP integration

## Installation Methods

### Option 1: GitLab OAuth App (Recommended)
1. Deploy the server with OAuth environment variables
2. Users visit `https://your-domain.com/gitlab/install`
3. Users authorize the app and auto-configure projects
4. Webhooks are set up automatically

### Option 2: Manual Webhook Setup
1. Go to your GitLab project → Settings → Webhooks
2. Add webhook URL: `https://your-server:5052/gitlab/webhook`
3. Select trigger: "Merge request events"
4. Save the webhook

## API Endpoints

### Core Service
- `GET /` - Service information and endpoint listing
- `GET /health` - Health check
- `GET /queue/status` - Queue statistics and worker info
- `GET /jobs/:jobId` - Individual job status
- `POST /test/review` - Test review functionality

### GitLab Integration
- `GET /gitlab/install` - Start OAuth installation flow
- `GET /gitlab/callback` - Handle OAuth callback
- `GET /gitlab/setup/:id` - Project setup page
- `POST /gitlab/setup` - Configure project webhooks
- `POST /gitlab/webhook` - Webhook receiver (multi-tenant)

### MCP (Model Context Protocol)
- `GET /mcp/health` - MCP service health check
- `GET /mcp/tools/list` - List available MCP tools
- `POST /mcp/tools/call` - Call MCP tools
- `POST /mcp/` - JSON-RPC protocol endpoint

## Configuration

The `config.yml` file controls:

- **GitLab API settings**: Base URL, authentication, status reporting, bot configuration
- **Amp configuration**: Command, timeout, prompt template, MCP server integration
- **Queue settings**: Max workers, queue size, retry behavior
- **Server settings**: Port, debug mode, and environment-based configuration
- **Tool definitions**: Available MCP tools for code review (leave_general_comment, leave_inline_comment, post_commit_status, get_mr_info, trigger_review, get_mr_comments)

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript  
- `npm start` - Start production server
- `npm run mcp` - Start standalone MCP server for testing
- `npm run mcp:build` - Build and start MCP server
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm test` - Run tests with Vitest

## Architecture

The service provides both OAuth App and traditional webhook modes:

### OAuth App Mode (Multi-tenant)
1. **OAuth Flow**: Users authorize via GitLab OAuth, tokens stored per-installation
2. **Automatic Setup**: Webhooks created automatically via API
3. **Multi-tenant**: Supports multiple users and organizations

### Webhook Processing (Both Modes)
1. **Webhook Receiver**: Hono.js routes handle incoming GitLab webhooks
2. **Job Queue**: Async processing prevents webhook timeouts (202 responses)
3. **Amp Integration**: Amp AI reviews code with MCP tools for GitLab interaction
4. **GitLab Updates**: Comments and commit statuses posted via MCP tools

### MCP Integration
1. **Tool Registry**: Provides get_mr_info, leave_general_comment, leave_inline_comment, post_commit_status, trigger_review, get_mr_comments
2. **Authentication**: Bearer token authentication for external access
3. **Protocol Support**: Both REST API and JSON-RPC protocols

## Error Handling

- Webhook timeouts are prevented by immediate 202 Accepted responses
- Queue overflow returns 503 Service Unavailable with retry timing
- Failed reviews post error commit statuses to GitLab
- Partial failures are handled gracefully with detailed logging

## Monitoring

Check these endpoints for service health:

- `/health` - Basic health check with service status
- `/queue/status` - Queue metrics, worker info, and job counts
- `/mcp/health` - MCP service health and tool availability
- Server logs for detailed debugging information

## Related Documentation

- See [README-GITLAB-APP.md](./README-GITLAB-APP.md) for detailed GitLab OAuth App setup
- Configuration examples in `config.yml`
- Environment variables template in `.env.example`
