import { eq, and, or, like, gte, lte, inArray, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
import {
  InsertUser,
  users,
  files,
  InsertFile,
  tags,
  InsertTag,
  fileTags,
  videos,
  InsertVideo,
  annotations,
  InsertAnnotation,
  knowledgeGraphEdges,
  InsertKnowledgeGraphEdge,
  savedSearches,
  InsertSavedSearch,
  collections,
  InsertCollection,
  collectionFiles,
  InsertCollectionFile,
  smartCollections,
  InsertSmartCollection,
  fileVersions,
  InsertFileVersion,
  metadataTemplates,
  InsertMetadataTemplate,
  metadataHistory,
  InsertMetadataHistory,
  externalKnowledgeGraphs,
  InsertExternalKnowledgeGraph,
  scheduledExports,
  InsertScheduledExport,
  exportHistory,
  InsertExportHistory,
  imageAnnotations,
  InsertImageAnnotation,
  voiceAnnotations,
  visualAnnotations,
  annotationHistory,
  InsertAnnotationHistory,
  userOnboarding,
  recentlyViewedFiles,
  videoTags,
  InsertVideoTag,
  videoTagAssignments,
  InsertVideoTagAssignment,
  videoTranscripts,
  InsertVideoTranscript,
  fileSuggestions,
  InsertFileSuggestion,
  videoChapters,
  InsertVideoChapter,
  shareLinks,
  InsertShareLink,
  shareAccessLog,
  InsertShareAccessLog,
  tagRelationships,
  visualCaptions,
  InsertVisualCaption,
  visualCaptionFileMatches,
  InsertVisualCaptionFileMatch,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Import all schema for query API
      const schema = await import("../drizzle/schema");
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============= USER QUERIES =============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============= FILE QUERIES =============

export async function createFile(file: InsertFile) {
  // SAFEGUARD: Reject test files in production
  const testPatterns = /^test[-_]?|[-_]test\.|searchable|export[-_]test|tagtest|mock[-_]|^search\d+\.|pagination[-_]?\d*/i;
  if (file.filename && testPatterns.test(file.filename)) {
    // Only allow in test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      console.warn(`[createFile] BLOCKED: Test filename detected: ${file.filename}`);
      throw new Error(`Cannot create file with test filename: ${file.filename}`);
    }
  }
  
  // Use MySQL2 connection pool directly to bypass Drizzle
  if (!_pool && process.env.DATABASE_URL) {
    _pool = mysql.createPool(process.env.DATABASE_URL);
  }
  if (!_pool) throw new Error("Database not available");

  console.log('[createFile] Using MySQL2 directly');

  // Truncate title to fit database column limit (255 chars)
  const truncatedTitle = file.title ? file.title.substring(0, 255) : null;
  
  const [result] = await _pool.execute(
    `INSERT INTO files (
      userId, fileKey, url, filename, mimeType, fileSize,
      title, description, voiceRecordingUrl, voiceTranscript,
      extractedMetadata, extractedKeywords, enrichmentStatus, perceptualHash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      file.userId,
      file.fileKey,
      file.url,
      file.filename,
      file.mimeType,
      file.fileSize,
      truncatedTitle,
      file.description || null,
      file.voiceRecordingUrl || null,
      file.voiceTranscript || null,
      file.extractedMetadata || null,
      file.extractedKeywords ? JSON.stringify(file.extractedKeywords) : null,
      file.enrichmentStatus || 'pending',
      (file as any).perceptualHash || null
    ]
  );
  
  return (result as any).insertId;
}

export async function getFilesByUserId(userId: number, limit?: number, offset?: number) {
  const db = await getDb();
  if (!db) return [];

  const baseQuery = db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        sql`${files.mimeType} NOT LIKE 'video/%'`
      )
    )
    .orderBy(desc(files.createdAt));
  
  if (limit !== undefined && offset !== undefined) {
    return await baseQuery.limit(limit).offset(offset);
  } else if (limit !== undefined) {
    return await baseQuery.limit(limit);
  } else if (offset !== undefined) {
    return await baseQuery.offset(offset);
  }
  
  return await baseQuery;
}

export async function getFilesCountByUserId(userId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        sql`${files.mimeType} NOT LIKE 'video/%'`
      )
    );
  
  return result[0]?.count || 0;
}

export async function getEnrichmentStatusCounts(userId: number) {
  const db = await getDb();
  if (!db) return { pending: 0, processing: 0, completed: 0, failed: 0 };

  const result = await db
    .select({
      status: files.enrichmentStatus,
      count: sql<number>`count(*)`
    })
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        sql`${files.mimeType} NOT LIKE 'video/%'`
      )
    )
    .groupBy(files.enrichmentStatus);
  
  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of result) {
    if (row.status === 'pending') counts.pending = row.count;
    else if (row.status === 'processing') counts.processing = row.count;
    else if (row.status === 'completed') counts.completed = row.count;
    else if (row.status === 'failed') counts.failed = row.count;
  }
  
  return counts;
}

export async function getFileById(fileId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  return result[0];
}

export async function updateFile(fileId: number, updates: Partial<InsertFile>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(files).set(updates).where(eq(files.id, fileId));
}

/**
 * Update sort order for files (drag-and-drop reordering)
 */
export async function updateFileSortOrder(fileIds: number[], collectionId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update sort order for each file based on position in array
  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i];
    const sortOrder = i;
    
    if (collectionId) {
      // Update sort order in collection_files junction table
      await db
        .update(collectionFiles)
        .set({ sortOrder })
        .where(
          and(
            eq(collectionFiles.fileId, fileId),
            eq(collectionFiles.collectionId, collectionId)
          )
        );
    } else {
      // Update sort order in files table directly
      await db
        .update(files)
        .set({ sortOrder })
        .where(eq(files.id, fileId));
    }
  }
}

export async function deleteFile(fileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete related records first
  await db.delete(fileTags).where(eq(fileTags.fileId, fileId));
  await db.delete(annotations).where(eq(annotations.fileId, fileId));
  await db.delete(knowledgeGraphEdges).where(
    or(
      eq(knowledgeGraphEdges.sourceFileId, fileId),
      eq(knowledgeGraphEdges.targetFileId, fileId)
    )!
  );
  
  await db.delete(files).where(eq(files.id, fileId));
}

export async function searchFiles(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        or(
          like(files.title, `%${query}%`),
          like(files.description, `%${query}%`)
        )
      )
    );

  return results;
}

export async function advancedSearchFiles(
  userId: number,
  filters: {
    query?: string;
    fileType?: string;
    tagIds?: number[];
    enrichmentStatus?: "pending" | "processing" | "completed" | "failed";
    dateFrom?: number;
    dateTo?: number;
    limit?: number;
    offset?: number;
  }
) {
  const db = await getDb();
  if (!db) return { files: [], total: 0 };

  const conditions: any[] = [eq(files.userId, userId)];

  // Text search across title, description, AI analysis, OCR text, and extracted keywords
  if (filters.query && filters.query.trim()) {
    conditions.push(
      or(
        like(files.title, `%${filters.query}%`),
        like(files.description, `%${filters.query}%`),
        like(files.aiAnalysis, `%${filters.query}%`),
        like(files.ocrText, `%${filters.query}%`),
        // Search in JSON extractedKeywords array
        sql`JSON_SEARCH(${files.extractedKeywords}, 'one', ${`%${filters.query}%`}) IS NOT NULL`
      )
    );
  }

  // File type filter
  if (filters.fileType) {
    conditions.push(like(files.mimeType, `${filters.fileType}%`));
  }

  // Enrichment status filter
  if (filters.enrichmentStatus) {
    conditions.push(eq(files.enrichmentStatus, filters.enrichmentStatus));
  }

  // Date range filter
  if (filters.dateFrom) {
    conditions.push(gte(files.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    conditions.push(lte(files.createdAt, new Date(filters.dateTo)));
  }

  // Build base query
  let query = db
    .select({
      id: files.id,
      title: files.title,
      description: files.description,
      url: files.url,
      fileKey: files.fileKey,
      mimeType: files.mimeType,
      fileSize: files.fileSize,
      enrichmentStatus: files.enrichmentStatus,
      aiAnalysis: files.aiAnalysis,
      ocrText: files.ocrText,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      userId: files.userId,
    })
    .from(files)
    .where(and(...conditions));

  // Tag filtering requires a join
  if (filters.tagIds && filters.tagIds.length > 0) {
    const filesWithTags = await db
      .select({ fileId: fileTags.fileId })
      .from(fileTags)
      .where(inArray(fileTags.tagId, filters.tagIds))
      .groupBy(fileTags.fileId);

    const fileIds = filesWithTags.map((ft) => ft.fileId);
    if (fileIds.length > 0) {
      conditions.push(inArray(files.id, fileIds));
    } else {
      // No files match the tag filter
      return { files: [], total: 0 };
    }

    // Rebuild query with tag filter
    query = db
      .select({
        id: files.id,
        title: files.title,
        description: files.description,
        url: files.url,
        fileKey: files.fileKey,
        mimeType: files.mimeType,
        fileSize: files.fileSize,
        enrichmentStatus: files.enrichmentStatus,
        aiAnalysis: files.aiAnalysis,
        ocrText: files.ocrText,
        createdAt: files.createdAt,
        updatedAt: files.updatedAt,
        userId: files.userId,
      })
      .from(files)
      .where(and(...conditions));
  }

  // Get total count
  const countResult = await db
    .select({ count: sql`count(*)` })
    .from(files)
    .where(and(...conditions));
  const total = Number(countResult[0]?.count || 0);

  // Apply pagination
  const results = await query
    .limit(filters.limit || 50)
    .offset(filters.offset || 0)
    .orderBy(desc(files.createdAt));

  return { files: results, total };
}

// ============= TAG QUERIES =============

export async function createTag(tag: InsertTag) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if tag already exists for this user
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.name, tag.name), eq(tags.userId, tag.userId))!)
    .limit(1);

  if (existing.length > 0) {
    return existing[0]!.id;
  }

  const result = await db.insert(tags).values(tag);
  return result[0].insertId;
}

export async function getTagsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(tags).where(eq(tags.userId, userId));
}

export async function linkFileTag(fileId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if link already exists
  const existing = await db
    .select()
    .from(fileTags)
    .where(and(eq(fileTags.fileId, fileId), eq(fileTags.tagId, tagId))!)
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(fileTags).values({ fileId, tagId });
}

export async function unlinkFileTag(fileId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(fileTags)
    .where(and(eq(fileTags.fileId, fileId), eq(fileTags.tagId, tagId))!);
}

export async function deleteTag(tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // First delete all file-tag associations
  await db.delete(fileTags).where(eq(fileTags.tagId, tagId));
  
  // Then delete the tag itself
  await db.delete(tags).where(eq(tags.id, tagId));
}

export async function getFileTagsWithNames(fileId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select({
      id: tags.id,
      name: tags.name,
      source: tags.source,
    })
    .from(fileTags)
    .innerJoin(tags, eq(fileTags.tagId, tags.id))
    .where(eq(fileTags.fileId, fileId));
}

// ============= TAG HIERARCHY FUNCTIONS =============

export async function updateTagParent(tagId: number, parentId: number | null, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify tag belongs to user
  const tag = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId))!)
    .limit(1);

  if (tag.length === 0) {
    throw new Error("Tag not found");
  }

  // Prevent circular references
  if (parentId) {
    let currentParent = parentId;
    const visited = new Set<number>();
    while (currentParent) {
      if (visited.has(currentParent) || currentParent === tagId) {
        throw new Error("Circular reference detected");
      }
      visited.add(currentParent);
      const parent = await db
        .select({ parentId: tags.parentId })
        .from(tags)
        .where(eq(tags.id, currentParent))
        .limit(1);
      currentParent = parent[0]?.parentId || 0;
    }
  }

  await db
    .update(tags)
    .set({ parentId })
    .where(eq(tags.id, tagId));
}

export async function getTagHierarchy(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const allTags = await db
    .select({
      id: tags.id,
      name: tags.name,
      parentId: tags.parentId,
      color: tags.color,
      icon: tags.icon,
      source: tags.source,
    })
    .from(tags)
    .where(eq(tags.userId, userId));

  return allTags;
}

export async function getChildTags(tagId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(tags)
    .where(and(eq(tags.parentId, tagId), eq(tags.userId, userId))!);
}

export async function getRootTags(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), sql`${tags.parentId} IS NULL`)!);
}

export async function updateTagVisuals(tagId: number, userId: number, color?: string, icon?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: { color?: string; icon?: string } = {};
  if (color !== undefined) updates.color = color;
  if (icon !== undefined) updates.icon = icon;

  await db
    .update(tags)
    .set(updates)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId))!);
}

// ============= VIDEO QUERIES =============

export async function createVideo(video: InsertVideo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(videos).values(video);
  return result[0].insertId;
}

export async function getVideosCountByUserId(userId: number, search?: string, tagIds?: number[], tagFilterMode: 'AND' | 'OR' = 'OR') {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [eq(videos.userId, userId)];

  // Add search filter if provided
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    conditions.push(
      or(
        sql`${videos.title} LIKE ${searchTerm}`,
        sql`${videos.filename} LIKE ${searchTerm}`,
        sql`${videos.description} LIKE ${searchTerm}`,
        sql`${videos.transcript} LIKE ${searchTerm}`
      ) as any
    );
  }

  let count = 0;
  
  // Join with videoTagAssignments if filtering by tags
  if (tagIds && tagIds.length > 0) {
    if (tagFilterMode === 'AND' && tagIds.length > 1) {
      // AND logic: count videos that have ALL selected tags
      const result = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${videos.id})` })
        .from(videos)
        .innerJoin(videoTagAssignments, eq(videos.id, videoTagAssignments.videoId))
        .where(and(...conditions, sql`${videoTagAssignments.tagId} IN (${sql.join(tagIds.map(id => sql`${id}`), sql`, `)})`))
        .groupBy(videos.id)
        .having(sql`COUNT(DISTINCT ${videoTagAssignments.tagId}) = ${tagIds.length}`);
      count = result.length; // Count the number of groups (videos)
    } else {
      // OR logic: count distinct videos that have ANY of the selected tags
      const result = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${videos.id})` })
        .from(videos)
        .innerJoin(videoTagAssignments, eq(videos.id, videoTagAssignments.videoId))
        .where(and(...conditions, sql`${videoTagAssignments.tagId} IN (${sql.join(tagIds.map(id => sql`${id}`), sql`, `)})`));
      count = result[0]?.count || 0;
    }
  } else {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(videos)
      .where(and(...conditions));
    count = result[0]?.count || 0;
  }

  return count;
}

export async function getVideosByUserId(userId: number, limit?: number, offset?: number, sortBy: 'date' | 'annotations' = 'date', search?: string, tagIds?: number[], tagFilterMode: 'AND' | 'OR' = 'OR') {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(videos.userId, userId)];

  // Add search filter if provided
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    conditions.push(
      or(
        sql`${videos.title} LIKE ${searchTerm}`,
        sql`${videos.filename} LIKE ${searchTerm}`,
        sql`${videos.description} LIKE ${searchTerm}`,
        sql`${videos.transcript} LIKE ${searchTerm}`
      ) as any
    );
  }

  let videoList;
  
  // Join with videoTagAssignments if filtering by tags
  if (tagIds && tagIds.length > 0) {
    if (tagFilterMode === 'AND' && tagIds.length > 1) {
      // AND logic: video must have ALL selected tags
      // Use subquery to count matching tags per video
      const queryResult = await db
        .select({
          id: videos.id,
          userId: videos.userId,
          fileId: videos.fileId,
          fileKey: videos.fileKey,
          title: videos.title,
          filename: videos.filename,
          description: videos.description,
          url: videos.url,
          duration: videos.duration,
          width: videos.width,
          height: videos.height,
          transcript: videos.transcript,
          exportStatus: videos.exportStatus,
          exportedUrl: videos.exportedUrl,
          thumbnailUrl: videos.thumbnailUrl,
          createdAt: videos.createdAt,
          updatedAt: videos.updatedAt,
        })
        .from(videos)
        .innerJoin(videoTagAssignments, eq(videos.id, videoTagAssignments.videoId))
        .where(and(...conditions, sql`${videoTagAssignments.tagId} IN (${sql.join(tagIds.map(id => sql`${id}`), sql`, `)})`))
        .groupBy(videos.id)
        .having(sql`COUNT(DISTINCT ${videoTagAssignments.tagId}) = ${tagIds.length}`)
        .orderBy(desc(videos.createdAt))
        .limit(limit || 1000)
        .offset(offset || 0);
      videoList = queryResult;
    } else {
      // OR logic: video must have ANY of the selected tags
      const queryResult = await db
        .selectDistinct({
          id: videos.id,
          userId: videos.userId,
          fileId: videos.fileId,
          fileKey: videos.fileKey,
          title: videos.title,
          filename: videos.filename,
          description: videos.description,
          url: videos.url,
          duration: videos.duration,
          width: videos.width,
          height: videos.height,
          transcript: videos.transcript,
          exportStatus: videos.exportStatus,
          exportedUrl: videos.exportedUrl,
          thumbnailUrl: videos.thumbnailUrl,
          createdAt: videos.createdAt,
          updatedAt: videos.updatedAt,
        })
        .from(videos)
        .innerJoin(videoTagAssignments, eq(videos.id, videoTagAssignments.videoId))
        .where(and(...conditions, sql`${videoTagAssignments.tagId} IN (${sql.join(tagIds.map(id => sql`${id}`), sql`, `)})`))
        .orderBy(desc(videos.createdAt))
        .limit(limit || 1000)
        .offset(offset || 0);
      videoList = queryResult;
    }
  } else {
    videoList = await db
      .select()
      .from(videos)
      .where(and(...conditions))
      .orderBy(desc(videos.createdAt))
      .limit(limit || 1000)
      .offset(offset || 0);
  }

  // Get annotation counts for each video
  const videosWithCounts = await Promise.all(
    videoList.map(async (video) => {
      if (!video.fileId) {
        return { ...video, voiceAnnotationCount: 0, visualAnnotationCount: 0, totalAnnotationCount: 0 };
      }

      const voiceNotes = await db
        .select()
        .from(voiceAnnotations)
        .where(eq(voiceAnnotations.fileId, video.fileId));

      const drawings = await db
        .select()
        .from(visualAnnotations)
        .where(eq(visualAnnotations.fileId, video.fileId));

      return {
        ...video,
        voiceAnnotationCount: voiceNotes.length,
        visualAnnotationCount: drawings.length,
        totalAnnotationCount: voiceNotes.length + drawings.length,
      };
    })
  );

  // Sort by annotation count if requested
  if (sortBy === 'annotations') {
    videosWithCounts.sort((a, b) => b.totalAnnotationCount - a.totalAnnotationCount);
  }

  return videosWithCounts;
}

export async function getRecentlyRecordedVideos(userId: number, since: Date, limit: number = 6) {
  const db = await getDb();
  if (!db) return [];

  const videoList = await db
    .select()
    .from(videos)
    .where(
      and(
        eq(videos.userId, userId),
        sql`${videos.createdAt} >= ${since}`
      )
    )
    .orderBy(desc(videos.createdAt))
    .limit(limit);

  // Get annotation counts for each video
  const videosWithCounts = await Promise.all(
    videoList.map(async (video) => {
      if (!video.fileId) {
        return { ...video, voiceAnnotationCount: 0, visualAnnotationCount: 0, totalAnnotationCount: 0 };
      }

      const voiceNotes = await db
        .select()
        .from(voiceAnnotations)
        .where(eq(voiceAnnotations.fileId, video.fileId));

      const drawings = await db
        .select()
        .from(visualAnnotations)
        .where(eq(visualAnnotations.fileId, video.fileId));

      return {
        ...video,
        voiceAnnotationCount: voiceNotes.length,
        visualAnnotationCount: drawings.length,
        totalAnnotationCount: voiceNotes.length + drawings.length,
      };
    })
  );

  return videosWithCounts;
}

export async function getVideoById(videoId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  return result[0];
}

export async function updateVideo(videoId: number, updates: Partial<InsertVideo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(videos).set(updates).where(eq(videos.id, videoId));
}

export async function deleteVideo(videoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(annotations).where(eq(annotations.videoId, videoId));
  await db.delete(videos).where(eq(videos.id, videoId));
}

// ============= ANNOTATION QUERIES =============

export async function createAnnotation(annotation: InsertAnnotation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(annotations).values(annotation);
  return result[0].insertId;
}

export async function getAnnotationsByVideoId(videoId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(annotations)
    .where(eq(annotations.videoId, videoId))
    .orderBy(annotations.startTime);
}

export async function updateAnnotation(annotationId: number, updates: Partial<InsertAnnotation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(annotations).set(updates).where(eq(annotations.id, annotationId));
}

export async function deleteAnnotation(annotationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(annotations).where(eq(annotations.id, annotationId));
}

// ============= KNOWLEDGE GRAPH QUERIES =============

export async function createKnowledgeGraphEdge(edge: InsertKnowledgeGraphEdge) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if edge already exists
  const existing = await db
    .select()
    .from(knowledgeGraphEdges)
    .where(
      and(
        eq(knowledgeGraphEdges.sourceFileId, edge.sourceFileId),
        eq(knowledgeGraphEdges.targetFileId, edge.targetFileId)
      )!
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing edge
    await db
      .update(knowledgeGraphEdges)
      .set(edge)
      .where(eq(knowledgeGraphEdges.id, existing[0]!.id));
    return existing[0]!.id;
  }

  const result = await db.insert(knowledgeGraphEdges).values(edge);
  return result[0].insertId;
}

export async function getKnowledgeGraphEdgesByFileId(fileId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(knowledgeGraphEdges)
    .where(
      or(
        eq(knowledgeGraphEdges.sourceFileId, fileId),
        eq(knowledgeGraphEdges.targetFileId, fileId)
      )!
    )
    .orderBy(desc(knowledgeGraphEdges.strength));
}

export async function getKnowledgeGraphForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get all edges for files owned by this user
  return await db
    .select({
      id: knowledgeGraphEdges.id,
      sourceFileId: knowledgeGraphEdges.sourceFileId,
      targetFileId: knowledgeGraphEdges.targetFileId,
      relationshipType: knowledgeGraphEdges.relationshipType,
      strength: knowledgeGraphEdges.strength,
      sharedTags: knowledgeGraphEdges.sharedTags,
      sharedKeywords: knowledgeGraphEdges.sharedKeywords,
    })
    .from(knowledgeGraphEdges)
    .innerJoin(files, eq(knowledgeGraphEdges.sourceFileId, files.id))
    .where(eq(files.userId, userId));
}


// ============= SAVED SEARCHES QUERIES =============

export async function createSavedSearch(search: InsertSavedSearch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(savedSearches).values(search);
  return { id: Number(result.insertId) };
}

export async function getSavedSearchesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
}

export async function deleteSavedSearch(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(savedSearches).where(eq(savedSearches.id, id));
}

// ============= COLLECTIONS QUERIES =============

export async function createCollection(collection: InsertCollection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(collections).values(collection);
  return { id: Number(result.insertId) };
}

export async function getCollectionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const userCollections = await db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.createdAt));

  // Get file counts for each collection
  const collectionsWithCounts = await Promise.all(
    userCollections.map(async (collection) => {
      const fileCount = await db
        .select({ count: sql`count(*)` })
        .from(collectionFiles)
        .where(eq(collectionFiles.collectionId, collection.id));

      return {
        ...collection,
        fileCount: Number(fileCount[0]?.count || 0),
      };
    })
  );

  return collectionsWithCounts;
}

export async function getCollectionById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);

  return collection || null;
}

export async function updateCollection(
  id: number,
  updates: Partial<InsertCollection>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(collections).set(updates).where(eq(collections.id, id));
}

export async function deleteCollection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete all file associations first
  await db.delete(collectionFiles).where(eq(collectionFiles.collectionId, id));

  // Delete the collection
  await db.delete(collections).where(eq(collections.id, id));
}

export async function addFileToCollection(collectionId: number, fileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(collectionFiles).values({ collectionId, fileId });
}

export async function removeFileFromCollection(
  collectionId: number,
  fileId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(collectionFiles)
    .where(
      and(
        eq(collectionFiles.collectionId, collectionId),
        eq(collectionFiles.fileId, fileId)
      )
    );
}

export async function getFilesByCollection(userId: number, collectionId: number, limit?: number, offset?: number) {
  const db = await getDb();
  if (!db) return [];

  const baseQuery = db
    .select({
      id: files.id,
      title: files.title,
      description: files.description,
      url: files.url,
      fileKey: files.fileKey,
      filename: files.filename,
      mimeType: files.mimeType,
      fileSize: files.fileSize,
      enrichmentStatus: files.enrichmentStatus,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      userId: files.userId,
      addedAt: collectionFiles.addedAt,
    })
    .from(collectionFiles)
    .innerJoin(files, eq(collectionFiles.fileId, files.id))
    .where(eq(collectionFiles.collectionId, collectionId))
    .orderBy(desc(collectionFiles.addedAt));
  
  if (limit !== undefined && offset !== undefined) {
    return await baseQuery.limit(limit).offset(offset);
  } else if (limit !== undefined) {
    return await baseQuery.limit(limit);
  } else if (offset !== undefined) {
    return await baseQuery.offset(offset);
  }

  return await baseQuery;
}

export async function getFilesCountByCollection(collectionId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(collectionFiles)
    .where(eq(collectionFiles.collectionId, collectionId));
  
  return result[0]?.count || 0;
}


// ============= FILE VERSIONS QUERIES =============

export async function createFileVersion(version: InsertFileVersion): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(fileVersions).values(version);
  return Number((result as any).insertId);
}

export async function getFileVersions(fileId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.fileId, fileId))
    .orderBy(desc(fileVersions.versionNumber));
}

export async function getFileVersionById(versionId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.id, versionId))
    .limit(1);
  
  return result[0] || null;
}


// ============= METADATA TEMPLATES =============

export async function getMetadataTemplatesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(metadataTemplates)
    .where(eq(metadataTemplates.userId, userId))
    .orderBy(desc(metadataTemplates.createdAt));
}

export async function createMetadataTemplate(template: InsertMetadataTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(metadataTemplates).values(template);
  return Number((result as any).insertId);
}

export async function updateMetadataTemplate(
  id: number,
  updates: Partial<InsertMetadataTemplate>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(metadataTemplates)
    .set(updates)
    .where(eq(metadataTemplates.id, id));
}

export async function deleteMetadataTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(metadataTemplates).where(eq(metadataTemplates.id, id));
}

// ============= METADATA HISTORY =============

export async function trackMetadataUsage(
  userId: number,
  title: string | null,
  description: string | null,
  fileType: string
) {
  const db = await getDb();
  if (!db) return;
  
  // Truncate to fit database column limits
  const truncatedTitle = title ? title.substring(0, 255) : null;
  const truncatedDescription = description ? description.substring(0, 10000) : null; // TEXT column limit
  
  // Check if this exact metadata combination exists
  const existing = await db
    .select()
    .from(metadataHistory)
    .where(
      and(
        eq(metadataHistory.userId, userId),
        eq(metadataHistory.title, truncatedTitle || ""),
        eq(metadataHistory.description, truncatedDescription || ""),
        eq(metadataHistory.fileType, fileType)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    // Increment usage count
    await db
      .update(metadataHistory)
      .set({
        usageCount: sql`${metadataHistory.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(metadataHistory.id, existing[0].id));
  } else {
    // Create new history entry
    await db.insert(metadataHistory).values({
      userId,
      title: truncatedTitle,
      description: truncatedDescription,
      fileType,
      usageCount: 1,
    });
  }
}

