# GitLab App Setup Guide

This guide shows how to set up the GitLab Code Review Agent as a proper GitLab app that users can install.

## 1. Create GitLab OAuth Application

1. Go to GitLab.com → User Settings → Applications
2. Create a new application with:
   - **Name**: `Code Review Agent`
   - **Redirect URI**: `http://your-domain.com/oauth/callback`
   - **Scopes**: `api` (full API access)
3. Save the Client ID and Client Secret

## 2. Deploy the Application

### Environment Variables

```bash
# GitLab OAuth Configuration
GITLAB_CLIENT_ID=your_gitlab_app_client_id
GITLAB_CLIENT_SECRET=your_gitlab_app_client_secret
GITLAB_REDIRECT_URI=https://your-domain.com/oauth/callback

# Server Configuration
APP_BASE_URL=https://your-domain.com
SERVER_PORT=5051

# Amp Configuration
AMP_SERVER_URL=https://ampcode.com
MCP_AUTH_TOKEN=your_mcp_auth_token
CRA_PUBLIC_URL=https://your-domain.com
```

### Deploy Options

**Option A: Railway/Heroku**
```bash
git push heroku main
```

**Option B: Docker**
```bash
docker build -t gitlab-cra .
docker run -p 5051:5051 --env-file .env gitlab-cra
```

**Option C: VPS**
```bash
npm run build
npm start
```

## 3. User Installation Flow

Users can now install your app by visiting:
```
https://your-domain.com/oauth/install
```

### Installation Process:
1. User clicks "Install App"
2. Redirected to GitLab authorization
3. User authorizes the app
4. Redirected back with setup instructions
5. User can auto-configure projects via web UI

## 4. Architecture Changes

### Before (Webhook Service)
- Manual webhook setup per project
- Single GitLab token for all users
- Users configure webhooks themselves

### After (GitLab App)
- OAuth-based installation
- Per-user token storage
- Automatic webhook configuration
- Multi-tenant support

## 5. Features

✅ **OAuth 2.0 Integration** - Secure token-based authentication  
✅ **Multi-tenant** - Supports multiple GitLab users/organizations  
✅ **Automatic Setup** - Web UI for easy project configuration  
✅ **Token Management** - Handles token refresh automatically  
✅ **Backward Compatible** - Still works with personal access tokens  

## 6. API Endpoints

- `GET /oauth/install` - Start installation flow
- `GET /oauth/callback` - OAuth callback handler
- `GET /oauth/setup/:id` - Project setup page
- `POST /oauth/setup` - Configure webhooks
- `POST /gitlab/webhook` - Webhook receiver (multi-tenant)

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

1. **Database**: Replace file storage with PostgreSQL/MySQL
2. **Redis**: Use Redis for session state management
3. **HTTPS**: Always use HTTPS in production
4. **Monitoring**: Add health checks and metrics
5. **Rate Limiting**: Implement rate limiting for API endpoints

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

## 10. Migration from Webhook Service

For existing webhook service users:

1. **Parallel Deployment**: Run both versions temporarily
2. **User Communication**: Notify users about the new app
3. **Migration Tool**: Provide tool to migrate existing webhooks
4. **Sunset Timeline**: Give users time to migrate (30-60 days)

## Troubleshooting

**"Installation not found"**
- User needs to complete OAuth flow first
- Check installation storage

**"Webhook creation failed"**
- Verify user has maintainer/owner permissions
- Check project ID is correct

**"OAuth error"**
- Verify redirect URI matches exactly
- Check client ID/secret configuration
