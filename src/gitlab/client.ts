import fetch from 'node-fetch';
import { Config } from '../config.js';
import { GitLabOAuthService } from './oauth.js';
import { InstallationStore } from './installation-store.js';
import { GitLabInstallation } from '../types/installation.js';

export class GitLabClient {
  private baseUrl: string;
  private token: string;
  private headers: Record<string, string>;
  private oauthService?: GitLabOAuthService;
  private installationStore?: InstallationStore;
  private installation?: GitLabInstallation;

  constructor(
    config: Config, 
    installation?: GitLabInstallation,
    oauthService?: GitLabOAuthService,
    installationStore?: InstallationStore
  ) {
    const gitlabConfig = config.gitlab;
    this.baseUrl = gitlabConfig.base_url.replace(/\/$/, '');
    this.token = gitlabConfig.token;
    this.installation = installation;
    this.oauthService = oauthService;
    this.installationStore = installationStore;
    
    this.headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    console.log(`GitLab client initialized for ${this.baseUrl}`);
  }

  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.installation?.refreshToken || !this.oauthService || !this.installationStore) {
      console.warn('Cannot refresh token: missing refresh token, OAuth service, or installation store');
      return;
    }

    try {
      console.log('Refreshing expired token...');
      const tokenResponse = await this.oauthService.refreshToken(this.installation.refreshToken);
      
      // Update the installation with new token
      this.installation.accessToken = tokenResponse.access_token;
      if (tokenResponse.refresh_token) {
        this.installation.refreshToken = tokenResponse.refresh_token;
      }
      this.installation.lastUsed = new Date();

      // Update stored installation
      await this.installationStore.updateInstallation(this.installation.id, {
        accessToken: this.installation.accessToken,
        refreshToken: this.installation.refreshToken,
        lastUsed: this.installation.lastUsed
      });

      // Update client token and headers
      this.token = tokenResponse.access_token;
      this.headers['Authorization'] = `Bearer ${this.token}`;
      
      console.log('Token refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error('Failed to refresh expired token');
    }
  }

  private async makeRequest(url: string, options: any, retryOnAuth = true): Promise<any> {
    const response = await fetch(url, options);
    
    // If 401 and we can refresh, try once
    if (response.status === 401 && retryOnAuth && this.installation?.refreshToken) {
      console.log('Received 401, attempting token refresh...');
      await this.refreshTokenIfNeeded();
      
      // Update the authorization header in the request
      const updatedOptions = {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${this.token}`
        }
      };
      
      // Retry the request once with new token
      return await fetch(url, updatedOptions);
    }
    
    return response;
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
      const response = await this.makeRequest(url, {
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
      const response = await this.makeRequest(url, {
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

  async createMRDiscussion(
    projectId: number,
    mrIid: number,
    body: string,
    position?: {
      base_sha: string;
      start_sha: string;
      head_sha: string;
      position_type: string;
      new_path: string;
      old_path: string;
      new_line?: number;
      old_line?: number;
    }
  ): Promise<any> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/discussions`;
    
    const payload: any = { body };
    if (position) {
      payload.position = position;
    }

    try {
      const response = await this.makeRequest(url, {
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
      console.error(`Failed to create MR discussion: ${error}`);
      throw error;
    }
  }

  async getMRDiff(projectId: number, mrIid: number): Promise<string> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/diffs`;
    
    try {
      const response = await this.makeRequest(url, {
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
      const response = await this.makeRequest(url, {
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
      const response = await this.makeRequest(url, {
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

  async getMRComments(projectId: number, mrIid: number): Promise<any[]> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`;
    
    try {
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get MR comments: ${error}`);
      throw error;
    }
  }
}
