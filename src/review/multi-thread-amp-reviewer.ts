import { ReviewChunk, ReviewResult, DEFAULT_MAX_CHUNK_SIZE, DEFAULT_MAX_CONCURRENT } from './types.js';
import { MRDetails } from '../gitlab/types.js';
import { Config } from '../config.js';
import { DiffSplitter } from './diff-splitter.js';
import { AmpReviewer } from './amp-reviewer.js';

interface ChunkResult {
  chunk_id: number;
  files: string[];
  result: ReviewResult;
}

interface ChunkError {
  chunk_id: number;
  files: string[];
  error: string;
}

export class MultiThreadAmpReviewer {
  private config: Config;
  private maxChunkSize: number;
  private maxConcurrent: number;
  private splitter: DiffSplitter;
  private singleReviewer: AmpReviewer;

  constructor(
    config: Config, 
    maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE, 
    maxConcurrent: number = DEFAULT_MAX_CONCURRENT
  ) {
    this.config = config;
    this.maxChunkSize = maxChunkSize;
    this.maxConcurrent = maxConcurrent;
    this.splitter = new DiffSplitter(maxChunkSize);
    this.singleReviewer = new AmpReviewer(config);
    console.log(`MultiThreadAmpReviewer initialized with max_chunk_size=${maxChunkSize}, max_concurrent=${maxConcurrent}`);
  }

  async reviewDiff(diffContent: string, mrDetails: MRDetails): Promise<ReviewResult> {
    console.log(`MultiThreadAmpReviewer.reviewDiff() called for MR ${mrDetails.mr_iid}`);

    // Step 1: Split diff into chunks
    const chunks = this.splitter.splitDiff(diffContent);

    if (chunks.length <= 1) {
      // Use single-threaded path for small diffs
      console.log(`MR ${mrDetails.mr_iid}: Using single-threaded review`);
      return this.singleReviewer.reviewDiff(diffContent, mrDetails);
    }

    // Step 2: Process chunks in parallel
    console.log(`MR ${mrDetails.mr_iid}: Using multi-threaded review with ${chunks.length} chunks`);
    return this.multiThreadReview(chunks, mrDetails);
  }

  private async multiThreadReview(chunks: ReviewChunk[], mrDetails: MRDetails): Promise<ReviewResult> {
    // Process chunks concurrently with limited concurrency
    const results: ChunkResult[] = [];
    const errors: ChunkError[] = [];

    // Process chunks in batches to respect concurrency limit
    const batches = this.createBatches(chunks, this.maxConcurrent);

    for (const batch of batches) {
      const batchPromises = batch.map(chunk => this.reviewChunk(chunk, mrDetails));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        const chunk = batch[index];
        if (!chunk) return; // Skip if chunk is undefined
        
        if (result.status === 'fulfilled') {
          results.push({
            chunk_id: chunk.chunk_id,
            files: chunk.files,
            result: result.value
          });
          console.log(`MR ${mrDetails.mr_iid}: Chunk ${chunk.chunk_id} completed successfully`);
        } else {
          errors.push({
            chunk_id: chunk.chunk_id,
            files: chunk.files,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
          console.error(`MR ${mrDetails.mr_iid}: Chunk ${chunk.chunk_id} failed:`, result.reason);
        }
      });
    }

    // Step 3: Aggregate results
    return this.aggregateResults(results, errors, mrDetails);
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async reviewChunk(chunk: ReviewChunk, mrDetails: MRDetails): Promise<ReviewResult> {
    // Create a unique identifier for this chunk
    const chunkMrDetails = {
      ...mrDetails,
      mr_iid: mrDetails.mr_iid + (chunk.chunk_id * 10000), // Ensure unique IDs
    };
    
    console.log(`Reviewing chunk ${chunk.chunk_id} for MR ${mrDetails.mr_iid} (${chunk.files.length} files, ${chunk.total_chars} chars)`);

    // Create a separate AmpReviewer instance for this chunk to avoid race conditions
    const chunkReviewer = new AmpReviewer(this.config);
    return chunkReviewer.reviewDiff(chunk.diff_content, chunkMrDetails);
  }

  private aggregateResults(
    results: ChunkResult[], 
    errors: ChunkError[], 
    mrDetails: MRDetails
  ): ReviewResult {
    // Combine all issues from successful chunks
    const allIssues: any[] = [];
    const allStructuredIssues: any[] = [];
    const threadIds: string[] = [];
    const finalReviewParts: string[] = [];

    for (const chunkResult of results) {
      const result = chunkResult.result;
      if (result.success && result.issues) {
        allIssues.push(...result.issues);
      }

      if (result.structured_issues) {
        allStructuredIssues.push(...result.structured_issues);
      }

      // Collect thread IDs for summary
      if (result.thread_ids) {
        threadIds.push(...result.thread_ids);
      }

      // Collect review text parts
      if (result.final_review) {
        finalReviewParts.push(result.final_review);
      }
    }

    // Create aggregated summary
    const summaryStats = {
      total_files_reviewed: results.reduce((sum, r) => sum + r.files.length, 0),
      chunks_processed: results.length,
      chunks_failed: errors.length,
      total_issues: allStructuredIssues.length,
      thread_ids: threadIds
    };

    // Combine final review text
    let combinedFinalReview = '';
    if (finalReviewParts.length > 0) {
      combinedFinalReview = finalReviewParts.join('\n\n---\n\n');

      if (errors.length > 0) {
        combinedFinalReview += '\n\n**Note:** Some files could not be processed.';
        // Log detailed error info for debugging
        for (const error of errors) {
          const filesInfo = error.files.length > 0 ? error.files.join(', ') : 'unknown files';
          console.error(`MR ${mrDetails.mr_iid}: Chunk ${error.chunk_id} failed (${filesInfo}): ${error.error}`);
        }
      }
    }

    console.log(`MR ${mrDetails.mr_iid}: Aggregated ${allStructuredIssues.length} total issues from ${results.length} chunks`);

    // Handle partial failures gracefully
    if (errors.length > 0 && results.length === 0) {
      // Complete failure
      console.error(`MR ${mrDetails.mr_iid}: All ${errors.length} chunks failed`);
      return {
        success: false,
        error: `All ${errors.length} chunks failed`,
        issues: undefined,
        structured_issues: undefined,
        stats: summaryStats
      };
    }

    // Success (possibly with some failed chunks)
    return {
      success: true,
      issues: allIssues.length > 0 ? allIssues : undefined,
      structured_issues: allStructuredIssues.length > 0 ? allStructuredIssues : undefined,
      final_review: combinedFinalReview || undefined,
      thread_ids: threadIds.length > 0 ? threadIds : undefined,
      stats: summaryStats,
      partial_failures: errors.length > 0 ? errors : undefined
    };
  }
}
