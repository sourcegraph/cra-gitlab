import { ReviewIssue } from "./types.js";
import { MRDetails } from "../gitlab/types.js";
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Config, getConfig } from "../config.js";
import { newThread, execute } from "../amp.js";

const extractIssues = (reviewText: string): ReviewIssue[] => {
  const issues: ReviewIssue[] = [];
  
  // Look for JSON blocks in the review text
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let match;
  
  while ((match = jsonBlockRegex.exec(reviewText)) !== null) {
    try {
      const jsonContent = match[1]?.trim();
      if (!jsonContent) continue;
      const parsedIssues = JSON.parse(jsonContent);
      
      if (Array.isArray(parsedIssues)) {
        for (const issue of parsedIssues) {
          if (issue?.path && issue?.line && issue?.line_type && issue?.message) {
            issues.push({
              path: issue.path,
              line: parseInt(issue.line),
              line_type: issue.line_type,
              message: issue.message,
              suggested_fix: issue.suggested_fix || null
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to parse JSON block in review text:', error);
    }
  }
  
  return issues;
};

export const reviewDiff = async (diffContent: string, mrDetails: MRDetails) => {

    // Get config
    const config: Config = getConfig();

    // Prepare temp files
    const tempDir = tmpdir();
    const promptFilePath = join(tempDir, `amp-prompt-${uuidv4()}.txt`);
    const resultFilePath = join(tempDir, `amp-result-${uuidv4()}.txt`);
    const settingsFilePath = join(tempDir, `amp-settings-${uuidv4()}.json`);

  try {
    // Generate MR details content
      const mrDetailsContent = `Project ID: ${mrDetails.project_id}, MR IID: ${mrDetails.mr_iid}, Commit SHA: ${mrDetails.commit_sha}, MR URL: ${mrDetails.mr_url}`;
      
      // Create prompt content
      const ampConfig = config.amp;
      
      let promptContent = ampConfig.prompt_template
        .replace(/__MR_DETAILS_CONTENT__/g, mrDetailsContent)
        .replace(/__DIFF_CONTENT__/g, diffContent);

      // Add tools content
      let toolsContent = '<tools>';
      toolsContent += ampConfig.tools.map(tool => {
        return `
        <tool>
            <title>${tool.name}</title>
            <description>${tool.description}</description>
            <instructions>${tool.instructions.join('\n')}</instructions>
        </tool>
    `;
      }).join('');
      toolsContent += '</tools>';
      promptContent = promptContent.replace(/__TOOL_CONTENT__/g, toolsContent);

      // Write prompt to file
      writeFileSync(promptFilePath, promptContent, 'utf8');

      // Write settings to file
      const settings = ampConfig.settings;
      writeFileSync(settingsFilePath, JSON.stringify(settings || {}, null, 2), 'utf8');

      const threadId = await newThread(tempDir);
      const result = await execute({
        promptFilePath,
        resultFilePath,
        settingsFilePath,
        commandNameLabel: 'amp',
        folderPath: tempDir,
        debug: true,
        threadId
      });

      let finalReviewText = '';
      
      // Read result from file if it exists
      if (existsSync(resultFilePath)) {
        finalReviewText = readFileSync(resultFilePath, 'utf8');
        console.log(`Amp CLI completed successfully, result length: ${finalReviewText.length}`);
      }

      // Structure final response
      const structuredIssues: ReviewIssue[] = [];
      if (finalReviewText.trim()) {
        // Extract structured issues from review text
        const extractedIssues = extractIssues(finalReviewText);
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
    console.error(`Error starting thread: ${error}`);
    throw new Error(`Failed to start thread: ${error}`);
  }
}
