import { GitLabClient } from '../../gitlab/client.js';
import { Config } from '../../config.js';

export interface PostCommitStatusArgs {
  project_id: number;
  commit_sha: string;
  state: 'success' | 'failed' | 'running' | 'pending' | 'canceled';
  description?: string;
  context?: string;
  target_url?: string;
}

export async function postCommitStatus(
  args: PostCommitStatusArgs,
  config: Config,
  gitlabClient: GitLabClient
): Promise<{ success: boolean; status_id?: number; error?: string }> {
  try {
    const { project_id, commit_sha, state, description, context, target_url } = args;

    const statusOptions: {
      name?: string;
      description?: string;
      target_url?: string;
      context?: string;
    } = {
      name: config.gitlab.build_status_name,
      description: description || `Code review ${state}`,
      context: context || config.gitlab.build_status_key,
    };

    if (target_url) {
      statusOptions.target_url = target_url;
    }

    const response = await gitlabClient.postCommitStatus(
      project_id,
      commit_sha,
      state,
      statusOptions
    );

    return {
      success: true,
      status_id: response.id
    };
  } catch (error) {
    console.error('Failed to post commit status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
