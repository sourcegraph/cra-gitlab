

export interface WebhookConfig {
  url: string;
  token?: string;
  push_events?: boolean;
  merge_request_events?: boolean;
  issues_events?: boolean;
  enable_ssl_verification?: boolean;
}

export class WebhookManager {
  private gitlabBaseUrl: string;

  constructor() {
    this.gitlabBaseUrl = process.env.GITLAB_BASE_URL || 'https://gitlab.com';
  }

  /**
   * Create webhook for a project
   */
  async createProjectWebhook(
    projectId: number,
    accessToken: string,
    webhookConfig: WebhookConfig
  ): Promise<number> {
    const webhookData = {
      url: webhookConfig.url,
      token: webhookConfig.token,
      push_events: webhookConfig.push_events === true,
      merge_requests_events: webhookConfig.merge_request_events === true,
      issues_events: webhookConfig.issues_events === true,
      tag_push_events: false,
      note_events: false,
      pipeline_events: false,
      wiki_page_events: false,
      deployment_events: false,
      job_events: false,
      releases_events: false,
      enable_ssl_verification: webhookConfig.enable_ssl_verification !== false,
    };

    console.log('Creating webhook with config:', webhookData);

    const response = await fetch(
      `${this.gitlabBaseUrl}/api/v4/projects/${projectId}/hooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookData),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to create webhook: ${response.status} - ${error}`);
      throw new Error(`Failed to create webhook: ${response.status} - ${error}`);
    }

    const webhook = await response.json();
    console.log('Webhook created successfully:', JSON.stringify(webhook, null, 2));
    return webhook.id;
  }

  /**
   * Create webhook for a group
   */
  async createGroupWebhook(
    groupId: number,
    accessToken: string,
    webhookConfig: WebhookConfig
  ): Promise<number> {
    const response = await fetch(
      `${this.gitlabBaseUrl}/api/v4/groups/${groupId}/hooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookConfig.url,
          token: webhookConfig.token,
          push_events: webhookConfig.push_events || false,
          merge_requests_events: webhookConfig.merge_request_events || true,
          issues_events: webhookConfig.issues_events || false,
          enable_ssl_verification: webhookConfig.enable_ssl_verification !== false,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create group webhook: ${response.status} - ${error}`);
    }

    const webhook = await response.json();
    return webhook.id;
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(
    projectId: number,
    webhookId: number,
    accessToken: string,
    isGroup = false
  ): Promise<void> {
    const endpoint = isGroup 
      ? `${this.gitlabBaseUrl}/api/v4/groups/${projectId}/hooks/${webhookId}`
      : `${this.gitlabBaseUrl}/api/v4/projects/${projectId}/hooks/${webhookId}`;

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete webhook: ${response.status}`);
    }
  }

  /**
   * Get webhook URL for this app
   */
  getWebhookUrl(): string {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5052';
    return `${baseUrl}/gitlab/webhook`;
  }

  /**
   * Generate webhook secret token
   */
  generateWebhookToken(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}
