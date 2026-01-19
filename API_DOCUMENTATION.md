# MetaClips API Documentation

## Overview

MetaClips provides a comprehensive tRPC API for managing media files, AI enrichment, video annotations, and knowledge graphs. All endpoints require authentication via Manus OAuth.

## Base URL

All API endpoints are accessed through tRPC at `/api/trpc`.

---

## Files API

### `files.list`

List all files for the authenticated user.

**Input:**
```typescript
{
  collectionId?: number; // Optional: filter by collection
}
```

**Output:**
```typescript
Array<{
  id: number;
  title: string | null;
  description: string | null;
  url: string;
  fileKey: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  enrichmentStatus: "pending" | "processing" | "completed" | "failed";
  aiAnalysis: string | null;
  ocrText: string | null;
  detectedObjects: string[] | null;
  extractedMetadata: Record<string, any> | null;
  extractedKeywords: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  enrichedAt: Date | null;
}>
```

### `files.create`

Create a new file record.

**Input:**
```typescript
{
  fileKey: string;
  url: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  title?: string;
  description?: string;
  collectionId?: number;
  extractedMetadata?: Record<string, any>;
  extractedKeywords?: string[];
}
```

**Output:**
```typescript
{
  id: number;
}
```

### `files.get`

Get detailed file information including tags and knowledge graph edges.

**Input:**
```typescript
{
  id: number;
}
```

**Output:**
```typescript
{
  // ... file fields
  tags: Array<{
    id: number;
    name: string;
    source: "manual" | "ai" | "voice" | "metadata";
  }>;
  knowledgeEdges: Array<{
    id: number;
    targetFileId: number;
    similarity: number;
  }>;
}
```

### `files.update`

Update file metadata.

