import { getConfig } from "../config.js";
import { reviewDiff } from "../review/reviewer.js";
import { GitLabClient } from "./client.js";
import { COMMIT_STATUS, MRDetails, GitLabMergeRequestEvent } from "./types.js";

export async function processReview(
    jobId: string, 
    gitlabClient: GitLabClient, 
    payload: GitLabMergeRequestEvent
  ): Promise<void> {
    const config = await getConfig();

    try {
      // Extract MR information
      const mrIid = payload.object_attributes.iid;
      const projectId = payload.project.id;
      const commitSha = payload.object_attributes.last_commit.id;

      if (!mrIid || !projectId || !commitSha) {
        const error = 'Missing required MR information';
        console.error(error);
        throw new Error(error);
      }

      // Generate MR URL
      const mrUrl = `${payload.project.web_url}/-/merge_requests/${mrIid}`;

      // Get diff content from GitLab API
      console.log('Fetching diff content from GitLab API...');
      const diffContent = await gitlabClient.getMRDiff(projectId, mrIid);
      
      if (!diffContent) {
        const error = 'No diff content found';
        console.error(error);
        throw new Error(error);
      }

      console.log(`Retrieved diff content (${diffContent.length} chars)`);

      // Create MR details object
      const mrDetails: MRDetails = {
        mr_iid: mrIid,
        project_id: projectId,
        commit_sha: commitSha,
        mr_url: mrUrl,
      };

      const mrDetailsContent = `Project ID: ${mrDetails.project_id}, MR IID: ${mrDetails.mr_iid}, Commit SHA: ${mrDetails.commit_sha}, MR URL: ${mrDetails.mr_url}`;

      console.log(`Calling reviewDiff() for job ${jobId}`);
      const result = await reviewDiff(diffContent, mrDetailsContent);
      console.log(`Review completed for job ${jobId}`);

      // Post commit status
      const gitlabConfig = config.gitlab;
      const state = COMMIT_STATUS.SUCCESS;
      const description = 'Code review completed';

      await gitlabClient.postCommitStatus(
        projectId,
        commitSha,
        state,
        {
          name: gitlabConfig.build_status_name,
          description,
          context: gitlabConfig.build_status_key,
          target_url: mrUrl,
        }
      );

    } catch (error) {
      console.error(`Review job ${jobId} failed with exception:`, error);
      // Post FAILED commit status for exceptions
      await postFailureCommitStatus(gitlabClient,payload, error instanceof Error ? error.message : String(error));
  }
}

async function postFailureCommitStatus(
  gitlabClient: GitLabClient,
    payload: GitLabMergeRequestEvent,
    errorMessage: string
  ): Promise<void> {
    const config = getConfig();

    try {
      const commitSha = payload.object_attributes.last_commit.id;
      const projectId = payload.project.id;
      
      if (commitSha && projectId) {
        const gitlabConfig = config.gitlab;
        await gitlabClient.postCommitStatus(
          projectId,
          commitSha,
          COMMIT_STATUS.FAILED,
          {
            name: gitlabConfig.build_status_name,
            description: `Review failed: ${errorMessage.substring(0, 100)}...`,
            context: gitlabConfig.build_status_key,
          }
        );
      }
    } catch (error) {
      console.error(`Failed to post failure commit status:`, error);
    }
}