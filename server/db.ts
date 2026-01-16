import { eq, and, or, like, gte, lte, inArray, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(files).values(file);
  return result[0].insertId;
}

export async function getFilesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(desc(files.createdAt));
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
    enrichmentStatus?: "pending" | "completed" | "failed";
    dateFrom?: number;
    dateTo?: number;
    limit?: number;
    offset?: number;
  }
) {
  const db = await getDb();
  if (!db) return { files: [], total: 0 };

  const conditions: any[] = [eq(files.userId, userId)];

  // Text search across title and description
  if (filters.query && filters.query.trim()) {
    conditions.push(
      or(
        like(files.title, `%${filters.query}%`),
        like(files.description, `%${filters.query}%`)
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

// ============= VIDEO QUERIES =============

export async function createVideo(video: InsertVideo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(videos).values(video);
  return result[0].insertId;
}

export async function getVideosByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(videos)
    .where(eq(videos.userId, userId))
    .orderBy(desc(videos.createdAt));
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

export async function getFilesByCollection(collectionId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
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

  return result;
}
