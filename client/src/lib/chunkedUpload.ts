// Chunked upload utility with resume capability

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const STORAGE_KEY_PREFIX = "upload_progress_";

export interface UploadProgress {
  fileKey: string;
  filename: string;
  totalChunks: number;
  uploadedChunks: number[];
  createdAt: number;
}

export interface ChunkedUploadOptions {
  file: File;
  fileKey: string;
  onProgress?: (progress: number) => void;
  onChunkComplete?: (chunkIndex: number) => void;
  onComplete?: (fileKey: string) => void;
  onError?: (error: Error) => void;
}

export class ChunkedUploader {
  private file: File;
  private fileKey: string;
  private totalChunks: number;
  private uploadedChunks: Set<number>;
  private options: ChunkedUploadOptions;
  private aborted: boolean = false;

  constructor(options: ChunkedUploadOptions) {
    this.file = options.file;
    this.fileKey = options.fileKey;
    this.options = options;
    this.totalChunks = Math.ceil(this.file.size / CHUNK_SIZE);
    this.uploadedChunks = new Set();

    // Try to resume from localStorage
    this.loadProgress();
  }

  private getStorageKey(): string {
    return `${STORAGE_KEY_PREFIX}${this.fileKey}`;
  }

  private loadProgress(): void {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const progress: UploadProgress = JSON.parse(stored);
        // Only resume if less than 24 hours old
        if (Date.now() - progress.createdAt < 24 * 60 * 60 * 1000) {
          this.uploadedChunks = new Set(progress.uploadedChunks);
        } else {
          this.clearProgress();
        }
      }
    } catch (error) {
      console.error("Failed to load upload progress:", error);
    }
  }

  private saveProgress(): void {
    try {
      const progress: UploadProgress = {
        fileKey: this.fileKey,
        filename: this.file.name,
        totalChunks: this.totalChunks,
        uploadedChunks: Array.from(this.uploadedChunks),
        createdAt: Date.now(),
      };
      localStorage.setItem(this.getStorageKey(), JSON.stringify(progress));
    } catch (error) {
      console.error("Failed to save upload progress:", error);
    }
  }

  private clearProgress(): void {
    try {
      localStorage.removeItem(this.getStorageKey());
    } catch (error) {
      console.error("Failed to clear upload progress:", error);
    }
  }

  private async readChunk(chunkIndex: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, this.file.size);
      const blob = this.file.slice(start, end);

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get base64
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async upload(): Promise<void> {
    try {
      const chunks: string[] = new Array(this.totalChunks);

      // Upload chunks sequentially
      for (let i = 0; i < this.totalChunks; i++) {
        if (this.aborted) {
          throw new Error("Upload aborted");
        }

        // Skip already uploaded chunks
        if (this.uploadedChunks.has(i)) {
          this.options.onProgress?.(
            (this.uploadedChunks.size / this.totalChunks) * 100
          );
          continue;
        }

        // Read chunk
        const chunkData = await this.readChunk(i);
        chunks[i] = chunkData;

        // Mark as uploaded
        this.uploadedChunks.add(i);
        this.saveProgress();

        // Notify progress
        const progress = (this.uploadedChunks.size / this.totalChunks) * 100;
        this.options.onProgress?.(progress);
        this.options.onChunkComplete?.(i);
      }

      // All chunks uploaded, combine and complete
      this.options.onComplete?.(this.fileKey);
      this.clearProgress();
    } catch (error) {
      this.options.onError?.(error as Error);
      throw error;
    }
  }

  abort(): void {
    this.aborted = true;
  }

  getProgress(): number {
    return (this.uploadedChunks.size / this.totalChunks) * 100;
  }

  static getIncompleteUploads(): UploadProgress[] {
    const uploads: UploadProgress[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_KEY_PREFIX)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const progress: UploadProgress = JSON.parse(stored);
            // Only include uploads less than 24 hours old
            if (Date.now() - progress.createdAt < 24 * 60 * 60 * 1000) {
              uploads.push(progress);
            } else {
              localStorage.removeItem(key);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to get incomplete uploads:", error);
    }
    return uploads;
  }

  static clearIncompleteUpload(fileKey: string): void {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${fileKey}`);
    } catch (error) {
      console.error("Failed to clear incomplete upload:", error);
    }
  }
}