**Input:**
```typescript
{
  id: number;
  title?: string;
  description?: string;
  collectionId?: number | null;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `files.delete`

Delete a file and all related records.

**Input:**
```typescript
{
  id: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `files.search`

Search files by query string.

**Input:**
```typescript
{
  query: string;
}
```

**Output:**
```typescript
Array<File> // Same structure as files.list
```

### `files.advancedSearch`

Advanced search with filters.

**Input:**
```typescript
{
  query?: string;
  fileType?: string;
  tagIds?: number[];
  enrichmentStatus?: "pending" | "processing" | "completed" | "failed";
  dateFrom?: number; // Unix timestamp
  dateTo?: number; // Unix timestamp
  limit?: number; // Default: 50
  offset?: number; // Default: 0
}
```

**Output:**
```typescript
{
  files: Array<File>;
  total: number;
}
```

### `files.searchSuggestions`

Get search suggestions based on existing files.

**Input:**
```typescript
{
  query: string;
}
```

**Output:**
```typescript
string[] // Array of suggested search terms
```

### `files.enrich`

Trigger AI enrichment for a file.

**Input:**
```typescript
{
  id: number;
}
```

**Output:**
```typescript
{
  success: boolean;
  aiAnalysis?: string;
  detectedObjects?: string[];
  ocrText?: string;
}
```

### `files.batchUpdate`

Update metadata for multiple files at once.

**Input:**
```typescript
{
  fileIds: number[];
  updates: {
    title?: string;
    description?: string;
    collectionId?: number | null;
  };
}
```

**Output:**
```typescript
{
  success: boolean;
  updated: number;
}
```

### `files.batchExport`

Export multiple files as a ZIP archive.

**Input:**
```typescript
{
  fileIds: number[];
}
```

**Output:**
```typescript
{
  files: Array<{
    id: number;
    url: string;
    filename: string;
    metadata: Record<string, any>;
  }>;
}
```

---

## Tags API

### `tags.list`

List all tags for the authenticated user.

**Output:**
```typescript
Array<{
  id: number;
  name: string;
  source: "manual" | "ai" | "voice" | "metadata";
  userId: number;
  createdAt: Date;
}>
```

### `tags.create`

Create a new tag.

**Input:**
```typescript
{
  name: string;
  source: "manual" | "ai" | "voice" | "metadata";
}
```

**Output:**
```typescript
{
  id: number;
}
```

### `tags.linkToFile`

Link a tag to a file.

**Input:**
```typescript
{
  fileId: number;
  tagId: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `tags.unlinkFromFile`

Unlink a tag from a file.

**Input:**
```typescript
{
  fileId: number;
  tagId: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `tags.merge`

Merge two tags into one.

**Input:**
```typescript
{
  sourceTagId: number;
  targetTagId: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

---

## Collections API

### `collections.list`

List all collections for the authenticated user.

**Output:**
```typescript
Array<{
  id: number;
  name: string;
  description: string | null;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}>
```

### `collections.create`

Create a new collection.

**Input:**
```typescript
{
  name: string;
  description?: string;
}
```

**Output:**
```typescript
{
  id: number;
}
```

### `collections.update`

Update collection details.

**Input:**
```typescript
{
  id: number;
  name?: string;
  description?: string;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `collections.delete`

Delete a collection.

**Input:**
```typescript
{
  id: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

---

## Videos API

### `videos.list`

List all recorded videos.

**Output:**
```typescript
Array<{
  id: number;
  url: string;
  fileKey: string;
  duration: number | null;
  transcript: string | null;
  keywords: string[] | null;
  userId: number;
  createdAt: Date;
}>
```

### `videos.create`

Create a new video record.

**Input:**
```typescript
{
  url: string;
  fileKey: string;
  duration?: number;
  transcript?: string;
  keywords?: string[];
}
```

**Output:**
```typescript
{
  id: number;
}
```

### `videos.get`

Get video details with annotations.

**Input:**
```typescript
{
  id: number;
}
```

**Output:**
```typescript
{
  // ... video fields
  annotations: Array<{
    id: number;
    fileId: number;
    startTime: number;
    endTime: number;
    position: "left" | "right" | "center";
    keyword: string | null;
    confidence: number | null;
    source: "auto" | "manual";
  }>;
}
```

---

## Annotations API

### `annotations.create`

Create a new video annotation.

**Input:**
```typescript
{
  videoId: number;
  fileId: number;
  startTime: number;
  endTime: number;
  position: "left" | "right" | "center";
  keyword?: string;
  confidence?: number;
  source: "auto" | "manual";
}
```

**Output:**
```typescript
{
  id: number;
}
```

### `annotations.update`

Update an annotation.

**Input:**
```typescript
{
  id: number;
  startTime?: number;
  endTime?: number;
  position?: "left" | "right" | "center";
  keyword?: string;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `annotations.delete`

Delete an annotation.

**Input:**
```typescript
{
  id: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

---

## Video Export API

### `videoExport.export`

Export video with burned-in annotations.

**Input:**
```typescript
{
  videoId: number;
}
```

**Output:**
```typescript
{
  url: string;
  fileKey: string;
}
```

---

## Knowledge Graph API

### `knowledgeGraph.get`

Get knowledge graph for the authenticated user.

**Output:**
```typescript
{
  nodes: Array<{
    id: number;
    title: string;
    mimeType: string;
    url: string;
  }>;
  edges: Array<{
    source: number;
    target: number;
    similarity: number;
  }>;
}
```

### `knowledgeGraph.computeSimilarity`

Compute semantic similarity between files.

**Output:**
```typescript
{
  success: boolean;
  edgesCreated: number;
}
```

---

## Storage API

### `storage.uploadFile`

Upload a file to S3 storage.

**Input:**
```typescript
{
  filename: string;
  contentType: string;
  base64Data: string;
}
```

**Output:**
```typescript
{
  url: string;
  fileKey: string;
}
```

---

## Metadata Templates API

### `metadataTemplates.list`

List all custom metadata templates.

**Output:**
```typescript
Array<{
  id: number;
  name: string;
  category: string | null;
  titlePattern: string;
  descriptionPattern: string;
  userId: number;
  createdAt: Date;
}>
```

### `metadataTemplates.create`

Create a new metadata template.

**Input:**
```typescript
{
  name: string;
  category?: string;
  titlePattern: string;
  descriptionPattern: string;
}
```

**Output:**
```typescript
{
  id: number;
}
```

### `metadataTemplates.update`

Update a metadata template.

**Input:**
```typescript
{
  id: number;
  name?: string;
  category?: string;
  titlePattern?: string;
  descriptionPattern?: string;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `metadataTemplates.delete`

Delete a metadata template.

**Input:**
```typescript
{
  id: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

### `metadataTemplates.getSuggestions`

Get metadata suggestions based on usage history.

**Input:**
```typescript
{
  fileType: string;
}
```

**Output:**
```typescript
Array<{
  title: string | null;
  description: string | null;
  usageCount: number;
}>
```

---

## File Versions API

### `fileVersions.list`

List all versions of a file.

**Input:**
```typescript
{
  fileId: number;
}
```

**Output:**
```typescript
Array<{
  id: number;
  fileId: number;
  versionNumber: number;
  snapshot: Record<string, any>;
  changeDescription: string | null;
  createdAt: Date;
}>
```

### `fileVersions.create`

Create a new version snapshot.

**Input:**
```typescript
{
  fileId: number;
  changeDescription?: string;
}
```

**Output:**
```typescript
{
  id: number;
  versionNumber: number;
}
```

### `fileVersions.restore`

Restore a file to a previous version.

**Input:**
```typescript
{
  versionId: number;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

---

## Error Handling

All API endpoints return errors in the following format:

```typescript
{
  code: string; // e.g., "NOT_FOUND", "UNAUTHORIZED", "BAD_REQUEST"
  message: string;
}
```

Common error codes:
- `UNAUTHORIZED`: User not authenticated
- `FORBIDDEN`: User lacks permission
- `NOT_FOUND`: Resource not found
- `BAD_REQUEST`: Invalid input parameters
- `INTERNAL_SERVER_ERROR`: Server error

---

## Rate Limiting

No rate limiting is currently enforced, but reasonable usage is expected.

---

## Authentication

All endpoints require authentication via Manus OAuth. The authentication token is automatically included in requests when using the tRPC client.

To authenticate:
1. Redirect user to `/api/oauth/login`
2. User completes OAuth flow
3. Session cookie is set automatically
4. All subsequent API calls include authentication

To logout:
```typescript
await trpc.auth.logout.mutate();
```

---

## Best Practices

1. **Batch Operations**: Use batch endpoints (e.g., `files.batchUpdate`) when updating multiple files
2. **Pagination**: Use `limit` and `offset` parameters for large result sets
3. **Error Handling**: Always handle errors gracefully with try-catch blocks
4. **File Uploads**: Upload files to S3 first using `storage.uploadFile`, then create file records
5. **Enrichment**: Trigger enrichment after file creation for AI analysis
6. **Versioning**: Create version snapshots before destructive operations

---

## Examples

### Upload and Create File

```typescript
// 1. Upload to S3
const { url, fileKey } = await trpc.storage.uploadFile.mutate({
  filename: "photo.jpg",
  contentType: "image/jpeg",
  base64Data: base64String,
});

// 2. Create file record
const { id } = await trpc.files.create.mutate({
  fileKey,
  url,
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  fileSize: 1024000,
  title: "My Photo",
  description: "A beautiful landscape",
});

// 3. Trigger AI enrichment
await trpc.files.enrich.mutate({ id });
```

### Search with Filters

```typescript
const results = await trpc.files.advancedSearch.useQuery({
  query: "landscape",
  fileType: "image",
  enrichmentStatus: "completed",
  limit: 20,
  offset: 0,
});

console.log(`Found ${results.total} files`);
console.log(results.files);
```

### Create and Export Video

```typescript
// 1. Create video record
const { id: videoId } = await trpc.videos.create.mutate({
  url: videoUrl,
  fileKey: videoKey,
  duration: 120,
  transcript: "Full transcript here...",
  keywords: ["keyword1", "keyword2"],
});

// 2. Add annotations
await trpc.annotations.create.mutate({
  videoId,
  fileId: relatedFileId,
  startTime: 10.5,
  endTime: 15.0,
  position: "right",
  keyword: "important",
  source: "manual",
});

// 3. Export with annotations
const { url: exportedUrl } = await trpc.videoExport.export.mutate({ videoId });
```

---

## Support

For issues or questions, visit [https://help.manus.im](https://help.manus.im)
