import { v4 as uuidv4 } from 'uuid';
import { JobInfo, JOB_STATUS } from './types.js';
import { GitLabMergeRequestEvent, COMMIT_STATUS } from '../gitlab/types.js';
import { GitLabClient } from '../gitlab/client.js';
import { Config } from '../config.js';
import { WebhookProcessor } from '../gitlab/webhook-processor.js';

export class QueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueFullError';
  }
}

export class ReviewJobQueue {
  private jobs = new Map<string, JobInfo>();
  private gitlabClient: GitLabClient;
  private config: Config;
  private maxQueueSize: number;
  private processing = new Set<string>();

  constructor(gitlabClient: GitLabClient, config: Config, maxQueueSize: number) {
    this.gitlabClient = gitlabClient;
    this.config = config;
    this.maxQueueSize = maxQueueSize;
    console.log(`ReviewJobQueue initialized with max queue size ${maxQueueSize}`);
  }

  enqueueReview(webhookProcessor: WebhookProcessor, payload: GitLabMergeRequestEvent): string {
    // Check if queue is at capacity
    if (this.jobs.size >= this.maxQueueSize) {
      throw new QueueFullError(`Review queue is full (max: ${this.maxQueueSize})`);
    }

    const jobId = uuidv4();
    this.jobs.set(jobId, {
      status: JOB_STATUS.QUEUED,
      created: Date.now(),
      mr_iid: payload.object_attributes.iid,
    });

    // Process job asynchronously without awaiting
    this.processReview(jobId, webhookProcessor, payload).catch(error => {
      console.error(`Uncaught error in job ${jobId}:`, error);
    });

    return jobId;
  }

  private async processReview(
    jobId: string, 
    webhookProcessor: WebhookProcessor, 
    payload: GitLabMergeRequestEvent
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    console.log(`Starting review job ${jobId} processing`);
    this.processing.add(jobId);

    try {
      job.status = JOB_STATUS.RUNNING;
      job.started = Date.now();
      console.log(`Job ${jobId} status set to running`);

      console.log(`Calling webhook_processor.processMREvent() for job ${jobId}`);
      const result = await webhookProcessor.processMREvent(payload);
      console.log(`Webhook processor returned result for job ${jobId}: success=${result.success}`);

      if (result.success) {
        job.status = JOB_STATUS.COMPLETED;
        console.log(`Job ${jobId} completed successfully`);
      } else {
        job.status = JOB_STATUS.FAILED;
        console.error(`Job ${jobId} failed: ${result.error || 'Review processing failed'}`);
        // Post FAILED commit status for technical errors
        await this.postFailureCommitStatus(payload, result.error || 'Review processing failed');
      }

      job.completed = Date.now();
      job.result = result;
    } catch (error) {
      job.status = JOB_STATUS.FAILED;
      job.error = error instanceof Error ? error.message : String(error);
      console.error(`Review job ${jobId} failed with exception:`, error);
      // Post FAILED commit status for exceptions
      await this.postFailureCommitStatus(payload, job.error);
    } finally {
      // Clean up job after a delay to allow status checking
      setTimeout(() => {
        this.jobs.delete(jobId);
        this.processing.delete(jobId);
        console.log(`Cleaned up completed job ${jobId}`);
      }, 60000); // Keep job info for 1 minute
    }
  }

  private async postFailureCommitStatus(
    payload: GitLabMergeRequestEvent,
    errorMessage: string
  ): Promise<void> {
    try {
      const commitSha = payload.object_attributes.last_commit.id;
      const projectId = payload.project.id;
      
      if (commitSha && projectId) {
        const gitlabConfig = this.config.gitlab;
        await this.gitlabClient.postCommitStatus(
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

  getJobStatus(jobId: string): JobInfo | null {
    return this.jobs.get(jobId) || null;
  }

  getQueueStats() {
    const queued = Array.from(this.jobs.values()).filter(job => job.status === JOB_STATUS.QUEUED).length;
    const running = Array.from(this.jobs.values()).filter(job => job.status === JOB_STATUS.RUNNING).length;
    const completed = Array.from(this.jobs.values()).filter(job => job.status === JOB_STATUS.COMPLETED).length;
    const failed = Array.from(this.jobs.values()).filter(job => job.status === JOB_STATUS.FAILED).length;

    return {
      total: this.jobs.size,
      queued,
      running,
      completed,
      failed,
      maxSize: this.maxQueueSize,
    };
  }
}
