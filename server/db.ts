import { eq, and, desc, sql, or, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  files,
  InsertFile,
  tags,
  InsertTag,
  fileTags,
  InsertFileTag,
  videos,
  InsertVideo,
  annotations,
  InsertAnnotation,
  knowledgeGraphEdges,
  InsertKnowledgeGraphEdge,
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

  const searchPattern = `%${query}%`;
  
  return await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        or(
          like(files.title, searchPattern),
          like(files.description, searchPattern),
          like(files.aiAnalysis, searchPattern),
          like(files.ocrText, searchPattern),
          like(files.voiceTranscript, searchPattern)
        )!
      )!
    )
    .orderBy(desc(files.createdAt));
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
