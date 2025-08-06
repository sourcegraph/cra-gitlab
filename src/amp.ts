import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { getConfig, Config } from "./config.js";

const execAsync = promisify(exec);

export interface AmpResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface ExecuteCommandOptions {
	prompt?: string;
    folderPath?: string;
    threadId?: string;
    promptFilePath?: string;
    settingsFilePath?: string;
    resultFilePath?: string;
    debug?: boolean;
    logging?: boolean;
    commandNameLabel?: string;
}

export async function newThread(folderPath: string = tmpdir()): Promise<string> {
    if (!folderPath) {
        throw new Error("Folder path not set");
    }

    const config: Config = getConfig();
    
    try {
        const command = `${config.amp.command} threads new`;
        const { stdout, stderr } = await execAsync(command, { cwd: folderPath });
        
        // Extract thread ID from stdout (assuming it's returned as the thread ID)
        const threadId = stdout.trim();
        
        return threadId;
    } catch (error) {
        throw new Error(`Failed to start thread: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function debugOutput(context: string, tag?: string): void {
    console.log(`
---------
<${tag || "result"}>
${context}
</${tag || "result"}>
---------
    `);
}

export async function execute(options: ExecuteCommandOptions = {}): Promise<string> {
    const { 
        prompt,
        promptFilePath,
        settingsFilePath,
        resultFilePath,
        commandNameLabel = 'amp',
        folderPath = tmpdir(),
        debug = false
    } = options;

    let { threadId } = options;
    
    try {
        const config: Config = getConfig();
        
        if (!threadId) {
            threadId = await newThread(folderPath);
        }
        
        const includePrompt = prompt ? `echo "${prompt.replace(/\n/g, "\\n")}" | ` : '';
        const includePromptFile = promptFilePath ? `cat ${promptFilePath} | ` : '';
        const includeThread = threadId ? ` threads continue ${threadId}` : '';
        const includeDebug = debug ? ` --log-level debug ` : '';
        const includeSettings = settingsFilePath ? ` --settings-file ${settingsFilePath} ` : '';
        const includeResult = resultFilePath ? ` > ${resultFilePath}` : '';
            
        // Build the command string
        const command = `${prompt ? includePrompt : includePromptFile}${config.amp.command}${includeThread}${includeDebug}${includeSettings}${includeResult}`;

        if (debug) debugOutput(`Executing: ${command}`, `${commandNameLabel}_command`);
        
        // Execute command
        const { stdout, stderr } = await execAsync(command, { cwd: folderPath });
        
        if (debug) debugOutput(stdout, `${commandNameLabel}_result`);
        
        return stdout;
    } catch (error) {
        if (debug) debugOutput(`Error executing command: ${error}`, `${commandNameLabel}_error`);
        throw new Error(`Failed to execute command: ${error instanceof Error ? error.message : String(error)}`);
    }
}


