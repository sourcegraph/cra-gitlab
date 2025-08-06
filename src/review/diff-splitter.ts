import { ReviewChunk, DEFAULT_MAX_CHUNK_SIZE } from './types.js';

interface FileDiff {
  file_path: string;
  diff_content: string;
  char_count: number;
}

export class DiffSplitter {
  private maxChunkSize: number;

  constructor(maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE) {
    this.maxChunkSize = maxChunkSize;
    console.log(`DiffSplitter initialized with max_chunk_size=${maxChunkSize}`);
  }

  splitDiff(fullDiffContent: string): ReviewChunk[] {
    // If diff is small enough, return single chunk
    if (fullDiffContent.length <= this.maxChunkSize) {
      console.log(`Diff size ${fullDiffContent.length} chars fits in single chunk`);
      return [{
        chunk_id: 0,
        files: [],
        total_chars: fullDiffContent.length,
        diff_content: fullDiffContent,
      }];
    }

    console.log(`Diff size ${fullDiffContent.length} chars exceeds limit, splitting into chunks`);

    // Parse individual file diffs
    const fileDiffs = this.parseFileDiffs(fullDiffContent);

    if (fileDiffs.length === 0) {
      console.warn('No file diffs found, returning single chunk');
      return [{
        chunk_id: 0,
        files: [],
        total_chars: fullDiffContent.length,
        diff_content: fullDiffContent,
      }];
    }

    // Group files into chunks using first-fit bin packing
    const chunks = this.groupFilesIntoChunks(fileDiffs);

    console.log(`Split diff into ${chunks.length} chunks`);
    chunks.forEach((chunk, i) => {
      console.log(`Chunk ${i}: ${chunk.files.length} files, ${chunk.total_chars} chars`);
    });

    return chunks;
  }

  private parseFileDiffs(diffContent: string): FileDiff[] {
    const fileDiffs: FileDiff[] = [];
    const lines = diffContent.split('\n');
    let currentFileLines: string[] = [];
    let currentFilePath: string | null = null;

    for (const line of lines) {
      // Check for file header
      const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      if (diffMatch) {
        // Save previous file if exists
        if (currentFilePath && currentFileLines.length > 0) {
          const fileContent = currentFileLines.join('\n');
          fileDiffs.push({
            file_path: currentFilePath,
            diff_content: fileContent,
            char_count: fileContent.length,
          });
        }

        // Start new file
        currentFilePath = diffMatch[2] || null; // Use destination path
        currentFileLines = [line];
      } else {
        // Add line to current file
        if (currentFileLines) {
          currentFileLines.push(line);
        }
      }
    }

    // Don't forget the last file
    if (currentFilePath && currentFileLines.length > 0) {
      const fileContent = currentFileLines.join('\n');
      fileDiffs.push({
        file_path: currentFilePath,
        diff_content: fileContent,
        char_count: fileContent.length,
      });
    }

    console.log(`Parsed ${fileDiffs.length} file diffs`);
    return fileDiffs;
  }

  private groupFilesIntoChunks(fileDiffs: FileDiff[]): ReviewChunk[] {
    // Sort files by size (largest first) for better packing
    const sortedFiles = [...fileDiffs].sort((a, b) => b.char_count - a.char_count);

    const chunks: ReviewChunk[] = [];

    for (const fileDiff of sortedFiles) {
      const { file_path, diff_content, char_count } = fileDiff;

      // Skip files that are too large individually
      if (char_count > this.maxChunkSize) {
        console.warn(`File ${file_path} (${char_count} chars) exceeds chunk size limit, skipping`);
        continue;
      }

      // Find first chunk that can fit this file
      let placed = false;
      for (const chunk of chunks) {
        if (chunk.total_chars + char_count <= this.maxChunkSize) {
          chunk.files.push(file_path);
          chunk.total_chars += char_count;
          chunk.diff_content += '\n' + diff_content;
          placed = true;
          break;
        }
      }

      // If no existing chunk can fit, create new chunk
      if (!placed) {
        chunks.push({
          chunk_id: chunks.length,
          files: [file_path],
          total_chars: char_count,
          diff_content: diff_content,
        });
      }
    }

    return chunks;
  }
}
