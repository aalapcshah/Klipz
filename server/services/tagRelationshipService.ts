/**
 * Tag Relationship Service
 * Builds and maintains semantic relationships between tags based on:
 * 1. Co-occurrence analysis (tags that appear together on files)
 * 2. Embedding similarity (semantic similarity using LLM embeddings)
 * 3. External knowledge graph connections (Wikidata, DBpedia)
 */

import { getDb } from "../db";
import { tags, fileTags, tagEmbeddings, tagRelationships } from "../../drizzle/schema";
import { eq, and, sql, desc, ne, inArray } from "drizzle-orm";
import { generateTagEmbedding, cosineSimilarity } from "./embeddingService";

export interface TagRelationshipResult {
  sourceTag: string;
  targetTag: string;
  relationshipType: "parent" | "child" | "related" | "synonym";
  confidence: number;
  source: string;
}

/**
 * Calculate co-occurrence score between two tags
 * Based on how often they appear together on the same files
 */
export async function calculateCoOccurrence(
  tagName1: string,
  tagName2: string,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get files that have both tags
  const result = await db.execute(sql`
    SELECT 
      COUNT(DISTINCT ft1.fileId) as coOccurrenceCount,
      (SELECT COUNT(DISTINCT ft.fileId) FROM file_tags ft 
       INNER JOIN tags t ON ft.tagId = t.id 
       WHERE t.name = ${tagName1} AND t.userId = ${userId}) as tag1Count,
      (SELECT COUNT(DISTINCT ft.fileId) FROM file_tags ft 
       INNER JOIN tags t ON ft.tagId = t.id 
       WHERE t.name = ${tagName2} AND t.userId = ${userId}) as tag2Count
    FROM file_tags ft1
    INNER JOIN tags t1 ON ft1.tagId = t1.id
    INNER JOIN file_tags ft2 ON ft1.fileId = ft2.fileId
    INNER JOIN tags t2 ON ft2.tagId = t2.id
    WHERE t1.name = ${tagName1} AND t2.name = ${tagName2} 
      AND t1.userId = ${userId} AND t2.userId = ${userId}
  `);

  const row = (result as any)[0]?.[0];
  if (!row) return 0;

  const coOccurrence = Number(row.coOccurrenceCount) || 0;
  const tag1Count = Number(row.tag1Count) || 1;
  const tag2Count = Number(row.tag2Count) || 1;

  // Jaccard similarity: intersection / union
  const union = tag1Count + tag2Count - coOccurrence;
  return union > 0 ? coOccurrence / union : 0;
}

/**
 * Get or create embedding for a tag
 */
export async function getOrCreateTagEmbedding(tagName: string): Promise<number[] | null> {
  const db = await getDb();
  if (!db) return null;

  // Check if embedding exists
  const existing = await db
    .select({ embedding: tagEmbeddings.embedding })
    .from(tagEmbeddings)
    .where(eq(tagEmbeddings.tagName, tagName.toLowerCase()))
    .limit(1);

  if (existing.length > 0 && existing[0].embedding) {
    return existing[0].embedding as number[];
  }

  // Generate new embedding
  const embedding = await generateTagEmbedding(tagName);
  
  // Store it
  await db.insert(tagEmbeddings).values({
    tagName: tagName.toLowerCase(),
    embedding,
  }).onDuplicateKeyUpdate({
    set: { embedding, updatedAt: new Date() }
  });

  return embedding;
}

/**
 * Calculate semantic similarity between two tags using embeddings
 */
export async function calculateSemanticSimilarity(
  tagName1: string,
  tagName2: string
): Promise<number> {
  const embedding1 = await getOrCreateTagEmbedding(tagName1);
  const embedding2 = await getOrCreateTagEmbedding(tagName2);

  if (!embedding1 || !embedding2) return 0;

  return cosineSimilarity(embedding1, embedding2);
}

/**
 * Build relationships for a single tag based on co-occurrence
 */
export async function buildTagCoOccurrenceRelationships(
  tagName: string,
  userId: number,
  minConfidence: number = 0.2
): Promise<TagRelationshipResult[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all other tags for this user
  const userTags = await db
    .select({ name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), ne(tags.name, tagName)));

  const relationships: TagRelationshipResult[] = [];

  for (const otherTag of userTags) {
    const coOccurrence = await calculateCoOccurrence(tagName, otherTag.name, userId);
    
    if (coOccurrence >= minConfidence) {
      relationships.push({
        sourceTag: tagName,
        targetTag: otherTag.name,
        relationshipType: "related",
        confidence: coOccurrence,
        source: "co-occurrence",
      });
    }
  }

  return relationships;
}

/**
 * Build all tag relationships for a user
 */
