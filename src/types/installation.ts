export interface GitLabInstallation {
  id: string;
  gitlabUserId: number;
  gitlabUsername: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  installedAt: Date;
  lastUsed?: Date;
  webhookId?: number;
  projectId?: number;
  groupId?: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  scope: string;
  created_at: number;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email: string;
}
