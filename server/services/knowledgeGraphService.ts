/**
 * Unified Knowledge Graph Service
 * Combines Wikidata, DBpedia, Schema.org, and LLM embeddings for comprehensive tag enrichment
 */

import { searchWikidataEntities, getWikidataTagSuggestions, enrichTagWithWikidata } from './wikidataService';
import { searchDBpediaEntities, getDBpediaTagSuggestions } from './dbpediaService';
import { getSchemaOrgTagSuggestions, classifyContentByTags, generateJsonLd } from './schemaOrgService';
import { getLLMTagSuggestions, generateTagEmbedding, cosineSimilarity } from './embeddingService';

export interface TagSuggestion {
  tag: string;
  source: string;
  confidence: number;
  reason?: string;
}

export interface KnowledgeGraphResult {
  suggestions: TagSuggestion[];
  classifications: Array<{
    type: string;
    label: string;
    confidence: number;
  }>;
  enrichments: Array<{
    tag: string;
    wikidataId?: string;
    description?: string;
    relatedConcepts: string[];
  }>;
}

export interface KnowledgeGraphSettings {
  enableWikidata: boolean;
  enableDBpedia: boolean;
  enableSchemaOrg: boolean;
  enableLLM: boolean;
  maxSuggestionsPerSource: number;
  confidenceThreshold: number;
}

const DEFAULT_SETTINGS: KnowledgeGraphSettings = {
  enableWikidata: true,
  enableDBpedia: true,
  enableSchemaOrg: true,
  enableLLM: true,
  maxSuggestionsPerSource: 5,
  confidenceThreshold: 0.4,
};

/**
 * Get comprehensive tag suggestions from all enabled knowledge graph sources
 */
export async function getUnifiedTagSuggestions(
  existingTags: string[],
  context?: string,
  settings: Partial<KnowledgeGraphSettings> = {}
): Promise<TagSuggestion[]> {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const allSuggestions: TagSuggestion[] = [];
  const seenTags = new Set(existingTags.map(t => t.toLowerCase()));

  // Collect suggestions from all enabled sources in parallel
  const promises: Promise<TagSuggestion[]>[] = [];

  if (config.enableWikidata) {
    promises.push(
      getWikidataTagSuggestions(existingTags, 'en', config.maxSuggestionsPerSource)
        .catch(err => {
          console.error('[KnowledgeGraph] Wikidata error:', err);
          return [];
        })
    );
  }

  if (config.enableDBpedia) {
    promises.push(
      getDBpediaTagSuggestions(existingTags, config.maxSuggestionsPerSource)
        .catch(err => {
          console.error('[KnowledgeGraph] DBpedia error:', err);
          return [];
        })
    );
  }

  if (config.enableSchemaOrg) {
    promises.push(
      Promise.resolve(getSchemaOrgTagSuggestions(existingTags, config.maxSuggestionsPerSource))
    );
  }

  if (config.enableLLM) {
    promises.push(
      getLLMTagSuggestions(existingTags, context, config.maxSuggestionsPerSource)
        .catch(err => {
          console.error('[KnowledgeGraph] LLM error:', err);
          return [];
        })
    );
  }

  // Wait for all sources
  const results = await Promise.all(promises);

  // Merge and deduplicate suggestions
  for (const sourceSuggestions of results) {
    for (const suggestion of sourceSuggestions) {
      const normalizedTag = suggestion.tag.toLowerCase();
      if (!seenTags.has(normalizedTag) && suggestion.confidence >= config.confidenceThreshold) {
        seenTags.add(normalizedTag);
        allSuggestions.push(suggestion);
      }
    }
  }

  // Sort by confidence and return
  return allSuggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);
}

/**
 * Get comprehensive knowledge graph analysis for a set of tags
 */
