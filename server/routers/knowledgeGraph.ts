/**
 * Knowledge Graph Router - tRPC endpoints for tag enrichment and suggestions
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getAllTags, getTagRelationships, getFilesForUser, getFileTagCoOccurrenceEdges, getFileToTagEdges, getAllVisualCaptionsByUser, getVisualCaptionByFileId } from "../db";
import { getDb } from "../db";
import { visualCaptions, files as filesTable } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  buildAllTagRelationships,
  getRelatedTags,
  getAllTagRelationshipsForGraph,
  updateTagRelationships,
} from "../services/tagRelationshipService";
import {
  getUnifiedTagSuggestions,
  analyzeTagsWithKnowledgeGraph,
  searchKnowledgeGraph,
  findSimilarTagsWithEmbeddings,
  generateStructuredData,
  getTagHierarchy,
} from "../services/knowledgeGraphService";
import { searchWikidataEntities, enrichTagWithWikidata } from "../services/wikidataService";
import { searchDBpediaEntities } from "../services/dbpediaService";
import { classifyContentByTags, getAllSchemaTypes } from "../services/schemaOrgService";

export const knowledgeGraphRouter = router({
  /**
   * Check if external API keys are configured on the server
   */
  checkApiKeyStatus: protectedProcedure
    .query(async () => {
      return {
        googleKg: !!process.env.GOOGLE_API_KEY,
      };
    }),

  /**
   * Get smart tag suggestions from all knowledge graph sources
   */
  getSuggestions: protectedProcedure
    .input(z.object({
      existingTags: z.array(z.string()),
      context: z.string().optional(),
      settings: z.object({
        enableWikidata: z.boolean().optional(),
        enableDBpedia: z.boolean().optional(),
        enableSchemaOrg: z.boolean().optional(),
        enableLLM: z.boolean().optional(),
        maxSuggestionsPerSource: z.number().optional(),
        confidenceThreshold: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const suggestions = await getUnifiedTagSuggestions(
        input.existingTags,
        input.context,
        input.settings
      );
      return { suggestions };
    }),

  /**
   * Analyze tags with full knowledge graph enrichment
   */
  analyzeTags: protectedProcedure
    .input(z.object({
      tags: z.array(z.string()),
      settings: z.object({
        enableWikidata: z.boolean().optional(),
        enableDBpedia: z.boolean().optional(),
        enableSchemaOrg: z.boolean().optional(),
        enableLLM: z.boolean().optional(),
      }).optional(),
    }))
    .query(async ({ input }) => {
      return await analyzeTagsWithKnowledgeGraph(input.tags, input.settings);
    }),

  /**
   * Search across knowledge graph sources
   */
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      sources: z.array(z.enum(['wikidata', 'dbpedia', 'all'])).optional(),
    }))
    .query(async ({ input }) => {
      const settings = {
        enableWikidata: !input.sources || input.sources.includes('all') || input.sources.includes('wikidata'),
        enableDBpedia: !input.sources || input.sources.includes('all') || input.sources.includes('dbpedia'),
      };
      return await searchKnowledgeGraph(input.query, settings);
    }),

  /**
   * Get tag hierarchy (parents, siblings, children)
   */
  getTagHierarchy: protectedProcedure
    .input(z.object({
      tag: z.string().min(1),
    }))
    .query(async ({ input }) => {
      return await getTagHierarchy(input.tag);
    }),

  /**
   * Enrich a single tag with Wikidata information
   */
  enrichTag: protectedProcedure
    .input(z.object({
      tag: z.string().min(1),
      language: z.string().default('en'),
    }))
    .query(async ({ input }) => {
      return await enrichTagWithWikidata(input.tag, input.language);
    }),

  /**
   * Classify content based on tags using Schema.org
   */
  classifyContent: publicProcedure
    .input(z.object({
      tags: z.array(z.string()),
    }))
    .query(({ input }) => {
      const classifications = classifyContentByTags(input.tags);
      return classifications.map(c => ({
        typeId: c.type.id,
        label: c.type.label,
        description: c.type.description,
        confidence: c.confidence,
        matchedKeywords: c.matchedKeywords,
      }));
    }),

  /**
   * Get all available Schema.org types
   */
  getSchemaTypes: publicProcedure
    .query(() => {
      return getAllSchemaTypes();
    }),

  /**
   * Generate JSON-LD structured data for a file
   */
  generateStructuredData: protectedProcedure
    .input(z.object({
      name: z.string(),
      url: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()),
      createdAt: z.date().optional(),
    }))
    .query(({ input }) => {
      return generateStructuredData(input);
    }),

  /**
   * Find semantically similar tags using embeddings
   */
  findSimilarTags: protectedProcedure
    .input(z.object({
      targetTag: z.string().min(1),
      candidateTags: z.array(z.string()),
      threshold: z.number().min(0).max(1).default(0.7),
    }))
    .mutation(async ({ input }) => {
      return await findSimilarTagsWithEmbeddings(
        input.targetTag,
        input.candidateTags,
        input.threshold
      );
    }),

  /**
   * Search Wikidata entities directly
   */
  searchWikidata: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      language: z.string().default('en'),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      return await searchWikidataEntities(input.query, input.language, input.limit);
    }),

  /**
   * Search DBpedia entities directly
   */
  searchDBpedia: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      return await searchDBpediaEntities(input.query, input.limit);
    }),

  /**
   * Get graph data for visualization
   */
  getGraphData: protectedProcedure
    .input(z.object({
      includeFiles: z.boolean().default(true),
      minSimilarity: z.number().min(0).max(1).default(0.3),
    }))
    .query(async ({ ctx, input }) => {
      // Get all tags with their usage counts
      const tags = await getAllTags(ctx.user.id);
      
      // Get tag relationships from the tagRelationships table
      const tagRelationships = await getTagRelationships(ctx.user.id);
      
      // Get files if requested
      const files = await getFilesForUser(ctx.user.id, { limit: 100 });
      
      // Also get file-tag associations to build co-occurrence edges
      const fileTagEdges = await getFileTagCoOccurrenceEdges(ctx.user.id, input.minSimilarity);
      
      // Get direct file-to-tag association edges
      const fileToTagEdges = input.includeFiles ? await getFileToTagEdges(ctx.user.id) : [];
      
      // Build nodes from tags
      const tagNodes = tags.map((tag: { id: number; name: string; usageCount: number }) => ({
        id: `tag-${tag.id}`,
        type: 'tag' as const,
        label: tag.name,
        weight: tag.usageCount || 1,
        metadata: { tagId: tag.id },
      }));
      
      // Build nodes from files
      const fileNodes = files.map((file: { id: number; name: string; fileType: string }) => ({
        id: `file-${file.id}`,
        type: 'file' as const,
        label: file.name,
        weight: 1,
        metadata: { fileId: file.id, fileType: file.fileType },
      }));
      
      // ===== ENTITY NODES FROM VISUAL CAPTIONS =====
      // Extract entities from completed visual captions and add them as nodes
      const entityNodeMap = new Map<string, { count: number; fileIds: number[] }>();
      const entityEdges: Array<{ source: string; target: string; weight: number; type: string }> = [];
      
      try {
        const drizzle = await getDb();
        if (drizzle) {
          // Get all completed visual captions for this user
          const captionRecords = await drizzle
            .select({
              fileId: visualCaptions.fileId,
              captions: visualCaptions.captions,
            })
            .from(visualCaptions)
            .where(
              and(
                eq(visualCaptions.userId, ctx.user.id),
                eq(visualCaptions.status, "completed")
              )
            );
          
          // Extract entities from each caption record
          for (const record of captionRecords) {
            const captions = record.captions as Array<{
              timestamp: number;
              caption: string;
              entities: string[];
              confidence: number;
            }> | null;
            
            if (!captions || !Array.isArray(captions)) continue;
            
            const fileEntitySet = new Set<string>();
            for (const caption of captions) {
              if (caption.entities && Array.isArray(caption.entities)) {
                for (const entity of caption.entities) {
                  const normalized = entity.trim();
                  if (!normalized || normalized.length < 2) continue;
                  fileEntitySet.add(normalized);
                  
                  const existing = entityNodeMap.get(normalized);
                  if (existing) {
                    if (!existing.fileIds.includes(record.fileId)) {
                      existing.fileIds.push(record.fileId);
                    }
                    existing.count++;
                  } else {
                    entityNodeMap.set(normalized, { count: 1, fileIds: [record.fileId] });
                  }
                }
              }
            }
            
            // Create entity-to-file edges
            for (const entity of Array.from(fileEntitySet)) {
              entityEdges.push({
                source: `entity-${entity}`,
                target: `file-${record.fileId}`,
                weight: 0.7,
                type: 'entity-appears-in',
              });
            }
          }
          
          // Create entity-to-entity co-occurrence edges (entities appearing in the same video)
          const entityList = Array.from(entityNodeMap.entries());
          for (let i = 0; i < entityList.length && i < 100; i++) {
            for (let j = i + 1; j < entityList.length && j < 100; j++) {
              const [entityA, dataA] = entityList[i];
              const [entityB, dataB] = entityList[j];
              // Check if they share any files
              const sharedFiles = dataA.fileIds.filter(f => dataB.fileIds.includes(f));
              if (sharedFiles.length > 0) {
                const weight = Math.min(1, sharedFiles.length * 0.3);
                entityEdges.push({
                  source: `entity-${entityA}`,
                  target: `entity-${entityB}`,
                  weight,
                  type: 'entity-co-occurrence',
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('[KnowledgeGraph] Error loading entity nodes:', err);
      }
      
      // Build entity nodes (limit to top 50 by occurrence count)
      const sortedEntities = Array.from(entityNodeMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50);
      
      const entityNodes = sortedEntities.map(([name, data]) => ({
        id: `entity-${name}`,
        type: 'entity' as const,
        label: name,
        weight: data.count,
        metadata: { videoCount: data.fileIds.length },
      }));
      
      // Build edges from tag relationships table
      const storedEdges = tagRelationships.map((rel: { sourceTagId: number; targetTagId: number; similarity: number; relationshipType: string }) => ({
        source: `tag-${rel.sourceTagId}`,
        target: `tag-${rel.targetTagId}`,
        weight: rel.similarity,
        type: rel.relationshipType,
      }));
      
      // Merge stored edges with co-occurrence edges (deduplicate)
      const edgeMap = new Map<string, { source: string; target: string; weight: number; type: string }>();
      
      // Add stored edges first
      for (const edge of storedEdges) {
        const key = [edge.source, edge.target].sort().join('-');
        edgeMap.set(key, edge);
      }
      
      // Add co-occurrence edges (only if not already present or if weight is higher)
      for (const edge of fileTagEdges) {
        const key = [edge.source, edge.target].sort().join('-');
        const existing = edgeMap.get(key);
        if (!existing || edge.weight > existing.weight) {
          edgeMap.set(key, edge);
        }
      }
      
      // Add file-to-tag association edges
      for (const edge of fileToTagEdges) {
        const key = [edge.source, edge.target].sort().join('-');
        if (!edgeMap.has(key)) {
          edgeMap.set(key, edge);
        }
      }
      
      // Add entity edges (only for entities that made it into the top 50)
      const entityNodeIds = new Set(entityNodes.map(n => n.id));
      for (const edge of entityEdges) {
        if (entityNodeIds.has(edge.source) || entityNodeIds.has(edge.target)) {
          // Only add if at least one end is an entity node that exists
          const sourceExists = entityNodeIds.has(edge.source) || edgeMap.has(edge.source) || 
            [...tagNodes, ...fileNodes].some(n => n.id === edge.source);
          const targetExists = entityNodeIds.has(edge.target) || edgeMap.has(edge.target) || 
            [...tagNodes, ...fileNodes].some(n => n.id === edge.target);
          if (sourceExists && targetExists) {
            const key = [edge.source, edge.target].sort().join('-');
            if (!edgeMap.has(key)) {
              edgeMap.set(key, edge);
            }
          }
        }
      }
      
      const edges = Array.from(edgeMap.values());
      
      return {
        nodes: [...tagNodes, ...fileNodes, ...entityNodes],
        edges,
        stats: {
          totalTags: tags.length,
          totalFiles: files.length,
          totalEntities: entityNodes.length,
          totalRelationships: edges.length,
        },
      };
    }),

  /**
   * Get knowledge graph statistics
   */
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      const tags = await getAllTags(ctx.user.id);
      const tagRelationships = await getTagRelationships(ctx.user.id);
      const files = await getFilesForUser(ctx.user.id, { limit: 1000 });
      
      // Count unique sources
      const sources = new Set<string>();
      sources.add('internal');
      
      return {
        totalTags: tags.length,
        totalFiles: files.length,
        totalRelationships: tagRelationships.length,
        totalSources: sources.size,
        sourceCounts: {
          wikidata: 0,
          dbpedia: 0,
          schemaOrg: 0,
          internal: tags.length,
        },
      };
    }),

  /**
   * Build tag relationships based on co-occurrence and semantic similarity
   */
  buildRelationships: protectedProcedure
    .input(z.object({
      useCoOccurrence: z.boolean().default(true),
      useEmbeddings: z.boolean().default(true),
      minCoOccurrence: z.number().min(0).max(1).default(0.1),
      minSimilarity: z.number().min(0).max(1).default(0.6),
      maxRelationshipsPerTag: z.number().min(1).max(50).default(10),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const result = await buildAllTagRelationships(ctx.user.id, input || {});
      return {
        success: true,
        created: result.created,
        updated: result.updated,
        message: `Created ${result.created} new relationships, updated ${result.updated} existing ones.`,
      };
    }),

  /**
   * Get related tags for a specific tag
   */
  getRelatedTags: protectedProcedure
    .input(z.object({
      tagName: z.string().min(1),
      minConfidence: z.number().min(0).max(1).default(0.3),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      return await getRelatedTags(input.tagName, input.minConfidence, input.limit);
    }),

  /**
   * Update relationships for a single tag (after tag creation/modification)
   */
  updateTagRelationships: protectedProcedure
    .input(z.object({
      tagName: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await updateTagRelationships(input.tagName, ctx.user.id);
      return {
        success: true,
        relationshipsCreated: count,
      };
    }),

  /**
   * Get all tag relationships for graph visualization (using new service)
   */
  getTagRelationshipsForGraph: protectedProcedure
    .input(z.object({
      minConfidence: z.number().min(0).max(1).default(0.3),
    }))
    .query(async ({ ctx, input }) => {
      return await getAllTagRelationshipsForGraph(ctx.user.id, input.minConfidence);
    }),

  /**
   * Export graph data in JSON or CSV format
   */
  exportGraphData: protectedProcedure
    .input(z.object({
      format: z.enum(['json', 'csv']),
      includeFiles: z.boolean().default(true),
      minSimilarity: z.number().min(0).max(1).default(0.3),
      relationshipType: z.enum(['all', 'co-occurrence', 'semantic', 'file-tag']).default('all'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get all tags with their usage counts
      const tags = await getAllTags(ctx.user.id);
      
      // Get tag relationships from the tagRelationships table
      const tagRelationships = await getTagRelationships(ctx.user.id);
      
      // Get files if requested
      const files = input.includeFiles ? await getFilesForUser(ctx.user.id, { limit: 1000 }) : [];
      
      // Get file-tag associations to build co-occurrence edges
      const fileTagEdges = await getFileTagCoOccurrenceEdges(ctx.user.id, input.minSimilarity);
      
      // Get direct file-to-tag association edges
      const fileToTagEdges = input.includeFiles ? await getFileToTagEdges(ctx.user.id) : [];
      
      // Build nodes from tags
      const tagNodes = tags.map((tag: { id: number; name: string; usageCount: number }) => ({
        id: `tag-${tag.id}`,
        type: 'tag' as const,
        label: tag.name,
        weight: tag.usageCount || 1,
      }));
      
      // Build nodes from files
      const fileNodes = files.map((file: { id: number; name: string; fileType: string }) => ({
        id: `file-${file.id}`,
        type: 'file' as const,
        label: file.name,
        weight: 1,
      }));
      
      // Build edges from tag relationships table
      const storedEdges = tagRelationships.map((rel: { sourceTagId: number; targetTagId: number; similarity: number; relationshipType: string }) => ({
        source: `tag-${rel.sourceTagId}`,
        target: `tag-${rel.targetTagId}`,
        weight: rel.similarity,
        type: rel.relationshipType || 'semantic',
      }));
      
      // Merge stored edges with co-occurrence edges (deduplicate)
      const edgeMap = new Map<string, { source: string; target: string; weight: number; type: string }>();
      
      for (const edge of storedEdges) {
        const key = [edge.source, edge.target].sort().join('-');
        edgeMap.set(key, edge);
      }
      
      for (const edge of fileTagEdges) {
        const key = [edge.source, edge.target].sort().join('-');
        const existing = edgeMap.get(key);
        if (!existing || edge.weight > existing.weight) {
          edgeMap.set(key, edge);
        }
      }
      
      // Add file-to-tag association edges
      for (const edge of fileToTagEdges) {
        const key = [edge.source, edge.target].sort().join('-');
        if (!edgeMap.has(key)) {
          edgeMap.set(key, edge);
        }
      }
      
      // Filter edges by relationship type
      let edges = Array.from(edgeMap.values());
      if (input.relationshipType !== 'all') {
        edges = edges.filter(e => e.type === input.relationshipType);
      }
      
      const nodes = [...tagNodes, ...fileNodes];
      
      if (input.format === 'json') {
        return {
          format: 'json',
          data: JSON.stringify({ nodes, edges }, null, 2),
          filename: `knowledge-graph-${new Date().toISOString().split('T')[0]}.json`,
        };
      } else {
        // CSV format - create two files content: nodes and edges
        const nodesCSV = 'id,type,label,weight\n' + 
          nodes.map(n => `"${n.id}","${n.type}","${n.label.replace(/"/g, '""')}",${n.weight}`).join('\n');
        
        const edgesCSV = 'source,target,weight,type\n' + 
          edges.map(e => `"${e.source}","${e.target}",${e.weight.toFixed(4)},"${e.type}"`).join('\n');
        
        return {
          format: 'csv',
          nodesData: nodesCSV,
          edgesData: edgesCSV,
          nodesFilename: `knowledge-graph-nodes-${new Date().toISOString().split('T')[0]}.csv`,
          edgesFilename: `knowledge-graph-edges-${new Date().toISOString().split('T')[0]}.csv`,
        };
      }
    }),
});
