import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Config } from '../config.js';
import { ReviewResult, ReviewIssue } from './types.js';
import { MRDetails } from '../gitlab/types.js';

export class AmpReviewer {
  private config: Config;
  private timeout: number;

  constructor(config: Config) {
    this.config = config;
    this.timeout = parseInt(config.amp.timeout) * 1000; // Convert to milliseconds
  }

  async reviewDiff(diffContent: string, mrDetails: MRDetails): Promise<ReviewResult> {
    console.log(`AmpReviewer.reviewDiff() called for MR ${mrDetails.mr_iid}`);
    
    const tempDir = tmpdir();
    const promptFilePath = join(tempDir, `amp-prompt-${uuidv4()}.txt`);
    const resultFilePath = join(tempDir, `amp-result-${uuidv4()}.txt`);
    const settingsFilePath = join(tempDir, `amp-settings-${uuidv4()}.json`);

    try {
      // Generate MR details content
      const mrDetailsContent = `Project ID: ${mrDetails.project_id}, MR IID: ${mrDetails.mr_iid}, Commit SHA: ${mrDetails.commit_sha}, MR URL: ${mrDetails.mr_url}`;
      
      // Create prompt content
      const ampConfig = this.config.amp;
      let promptContent = ampConfig.prompt_template
        .replace('__MR_DETAILS_CONTENT__', mrDetailsContent)
        .replace('__DIFF_CONTENT__', diffContent);

      // Add tools content
      const toolsContent = ampConfig.tools.map(tool => 
        `${tool.name}: ${tool.description}\n${tool.instructions.join('\n')}`
      ).join('\n\n');
      
      promptContent = promptContent.replace('__TOOL_CONTENT__', toolsContent);

      // Write prompt to file
      writeFileSync(promptFilePath, promptContent, 'utf8');

      // Write settings to file
      const settings = ampConfig.settings;
      writeFileSync(settingsFilePath, JSON.stringify(settings || {}, null, 2), 'utf8');

      // Prepare Amp CLI command
      const commandParts = ampConfig.command.split(' ');
      const baseCommand = commandParts[0];
      if (!baseCommand) {
        throw new Error('Invalid amp command configuration');
      }
      
      const args = [
        ...commandParts.slice(1),
        '--prompt-file', promptFilePath,
        '--result-file', resultFilePath,
        '--settings-file', settingsFilePath
      ];

      console.log(`Executing Amp CLI: ${baseCommand} ${args.join(' ')}`);

      // Execute Amp CLI
      const result = await this.executeCommand(baseCommand, args);
      
      let finalReviewText = '';
      let threadId: string | undefined;
      
      // Read result from file if it exists
      if (existsSync(resultFilePath)) {
        finalReviewText = readFileSync(resultFilePath, 'utf8');
        console.log(`Amp CLI completed successfully, result length: ${finalReviewText.length}`);
        
        // Extract thread ID from the output
        const threadMatch = finalReviewText.match(/Thread:\s*https:\/\/ampcode\.com\/threads\/(T-[a-f0-9\-]+)/);
        if (threadMatch) {
          threadId = threadMatch[1];
          console.log(`Extracted thread ID: ${threadId}`);
        } else {
          console.warn('Could not extract thread ID from Amp output');
        }
      }

      // Structure final response
      const structuredIssues: ReviewIssue[] = [];
      if (finalReviewText.trim()) {
        // Extract structured issues from review text
        const extractedIssues = this.extractIssues(finalReviewText);
        structuredIssues.push(...extractedIssues);
      }

      return {
        success: true,
        issues: structuredIssues.length > 0 ? [{
          path: '',
          line: 0,
          line_type: 'ADDED' as const,
          message: finalReviewText,
          suggested_fix: null
        }] : undefined,
        structured_issues: structuredIssues,
        final_review: finalReviewText,
        thread_ids: threadId ? [threadId] : undefined
      };

    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        console.error(`Amp CLI timeout after ${this.timeout}ms`);
        return {
          success: false,
          error: `Review timeout after ${this.timeout / 1000}s`,
          issues: undefined
        };
      }
      
      console.error('Amp CLI execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        issues: undefined
      };
    } finally {
      // Cleanup temp files
      for (const filePath of [promptFilePath, resultFilePath, settingsFilePath]) {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }
    }
  }
}
