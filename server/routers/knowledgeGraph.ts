/**
 * Knowledge Graph Router - tRPC endpoints for tag enrichment and suggestions
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getAllTags, getTagRelationships, getFilesForUser } from "../db";
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
    .query(async ({ ctx }) => {
      // Get all tags with their usage counts
      const tags = await getAllTags(ctx.user.id);
      
      // Get tag relationships from embeddings
      const tagRelationships = await getTagRelationships(ctx.user.id);
      
      // Get files if requested
      const files = await getFilesForUser(ctx.user.id, { limit: 100 });
      
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
      
      // Build edges from tag relationships
      const edges = tagRelationships.map((rel: { sourceTagId: number; targetTagId: number; similarity: number; relationshipType: string }) => ({
        source: `tag-${rel.sourceTagId}`,
        target: `tag-${rel.targetTagId}`,
        weight: rel.similarity,
        type: rel.relationshipType,
      }));
      
      return {
        nodes: [...tagNodes, ...fileNodes],
        edges,
        stats: {
          totalTags: tags.length,
          totalFiles: files.length,
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
});