export async function getMetadataSuggestions(userId: number, fileType: string, limit: number = 5) {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(metadataHistory)
    .where(
      and(
        eq(metadataHistory.userId, userId),
        eq(metadataHistory.fileType, fileType)
      )
    )
    .orderBy(desc(metadataHistory.usageCount), desc(metadataHistory.lastUsedAt))
    .limit(limit);
}


// ============= EXTERNAL KNOWLEDGE GRAPHS =============

export async function getExternalKnowledgeGraphsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(externalKnowledgeGraphs)
    .where(eq(externalKnowledgeGraphs.userId, userId))
    .orderBy(desc(externalKnowledgeGraphs.priority));
}

export async function getExternalKnowledgeGraphById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db
    .select()
    .from(externalKnowledgeGraphs)
    .where(eq(externalKnowledgeGraphs.id, id))
    .limit(1);
  return results[0] || null;
}

export async function createExternalKnowledgeGraph(data: InsertExternalKnowledgeGraph) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db
    .insert(externalKnowledgeGraphs)
    .values(data);
  return await getExternalKnowledgeGraphById(Number(result.insertId));
}

export async function updateExternalKnowledgeGraph(
  id: number,
  updates: Partial<Omit<InsertExternalKnowledgeGraph, "userId">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(externalKnowledgeGraphs)
    .set(updates)
    .where(eq(externalKnowledgeGraphs.id, id));
}

