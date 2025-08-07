import { GitLabInstallation, OAuthTokenResponse, GitLabUser } from '../types/installation.js';

export class GitLabOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private gitlabBaseUrl: string;

  constructor() {
    this.clientId = process.env.GITLAB_CLIENT_ID!;
    this.clientSecret = process.env.GITLAB_CLIENT_SECRET!;
    this.redirectUri = process.env.GITLAB_REDIRECT_URI!;
    this.gitlabBaseUrl = process.env.GITLAB_BASE_URL || 'https://gitlab.com';
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'api',
      ...(state && { state })
    });

    return `${this.gitlabBaseUrl}/oauth/authorize?${params}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const response = await fetch(`${this.gitlabBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth token exchange failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get user info using access token
   */
  async getUserInfo(accessToken: string): Promise<GitLabUser> {
    const response = await fetch(`${this.gitlabBaseUrl}/api/v4/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    const response = await fetch(`${this.gitlabBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    return response.json();
  }
}
