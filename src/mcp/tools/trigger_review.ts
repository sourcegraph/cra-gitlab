import { GitLabClient } from '../../gitlab/client.js';
import { Config } from '../../config.js';

export interface TriggerReviewArgs {
  project_id: number;
  mr_iid: number;
  commit_sha?: string;
  force?: boolean;
}

export async function triggerReview(
  args: TriggerReviewArgs,
  config: Config,
  gitlabClient: GitLabClient
): Promise<{ success: boolean; review_id?: string; error?: string }> {
  try {
    const { project_id, mr_iid, commit_sha, force = false } = args;

    // Get MR info to get the latest commit if not provided
    const mrInfo = await gitlabClient.getMRInfo(project_id, mr_iid);
    const targetCommitSha = commit_sha || mrInfo.sha;

    // Set status to pending to indicate review is starting
    await gitlabClient.postCommitStatus(
      project_id,
      targetCommitSha,
      'pending',
      {
        name: config.gitlab.build_status_name,
        description: 'Code review in progress...',
        context: config.gitlab.build_status_key
      }
    );

    // In a real implementation, this would trigger the actual review process
    // For now, we'll just return success with a mock review ID
    const reviewId = `review_${project_id}_${mr_iid}_${Date.now()}`;

    return {
      success: true,
      review_id: reviewId
    };
  } catch (error) {
    console.error('Failed to trigger review:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