export async function analyzeTagsWithKnowledgeGraph(
  tags: string[],
  settings: Partial<KnowledgeGraphSettings> = {}
): Promise<KnowledgeGraphResult> {
  const config = { ...DEFAULT_SETTINGS, ...settings };

  // Get suggestions
  const suggestions = await getUnifiedTagSuggestions(tags, undefined, config);

  // Get Schema.org classifications
  const schemaClassifications = classifyContentByTags(tags);
  const classifications = schemaClassifications.map(c => ({
    type: c.type.id,
    label: c.type.label,
    confidence: c.confidence,
  }));

  // Get enrichments from Wikidata
  const enrichments: KnowledgeGraphResult['enrichments'] = [];
  
  if (config.enableWikidata) {
    for (const tag of tags.slice(0, 5)) {
      try {
        const enrichment = await enrichTagWithWikidata(tag);
        if (enrichment) {
          enrichments.push({
            tag,
            wikidataId: enrichment.wikidataId,
            description: enrichment.description,
            relatedConcepts: enrichment.relatedConcepts.map(c => c.label),
          });
        }
      } catch (err) {
        console.error(`[KnowledgeGraph] Error enriching tag "${tag}":`, err);
      }
    }
  }

  return {
    suggestions,
    classifications,
    enrichments,
  };
}

/**
 * Search across all knowledge graph sources
 */
export async function searchKnowledgeGraph(
  query: string,
  settings: Partial<KnowledgeGraphSettings> = {}
): Promise<Array<{
  source: string;
  id: string;
  label: string;
  description?: string;
}>> {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const results: Array<{
    source: string;
    id: string;
    label: string;
    description?: string;
  }> = [];

  const promises: Promise<void>[] = [];

  if (config.enableWikidata) {
    promises.push(
      searchWikidataEntities(query, 'en', 5)
        .then(result => {
          for (const entity of result.entities) {
            results.push({
              source: 'wikidata',
              id: entity.id,
              label: entity.label,
              description: entity.description,
            });
          }
        })
        .catch(err => console.error('[KnowledgeGraph] Wikidata search error:', err))
    );
  }

  if (config.enableDBpedia) {
    promises.push(
      searchDBpediaEntities(query, 5)
        .then(result => {
          for (const entity of result.entities) {
            results.push({
              source: 'dbpedia',
              id: entity.uri,
              label: entity.label,
              description: entity.abstract,
            });
          }
        })
        .catch(err => console.error('[KnowledgeGraph] DBpedia search error:', err))
    );
  }

  await Promise.all(promises);

  return results;
}

/**
 * Find semantically similar tags using embeddings
 */
export async function findSimilarTagsWithEmbeddings(
  targetTag: string,
  candidateTags: string[],
  threshold: number = 0.7
): Promise<Array<{ tag: string; similarity: number }>> {
  try {
    const targetEmbedding = await generateTagEmbedding(targetTag);
    
    const results: Array<{ tag: string; similarity: number }> = [];
    
    for (const candidateTag of candidateTags) {
      const candidateEmbedding = await generateTagEmbedding(candidateTag);
      const similarity = cosineSimilarity(targetEmbedding, candidateEmbedding);
      
      if (similarity >= threshold) {
        results.push({ tag: candidateTag, similarity });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    console.error('[KnowledgeGraph] Embedding similarity error:', error);
    return [];
  }
}

/**
 * Generate JSON-LD structured data for a file
 */
export function generateStructuredData(fileData: {
  name: string;
  url?: string;
  description?: string;
  tags: string[];
  createdAt?: Date;
}): Record<string, unknown> {
  return generateJsonLd(fileData);
}

/**
 * Get tag hierarchy based on knowledge graph relationships
 */
export async function getTagHierarchy(
  tag: string
): Promise<{
  parents: string[];
  siblings: string[];
  children: string[];
}> {
  const hierarchy = {
    parents: [] as string[],
    siblings: [] as string[],
    children: [] as string[],
  };

  try {
    const enrichment = await enrichTagWithWikidata(tag);
    if (enrichment) {
      for (const concept of enrichment.relatedConcepts) {
        if (concept.relationshipType === 'parent') {
          hierarchy.parents.push(concept.label);
        } else if (concept.relationshipType === 'child') {
          hierarchy.children.push(concept.label);
        } else {
          hierarchy.siblings.push(concept.label);
        }
      }
    }
  } catch (error) {
    console.error('[KnowledgeGraph] Hierarchy error:', error);
  }

  return hierarchy;
}