export async function deleteExternalKnowledgeGraph(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(externalKnowledgeGraphs)
    .where(eq(externalKnowledgeGraphs.id, id));
}


// User management functions
export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user;
}

export async function updateUser(userId: number, data: Partial<typeof users.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}

// ============= SMART COLLECTION QUERIES =============

export async function createSmartCollection(smartCollection: InsertSmartCollection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(smartCollections).values(smartCollection);
  return { id: Number(result.insertId) };
}

export async function getSmartCollectionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const userSmartCollections = await db
    .select()
    .from(smartCollections)
    .where(eq(smartCollections.userId, userId))
    .orderBy(desc(smartCollections.createdAt));

  return userSmartCollections;
}

export async function getSmartCollectionById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [smartCollection] = await db
    .select()
    .from(smartCollections)
    .where(eq(smartCollections.id, id))
    .limit(1);

  return smartCollection || null;
}

export async function updateSmartCollection(
  id: number,
  updates: Partial<InsertSmartCollection>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(smartCollections).set(updates).where(eq(smartCollections.id, id));
}

export async function deleteSmartCollection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(smartCollections).where(eq(smartCollections.id, id));
}

export async function updateSmartCollectionCache(id: number, fileCount: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(smartCollections)
    .set({ cachedFileCount: fileCount, lastEvaluatedAt: new Date() })
    .where(eq(smartCollections.id, id));
}

