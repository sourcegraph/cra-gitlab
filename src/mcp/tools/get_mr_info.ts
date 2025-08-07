import { GitLabClient } from '../../gitlab/client.js';
import { Config } from '../../config.js';

export interface GetMRInfoArgs {
  project_id: number;
  mr_iid: number;
  include_diff?: boolean;
}

export async function getMRInfo(
  args: GetMRInfoArgs,
  config: Config,
  gitlabClient: GitLabClient
): Promise<{ 
  success: boolean; 
  mr_info?: any; 
  diff?: string;
  project_info?: any;
  error?: string 
}> {
  try {
    const { project_id, mr_iid, include_diff = false } = args;

    // Get MR info
    const mrInfo = await gitlabClient.getMRInfo(project_id, mr_iid);
    
    // Get project info for additional context
    const projectInfo = await gitlabClient.getProjectInfo(project_id);

    let diff;
    if (include_diff) {
      diff = await gitlabClient.getMRDiff(project_id, mr_iid);
    }

    return {
      success: true,
      mr_info: mrInfo,
      project_info: projectInfo,
      ...(diff && { diff })
    };
  } catch (error) {
    console.error('Failed to get MR info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
