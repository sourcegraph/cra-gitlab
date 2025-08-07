import { LeaveGeneralCommentArgs } from './tools/leave_comment.js';
import { LeaveInlineCommentArgs } from './tools/leave_inline_comment.js';
import { PostCommitStatusArgs } from './tools/post_commit_status.js';
import { GetMRInfoArgs } from './tools/get_mr_info.js';
import { TriggerReviewArgs } from './tools/trigger_review.js';
import { GetMRCommentsArgs } from './tools/get_mr_comments.js';

export function validateLeaveGeneralCommentArgs(args: any): LeaveGeneralCommentArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments: expected object');
  }
  
  if (typeof args.message !== 'string') {
    throw new Error('Invalid message: expected string');
  }
  
  if (typeof args.project_id !== 'number') {
    throw new Error('Invalid project_id: expected number');
  }
  
  if (typeof args.mr_iid !== 'number') {
    throw new Error('Invalid mr_iid: expected number');
  }
  
  return args as LeaveGeneralCommentArgs;
}

export function validateLeaveInlineCommentArgs(args: any): LeaveInlineCommentArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments: expected object');
  }
  
  if (typeof args.message !== 'string') {
    throw new Error('Invalid message: expected string');
  }
  
  if (typeof args.project_id !== 'number') {
    throw new Error('Invalid project_id: expected number');
  }
  
  if (typeof args.mr_iid !== 'number') {
    throw new Error('Invalid mr_iid: expected number');
  }
  
  if (typeof args.path !== 'string') {
    throw new Error('Invalid path: expected string');
  }
  
  if (typeof args.line !== 'number') {
    throw new Error('Invalid line: expected number');
  }
  
  if (!['new', 'old'].includes(args.line_type)) {
    throw new Error('Invalid line_type: expected new or old');
  }
  
  // Optional SHA fields validation
  if (args.base_sha !== undefined && typeof args.base_sha !== 'string') {
    throw new Error('Invalid base_sha: expected string or undefined');
  }
  
  if (args.start_sha !== undefined && typeof args.start_sha !== 'string') {
    throw new Error('Invalid start_sha: expected string or undefined');
  }
  
  if (args.head_sha !== undefined && typeof args.head_sha !== 'string') {
    throw new Error('Invalid head_sha: expected string or undefined');
  }
  
  return args as LeaveInlineCommentArgs;
}

export function validatePostCommitStatusArgs(args: any): PostCommitStatusArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments: expected object');
  }
  
  if (typeof args.project_id !== 'number') {
    throw new Error('Invalid project_id: expected number');
  }
  
  if (typeof args.commit_sha !== 'string') {
    throw new Error('Invalid commit_sha: expected string');
  }
  
  if (!['success', 'failed', 'running', 'pending', 'canceled'].includes(args.state)) {
    throw new Error('Invalid state: expected success, failed, running, pending, or canceled');
  }
  
  return args as PostCommitStatusArgs;
}

export function validateGetMRInfoArgs(args: any): GetMRInfoArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments: expected object');
  }
  
  if (typeof args.project_id !== 'number') {
    throw new Error('Invalid project_id: expected number');
  }
  
  if (typeof args.mr_iid !== 'number') {
    throw new Error('Invalid mr_iid: expected number');
  }
  
  if (args.include_diff !== undefined && typeof args.include_diff !== 'boolean') {
    throw new Error('Invalid include_diff: expected boolean or undefined');
  }
  
  return args as GetMRInfoArgs;
}

export function validateTriggerReviewArgs(args: any): TriggerReviewArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments: expected object');
  }
  
  if (typeof args.project_id !== 'number') {
    throw new Error('Invalid project_id: expected number');
  }
  
  if (typeof args.mr_iid !== 'number') {
    throw new Error('Invalid mr_iid: expected number');
  }
  
  if (args.commit_sha !== undefined && typeof args.commit_sha !== 'string') {
    throw new Error('Invalid commit_sha: expected string or undefined');
  }
  
  if (args.force !== undefined && typeof args.force !== 'boolean') {
    throw new Error('Invalid force: expected boolean or undefined');
  }
  
  return args as TriggerReviewArgs;
}

export function validateGetMRCommentsArgs(args: any): GetMRCommentsArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments: expected object');
  }
  
  if (typeof args.project_id !== 'number') {
    throw new Error('Invalid project_id: expected number');
  }
  
  if (typeof args.mr_iid !== 'number') {
    throw new Error('Invalid mr_iid: expected number');
  }
  
  return args as GetMRCommentsArgs;
}
