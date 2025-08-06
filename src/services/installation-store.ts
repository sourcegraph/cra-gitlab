import { GitLabInstallation } from '../types/installation.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Simple file-based storage for installations
 * In production, use a proper database like PostgreSQL
 */
export class InstallationStore {
  private storePath: string;
  private installations: Map<string, GitLabInstallation> = new Map();

  constructor(storePath = './data/installations.json') {
    this.storePath = storePath;
    this.loadInstallations();
  }

  private loadInstallations(): void {
    try {
      if (existsSync(this.storePath)) {
        const data = readFileSync(this.storePath, 'utf-8');
        const installations = JSON.parse(data);
        this.installations = new Map(Object.entries(installations));
      }
    } catch (error) {
      console.error('Failed to load installations:', error);
    }
  }

  private saveInstallations(): void {
    try {
      const data = Object.fromEntries(this.installations);
      writeFileSync(this.storePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save installations:', error);
    }
  }

  /**
   * Store a new installation
   */
  async storeInstallation(installation: GitLabInstallation): Promise<void> {
    this.installations.set(installation.id, installation);
    this.saveInstallations();
  }

  /**
   * Get installation by ID
   */
  async getInstallation(id: string): Promise<GitLabInstallation | null> {
    return this.installations.get(id) || null;
  }

  /**
   * Get installation by GitLab user ID
   */
  async getInstallationByUserId(userId: number): Promise<GitLabInstallation | null> {
    for (const installation of this.installations.values()) {
      if (installation.gitlabUserId === userId) {
        return installation;
      }
    }
    return null;
  }

  /**
   * Get installation by project ID
   */
  async getInstallationByProjectId(projectId: number): Promise<GitLabInstallation | null> {
    for (const installation of this.installations.values()) {
      if (installation.projectId === projectId) {
        return installation;
      }
    }
    return null;
  }

  /**
   * Update installation
   */
  async updateInstallation(id: string, updates: Partial<GitLabInstallation>): Promise<void> {
    const existing = this.installations.get(id);
    if (existing) {
      this.installations.set(id, { ...existing, ...updates });
      this.saveInstallations();
    }
  }

  /**
   * Remove installation
   */
  async removeInstallation(id: string): Promise<void> {
    this.installations.delete(id);
    this.saveInstallations();
  }

  /**
   * List all installations
   */
  async listInstallations(): Promise<GitLabInstallation[]> {
    return Array.from(this.installations.values());
  }
}
