import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { getConfig, Config } from "../config.js";
import { GitLabClient } from "../gitlab/client.js";
import { leaveGeneralComment } from "./tools/leave_comment.js";
import { leaveInlineComment } from "./tools/leave_inline_comment.js";
import { postCommitStatus } from "./tools/post_commit_status.js";
import { getMRInfo } from "./tools/get_mr_info.js";
import { triggerReview } from "./tools/trigger_review.js";
import { getMRComments } from "./tools/get_mr_comments.js";
import {
  validateLeaveGeneralCommentArgs,
  validateLeaveInlineCommentArgs,
  validatePostCommitStatusArgs,
  validateGetMRInfoArgs,
  validateTriggerReviewArgs,
  validateGetMRCommentsArgs,
} from "./validation.js";

export function createMCPRoutes(): Hono {
  const app = new Hono();
  const config = getConfig();

  // CORS middleware for MCP endpoints
  app.use(
    "*",
    cors({
      origin: ["*"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })
  );

  // Middleware to validate Authorization header
  const authMiddleware = async (c: any, next: any) => {
    const authHeader = c.req.header("Authorization");
    const expectedToken = process.env.MCP_AUTH_TOKEN;

    if (!expectedToken) {
      console.warn("⚠️  MCP_AUTH_TOKEN not set, skipping auth check");
      await next();
      return;
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ Missing or invalid Authorization header");
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    if (token !== expectedToken) {
      console.log("❌ Token mismatch");
      return c.json({ error: "Invalid token" }, 401);
    }

    console.log("✅ Authentication successful");
    await next();
  };

  app.use("*", authMiddleware);

  // Create GitLab client (we'll use default config for now)
  const gitlabClient = new GitLabClient(config);

  // List tools endpoint
  app.get("/tools/list", async (c) => {
    try {
      const tools = [
        {
          name: "leave_general_comment",
          description: "Leave general comments on merge requests",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The comment message",
              },
              project_id: {
                type: "number",
                description: "GitLab project ID",
              },
              mr_iid: {
                type: "number",
                description: "Merge request IID",
              },
            },
            required: ["message", "project_id", "mr_iid"],
          },
        },
        {
          name: "leave_inline_comment",
          description:
            "Leave inline comments on specific lines in merge requests",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The comment message",
              },
              project_id: {
                type: "number",
                description: "GitLab project ID",
              },
              mr_iid: {
                type: "number",
                description: "Merge request IID",
              },
              path: {
                type: "string",
                description: "File path for the inline comment",
              },
              line: {
                type: "number",
                description: "Line number for the inline comment",
              },
              line_type: {
                type: "string",
                enum: ["new", "old"],
                description: "Type of line (new or old)",
              },
              base_sha: {
                type: "string",
                description:
                  "Base commit SHA (optional - will be fetched if not provided)",
              },
              start_sha: {
                type: "string",
                description:
                  "Start commit SHA (optional - will be fetched if not provided)",
              },
              head_sha: {
                type: "string",
                description:
                  "Head commit SHA (optional - will be fetched if not provided)",
              },
            },
            required: [
              "message",
              "project_id",
              "mr_iid",
              "path",
              "line",
              "line_type",
            ],
          },
        },
        {
          name: "post_commit_status",
          description: "Update commit status",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "number",
                description: "GitLab project ID",
              },
              commit_sha: {
                type: "string",
                description: "Commit SHA to update status for",
              },
              state: {
                type: "string",
                enum: ["success", "failed", "running", "pending", "canceled"],
                description: "Status state",
              },
              description: {
                type: "string",
                description: "Status description (optional)",
              },
              context: {
                type: "string",
                description: "Status context (optional)",
              },
              target_url: {
                type: "string",
                description: "Target URL for the status (optional)",
              },
            },
            required: ["project_id", "commit_sha", "state"],
          },
        },
        {
          name: "get_mr_info",
          description: "Get merge request details",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "number",
                description: "GitLab project ID",
              },
              mr_iid: {
                type: "number",
                description: "Merge request IID",
              },
              include_diff: {
                type: "boolean",
                description: "Include diff content (optional, default: false)",
                default: false,
              },
            },
            required: ["project_id", "mr_iid"],
          },
        },
        {
          name: "trigger_review",
          description: "Start code review process",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "number",
                description: "GitLab project ID",
              },
              mr_iid: {
                type: "number",
                description: "Merge request IID",
              },
              commit_sha: {
                type: "string",
                description: "Specific commit SHA to review (optional)",
              },
              force: {
                type: "boolean",
                description:
                  "Force re-review even if already reviewed (optional)",
                default: false,
              },
            },
            required: ["project_id", "mr_iid"],
          },
        },
        {
          name: "get_mr_comments",
          description: "Get all comments on a merge request",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "number",
                description: "GitLab project ID",
              },
              mr_iid: {
                type: "number",
                description: "Merge request IID",
              },
            },
            required: ["project_id", "mr_iid"],
          },
        },
      ];

      return c.json({ tools });
    } catch (error) {
      console.error("Error listing tools:", error);
      return c.json({ error: "Failed to list tools" }, 500);
    }
  });

  // Call tool endpoint
  app.post("/tools/call", async (c) => {
    try {
      const body = await c.req.json();
      const { name, arguments: args } = body;

      let result;
      switch (name) {
        case "leave_general_comment":
          result = await leaveGeneralComment(
            validateLeaveGeneralCommentArgs(args),
            config,
            gitlabClient
          );
          break;

        case "leave_inline_comment":
          result = await leaveInlineComment(
            validateLeaveInlineCommentArgs(args),
            config,
            gitlabClient
          );
          break;

        case "post_commit_status":
          result = await postCommitStatus(
            validatePostCommitStatusArgs(args),
            config,
            gitlabClient
          );
          break;

        case "get_mr_info":
          result = await getMRInfo(
            validateGetMRInfoArgs(args),
            config,
            gitlabClient
          );
          break;

        case "trigger_review":
          result = await triggerReview(
            validateTriggerReviewArgs(args),
            config,
            gitlabClient
          );
          break;

        case "get_mr_comments":
          result = await getMRComments(
            validateGetMRCommentsArgs(args),
            config,
            gitlabClient
          );
          break;

        default:
          return c.json({ error: `Unknown tool: ${name}` }, 400);
      }

      return c.json({
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (error) {
      console.error("Error calling tool:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Tool execution failed: ${errorMessage}` }, 500);
    }
  });

  // Handle MCP JSON-RPC protocol messages at root
  app.post("/", async (c) => {
    let request: any;
    try {
      request = await c.req.json();
      console.log("📨 MCP Request:", JSON.stringify(request, null, 2));

      // Handle MCP protocol messages
      if (request.method === "initialize") {
        return c.json({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "gitlab-cra",
              version: "1.0.0",
            },
          },
        });
      }

      if (request.method === "tools/list") {
        const tools = [
          {
            name: "leave_general_comment",
            description: "Leave general comments on merge requests",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "The comment message" },
                project_id: {
                  type: "number",
                  description: "GitLab project ID",
                },
                mr_iid: { type: "number", description: "Merge request IID" },
              },
              required: ["message", "project_id", "mr_iid"],
            },
          },
          {
            name: "leave_inline_comment",
            description:
              "Leave inline comments on specific lines in merge requests",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "The comment message" },
                project_id: {
                  type: "number",
                  description: "GitLab project ID",
                },
                mr_iid: { type: "number", description: "Merge request IID" },
                path: {
                  type: "string",
                  description: "File path for the inline comment",
                },
                line: {
                  type: "number",
                  description: "Line number for the inline comment",
                },
                line_type: {
                  type: "string",
                  enum: ["new", "old"],
                  description: "Type of line (new or old)",
                },
                base_sha: {
                  type: "string",
                  description:
                    "Base commit SHA (optional - will be fetched if not provided)",
                },
                start_sha: {
                  type: "string",
                  description:
                    "Start commit SHA (optional - will be fetched if not provided)",
                },
                head_sha: {
                  type: "string",
                  description:
                    "Head commit SHA (optional - will be fetched if not provided)",
                },
              },
              required: [
                "message",
                "project_id",
                "mr_iid",
                "path",
                "line",
                "line_type",
              ],
            },
          },
          {
            name: "post_commit_status",
            description: "Update commit status",
            inputSchema: {
              type: "object",
              properties: {
                project_id: {
                  type: "number",
                  description: "GitLab project ID",
                },
                commit_sha: {
                  type: "string",
                  description: "Commit SHA to update status for",
                },
                state: {
                  type: "string",
                  enum: ["success", "failed", "running", "pending", "canceled"],
                  description: "Status state",
                },
                description: {
                  type: "string",
                  description: "Status description (optional)",
                },
                context: {
                  type: "string",
                  description: "Status context (optional)",
                },
                target_url: {
                  type: "string",
                  description: "Target URL for the status (optional)",
                },
              },
              required: ["project_id", "commit_sha", "state"],
            },
          },
          {
            name: "get_mr_info",
            description: "Get merge request details",
            inputSchema: {
              type: "object",
              properties: {
                project_id: {
                  type: "number",
                  description: "GitLab project ID",
                },
                mr_iid: { type: "number", description: "Merge request IID" },
                include_diff: {
                  type: "boolean",
                  description:
                    "Include diff content (optional, default: false)",
                  default: false,
                },
              },
              required: ["project_id", "mr_iid"],
            },
          },
          {
            name: "trigger_review",
            description: "Start code review process",
            inputSchema: {
              type: "object",
              properties: {
                project_id: {
                  type: "number",
                  description: "GitLab project ID",
                },
                mr_iid: { type: "number", description: "Merge request IID" },
                commit_sha: {
                  type: "string",
                  description: "Specific commit SHA to review (optional)",
                },
                force: {
                  type: "boolean",
                  description:
                    "Force re-review even if already reviewed (optional)",
                  default: false,
                },
              },
              required: ["project_id", "mr_iid"],
            },
          },
          {
            name: "get_mr_comments",
            description: "Get all comments on a merge request",
            inputSchema: {
              type: "object",
              properties: {
                project_id: {
                  type: "number",
                  description: "GitLab project ID",
                },
                mr_iid: { type: "number", description: "Merge request IID" },
              },
              required: ["project_id", "mr_iid"],
            },
          },
        ];

        return c.json({
          jsonrpc: "2.0",
          id: request.id,
          result: { tools },
        });
      }

      if (request.method === "tools/call") {
        const { name, arguments: args } = request.params;

        let result;
        switch (name) {
          case "leave_general_comment":
            result = await leaveGeneralComment(
              validateLeaveGeneralCommentArgs(args),
              config,
              gitlabClient
            );
            break;
          case "leave_inline_comment":
            result = await leaveInlineComment(
              validateLeaveInlineCommentArgs(args),
              config,
              gitlabClient
            );
            break;
          case "post_commit_status":
            result = await postCommitStatus(
              validatePostCommitStatusArgs(args),
              config,
              gitlabClient
            );
            break;
          case "get_mr_info":
            result = await getMRInfo(
              validateGetMRInfoArgs(args),
              config,
              gitlabClient
            );
            break;
          case "trigger_review":
            result = await triggerReview(
              validateTriggerReviewArgs(args),
              config,
              gitlabClient
            );
            break;
          case "get_mr_comments":
            result = await getMRComments(
              validateGetMRCommentsArgs(args),
              config,
              gitlabClient
            );
            break;
          default:
            return c.json({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32601, message: `Unknown tool: ${name}` },
            });
        }

        return c.json({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      }

      // Unknown method
      return c.json({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      });
    } catch (error) {
      console.error("❌ MCP request error:", error);
      return c.json(
        {
          jsonrpc: "2.0",
          id: request.id || 1,
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error),
          },
        },
        500
      );
    }
  });

  // Health check endpoint
  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      service: "gitlab-mcp-server",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