export async function evaluateSmartCollection(userId: number, rules: any[]) {
  const db = await getDb();
  if (!db) return [];

  // Build dynamic SQL conditions
  const conditions: any[] = [eq(files.userId, userId)];

  for (const rule of rules) {
    const { field, operator, value } = rule;

    // Map field names to actual column references
    const fieldMap: Record<string, any> = {
      fileSize: files.fileSize,
      mimeType: files.mimeType,
      enrichmentStatus: files.enrichmentStatus,
      enrichedAt: files.enrichedAt,
      createdAt: files.createdAt,
      qualityScore: sql`(SELECT COUNT(*) FROM fileTags WHERE fileTags.fileId = files.id)`,
      tagCount: sql`(SELECT COUNT(*) FROM fileTags WHERE fileTags.fileId = files.id)`,
    };

    const column = fieldMap[field];
    if (!column) continue;

    let condition;
    switch (operator) {
      case ">":
        condition = sql`${column} > ${value}`;
        break;
      case "<":
        condition = sql`${column} < ${value}`;
        break;
      case "=":
        condition = sql`${column} = ${value}`;
        break;
      case "contains":
        condition = sql`${column} LIKE ${`%${value}%`}`;
        break;
      case "startsWith":
        condition = sql`${column} LIKE ${`${value}%`}`;
        break;
      default:
        continue;
    }

    conditions.push(condition);
  }

  // Execute query with all conditions
  const result = await db
    .select()
    .from(files)
    .where(and(...conditions));

  return result;
}


// ============= DUPLICATE DETECTION =============

/**
 * Find files with similar perceptual hashes
 * @param userId - User ID to search within
 * @param hash - Perceptual hash to compare against
 * @param threshold - Maximum Hamming distance (default: 5 for near-duplicates)
 * @returns Array of similar files with similarity scores
 */
export async function findSimilarFiles(userId: number, hash: string, threshold: number = 5) {
  const db = await getDb();
  if (!db) return [];

  // Get all files with perceptual hashes for this user
  const allFiles = await db
    .select()
    .from(files)
    .where(eq(files.userId, userId));

  // Calculate Hamming distance for each file and filter by threshold
  const { compareHashes, calculateSimilarity } = await import('./perceptualHash');
  
  const similarFiles = allFiles
    .filter(file => file.perceptualHash)
    .map(file => ({
      ...file,
      hammingDistance: compareHashes(hash, file.perceptualHash!),
      similarity: calculateSimilarity(hash, file.perceptualHash!)
    }))
    .filter(file => file.hammingDistance <= threshold)
    .sort((a, b) => a.hammingDistance - b.hammingDistance);

  return similarFiles;
}

/**
 * Update perceptual hash for a file
 */
export async function updateFileHash(fileId: number, perceptualHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(files)
    .set({ perceptualHash })
    .where(eq(files.id, fileId));
}

/**
 * Check if a file with the same hash already exists for the user
 */
export async function findExactDuplicate(userId: number, hash: string) {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(files)
    .where(and(
      eq(files.userId, userId),
      eq(files.perceptualHash, hash)
    ))
    .limit(1);

  return results[0] || null;
}


// ============= SCHEDULED EXPORTS =============

export async function createScheduledExport(data: InsertScheduledExport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(scheduledExports).values(data);
  return Number((result as any).insertId);
}

export async function getScheduledExportsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(scheduledExports)
    .where(eq(scheduledExports.userId, userId))
    .orderBy(desc(scheduledExports.createdAt));
}

export async function getScheduledExportById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(scheduledExports)
    .where(eq(scheduledExports.id, id))
    .limit(1);

  return results[0] || null;
}

export async function updateScheduledExport(id: number, data: Partial<InsertScheduledExport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(scheduledExports)
    .set(data)
    .where(eq(scheduledExports.id, id));
}

export async function deleteScheduledExport(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(scheduledExports)
    .where(eq(scheduledExports.id, id));
}

export async function getActiveScheduledExports() {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(scheduledExports)
    .where(eq(scheduledExports.isActive, true));
}

// ============= EXPORT HISTORY =============

export async function createExportHistory(data: InsertExportHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(exportHistory).values(data);
  return Number((result as any).insertId);
}

export async function getExportHistoryByUser(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(exportHistory)
    .where(eq(exportHistory.userId, userId))
    .orderBy(desc(exportHistory.createdAt))
    .limit(limit);
}

export async function updateExportHistory(id: number, data: Partial<InsertExportHistory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(exportHistory)
    .set(data)
    .where(eq(exportHistory.id, id));
}

export async function getExportHistoryByScheduledExport(scheduledExportId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(exportHistory)
    .where(eq(exportHistory.scheduledExportId, scheduledExportId))
    .orderBy(desc(exportHistory.createdAt))
    .limit(limit);
}


// ==================== Image Annotations ====================

export async function saveImageAnnotation(data: {
  fileId: number;
  userId: number;
  annotationData: any;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Check if annotation already exists for this file
  const existing = await db
    .select()
    .from(imageAnnotations)
    .where(eq(imageAnnotations.fileId, data.fileId))
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing annotation
    await db
      .update(imageAnnotations)
      .set({
        annotationData: data.annotationData,
        version: existing[0].version + 1,
        updatedAt: new Date(),
      })
      .where(eq(imageAnnotations.id, existing[0].id));
    
    return existing[0].id;
  } else {
    // Create new annotation
    const result = await db.insert(imageAnnotations).values({
      fileId: data.fileId,
      userId: data.userId,
      annotationData: data.annotationData,
      version: 1,
    });
    
    return result[0].insertId;
  }
}

export async function getImageAnnotation(fileId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const result = await db
    .select()
    .from(imageAnnotations)
    .where(eq(imageAnnotations.fileId, fileId))
    .limit(1);
  
  return result[0] || null;
}

export async function deleteImageAnnotation(fileId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  await db
    .delete(imageAnnotations)
    .where(eq(imageAnnotations.fileId, fileId));
}


// ==================== Bulk Operations ====================

export async function bulkDeleteFiles(fileIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Delete files that belong to the user
  const result = await db
    .delete(files)
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.userId, userId)
      )
    );
  
  return result;
}

export async function bulkAddTagsToFiles(fileIds: number[], tagIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Verify files belong to user
  const userFiles = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.userId, userId)
      )
    );
  
  const validFileIds = userFiles.map(f => f.id);
  
  // Create file-tag associations
  const associations = [];
  for (const fileId of validFileIds) {
    for (const tagId of tagIds) {
      associations.push({ fileId, tagId });
    }
  }
  
  if (associations.length > 0) {
    // Insert and skip duplicates
    try {
      await db.insert(fileTags).values(associations);
    } catch (error: any) {
      // Ignore duplicate key errors
      if (!error.message?.includes('Duplicate entry')) {
        throw error;
      }
    }
  }
  
  return { filesTagged: validFileIds.length, tagsApplied: tagIds.length };
}

export async function bulkRemoveTagsFromFiles(fileIds: number[], tagIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Verify files belong to user
  const userFiles = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.userId, userId)
      )
    );
  
  const validFileIds = userFiles.map(f => f.id);
  
  if (validFileIds.length === 0) {
    return { filesUntagged: 0, tagsRemoved: 0 };
  }
  
  // Remove file-tag associations
  const result = await db
    .delete(fileTags)
    .where(
      and(
        inArray(fileTags.fileId, validFileIds),
        inArray(fileTags.tagId, tagIds)
      )
    );
  
  return { filesUntagged: validFileIds.length, tagsRemoved: tagIds.length };
}

export async function bulkAddFilesToCollection(fileIds: number[], collectionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Verify collection belongs to user
  const collection = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.id, collectionId),
        eq(collections.userId, userId)
      )
    )
    .limit(1);
  
  if (collection.length === 0) {
    throw new Error('Collection not found');
  }
  
  // Verify files belong to user
  const userFiles = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.userId, userId)
      )
    );
  
  const validFileIds = userFiles.map(f => f.id);
  
  // Add files to collection
  const associations = validFileIds.map(fileId => ({
    collectionId,
    fileId,
  }));
  
  if (associations.length > 0) {
    try {
      await db.insert(collectionFiles).values(associations);
    } catch (error: any) {
      // Ignore duplicate key errors
      if (!error.message?.includes('Duplicate entry')) {
        throw error;
      }
    }
  }
  
  return { filesAdded: validFileIds.length };
}

export async function bulkRemoveFilesFromCollection(fileIds: number[], collectionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Verify collection belongs to user
  const collection = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.id, collectionId),
        eq(collections.userId, userId)
      )
    )
    .limit(1);
  
  if (collection.length === 0) {
    throw new Error('Collection not found');
  }
  
  // Remove files from collection
  await db
    .delete(collectionFiles)
    .where(
      and(
        eq(collectionFiles.collectionId, collectionId),
        inArray(collectionFiles.fileId, fileIds)
      )
    );
  
  return { filesRemoved: fileIds.length };
}

// Batch re-enrichment operations
export async function batchReEnrichFiles(fileIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  
  // Update enrichment status to pending for selected files
  const result = await db
    .update(files)
    .set({ 
      enrichmentStatus: 'pending',
      updatedAt: new Date()
    })
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.userId, userId)
      )
    );
  
  return { count: fileIds.length };
}

export async function getFileEnrichmentStatus(fileIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  
  const fileStatuses = await db
    .select({
      id: files.id,
      enrichmentStatus: files.enrichmentStatus,
      filename: files.filename
    })
    .from(files)
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.userId, userId)
      )
    );
  
  return fileStatuses;
}

