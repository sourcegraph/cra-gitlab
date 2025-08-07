import { ReviewIssue } from "./types.js";
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Config, getConfig } from "../config.js";
import { newThread, execute } from "../amp.js";


export const reviewDiff = async (diffContent: string, mrDetailsContent: string) => {

    // Get config
    const config: Config = getConfig();

    // Prepare temp files
    const tempDir = tmpdir();
    const promptFilePath = join(tempDir, `amp-prompt-${uuidv4()}.txt`);
    const resultFilePath = join(tempDir, `amp-result-${uuidv4()}.txt`);
    const settingsFilePath = join(tempDir, `amp-settings-${uuidv4()}.json`);

  try {      
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

      return { success: true, threadId, result };
  } catch (error) {
    console.error(`Error starting thread: ${error}`);
    throw new Error(`Failed to start thread: ${error}`);
  }
}
