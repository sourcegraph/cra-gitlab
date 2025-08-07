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
import { leaveGeneralComment } from './tools/leave_comment.js';
import { leaveInlineComment } from './tools/leave_inline_comment.js';
import { postCommitStatus } from './tools/post_commit_status.js';
import { getMRInfo } from './tools/get_mr_info.js';
import { triggerReview } from './tools/trigger_review.js';
import { getMRComments } from './tools/get_mr_comments.js';
import { 
  validateLeaveGeneralCommentArgs,
  validateLeaveInlineCommentArgs,
  validatePostCommitStatusArgs,
  validateGetMRInfoArgs,
  validateTriggerReviewArgs,
  validateGetMRCommentsArgs
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
            name: 'leave_general_comment',
            description: 'Leave general comments on merge requests',
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
              },
              required: ['message', 'project_id', 'mr_iid'],
            },
          },
          {
            name: 'leave_inline_comment',
            description: 'Leave inline comments on specific lines in merge requests',
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
                  description: 'File path for the inline comment',
                },
                line: {
                  type: 'number',
                  description: 'Line number for the inline comment',
                },
                line_type: {
                  type: 'string',
                  enum: ['new', 'old'],
                  description: 'Type of line (new or old)',
                },
                base_sha: {
                  type: 'string',
                  description: 'Base commit SHA (optional - will be fetched if not provided)',
                },
                start_sha: {
                  type: 'string',
                  description: 'Start commit SHA (optional - will be fetched if not provided)',
                },
                head_sha: {
                  type: 'string',
                  description: 'Head commit SHA (optional - will be fetched if not provided)',
                },
              },
              required: ['message', 'project_id', 'mr_iid', 'path', 'line', 'line_type'],
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
          {
            name: 'get_mr_comments',
            description: 'Get all comments on a merge request',
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
          case 'leave_general_comment': {
            const validatedArgs = validateLeaveGeneralCommentArgs(args);
            const result = await leaveGeneralComment(
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

          case 'leave_inline_comment': {
            const validatedArgs = validateLeaveInlineCommentArgs(args);
            const result = await leaveInlineComment(
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

          case 'get_mr_comments': {
            const validatedArgs = validateGetMRCommentsArgs(args);
            const result = await getMRComments(
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