// User profile management
export async function updateUserProfile(
  userId: number,
  updates: {
    name?: string;
    location?: string;
    age?: number;
    company?: string;
    jobTitle?: string;
    bio?: string;
    reasonForUse?: string;
    avatarUrl?: string;
    profileCompleted?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  
  await db
    .update(users)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function recordUserConsents(
  userId: number,
  consents: {
    termsOfService: boolean;
    privacyPolicy: boolean;
    marketingEmails: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  
  const { userConsents, emailPreferences } = await import("../drizzle/schema");
  const { nanoid } = await import("nanoid");
  
  // Record individual consents
  const consentRecords = [
    { userId, consentType: "terms_of_service" as const, consented: consents.termsOfService },
    { userId, consentType: "privacy_policy" as const, consented: consents.privacyPolicy },
    { userId, consentType: "marketing_emails" as const, consented: consents.marketingEmails },
  ];
  
  for (const consent of consentRecords) {
    await db.insert(userConsents).values(consent);
  }
  
  // Create or update email preferences
  const unsubscribeToken = nanoid(32);
  await db
    .insert(emailPreferences)
    .values({
      userId,
      marketingEmails: consents.marketingEmails,
      unsubscribeToken,
    })
    .onDuplicateKeyUpdate({
      set: {
        marketingEmails: consents.marketingEmails,
      },
    });
}

export async function deactivateUserAccount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  
  await db
    .update(users)
    .set({
      accountStatus: "deactivated",
      deactivatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function getEmailPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  
  const { emailPreferences } = await import("../drizzle/schema");
  
  const prefs = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);
  
  return prefs[0] || null;
}

export async function updateEmailPreferences(
  userId: number,
  updates: {
    marketingEmails?: boolean;
    productUpdates?: boolean;
    securityAlerts?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  
  const { emailPreferences } = await import("../drizzle/schema");
  
  await db
    .update(emailPreferences)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(emailPreferences.userId, userId));
}


// ============= RECENTLY VIEWED FILES =============
export async function trackFileView(fileId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Upsert: update viewedAt if exists, insert if not
  await db
    .insert(recentlyViewedFiles)
    .values({ fileId, userId, viewedAt: new Date() })
    .onDuplicateKeyUpdate({
      set: { viewedAt: new Date() }
    });
  
  return { success: true };
}

export async function getRecentlyViewedFiles(userId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const result = await db
    .select({
      file: files,
      viewedAt: recentlyViewedFiles.viewedAt,
    })
    .from(recentlyViewedFiles)
    .innerJoin(files, eq(recentlyViewedFiles.fileId, files.id))
    .where(eq(recentlyViewedFiles.userId, userId))
    .orderBy(desc(recentlyViewedFiles.viewedAt))
    .limit(limit);
  
  return result;
}


// ============= FILE ACTIVITY LOGS FUNCTIONS =============

export async function trackFileActivity(params: {
  userId: number;
  fileId?: number;
  activityType: "upload" | "view" | "edit" | "tag" | "share" | "delete" | "enrich" | "export";
  details?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const { fileActivityLogs, files, users } = await import("../drizzle/schema");

  await db.insert(fileActivityLogs).values({
    userId: params.userId,
    fileId: params.fileId,
    activityType: params.activityType,
    details: params.details,
  });

  // Broadcast activity event via WebSocket
  try {
    const { broadcastActivityEvent } = await import("./_core/websocketBroadcast");
    
    // Get file name if fileId is provided
    let fileName: string | undefined;
    if (params.fileId) {
      const [file] = await db.select({ filename: files.filename }).from(files).where(eq(files.id, params.fileId)).limit(1);
      fileName = file?.filename;
    }
    
    // Get user name
    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, params.userId)).limit(1);
    const userName = user?.name || "Unknown";
    
    broadcastActivityEvent(
      params.activityType,
      params.fileId,
      fileName,
      params.details,
      params.userId,
      userName
    );
  } catch (error) {
    // Silently fail if broadcast fails
    console.error("Failed to broadcast activity event:", error);
  }

  return { success: true };
}

export async function getActivityLogs(params: {
  userId: number;
  limit?: number;
  offset?: number;
  activityType?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const { fileActivityLogs } = await import("../drizzle/schema");

  let conditions: any[] = [eq(fileActivityLogs.userId, params.userId)];

  if (params.activityType) {
    conditions.push(eq(fileActivityLogs.activityType, params.activityType as any));
  }

  if (params.startDate) {
    conditions.push(gte(fileActivityLogs.createdAt, params.startDate));
  }

  if (params.endDate) {
    conditions.push(lte(fileActivityLogs.createdAt, params.endDate));
  }

  let query = db
    .select({
      id: fileActivityLogs.id,
      userId: fileActivityLogs.userId,
      fileId: fileActivityLogs.fileId,
      activityType: fileActivityLogs.activityType,
      details: fileActivityLogs.details,
      createdAt: fileActivityLogs.createdAt,
      file: {
        id: files.id,
        filename: files.filename,
        mimeType: files.mimeType,
        url: files.url,
      },
    })
    .from(fileActivityLogs)
    .leftJoin(files, eq(fileActivityLogs.fileId, files.id))
    .where(and(...conditions))
    .orderBy(desc(fileActivityLogs.createdAt))
    .$dynamic();

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.offset) {
    query = query.offset(params.offset);
  }

  return await query;
}

export async function getActivityStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const { fileActivityLogs } = await import("../drizzle/schema");

  const [totalActivities] = await db
    .select({ count: sql<number>`count(*)` })
    .from(fileActivityLogs)
    .where(eq(fileActivityLogs.userId, userId));

  const activityByType = await db
    .select({
      activityType: fileActivityLogs.activityType,
      count: sql<number>`count(*)`,
    })
    .from(fileActivityLogs)
    .where(eq(fileActivityLogs.userId, userId))
    .groupBy(fileActivityLogs.activityType);

  return {
    totalActivities: totalActivities.count,
    activityByType,
  };
}


// ============= ACTIVITY NOTIFICATION PREFERENCES FUNCTIONS =============

export async function getActivityNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const { activityNotificationPreferences } = await import("../drizzle/schema");

  const [prefs] = await db
    .select()
    .from(activityNotificationPreferences)
    .where(eq(activityNotificationPreferences.userId, userId))
    .limit(1);

  // Return defaults if no preferences exist
  if (!prefs) {
    return {
      userId,
      enableUploadNotifications: true,
      enableViewNotifications: false,
      enableEditNotifications: true,
      enableTagNotifications: true,
      enableShareNotifications: true,
      enableDeleteNotifications: true,
      enableEnrichNotifications: true,
      enableExportNotifications: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      emailDigestFrequency: "immediate" as const,
    };
  }

  return prefs;
}

export async function upsertActivityNotificationPreferences(params: {
  userId: number;
  enableUploadNotifications?: boolean;
  enableViewNotifications?: boolean;
  enableEditNotifications?: boolean;
  enableTagNotifications?: boolean;
  enableShareNotifications?: boolean;
  enableDeleteNotifications?: boolean;
  enableEnrichNotifications?: boolean;
  enableExportNotifications?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  emailDigestFrequency?: "immediate" | "daily" | "weekly" | "disabled";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const { activityNotificationPreferences } = await import("../drizzle/schema");

  // Check if preferences exist
  const [existing] = await db
    .select()
    .from(activityNotificationPreferences)
    .where(eq(activityNotificationPreferences.userId, params.userId))
    .limit(1);

  if (existing) {
    // Update existing preferences
    await db
      .update(activityNotificationPreferences)
      .set({
        enableUploadNotifications: params.enableUploadNotifications ?? existing.enableUploadNotifications,
        enableViewNotifications: params.enableViewNotifications ?? existing.enableViewNotifications,
        enableEditNotifications: params.enableEditNotifications ?? existing.enableEditNotifications,
        enableTagNotifications: params.enableTagNotifications ?? existing.enableTagNotifications,
        enableShareNotifications: params.enableShareNotifications ?? existing.enableShareNotifications,
        enableDeleteNotifications: params.enableDeleteNotifications ?? existing.enableDeleteNotifications,
        enableEnrichNotifications: params.enableEnrichNotifications ?? existing.enableEnrichNotifications,
        enableExportNotifications: params.enableExportNotifications ?? existing.enableExportNotifications,
        quietHoursStart: params.quietHoursStart !== undefined ? params.quietHoursStart : existing.quietHoursStart,
        quietHoursEnd: params.quietHoursEnd !== undefined ? params.quietHoursEnd : existing.quietHoursEnd,
        emailDigestFrequency: params.emailDigestFrequency ?? existing.emailDigestFrequency,
      })
      .where(eq(activityNotificationPreferences.userId, params.userId));
  } else {
    // Insert new preferences
    await db.insert(activityNotificationPreferences).values({
      userId: params.userId,
      enableUploadNotifications: params.enableUploadNotifications ?? true,
      enableViewNotifications: params.enableViewNotifications ?? false,
      enableEditNotifications: params.enableEditNotifications ?? true,
      enableTagNotifications: params.enableTagNotifications ?? true,
      enableShareNotifications: params.enableShareNotifications ?? true,
      enableDeleteNotifications: params.enableDeleteNotifications ?? true,
      enableEnrichNotifications: params.enableEnrichNotifications ?? true,
      enableExportNotifications: params.enableExportNotifications ?? true,
      quietHoursStart: params.quietHoursStart ?? null,
      quietHoursEnd: params.quietHoursEnd ?? null,
      emailDigestFrequency: params.emailDigestFrequency ?? "immediate",
    });
  }

  return await getActivityNotificationPreferences(params.userId);
}


// ============= VIDEO TAGS HELPERS =============

export async function getVideoTagsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(videoTags)
    .where(eq(videoTags.userId, userId))
    .orderBy(videoTags.name);
}

export async function createVideoTag(tag: InsertVideoTag) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(videoTags).values(tag);
  return result[0].insertId;
}

