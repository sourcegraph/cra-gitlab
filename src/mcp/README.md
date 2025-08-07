# GitLab MCP Server

This directory contains the Model Context Protocol (MCP) server implementation for GitLab integration. The server exposes GitLab operations as tools that can be used by AI agents and code editors like Cursor.

## Available Tools

### 1. `leave_comment`
Leave comments or code suggestions on merge requests.

**Parameters:**
- `message` (string, required): The comment message
- `project_id` (number, required): GitLab project ID
- `mr_iid` (number, required): Merge request IID
- `path` (string, optional): File path for inline comments
- `line` (number, optional): Line number for inline comments
- `line_type` (string, optional): Type of line - "ADDED", "REMOVED", or "CONTEXT"
- `base_sha` (string, optional): Base commit SHA for inline comments
- `start_sha` (string, optional): Start commit SHA for inline comments
- `head_sha` (string, optional): Head commit SHA for inline comments

### 2. `post_commit_status`
Update commit status in GitLab.

**Parameters:**
- `project_id` (number, required): GitLab project ID
- `commit_sha` (string, required): Commit SHA to update status for
- `state` (string, required): Status state - "success", "failed", "running", "pending", or "canceled"
- `description` (string, optional): Status description
- `context` (string, optional): Status context
- `target_url` (string, optional): Target URL for the status

### 3. `get_mr_info`
Get merge request details and optionally the diff.

**Parameters:**
- `project_id` (number, required): GitLab project ID
- `mr_iid` (number, required): Merge request IID
- `include_diff` (boolean, optional): Include diff content (default: false)

### 4. `trigger_review`
Start the code review process.

**Parameters:**
- `project_id` (number, required): GitLab project ID
- `mr_iid` (number, required): Merge request IID
- `commit_sha` (string, optional): Specific commit SHA to review
- `force` (boolean, optional): Force re-review even if already reviewed (default: false)

## Usage

### HTTP Server (for mcp-remote)

The MCP server is exposed via HTTP endpoints at `/mcp` when the main server is running.

**Endpoints:**
- `GET /mcp/tools/list` - List available tools
- `POST /mcp/tools/call` - Call a tool
- `GET /mcp/health` - Health check

**Authentication:**
Set the `MCP_AUTH_TOKEN` environment variable and include it in requests:
```
Authorization: Bearer <your-token>
```

**Usage with mcp-remote:**
```bash
npx mcp-remote http://localhost:5050/mcp --header "Authorization: Bearer your-token"
```

### Standalone STDIO Server

Run the standalone MCP server for direct stdio communication:

```bash
npm run mcp
```

Or build and run:
```bash
npm run mcp:build
```

## Configuration

The server uses the same configuration as the main application. Make sure your `config.yml` and environment variables are properly set:

- `GITLAB_BASE_URL` - Your GitLab instance URL
- `GITLAB_TOKEN` - GitLab access token
- `MCP_AUTH_TOKEN` - Token for MCP server authentication (optional)

## Integration with AI Agents

### Cursor Configuration

Add to your Cursor settings:

```json
{
  "mcp.servers": {
    "gitlab": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote", 
        "http://localhost:5050/mcp",
        "--header",
        "Authorization: Bearer your-mcp-token"
      ]
    }
  }
}
```

### Example Usage in Prompts

```
You have access to GitLab tools. To review a merge request:

1. Use get_mr_info to understand the context
2. Review the code changes  
3. Use leave_comment to add inline feedback
4. Use post_commit_status to mark the review complete

Project ID: 123
MR IID: 456
```

## Development

The tools are organized in the `/src/mcp/tools/` directory:
- `leave_comment.ts` - Comment functionality
- `post_commit_status.ts` - Status updates
- `get_mr_info.ts` - MR information retrieval  
- `trigger_review.ts` - Review triggering

The server implementations are:
- `server.ts` - Standalone stdio MCP server
- `http-server.ts` - HTTP adapter for mcp-remote
