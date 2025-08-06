import { GitLabMergeRequestEvent, COMMIT_STATUS, MRDetails } from './types.js';
import { ReviewResult } from '../review/types.js';
import { GitLabClient } from './client.js';
import { Config } from '../config.js';
import { MultiThreadAmpReviewer } from '../review/multi-thread-amp-reviewer.js';

export class WebhookProcessor {
  private gitlabClient: GitLabClient;
  private config: Config;
  private amp: MultiThreadAmpReviewer;

  constructor(gitlabClient: GitLabClient, config: Config) {
    this.gitlabClient = gitlabClient;
    this.config = config;

    // Initialize MultiThreadAmpReviewer with configuration
    const diffConfig = config.diff_splitting;
    this.amp = new MultiThreadAmpReviewer(
      config,
      diffConfig.max_chunk_size,
      diffConfig.max_concurrent
    );
    console.log('WebhookProcessor initialized with MultiThreadAmpReviewer');
  }

  async processMREvent(payload: GitLabMergeRequestEvent): Promise<ReviewResult> {
    console.log('WebhookProcessor.processMREvent() called');
    
    try {
      // Extract MR information
      const mrIid = payload.object_attributes.iid;
      const projectId = payload.project.id;
      const commitSha = payload.object_attributes.last_commit.id;

      console.log(`Extracted MR info: iid=${mrIid}, project=${projectId}, commit=${commitSha}`);

      if (!mrIid || !projectId || !commitSha) {
        const error = 'Missing required MR information';
        console.error(error);
        return { success: false, error };
      }

      console.log(`Processing MR ${mrIid} in project ${projectId}`);

      // Generate MR URL
      const mrUrl = `${payload.project.web_url}/-/merge_requests/${mrIid}`;

      // Get diff content from GitLab API
      console.log('Fetching diff content from GitLab API...');
      const diffContent = await this.gitlabClient.getMRDiff(projectId, mrIid);
      
      if (!diffContent) {
        const error = 'No diff content found';
        console.error(error);
        return { success: false, error };
      }

      console.log(`Retrieved diff content (${diffContent.length} chars)`);

      // Create MR details object
      const mrDetails: MRDetails = {
        mr_iid: mrIid,
        project_id: projectId,
        commit_sha: commitSha,
        mr_url: mrUrl,
      };

      // Review with Amp
      console.log('Calling amp.reviewDiff()...');
      const reviewResult = await this.amp.reviewDiff(diffContent, mrDetails);
      console.log(`Amp review completed: success=${reviewResult.success}`);

      // Handle review failure
      if (!reviewResult.success) {
        try {
          const gitlabConfig = this.config.gitlab;
          await this.gitlabClient.postCommitStatus(
            projectId,
            commitSha,
            COMMIT_STATUS.FAILED,
            {
              name: gitlabConfig.build_status_name,
              description: `Review failed: ${reviewResult.error || 'Unknown error'}`,
              context: gitlabConfig.build_status_key,
              target_url: mrUrl,
            }
          );
        } catch (error) {
          console.error('Failed to post error commit status:', error);
        }
        return reviewResult;
      }

      // Extract structured issues and summary
      const structuredIssues = reviewResult.structured_issues || [];
      const totalIssues = structuredIssues.length;
      const threadIds = reviewResult.thread_ids || [];

      console.log(`MR ${mrIid} review completed - commit ${commitSha}`);
      console.log(`Found ${structuredIssues.length} issues in review`);

      // TODO: Implement comment publishing
      // For now, we'll just log that we would post comments
      console.log(`Would post ${structuredIssues.length} inline comments to MR`);

      // Post final commit status
      const state = COMMIT_STATUS.SUCCESS;
      const description = totalIssues === 0 
        ? 'Code review completed - no issues found'
        : `Code review completed - ${totalIssues} issues found (see comments)`;

      console.log(`About to post final commit status: state=${state}, description='${description}'`);
      
      try {
        // Use Amp thread URL for successful reviews, MR URL for failures
        let statusUrl = mrUrl;
        if (state === COMMIT_STATUS.SUCCESS && threadIds.length > 0) {
          const ampServerUrl = this.config.amp.server_url;
          statusUrl = `${ampServerUrl}/threads/${threadIds[0]}`; // Use first thread for commit status
          console.log(`Using Amp thread URL for successful review: ${statusUrl}`);
        } else {
          console.log(`Using MR URL for status: ${statusUrl}`);
        }

        const gitlabConfig = this.config.gitlab;
        console.log(`Posting commit status: commit=${commitSha}, state=${state}, context=${gitlabConfig.build_status_key}, name=${gitlabConfig.build_status_name}`);

        await this.gitlabClient.postCommitStatus(
          projectId,
          commitSha,
          state,
          {
            name: gitlabConfig.build_status_name,
            description,
            context: gitlabConfig.build_status_key,
            target_url: statusUrl,
          }
        );
        console.log('Final commit status posted successfully');
      } catch (error) {
        console.error('Failed to post final commit status:', error);
        // Continue anyway - don't fail the whole process
      }

      return {
        ...reviewResult, // Include all review result fields
        mr_iid: mrIid,
        project_id: projectId,
        commit_sha: commitSha,
        issues_found: totalIssues,
        review_result: reviewResult,
      };

    } catch (error) {
      console.error('Error processing MR event:', error);
      console.error('Exception type:', typeof error);
      console.error('Full error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}