export async function updateVideoTag(tagId: number, userId: number, updates: Partial<InsertVideoTag>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(videoTags)
    .set(updates)
    .where(and(eq(videoTags.id, tagId), eq(videoTags.userId, userId)));
}

export async function deleteVideoTag(tagId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // First delete all assignments
  await db
    .delete(videoTagAssignments)
    .where(eq(videoTagAssignments.tagId, tagId));

  // Then delete the tag
  await db
    .delete(videoTags)
    .where(and(eq(videoTags.id, tagId), eq(videoTags.userId, userId)));
}

export async function assignTagToVideo(videoId: number, tagId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify the video belongs to the user
  const video = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
    .limit(1);

  if (!video.length) throw new Error("Video not found");

  // Check if assignment already exists
  const existing = await db
    .select()
    .from(videoTagAssignments)
    .where(and(eq(videoTagAssignments.videoId, videoId), eq(videoTagAssignments.tagId, tagId)))
    .limit(1);

  if (existing.length) return; // Already assigned

  await db.insert(videoTagAssignments).values({ videoId, tagId });
}

export async function removeTagFromVideo(videoId: number, tagId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify the video belongs to the user
  const video = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
    .limit(1);

  if (!video.length) throw new Error("Video not found");

  await db
    .delete(videoTagAssignments)
    .where(and(eq(videoTagAssignments.videoId, videoId), eq(videoTagAssignments.tagId, tagId)));
}

export async function getTagsForVideo(videoId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Verify the video belongs to the user
  const video = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
    .limit(1);

  if (!video.length) return [];

  const result = await db
    .select({
      id: videoTags.id,
      name: videoTags.name,
      color: videoTags.color,
    })
    .from(videoTagAssignments)
    .innerJoin(videoTags, eq(videoTagAssignments.tagId, videoTags.id))
    .where(eq(videoTagAssignments.videoId, videoId));

  return result;
}

// ==================== Video Transcripts ====================

export async function createVideoTranscript(transcript: InsertVideoTranscript) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(videoTranscripts).values(transcript);
  return result[0].insertId;
}

export async function getVideoTranscriptByFileId(fileId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.fileId, fileId))
    .limit(1);

  return result[0] || null;
}

export async function updateVideoTranscript(
  transcriptId: number,
  updates: Partial<InsertVideoTranscript>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(videoTranscripts)
    .set(updates)
    .where(eq(videoTranscripts.id, transcriptId));
}

export async function updateVideoTranscriptStatus(
  transcriptId: number,
  status: "pending" | "processing" | "completed" | "failed"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(videoTranscripts)
    .set({ status })
    .where(eq(videoTranscripts.id, transcriptId));
}

// ==================== File Suggestions ====================

export async function createFileSuggestion(suggestion: InsertFileSuggestion) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(fileSuggestions).values(suggestion);
  return result[0].insertId;
}

export async function getFileSuggestionsByVideoId(
  videoFileId: number,
  status?: "active" | "dismissed" | "accepted"
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(fileSuggestions.videoFileId, videoFileId)];
  if (status) {
    conditions.push(eq(fileSuggestions.status, status));
  }

  const result = await db
    .select()
    .from(fileSuggestions)
    .where(and(...conditions))
    .orderBy(fileSuggestions.startTime);
    
  return result;
}

export async function getFileSuggestionById(suggestionId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(fileSuggestions)
    .where(eq(fileSuggestions.id, suggestionId))
    .limit(1);

  return result[0] || null;
}

export async function updateFileSuggestionStatus(
  suggestionId: number,
  status: "active" | "dismissed" | "accepted",
  feedback?: "helpful" | "not_helpful" | "irrelevant"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: any = { status };
  if (feedback) {
    updates.userFeedback = feedback;
    updates.feedbackAt = new Date();
  }

  await db
    .update(fileSuggestions)
    .set(updates)
    .where(eq(fileSuggestions.id, suggestionId));
}


// ============= VIDEO CHAPTERS QUERIES =============

export async function getVideoChapters(fileId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(videoChapters)
    .where(eq(videoChapters.fileId, fileId))
    .orderBy(videoChapters.sortOrder);
}

export async function createVideoChapter(data: InsertVideoChapter) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(videoChapters).values(data);
  return result[0].insertId;
}

export async function updateVideoChapter(id: number, data: Partial<InsertVideoChapter>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(videoChapters).set(data).where(eq(videoChapters.id, id));
}

export async function deleteVideoChapter(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(videoChapters).where(eq(videoChapters.id, id));
}


// ============= UPLOAD HISTORY QUERIES =============

export async function createUploadHistoryRecord(data: {
  userId: number;
  fileId?: number;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadType: 'video' | 'file';
  status: 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  startedAt: Date;
  durationSeconds?: number;
  averageSpeed?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { uploadHistory } = await import("../drizzle/schema");

  const result = await db.insert(uploadHistory).values({
    userId: data.userId,
    fileId: data.fileId,
    filename: data.filename,
    fileSize: data.fileSize,
    mimeType: data.mimeType,
    uploadType: data.uploadType,
    status: data.status,
    errorMessage: data.errorMessage,
    startedAt: data.startedAt,
    durationSeconds: data.durationSeconds,
    averageSpeed: data.averageSpeed,
  });

  return result[0].insertId;
}

export async function getUploadHistory(params: {
  userId: number;
  limit?: number;
  offset?: number;
  status?: 'completed' | 'failed' | 'cancelled';
  uploadType?: 'video' | 'file';
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { uploadHistory } = await import("../drizzle/schema");

  const conditions: any[] = [eq(uploadHistory.userId, params.userId)];

  if (params.status) {
    conditions.push(eq(uploadHistory.status, params.status));
  }

  if (params.uploadType) {
    conditions.push(eq(uploadHistory.uploadType, params.uploadType));
  }

  if (params.startDate) {
    conditions.push(gte(uploadHistory.completedAt, params.startDate));
  }

  if (params.endDate) {
    conditions.push(lte(uploadHistory.completedAt, params.endDate));
  }

  let query = db
    .select()
    .from(uploadHistory)
    .where(and(...conditions))
    .orderBy(desc(uploadHistory.completedAt))
    .$dynamic();

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.offset) {
    query = query.offset(params.offset);
  }

  return await query;
}

export async function getUploadHistoryStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { uploadHistory } = await import("../drizzle/schema");

  // Total uploads by status
  const statusCounts = await db
    .select({
      status: uploadHistory.status,
      count: sql<number>`count(*)`,
      totalSize: sql<number>`sum(${uploadHistory.fileSize})`,
    })
    .from(uploadHistory)
    .where(eq(uploadHistory.userId, userId))
    .groupBy(uploadHistory.status);

  // Total uploads by type
  const typeCounts = await db
    .select({
      uploadType: uploadHistory.uploadType,
      count: sql<number>`count(*)`,
      totalSize: sql<number>`sum(${uploadHistory.fileSize})`,
    })
    .from(uploadHistory)
    .where(eq(uploadHistory.userId, userId))
    .groupBy(uploadHistory.uploadType);

  // Recent uploads (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentUploads = await db
    .select({
      date: sql<string>`DATE(${uploadHistory.completedAt})`,
      count: sql<number>`count(*)`,
      totalSize: sql<number>`sum(${uploadHistory.fileSize})`,
    })
    .from(uploadHistory)
    .where(
      and(
        eq(uploadHistory.userId, userId),
        gte(uploadHistory.completedAt, sevenDaysAgo)
      )
    )
    .groupBy(sql`DATE(${uploadHistory.completedAt})`);

  return {
    statusCounts,
    typeCounts,
    recentUploads,
  };
}


// ============= DUPLICATE DETECTION QUERIES =============

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingFile?: {
    id: number;
    filename: string;
    fileSize: number;
    url: string;
    createdAt: Date;
    type: 'video' | 'file';
  };
}

export interface DuplicateCheckInput {
  filename: string;
  fileSize: number;
  type: 'video' | 'file';
}

/**
 * Check for duplicate files by filename and size
 * Returns the existing file if a duplicate is found
 */
