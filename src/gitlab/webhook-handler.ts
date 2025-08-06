import { GitLabMergeRequestEvent, MRDetails } from './types.js';

export interface MREventDetails {
  mrIid: number;
  projectId: number;
  commitSha: string;
  mrUrl: string;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  state: string;
  mergeStatus: string;
  action: string;
  author: {
    id: number;
    name: string;
    username: string;
  };
  project: {
    id: number;
    name: string;
    pathWithNamespace: string;
    webUrl: string;
  };
}

export type MREventCallback = (details: MREventDetails) => Promise<void> | void;

export async function processMREvent(
  payload: GitLabMergeRequestEvent, 
  callback: MREventCallback
): Promise<void> {
  const { object_attributes, project, user } = payload;
  const { iid, title, description, source_branch, target_branch, state, merge_status, action, last_commit } = object_attributes;

  const mrDetails: MREventDetails = {
    mrIid: iid,
    projectId: project.id,
    commitSha: last_commit.id,
    mrUrl: `${project.web_url}/-/merge_requests/${iid}`,
    title,
    description,
    sourceBranch: source_branch,
    targetBranch: target_branch,
    state,
    mergeStatus: merge_status,
    action,
    author: user,
    project: {
      id: project.id,
      name: project.name,
      pathWithNamespace: project.path_with_namespace,
      webUrl: project.web_url,
    },
  };

  await callback(mrDetails);
}
