import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { getConfig, Config } from '../config.js';
import { GitLabClient } from '../gitlab/client.js';
import { leaveComment } from './tools/leave_comment.js';
import { postCommitStatus } from './tools/post_commit_status.js';
import { getMRInfo } from './tools/get_mr_info.js';
import { triggerReview } from './tools/trigger_review.js';
import { 
  validateLeaveCommentArgs,
  validatePostCommitStatusArgs,
  validateGetMRInfoArgs,
  validateTriggerReviewArgs
} from './validation.js';

class GitLabMCPServer {
  private server: Server;
  private config: Config;
  private gitlabClient: GitLabClient;

  constructor() {
    this.server = new Server(
      {
        name: 'gitlab-cra',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.config = getConfig();
    this.gitlabClient = new GitLabClient(this.config);
    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'leave_comment',
            description: 'Leave comments or code suggestions on merge requests',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'The comment message',
                },
                project_id: {
                  type: 'number',
                  description: 'GitLab project ID',
                },
                mr_iid: {
                  type: 'number',
                  description: 'Merge request IID',
                },
                path: {
                  type: 'string',
                  description: 'File path for inline comments (optional)',
                },
                line: {
                  type: 'number',
                  description: 'Line number for inline comments (optional)',
                },
                line_type: {
                  type: 'string',
                  enum: ['ADDED', 'REMOVED', 'CONTEXT'],
                  description: 'Type of line for inline comments (optional)',
                },
                base_sha: {
                  type: 'string',
                  description: 'Base commit SHA for inline comments (optional)',
                },
                start_sha: {
                  type: 'string',
                  description: 'Start commit SHA for inline comments (optional)',
                },
                head_sha: {
                  type: 'string',
                  description: 'Head commit SHA for inline comments (optional)',
                },
              },
              required: ['message', 'project_id', 'mr_iid'],
            },
          },
          {
            name: 'post_commit_status',
            description: 'Update commit status',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'number',
                  description: 'GitLab project ID',
                },
                commit_sha: {
                  type: 'string',
                  description: 'Commit SHA to update status for',
                },
                state: {
                  type: 'string',
                  enum: ['success', 'failed', 'running', 'pending', 'canceled'],
                  description: 'Status state',
                },
                description: {
                  type: 'string',
                  description: 'Status description (optional)',
                },
                context: {
                  type: 'string',
                  description: 'Status context (optional)',
                },
                target_url: {
                  type: 'string',
                  description: 'Target URL for the status (optional)',
                },
              },
              required: ['project_id', 'commit_sha', 'state'],
            },
          },
          {
            name: 'get_mr_info',
            description: 'Get merge request details',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'number',
                  description: 'GitLab project ID',
                },
                mr_iid: {
                  type: 'number',
                  description: 'Merge request IID',
                },
                include_diff: {
                  type: 'boolean',
                  description: 'Include diff content (optional, default: false)',
                  default: false,
                },
              },
              required: ['project_id', 'mr_iid'],
            },
          },
          {
            name: 'trigger_review',
            description: 'Start code review process',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'number',
                  description: 'GitLab project ID',
                },
                mr_iid: {
                  type: 'number',
                  description: 'Merge request IID',
                },
                commit_sha: {
                  type: 'string',
                  description: 'Specific commit SHA to review (optional)',
                },
                force: {
                  type: 'boolean',
                  description: 'Force re-review even if already reviewed (optional)',
                  default: false,
                },
              },
              required: ['project_id', 'mr_iid'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.log(`🔧 MCP Tool called: ${name}`);

      try {
        switch (name) {
          case 'leave_comment': {
            const validatedArgs = validateLeaveCommentArgs(args);
            const result = await leaveComment(
              validatedArgs,
              this.config,
              this.gitlabClient
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'post_commit_status': {
            const validatedArgs = validatePostCommitStatusArgs(args);
            const result = await postCommitStatus(
              validatedArgs,
              this.config,
              this.gitlabClient
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_mr_info': {
            const validatedArgs = validateGetMRInfoArgs(args);
            const result = await getMRInfo(
              validatedArgs,
              this.config,
              this.gitlabClient
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'trigger_review': {
            const validatedArgs = validateTriggerReviewArgs(args);
            const result = await triggerReview(
              validatedArgs,
              this.config,
              this.gitlabClient
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`
        );
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GitLab MCP server running on stdio');
  }
}

// Run the server
const server = new GitLabMCPServer();
server.run().catch(console.error);