export async function checkForDuplicateFile(
  userId: number,
  input: DuplicateCheckInput
): Promise<DuplicateCheckResult> {
  const db = await getDb();
  if (!db) return { isDuplicate: false };

  if (input.type === 'video') {
    // Check videos table
    const existingVideo = await db
      .select({
        id: videos.id,
        filename: videos.filename,
        url: videos.url,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .where(
        and(
          eq(videos.userId, userId),
          eq(videos.filename, input.filename)
        )
      )
      .limit(1);

    if (existingVideo.length > 0) {
      return {
        isDuplicate: true,
        existingFile: {
          id: existingVideo[0].id,
          filename: existingVideo[0].filename,
          fileSize: input.fileSize, // Videos table doesn't store fileSize, use input
          url: existingVideo[0].url,
          createdAt: existingVideo[0].createdAt,
          type: 'video',
        },
      };
    }
  } else {
    // Check files table
    const existingFile = await db
      .select({
        id: files.id,
        filename: files.filename,
        fileSize: files.fileSize,
        url: files.url,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(
        and(
          eq(files.userId, userId),
          eq(files.filename, input.filename),
          eq(files.fileSize, input.fileSize)
        )
      )
      .limit(1);

    if (existingFile.length > 0) {
      return {
        isDuplicate: true,
        existingFile: {
          id: existingFile[0].id,
          filename: existingFile[0].filename,
          fileSize: existingFile[0].fileSize,
          url: existingFile[0].url,
          createdAt: existingFile[0].createdAt,
          type: 'file',
        },
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Check for multiple duplicate files at once
 * Returns a map of filename to duplicate check result
 */
export async function checkForDuplicateFiles(
  userId: number,
  inputs: DuplicateCheckInput[]
): Promise<Map<string, DuplicateCheckResult>> {
  const results = new Map<string, DuplicateCheckResult>();
  
  // Process in batches to avoid overwhelming the database
  for (const input of inputs) {
    const result = await checkForDuplicateFile(userId, input);
    // Use filename + size as key to handle same filename with different sizes
    const key = `${input.filename}:${input.fileSize}`;
    results.set(key, result);
  }

  return results;
}


// ============= STORAGE STATISTICS QUERIES =============

export interface StorageStats {
  totalBytes: number;
  fileCount: number;
  videoCount: number;
  breakdown: {
    type: string;
    bytes: number;
    count: number;
  }[];
  largestFiles: {
    id: number;
    filename: string;
    fileSize: number;
    mimeType: string;
    createdAt: Date;
    type: 'file' | 'video';
  }[];
  recentUploads: {
    date: string;
    bytes: number;
    count: number;
  }[];
}

/**
 * Get storage statistics for a user
 */
export async function getStorageStats(userId: number): Promise<StorageStats> {
  const db = await getDb();
  if (!db) {
    return {
      totalBytes: 0,
      fileCount: 0,
      videoCount: 0,
      breakdown: [],
      largestFiles: [],
      recentUploads: [],
    };
  }

  // Get file statistics
  const fileStats = await db
    .select({
      totalBytes: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(files)
    .where(eq(files.userId, userId));

  // Get video count (videos don't store fileSize in DB, we'll estimate from upload history)
  const videoStats = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(videos)
    .where(eq(videos.userId, userId));

  // Get video storage from upload history
  const { uploadHistory } = await import("../drizzle/schema");
  const videoStorageStats = await db
    .select({
      totalBytes: sql<number>`COALESCE(SUM(${uploadHistory.fileSize}), 0)`,
    })
    .from(uploadHistory)
    .where(
      and(
        eq(uploadHistory.userId, userId),
        eq(uploadHistory.uploadType, 'video'),
        eq(uploadHistory.status, 'completed')
      )
    );

  // Get breakdown by file type (for files table)
  const fileBreakdown = await db
    .select({
      mimeType: files.mimeType,
      bytes: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(files)
    .where(eq(files.userId, userId))
    .groupBy(files.mimeType);

  // Categorize mime types
  const breakdown: StorageStats['breakdown'] = [];
  const categories: Record<string, { bytes: number; count: number }> = {
    'Images': { bytes: 0, count: 0 },
    'Documents': { bytes: 0, count: 0 },
    'Videos': { bytes: Number(videoStorageStats[0]?.totalBytes || 0), count: Number(videoStats[0]?.count || 0) },
    'Audio': { bytes: 0, count: 0 },
    'Other': { bytes: 0, count: 0 },
  };

  for (const row of fileBreakdown) {
    const mime = row.mimeType || '';
    const bytes = Number(row.bytes);
    const count = Number(row.count);

    if (mime.startsWith('image/')) {
      categories['Images'].bytes += bytes;
      categories['Images'].count += count;
    } else if (mime.startsWith('video/')) {
      categories['Videos'].bytes += bytes;
      categories['Videos'].count += count;
    } else if (mime.startsWith('audio/')) {
      categories['Audio'].bytes += bytes;
      categories['Audio'].count += count;
    } else if (
      mime.includes('pdf') ||
      mime.includes('document') ||
      mime.includes('text') ||
      mime.includes('spreadsheet') ||
      mime.includes('presentation')
    ) {
      categories['Documents'].bytes += bytes;
      categories['Documents'].count += count;
    } else {
      categories['Other'].bytes += bytes;
      categories['Other'].count += count;
    }
  }

  for (const [type, data] of Object.entries(categories)) {
    if (data.count > 0 || type === 'Videos') {
      breakdown.push({ type, bytes: data.bytes, count: data.count });
    }
  }

  // Get largest files
  const largestFilesResult = await db
    .select({
      id: files.id,
      filename: files.filename,
      fileSize: files.fileSize,
      mimeType: files.mimeType,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(desc(files.fileSize))
    .limit(10);

  const largestFiles: StorageStats['largestFiles'] = largestFilesResult.map(f => ({
    id: f.id,
    filename: f.filename,
    fileSize: f.fileSize,
    mimeType: f.mimeType || 'application/octet-stream',
    createdAt: f.createdAt,
    type: 'file' as const,
  }));

  // Get recent upload trends (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentUploadsResult = await db
    .select({
      date: sql<string>`DATE(${files.createdAt})`,
      bytes: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        gte(files.createdAt, thirtyDaysAgo)
      )
    )
    .groupBy(sql`DATE(${files.createdAt})`)
    .orderBy(sql`DATE(${files.createdAt})`);

  const recentUploads = recentUploadsResult.map(r => ({
    date: String(r.date),
    bytes: Number(r.bytes),
    count: Number(r.count),
  }));

  const totalFileBytes = Number(fileStats[0]?.totalBytes || 0);
  const totalVideoBytes = Number(videoStorageStats[0]?.totalBytes || 0);

  return {
    totalBytes: totalFileBytes + totalVideoBytes,
    fileCount: Number(fileStats[0]?.count || 0),
    videoCount: Number(videoStats[0]?.count || 0),
    breakdown: breakdown.sort((a, b) => b.bytes - a.bytes),
    largestFiles,
    recentUploads,
  };
}


// ============= SHARE LINK QUERIES =============

export async function createShareLink(data: InsertShareLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shareLinks).values(data);
  return result[0].insertId;
}

export async function getShareLinkByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  return result[0] || null;
}

export async function getShareLinkById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.id, id))
    .limit(1);
  return result[0] || null;
}

export async function getShareLinksByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.userId, userId))
    .orderBy(desc(shareLinks.createdAt));
}

export async function getShareLinksForFile(fileId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.fileId, fileId))
    .orderBy(desc(shareLinks.createdAt));
}

export async function getShareLinksForVideo(videoId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.videoId, videoId))
    .orderBy(desc(shareLinks.createdAt));
}

export async function updateShareLink(id: number, updates: Partial<InsertShareLink>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shareLinks).set(updates).where(eq(shareLinks.id, id));
}

export async function deleteShareLink(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(shareLinks).where(eq(shareLinks.id, id));
}

export async function incrementShareLinkViewCount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
      lastAccessedAt: new Date(),
    })
    .where(eq(shareLinks.id, id));
}

export async function logShareAccess(data: InsertShareAccessLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(shareAccessLog).values(data);
}

export async function getShareAccessLogs(shareLinkId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(shareAccessLog)
    .where(eq(shareAccessLog.shareLinkId, shareLinkId))
    .orderBy(desc(shareAccessLog.accessedAt))
    .limit(limit);
}


export async function getShareLinksForCollection(collectionId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.collectionId, collectionId))
    .orderBy(desc(shareLinks.createdAt));
}

export async function getFilesInCollection(collectionId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      id: files.id,
      filename: files.filename,
      url: files.url,
      mimeType: files.mimeType,
      fileSize: files.fileSize,
      title: files.title,
      description: files.description,
    })
    .from(collectionFiles)
    .innerJoin(files, eq(collectionFiles.fileId, files.id))
    .where(eq(collectionFiles.collectionId, collectionId));
  return result;
}


// ============= KNOWLEDGE GRAPH QUERIES =============

export async function getAllTags(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Get all tags with their usage counts
  const result = await db
    .select({
      id: tags.id,
      name: tags.name,
      usageCount: sql<number>`COUNT(DISTINCT ${fileTags.fileId})`,
    })
    .from(tags)
    .leftJoin(fileTags, eq(tags.id, fileTags.tagId))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id, tags.name);
  
  return result.map(r => ({
    id: r.id,
    name: r.name,
    usageCount: Number(r.usageCount) || 0,
  }));
}

export async function getTagRelationships(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Get user's tags first
  const userTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.userId, userId));
  
  const tagNameToId = new Map(userTags.map(t => [t.name, t.id]));
  const tagNames = userTags.map(t => t.name);
  
  if (tagNames.length === 0) return [];
  
  // Get relationships from the tagRelationships table
  const result = await db
    .select({
      sourceTag: tagRelationships.sourceTag,
      targetTag: tagRelationships.targetTag,
      confidence: tagRelationships.confidence,
      relationshipType: tagRelationships.relationshipType,
    })
    .from(tagRelationships)
    .where(
      and(
        inArray(tagRelationships.sourceTag, tagNames),
        inArray(tagRelationships.targetTag, tagNames)
      )
    );
  
  return result.map(r => ({
    sourceTagId: tagNameToId.get(r.sourceTag) || 0,
    targetTagId: tagNameToId.get(r.targetTag) || 0,
    similarity: Number(r.confidence) || 0,
    relationshipType: r.relationshipType || 'related',
  }));
}

