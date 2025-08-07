import { GitLabClient } from '../../gitlab/client.js';
import { Config } from '../../config.js';

export interface GetMRCommentsArgs {
  project_id: number;
  mr_iid: number;
}

export async function getMRComments(
  args: GetMRCommentsArgs,
  config: Config,
  gitlabClient: GitLabClient
): Promise<{ 
  success: boolean; 
  comments?: any[]; 
  total_comments?: number;
  error?: string 
}> {
  try {
    const { project_id, mr_iid } = args;

    const comments = await gitlabClient.getMRComments(project_id, mr_iid);
    
    return {
      success: true,
      comments,
      total_comments: comments.length
    };
  } catch (error) {
    console.error('Failed to get MR comments:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
