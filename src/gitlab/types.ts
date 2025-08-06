export interface MRDetails {
  mr_iid: number;
  project_id: number;
  commit_sha: string;
  mr_url: string;
}

export interface GitLabMergeRequestEvent {
  object_kind: string;
  user: {
    id: number;
    name: string;
    username: string;
  };
  project: {
    id: number;
    name: string;
    path_with_namespace: string;
    web_url: string;
  };
  object_attributes: {
    id: number;
    iid: number;
    target_branch: string;
    source_branch: string;
    title: string;
    description: string;
    state: string;
    merge_status: string;
    action: string;
    last_commit: {
      id: string;
      title: string;
      timestamp: string;
    };
  };
  changes?: {
    [key: string]: {
      previous: any;
      current: any;
    };
  };
}

export const COMMIT_STATUS = {
  SUCCESS: 'success' as const,
  FAILED: 'failed' as const,
  RUNNING: 'running' as const,
  PENDING: 'pending' as const,
  CANCELED: 'canceled' as const,
};
