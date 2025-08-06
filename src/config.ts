import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';

interface MCPServer {
  command: string;
  args: string[];
}

interface AmpSettings {
  'amp.url': string;
  'amp.mcpServers': {
    [key: string]: MCPServer;
  };
}

interface Tool {
  name: string;
  description: string;
  instructions: string[];
}

export interface Config {
  gitlab: {
    base_url: string;
    token: string;
    build_status_key: string;
    build_status_name: string;
    development_mode: boolean;
    bot_username: string;
  };
  queue: {
    max_workers: number;
    max_queue_size: number;
    retry_after_seconds: number;
  };
  diff_splitting: {
    max_chunk_size: number;
    max_concurrent: number;
  };
  server: {
    port: string;
    debug: string;
  };
  amp: {
    timeout: string;
    command: string;
    server_url: string;
    settings: AmpSettings;
    prompt_template: string;
    tools: Tool[];
  };
}

class ConfigLoader {
  private static instance: ConfigLoader;
  private config: Config;

  private constructor() {
    const configFile = readFileSync('config.yml', 'utf8');
    const rawConfig = yaml.load(configFile) as any;
    this.config = this.processEnvVars(rawConfig);
  }

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  getConfig(): Config {
    return this.config;
  }

  private processEnvVars(obj: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([^}]+)\}/g, (_, envVar) => 
        process.env[envVar] || `\${${envVar}}`
      );
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.processEnvVars(item));
    }
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.processEnvVars(value);
      }
      return result;
    }
    return obj;
  }
}

export const getConfig = () => ConfigLoader.getInstance().getConfig();

