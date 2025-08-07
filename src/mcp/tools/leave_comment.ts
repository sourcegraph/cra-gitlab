import { GitLabClient } from '../../gitlab/client.js';
import { Config } from '../../config.js';

export interface LeaveGeneralCommentArgs {
  message: string;
  project_id: number;
  mr_iid: number;
}

export async function leaveGeneralComment(
  args: LeaveGeneralCommentArgs,
  config: Config,
  gitlabClient: GitLabClient
): Promise<{ success: boolean; comment_id?: number; error?: string }> {
  try {
    const { message, project_id, mr_iid } = args;

    const response = await gitlabClient.postMRComment(project_id, mr_iid, message);
    
    return {
      success: true,
      comment_id: response.id
    };
  } catch (error) {
    console.error('Failed to leave general comment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