export async function getFilesForUser(userId: number, options?: { limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const limit = options?.limit || 100;
  
  const result = await db
    .select({
      id: files.id,
      name: files.filename,
      fileType: files.mimeType,
    })
    .from(files)
    .where(eq(files.userId, userId))
    .limit(limit);
  
  return result;
}

/**
 * Get direct file-to-tag association edges for the graph
 * Creates edges between file nodes and their assigned tag nodes
 */
export async function getFileToTagEdges(
  userId: number
): Promise<Array<{ source: string; target: string; weight: number; type: string }>> {
  const db = await getDb();
  if (!db) return [];
  
  const fileTagAssociations = await db
    .select({
      fileId: fileTags.fileId,
      tagId: fileTags.tagId,
    })
    .from(fileTags)
    .innerJoin(files, eq(fileTags.fileId, files.id))
    .where(eq(files.userId, userId));
  
  return fileTagAssociations.map(({ fileId, tagId }) => ({
    source: `file-${fileId}`,
    target: `tag-${tagId}`,
    weight: 0.8,
    type: 'file-tag',
  }));
}

/**
 * Get tag co-occurrence edges based on file-tag associations
 * Tags that appear together on the same files are considered related
 */
export async function getFileTagCoOccurrenceEdges(
  userId: number,
  minSimilarity: number = 0.3
): Promise<Array<{ source: string; target: string; weight: number; type: string }>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get all file-tag associations for the user
  const fileTagAssociations = await db
    .select({
      fileId: fileTags.fileId,
      tagId: fileTags.tagId,
    })
    .from(fileTags)
    .innerJoin(files, eq(fileTags.fileId, files.id))
    .where(eq(files.userId, userId));
  
  if (fileTagAssociations.length === 0) return [];
  
  // Build a map of fileId -> tagIds
  const fileToTags = new Map<number, Set<number>>();
  const tagToFiles = new Map<number, Set<number>>();
  
  for (const { fileId, tagId } of fileTagAssociations) {
    if (!fileToTags.has(fileId)) {
      fileToTags.set(fileId, new Set());
    }
    fileToTags.get(fileId)!.add(tagId);
    
    if (!tagToFiles.has(tagId)) {
      tagToFiles.set(tagId, new Set());
    }
    tagToFiles.get(tagId)!.add(fileId);
  }
  
  // Calculate co-occurrence between tags
  // Jaccard similarity: |A ∩ B| / |A ∪ B|
  const edges: Array<{ source: string; target: string; weight: number; type: string }> = [];
  const tagIds = Array.from(tagToFiles.keys());
  
  for (let i = 0; i < tagIds.length; i++) {
    for (let j = i + 1; j < tagIds.length; j++) {
      const tagA = tagIds[i];
      const tagB = tagIds[j];
      const filesA = tagToFiles.get(tagA)!;
      const filesB = tagToFiles.get(tagB)!;
      
      // Calculate intersection
      const intersection = new Set(Array.from(filesA).filter(f => filesB.has(f)));
      if (intersection.size === 0) continue;
      
      // Calculate union
      const union = new Set([...Array.from(filesA), ...Array.from(filesB)]);
      
      // Jaccard similarity
      const similarity = intersection.size / union.size;
      
      if (similarity >= minSimilarity) {
        edges.push({
          source: `tag-${tagA}`,
          target: `tag-${tagB}`,
          weight: similarity,
          type: 'co-occurrence',
        });
      }
    }
  }
  
  return edges;
}


// ============= VISUAL CAPTIONS QUERIES =============

export async function createVisualCaption(data: InsertVisualCaption) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(visualCaptions).values(data);
  return result[0].insertId;
}

export async function getVisualCaptionByFileId(fileId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(visualCaptions)
    .where(eq(visualCaptions.fileId, fileId))
    .orderBy(desc(visualCaptions.createdAt))
    .limit(1);
  return result[0] || null;
}

export async function updateVisualCaption(
  id: number,
  updates: Partial<InsertVisualCaption>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(visualCaptions).set(updates).where(eq(visualCaptions.id, id));
}

export async function createVisualCaptionFileMatch(data: InsertVisualCaptionFileMatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(visualCaptionFileMatches).values(data);
  return result[0].insertId;
}

export async function getVisualCaptionFileMatches(
  videoFileId: number,
  status?: "active" | "dismissed" | "accepted"
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(visualCaptionFileMatches.videoFileId, videoFileId)];
  if (status) {
    conditions.push(eq(visualCaptionFileMatches.status, status));
  }

  const matches = await db
    .select({
      id: visualCaptionFileMatches.id,
      visualCaptionId: visualCaptionFileMatches.visualCaptionId,
      videoFileId: visualCaptionFileMatches.videoFileId,
      suggestedFileId: visualCaptionFileMatches.suggestedFileId,
      timestamp: visualCaptionFileMatches.timestamp,
      captionText: visualCaptionFileMatches.captionText,
      matchedEntities: visualCaptionFileMatches.matchedEntities,
      relevanceScore: visualCaptionFileMatches.relevanceScore,
      matchReasoning: visualCaptionFileMatches.matchReasoning,
      status: visualCaptionFileMatches.status,
      userFeedback: visualCaptionFileMatches.userFeedback,
      createdAt: visualCaptionFileMatches.createdAt,
      // Join with files to get suggested file info
      suggestedFile: {
        id: files.id,
        filename: files.filename,
        title: files.title,
        description: files.description,
        mimeType: files.mimeType,
        url: files.url,
        fileSize: files.fileSize,
      },
    })
    .from(visualCaptionFileMatches)
    .innerJoin(files, eq(visualCaptionFileMatches.suggestedFileId, files.id))
    .where(and(...conditions))
    .orderBy(visualCaptionFileMatches.timestamp);

  return matches;
}

export async function updateVisualCaptionFileMatchStatus(
  matchId: number,
  status: "active" | "dismissed" | "accepted",
  feedback?: "helpful" | "not_helpful" | "irrelevant"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: any = { status };
  if (feedback) {
    updates.userFeedback = feedback;
  }

  await db
    .update(visualCaptionFileMatches)
    .set(updates)
    .where(eq(visualCaptionFileMatches.id, matchId));
}

export async function deleteVisualCaptionFileMatches(videoFileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(visualCaptionFileMatches)
    .where(eq(visualCaptionFileMatches.videoFileId, videoFileId));
}

// Search visual captions across all videos for a user
export async function searchVisualCaptions(userId: number, searchQuery: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get all visual captions for the user
  const allCaptions = await db
    .select({
      id: visualCaptions.id,
      fileId: visualCaptions.fileId,
      captions: visualCaptions.captions,
      status: visualCaptions.status,
      createdAt: visualCaptions.createdAt,
      filename: files.filename,
      title: files.title,
      url: files.url,
      mimeType: files.mimeType,
    })
    .from(visualCaptions)
    .innerJoin(files, eq(visualCaptions.fileId, files.id))
    .where(
      and(
        eq(visualCaptions.userId, userId),
        eq(visualCaptions.status, "completed")
      )
    );

  // Search through captions JSON for matching text
  const query = searchQuery.toLowerCase();
  const results: Array<{
    fileId: number;
    filename: string;
    title: string | null;
    url: string;
    mimeType: string;
    timestamp: number;
    caption: string;
    entities: string[];
    confidence: number;
  }> = [];

  for (const row of allCaptions) {
    const captions = row.captions as Array<{
      timestamp: number;
      caption: string;
      entities: string[];
      confidence: number;
    }>;
    if (!captions) continue;

    for (const cap of captions) {
      const captionMatch = cap.caption.toLowerCase().includes(query);
      const entityMatch = cap.entities.some((e) =>
        e.toLowerCase().includes(query)
      );
      if (captionMatch || entityMatch) {
        results.push({
          fileId: row.fileId,
          filename: row.filename,
          title: row.title,
          url: row.url,
          mimeType: row.mimeType,
          timestamp: cap.timestamp,
          caption: cap.caption,
          entities: cap.entities,
          confidence: cap.confidence,
        });
      }
    }
  }

  return results;
}

// Get all visual captions for a user (summary)
export async function getAllVisualCaptionsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select({
      id: visualCaptions.id,
      fileId: visualCaptions.fileId,
      status: visualCaptions.status,
      totalFramesAnalyzed: visualCaptions.totalFramesAnalyzed,
      createdAt: visualCaptions.createdAt,
      filename: files.filename,
      title: files.title,
      url: files.url,
    })
    .from(visualCaptions)
    .innerJoin(files, eq(visualCaptions.fileId, files.id))
    .where(eq(visualCaptions.userId, userId))
    .orderBy(desc(visualCaptions.createdAt));
}

// Get caption analytics for a user (aggregate stats)
export async function getCaptionAnalytics(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all completed captions for the user
  const allCaptions = await db
    .select({
      id: visualCaptions.id,
      fileId: visualCaptions.fileId,
      captions: visualCaptions.captions,
      totalFramesAnalyzed: visualCaptions.totalFramesAnalyzed,
      status: visualCaptions.status,
      createdAt: visualCaptions.createdAt,
    })
    .from(visualCaptions)
    .where(eq(visualCaptions.userId, userId));

  const completed = allCaptions.filter((c) => c.status === "completed");
  const processing = allCaptions.filter((c) => c.status === "processing");
  const failed = allCaptions.filter((c) => c.status === "failed");

  // Aggregate entity counts and confidence scores
  let totalCaptions = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;
  const entityCounts: Record<string, number> = {};

  for (const vc of completed) {
    const caps = vc.captions as Array<{
      timestamp: number;
      caption: string;
      entities: string[];
      confidence: number;
    }>;
    if (!caps) continue;
    totalCaptions += caps.length;
    for (const c of caps) {
      if (c.confidence) {
        totalConfidence += c.confidence;
        confidenceCount++;
      }
      if (c.entities) {
        for (const entity of c.entities) {
          const normalized = entity.toLowerCase().trim();
          entityCounts[normalized] = (entityCounts[normalized] || 0) + 1;
        }
      }
    }
  }

  // Get top entities sorted by count
  const topEntities = Object.entries(entityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([entity, count]) => ({ entity, count }));

  // Get file match stats
  const allMatches = await db
    .select({
      id: visualCaptionFileMatches.id,
      status: visualCaptionFileMatches.status,
      relevanceScore: visualCaptionFileMatches.relevanceScore,
    })
    .from(visualCaptionFileMatches)
    .where(eq(visualCaptionFileMatches.userId, userId));

  const acceptedMatches = allMatches.filter((m) => m.status === "accepted");
  const dismissedMatches = allMatches.filter((m) => m.status === "dismissed");
  const activeMatches = allMatches.filter((m) => m.status === "active");
  const avgRelevance =
    allMatches.length > 0
      ? allMatches.reduce((sum, m) => sum + (m.relevanceScore || 0), 0) / allMatches.length
      : 0;

  return {
    videosCaptioned: completed.length,
    videosProcessing: processing.length,
    videosFailed: failed.length,
    totalCaptions,
    avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    topEntities,
    uniqueEntities: Object.keys(entityCounts).length,
    fileMatches: {
      total: allMatches.length,
      accepted: acceptedMatches.length,
      dismissed: dismissedMatches.length,
      active: activeMatches.length,
      avgRelevance,
    },
  };
}

// Get all captioned video file IDs for a user (for bulk matching)
export async function getCaptionedVideoFileIds(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db
    .select({
      fileId: visualCaptions.fileId,
    })
    .from(visualCaptions)
    .where(
      and(
        eq(visualCaptions.userId, userId),
        eq(visualCaptions.status, "completed")
      )
    );
  return results.map((r) => r.fileId);
}