export async function buildAllTagRelationships(
  userId: number,
  options: {
    useCoOccurrence?: boolean;
    useEmbeddings?: boolean;
    minCoOccurrence?: number;
    minSimilarity?: number;
    maxRelationshipsPerTag?: number;
  } = {}
): Promise<{ created: number; updated: number }> {
  const db = await getDb();
  if (!db) return { created: 0, updated: 0 };

  const {
    useCoOccurrence = true,
    useEmbeddings = true,
    minCoOccurrence = 0.1,
    minSimilarity = 0.6,
    maxRelationshipsPerTag = 10,
  } = options;

  // Get all tags for user
  const userTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.userId, userId));

  if (userTags.length < 2) {
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  // Process each pair of tags
  for (let i = 0; i < userTags.length; i++) {
    const tag1 = userTags[i];
    const relationships: Array<{
      targetTag: string;
      confidence: number;
      type: "parent" | "child" | "related" | "synonym";
      source: string;
    }> = [];

    for (let j = i + 1; j < userTags.length; j++) {
      const tag2 = userTags[j];
      let maxConfidence = 0;
      let source = "";

      // Calculate co-occurrence
      if (useCoOccurrence) {
        const coOccurrence = await calculateCoOccurrence(tag1.name, tag2.name, userId);
        if (coOccurrence >= minCoOccurrence && coOccurrence > maxConfidence) {
          maxConfidence = coOccurrence;
          source = "co-occurrence";
        }
      }

      // Calculate embedding similarity
      if (useEmbeddings) {
        const similarity = await calculateSemanticSimilarity(tag1.name, tag2.name);
        if (similarity >= minSimilarity && similarity > maxConfidence) {
          maxConfidence = similarity;
          source = "embedding";
        }
      }

      if (maxConfidence > 0) {
        relationships.push({
          targetTag: tag2.name,
          confidence: maxConfidence,
          type: "related",
          source,
        });
      }
    }

    // Sort by confidence and take top N
    relationships.sort((a, b) => b.confidence - a.confidence);
    const topRelationships = relationships.slice(0, maxRelationshipsPerTag);

    // Store relationships
    for (const rel of topRelationships) {
      try {
        // Check if relationship exists
        const existing = await db
          .select({ id: tagRelationships.id })
          .from(tagRelationships)
          .where(
            and(
              eq(tagRelationships.sourceTag, tag1.name),
              eq(tagRelationships.targetTag, rel.targetTag)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing
          await db
            .update(tagRelationships)
            .set({
              confidence: rel.confidence,
              source: "auto" as const,
            })
            .where(eq(tagRelationships.id, existing[0].id));
          updated++;
        } else {
          // Create new
          await db.insert(tagRelationships).values({
            sourceTag: tag1.name,
            targetTag: rel.targetTag,
            relationshipType: rel.type,
            confidence: rel.confidence,
            source: rel.source === 'co-occurrence' || rel.source === 'embedding' ? 'auto' : 'auto',
          });
          created++;
        }
      } catch (error) {
        console.error(`[TagRelationshipService] Error storing relationship ${tag1.name} -> ${rel.targetTag}:`, error);
      }
    }
  }

  return { created, updated };
}

/**
 * Get related tags for a given tag
 */
export async function getRelatedTags(
  tagName: string,
  minConfidence: number = 0.3,
  limit: number = 10
): Promise<Array<{ tag: string; confidence: number; relationshipType: string; source: string }>> {
  const db = await getDb();
  if (!db) return [];

  // Get relationships where this tag is either source or target
  const results = await db
    .select({
      sourceTag: tagRelationships.sourceTag,
      targetTag: tagRelationships.targetTag,
      confidence: tagRelationships.confidence,
      relationshipType: tagRelationships.relationshipType,
      source: tagRelationships.source,
    })
    .from(tagRelationships)
    .where(
      sql`(${tagRelationships.sourceTag} = ${tagName} OR ${tagRelationships.targetTag} = ${tagName}) 
          AND ${tagRelationships.confidence} >= ${minConfidence}`
    )
    .orderBy(desc(tagRelationships.confidence))
    .limit(limit);

  return results.map((r) => ({
    tag: r.sourceTag === tagName ? r.targetTag : r.sourceTag,
    confidence: Number(r.confidence),
    relationshipType: r.relationshipType,
    source: r.source || "unknown",
  }));
}

/**
 * Get all tag relationships for graph visualization
 */
export async function getAllTagRelationshipsForGraph(
  userId: number,
  minConfidence: number = 0.3
): Promise<Array<{
  source: string;
  target: string;
  weight: number;
  type: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Get user's tags first
  const userTagNames = await db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.userId, userId));

  const tagNameSet = new Set(userTagNames.map((t) => t.name));

  // Get relationships involving user's tags
  const results = await db
    .select({
      sourceTag: tagRelationships.sourceTag,
      targetTag: tagRelationships.targetTag,
      confidence: tagRelationships.confidence,
      relationshipType: tagRelationships.relationshipType,
    })
    .from(tagRelationships)
    .where(sql`${tagRelationships.confidence} >= ${minConfidence}`)
    .orderBy(desc(tagRelationships.confidence));

  // Filter to only include relationships where both tags belong to user
  return results
    .filter((r) => tagNameSet.has(r.sourceTag) && tagNameSet.has(r.targetTag))
    .map((r) => ({
      source: `tag-${r.sourceTag}`,
      target: `tag-${r.targetTag}`,
      weight: Number(r.confidence),
      type: r.relationshipType,
    }));
}

/**
 * Trigger relationship building for a specific tag (e.g., after tag creation)
 */
export async function updateTagRelationships(
  tagName: string,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get all other tags for user
  const userTags = await db
    .select({ name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), ne(tags.name, tagName)));

  let created = 0;

  for (const otherTag of userTags) {
    // Calculate both co-occurrence and semantic similarity
    const coOccurrence = await calculateCoOccurrence(tagName, otherTag.name, userId);
    const similarity = await calculateSemanticSimilarity(tagName, otherTag.name);

    // Use the higher of the two
    const confidence = Math.max(coOccurrence, similarity);
    const source = coOccurrence > similarity ? "co-occurrence" : "embedding";

    if (confidence >= 0.3) {
      try {
        await db
          .insert(tagRelationships)
          .values({
            sourceTag: tagName,
            targetTag: otherTag.name,
            relationshipType: "related",
            confidence,
            source: "auto",
          })
          .onDuplicateKeyUpdate({
            set: { confidence, source: "auto" as const },
          });
        created++;
      } catch (error) {
        // Ignore duplicate key errors
      }
    }
  }

  return created;
}
