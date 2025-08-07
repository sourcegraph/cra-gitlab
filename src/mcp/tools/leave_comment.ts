import { GitLabClient } from '../../gitlab/client.js';
import { Config } from '../../config.js';

export interface LeaveCommentArgs {
  message: string;
  project_id: number;
  mr_iid: number;
  path?: string;
  line?: number;
  line_type?: 'ADDED' | 'REMOVED' | 'CONTEXT';
  base_sha?: string;
  start_sha?: string;
  head_sha?: string;
}

export async function leaveComment(
  args: LeaveCommentArgs,
  config: Config,
  gitlabClient: GitLabClient
): Promise<{ success: boolean; comment_id?: number; error?: string }> {
  try {
    const { message, project_id, mr_iid, path, line, line_type, base_sha, start_sha, head_sha } = args;

    let position;
    if (path && line && line_type) {
      console.log('🎯 Attempting inline comment:', { path, line, line_type });
      
      // Get SHA values if not provided
      let actualBaseSha = base_sha;
      let actualStartSha = start_sha;
      let actualHeadSha = head_sha;
      
      if (!actualBaseSha || !actualStartSha || !actualHeadSha) {
        console.log('🔍 Fetching missing SHA values from MR...');
        try {
          const mrInfo = await gitlabClient.getMRInfo(project_id, mr_iid);
          actualBaseSha = actualBaseSha || mrInfo.diff_refs?.base_sha;
          actualStartSha = actualStartSha || mrInfo.diff_refs?.start_sha;
          actualHeadSha = actualHeadSha || mrInfo.diff_refs?.head_sha;
          console.log('✅ SHA values:', { 
            base: actualBaseSha?.substring(0, 8),
            start: actualStartSha?.substring(0, 8), 
            head: actualHeadSha?.substring(0, 8)
          });
        } catch (error) {
          console.log('⚠️ Could not fetch MR info for SHAs:', error);
        }
      }
      
      if (actualBaseSha && actualStartSha && actualHeadSha) {
        // Create position object for inline comments
        position = {
          base_sha: actualBaseSha,
          start_sha: actualStartSha,
          head_sha: actualHeadSha,
          new_path: path,
          old_path: path,
        } as any;

        if (line_type === 'ADDED') {
          position.new_line = line;
        } else if (line_type === 'REMOVED') {
          position.old_line = line;
        } else {
          // CONTEXT - show on both sides
          position.new_line = line;
          position.old_line = line;
        }
        
        console.log('📍 Creating inline comment at position:', position);
      } else {
        console.log('⚠️ Missing SHA values, falling back to general comment');
      }
    }

    const response = await gitlabClient.postMRComment(project_id, mr_iid, message, position);
    
    return {
      success: true,
      comment_id: response.id
    };
  } catch (error) {
    console.error('Failed to leave comment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
