import { ReviewIssue } from "./types.js";
import { MRDetails } from "../gitlab/types.js";
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Config, getConfig } from "../config.js";
import { newThread, execute } from "../amp.js";

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
        .replace('__MR_DETAILS_CONTENT__', mrDetailsContent)
        .replace('__DIFF_CONTENT__', diffContent);

      // Add tools content
      const toolsContent = ampConfig.tools.map(tool => 
        `${tool.name}: ${tool.description}\n${tool.instructions.join('\n')}`
      ).join('\n\n');
      
    //   promptContent = promptContent.replace('__TOOL_CONTENT__', toolsContent);

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

      console.log("!@!@!@!@!@", finalReviewText, "!@!@!@!@!@!");

      // Structure final response
      const structuredIssues: ReviewIssue[] = [];
      if (finalReviewText.trim()) {
        // Extract structured issues from review text
        const extractedIssues = extractIssues(finalReviewText);
        structuredIssues.push(...extractedIssues);
      }

    //   return {
    //     success: true,
    //     issues: structuredIssues.length > 0 ? [{
    //       path: '',
    //       line: 0,
    //       line_type: 'ADDED' as const,
    //       message: finalReviewText,
    //       suggested_fix: null
    //     }] : undefined,
    //     structured_issues: structuredIssues,
    //     final_review: finalReviewText,
    //     thread_ids: threadId ? [threadId] : undefined
    //   };
  } catch (error) {
    console.error(`Error starting thread: ${error}`);
    throw new Error(`Failed to start thread: ${error}`);
  }
}
