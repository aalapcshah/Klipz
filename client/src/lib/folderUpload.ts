/**
 * Folder Upload Utility
 * Handles recursive file extraction from folders using File System Access API
 * and webkitdirectory fallback
 */

export interface FolderFile {
  file: File;
  relativePath: string;
  folderName: string;
}

// Video file extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.mpeg', '.mpg', '.m4v', '.wmv', '.flv'];

// Image file extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.ico'];

// Document file extensions
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.csv'];

/**
 * Check if a file is a video based on its extension or MIME type
 */
export function isVideoFile(file: File): boolean {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return VIDEO_EXTENSIONS.includes(extension) || file.type.startsWith('video/');
}

/**
 * Check if a file is an image based on its extension or MIME type
 */
export function isImageFile(file: File): boolean {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(extension) || file.type.startsWith('image/');
}

/**
 * Check if a file is a document based on its extension
 */
export function isDocumentFile(file: File): boolean {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return DOCUMENT_EXTENSIONS.includes(extension);
}

/**
 * Get file type category
 */
export function getFileCategory(file: File): 'video' | 'image' | 'document' | 'other' {
  if (isVideoFile(file)) return 'video';
  if (isImageFile(file)) return 'image';
  if (isDocumentFile(file)) return 'document';
  return 'other';
}

/**
 * Extract files from a FileList (from webkitdirectory input)
 * Files already have webkitRelativePath set
 */
export function extractFilesFromFileList(fileList: FileList): FolderFile[] {
  const files: FolderFile[] = [];
  
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    // Skip hidden files and system files
    if (file.name.startsWith('.') || file.name === 'Thumbs.db' || file.name === 'desktop.ini') {
      continue;
    }
    
    // webkitRelativePath is like "folderName/subfolder/file.txt"
    const relativePath = (file as any).webkitRelativePath || file.name;
    const pathParts = relativePath.split('/');
    const folderName = pathParts.length > 1 ? pathParts[0] : '';
    
    files.push({
      file,
      relativePath,
      folderName,
    });
  }
  
  return files;
}

/**
 * Extract files from DataTransferItemList (from drag and drop)
 * Uses File System Access API for folder traversal
 */
export async function extractFilesFromDataTransfer(items: DataTransferItemList): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  const entries: FileSystemEntry[] = [];
  
  // Collect all entries first
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        entries.push(entry);
      }
    }
  }
  
  // Process all entries
  for (const entry of entries) {
    await processEntry(entry, '', files);
  }
  
  return files;
}

/**
 * Recursively process a FileSystemEntry
 */
async function processEntry(entry: FileSystemEntry, basePath: string, files: FolderFile[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await getFileFromEntry(fileEntry);
    
    // Skip hidden files and system files
    if (file && !file.name.startsWith('.') && file.name !== 'Thumbs.db' && file.name !== 'desktop.ini') {
      const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
      const pathParts = relativePath.split('/');
      const folderName = pathParts.length > 1 ? pathParts[0] : '';
      
      files.push({
        file,
        relativePath,
        folderName,
      });
    }
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const dirReader = dirEntry.createReader();
    const newBasePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    
    // Read all entries in the directory
    const entries = await readAllDirectoryEntries(dirReader);
    
    for (const childEntry of entries) {
      await processEntry(childEntry, newBasePath, files);
    }
  }
}

/**
 * Get File object from FileSystemFileEntry
 */
function getFileFromEntry(fileEntry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    fileEntry.file(
      (file) => resolve(file),
      () => resolve(null)
    );
  });
}

/**
 * Read all entries from a directory reader
 * Handles the case where readEntries may need to be called multiple times
 */
function readAllDirectoryEntries(dirReader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    
    const readBatch = () => {
      dirReader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries);
          } else {
            entries.push(...batch);
            readBatch(); // Continue reading
          }
        },
        reject
      );
    };
    
    readBatch();
  });
}

/**
 * Filter files by category
 */
export function filterFilesByCategory(files: FolderFile[], category: 'video' | 'image' | 'document' | 'other' | 'all'): FolderFile[] {
  if (category === 'all') return files;
  return files.filter(f => getFileCategory(f.file) === category);
}

/**
 * Group files by folder
 */
export function groupFilesByFolder(files: FolderFile[]): Map<string, FolderFile[]> {
  const groups = new Map<string, FolderFile[]>();
  
  for (const file of files) {
    const folder = file.folderName || '(root)';
    if (!groups.has(folder)) {
      groups.set(folder, []);
    }
    groups.get(folder)!.push(file);
  }
  
  return groups;
}

/**
 * Get summary of files in folder
 */
export function getFolderSummary(files: FolderFile[]): {
  totalFiles: number;
  videoCount: number;
  imageCount: number;
  documentCount: number;
  otherCount: number;
  totalSize: number;
  folders: string[];
} {
  const folders = new Set<string>();
  let videoCount = 0;
  let imageCount = 0;
  let documentCount = 0;
  let otherCount = 0;
  let totalSize = 0;
  
  for (const f of files) {
    if (f.folderName) folders.add(f.folderName);
    totalSize += f.file.size;
    
    const category = getFileCategory(f.file);
    switch (category) {
      case 'video': videoCount++; break;
      case 'image': imageCount++; break;
      case 'document': documentCount++; break;
      default: otherCount++; break;
    }
  }
  
  return {
    totalFiles: files.length,
    videoCount,
    imageCount,
    documentCount,
    otherCount,
    totalSize,
    folders: Array.from(folders),
  };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if browser supports folder selection
 */
export function supportsFolderSelection(): boolean {
  // Check for webkitdirectory support
  const input = document.createElement('input');
  return 'webkitdirectory' in input;
}

/**
 * Check if browser supports File System Access API for drag and drop
 */
export function supportsFileSystemAccess(): boolean {
  return 'webkitGetAsEntry' in DataTransferItem.prototype;
}
