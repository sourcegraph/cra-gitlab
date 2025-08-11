# GitLab OAuth App Setup Guide

This guide shows how to set up the GitLab Code Review Agent as a GitLab OAuth application that users can easily install and configure.

## 1. Create GitLab OAuth Application

1. Go to GitLab.com → User Settings → Applications
2. Create a new application with:
   - **Name**: `Code Review Agent`
   - **Redirect URI**: `https://your-domain.com/gitlab/callback`
   - **Scopes**: `api` (full API access for webhook management and code review)
   - **Trusted**: Check this box for seamless authorization
3. Save the Application ID and Secret

## 2. Deploy the Application

### Environment Variables

```bash
# Server Configuration
APP_BASE_URL=https://your-id.ngrok-free.app
SERVER_PORT=5052
SERVER_DEBUG=true

# GitLab OAuth Configuration
GITLAB_BASE_URL=https://gitlab.com
GITLAB_CLIENT_ID=your_gitlab_app_client_id
GITLAB_CLIENT_SECRET=your_gitlab_app_client_secret
GITLAB_REDIRECT_URI=https://your-id.ngrok-free.app/gitlab/callback

# Amp & MCP Configuration
AMP_SERVER_URL=https://ampcode.com
AMP_TIMEOUT=300
MCP_AUTH_TOKEN=your_mcp_secret
CRA_PUBLIC_URL=https://your-id.ngrok-free.app

# Optional: Personal Access Token (for webhook-only mode)
GITLAB_TOKEN=your_gitlab_pat
```

### Deploy Options

**Option A: Docker (Recommended)**
```bash
docker build -t gitlab-cra .
docker run -p 5052:5052 --env-file .env gitlab-cra
```

**Option B: Docker Compose**
```bash
docker-compose up -d
```

**Option C: Railway/Heroku**
```bash
git push railway main
# or
git push heroku main
```

**Option D: VPS/Server**
```bash
npm install
npm run build
npm start
```

## 3. User Installation Flow

Users can now install your app by visiting:
```
https://your-domain.com/gitlab/install
```

### Installation Process:
1. User clicks "Install App"
2. Redirected to GitLab authorization
3. User authorizes the app
4. Redirected back with setup instructions
5. User can auto-configure projects via web UI

## 4. Architecture Overview

### OAuth App Mode
- **OAuth-based installation**: Users authorize via GitLab OAuth flow
- **Per-user token storage**: Each installation has its own access/refresh tokens
- **Automatic webhook configuration**: Webhooks created via API during setup
- **Multi-tenant support**: Multiple users and organizations supported
- **Token refresh**: Automatic refresh token handling for expired tokens

### Backward Compatibility
- **Webhook-only mode**: Still supports traditional personal access token setup
- **Dual operation**: Both OAuth and webhook modes can run simultaneously
- **Gradual migration**: Existing webhook users can migrate at their own pace

## 5. Features

✅ **OAuth 2.0 Integration** - Secure token-based authentication  
✅ **Multi-tenant** - Supports multiple GitLab users/organizations  
✅ **Automatic Setup** - Web UI for easy project configuration  
✅ **Token Management** - Handles token refresh automatically  
✅ **Backward Compatible** - Still works with personal access tokens  

## 6. API Endpoints

### OAuth & Installation
- `GET /gitlab/install` - Start OAuth installation flow
- `GET /gitlab/callback` - Handle OAuth authorization callback
- `GET /gitlab/setup/:installationId` - Project configuration page (HTML form)
- `POST /gitlab/setup` - Process project setup and create webhooks

### Webhooks & Reviews
- `POST /gitlab/webhook` - Multi-tenant webhook receiver
- `GET /queue/status` - Review queue status and metrics
- `GET /jobs/:jobId` - Individual review job status

### MCP Integration
- `GET /mcp/health` - MCP service health check
- `GET /mcp/tools/list` - List available review tools (get_mr_info, leave_general_comment, leave_inline_comment, post_commit_status, trigger_review, get_mr_comments)
- `POST /mcp/tools/call` - Execute review tools
- `POST /mcp/` - JSON-RPC protocol endpoint

## 7. Database Schema

Installations are stored in JSON format:

```json
{
  "id": "uuid",
  "gitlabUserId": 12345,
  "gitlabUsername": "user",
  "accessToken": "oauth_token",
  "refreshToken": "refresh_token",
  "scopes": ["api"],
  "installedAt": "2025-01-01T00:00:00Z",
  "webhookId": 67890,
  "projectId": 123
}
```

## 8. Production Considerations

### Infrastructure
1. **Database**: Replace file-based storage with PostgreSQL/MySQL for installations
2. **Redis**: Use Redis for job queue and session management  
3. **HTTPS**: Always use HTTPS in production (required for OAuth)
4. **Load Balancing**: Use reverse proxy (nginx/cloudflare) for high availability

### Security & Monitoring  
5. **Rate Limiting**: Implement rate limiting for webhook and OAuth endpoints
6. **Monitoring**: Add health checks, metrics, and alerting (`/health`, `/queue/status`, `/mcp/health`)
7. **Logging**: Structured logging with log aggregation
8. **Secrets Management**: Use environment-specific secret management (MCP_AUTH_TOKEN, OAuth secrets)

### Performance
9. **Queue Scaling**: Scale review workers based on queue depth (max 20 workers, 100 queue size)
10. **Token Refresh**: Implement robust token refresh and retry logic

## 9. Marketplace Submission

To submit to GitLab marketplace:

1. **Prepare Assets**:
   - App icon (512x512 PNG)
   - Screenshots
   - Description and documentation

2. **Create Listing**:
   - Go to GitLab Partner Portal
   - Submit application for review
   - Provide OAuth app details

3. **Review Process**:
   - GitLab reviews security and functionality
   - May require additional documentation
   - Approval typically takes 2-4 weeks

## 10. Migration Strategy

### For Existing Webhook Users

**Phase 1: Parallel Operation**
- Deploy OAuth app alongside existing webhook service
- Both modes supported simultaneously
- No disruption to existing users

**Phase 2: User Communication**  
- Notify users about OAuth app benefits
- Provide migration documentation
- Offer migration assistance

**Phase 3: Gradual Migration**
- Users migrate at their own pace
- Support both modes indefinitely
- Monitor adoption metrics

### Migration Benefits
- ✅ **Easier Setup**: One-click installation vs manual webhook configuration
- ✅ **Better Security**: OAuth tokens vs long-lived personal access tokens  
- ✅ **Auto-Updates**: Webhooks managed automatically
- ✅ **Multi-Project**: Easy setup across multiple projects

## Troubleshooting

### Installation Issues
**"Installation not found"**
- User needs to complete OAuth flow first
- Check installation storage and file permissions
- Verify `APP_BASE_URL` matches deployment URL

**"OAuth error"**
- Verify redirect URI matches exactly (`https://your-domain.com/gitlab/callback`)
- Check client ID/secret configuration
- Ensure HTTPS is enabled in production

### Webhook Issues  
**"Webhook creation failed"**
- Verify user has Maintainer/Owner permissions on the project
- Check project ID is correct and accessible
- Ensure GitLab API is reachable from deployment

**"Review not triggered"**
- Check webhook events include "Merge request events"  
- Verify webhook URL is accessible from GitLab
- Check server logs for webhook delivery errors

### MCP Issues
**"MCP tools not working"**
- Verify `MCP_AUTH_TOKEN` is set and matches client
- Check `CRA_PUBLIC_URL` is accessible externally
- Test `/mcp/health` endpoint directly
