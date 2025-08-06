import fetch from 'node-fetch';
import { Config } from '../config.js';

export class GitLabClient {
  private baseUrl: string;
  private token: string;
  private headers: Record<string, string>;

  constructor(config: Config) {
    const gitlabConfig = config.gitlab;
    this.baseUrl = gitlabConfig.base_url.replace(/\/$/, '');
    this.token = gitlabConfig.token;
    
    this.headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    console.log(`GitLab client initialized for ${this.baseUrl}`);
  }

  async postCommitStatus(
    projectId: number,
    sha: string, 
    state: 'success' | 'failed' | 'running' | 'pending' | 'canceled',
    options: {
      name?: string;
      description?: string;
      target_url?: string;
      context?: string;
    } = {}
  ): Promise<any> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/statuses/${sha}`;
    
    const payload = {
      state,
      name: options.name,
      description: options.description,
      target_url: options.target_url,
      context: options.context,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      return responseText ? JSON.parse(responseText) : { success: true };
    } catch (error) {
      console.error(`Failed to post commit status: ${error}`);
      throw error;
    }
  }

  async postMRComment(
    projectId: number,
    mrIid: number,
    body: string,
    position?: {
      base_sha: string;
      start_sha: string;
      head_sha: string;
      old_path?: string;
      new_path: string;
      old_line?: number;
      new_line?: number;
      line_range?: {
        start: {
          line_code: string;
          type: string;
          old_line?: number;
          new_line?: number;
        };
        end?: {
          line_code: string;
          type: string;
          old_line?: number;
          new_line?: number;
        };
      };
    }
  ): Promise<any> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`;
    
    const payload: any = { body };
    if (position) {
      payload.position = position;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      return responseText ? JSON.parse(responseText) : { success: true };
    } catch (error) {
      console.error(`Failed to post MR comment: ${error}`);
      throw error;
    }
  }

  async getMRDiff(projectId: number, mrIid: number): Promise<string> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/diffs`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const diffs = await response.json() as any[];
      
      // Convert GitLab diff format to unified diff format
      let unifiedDiff = '';
      for (const diff of diffs) {
        unifiedDiff += `diff --git a/${diff.old_path} b/${diff.new_path}\n`;
        if (diff.diff) {
          unifiedDiff += diff.diff + '\n';
        }
      }
      
      return unifiedDiff;
    } catch (error) {
      console.error(`Failed to get MR diff: ${error}`);
      throw error;
    }
  }

  async getMRInfo(projectId: number, mrIid: number): Promise<any> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get MR info: ${error}`);
      throw error;
    }
  }

  async getProjectInfo(projectId: number): Promise<any> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get project info: ${error}`);
      throw error;
    }
  }
}
