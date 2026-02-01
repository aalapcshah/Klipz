/**
 * Wikidata Service - Integration with Wikidata API for semantic tag enrichment
 */

export interface WikidataEntity {
  id: string;
  label: string;
  description?: string;
  aliases?: string[];
}

export interface WikidataSearchResult {
  entities: WikidataEntity[];
  searchTerm: string;
}

export interface WikidataEnrichmentResult {
  wikidataId: string;
  label: string;
  description?: string;
  relatedConcepts: Array<{
    id: string;
    label: string;
    relationshipType: 'parent' | 'child' | 'related' | 'synonym';
  }>;
  categories: string[];
}

const WIKIDATA_API_BASE = 'https://www.wikidata.org/w/api.php';

/**
 * Search Wikidata for entities matching a query
 */
export async function searchWikidataEntities(
  query: string,
  language: string = 'en',
  limit: number = 10
): Promise<WikidataSearchResult> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language,
    limit: limit.toString(),
    format: 'json',
    origin: '*',
  });

  try {
    const response = await fetch(`${WIKIDATA_API_BASE}?${params}`);
    if (!response.ok) {
      throw new Error(`Wikidata API error: ${response.status}`);
    }

    const data = await response.json();
    
    const entities: WikidataEntity[] = (data.search || []).map((item: {
      id: string;
      label: string;
      description?: string;
      aliases?: string[];
    }) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      aliases: item.aliases,
    }));

    return {
      entities,
      searchTerm: query,
    };
  } catch (error) {
    console.error('[WikidataService] Search error:', error);
    return {
      entities: [],
      searchTerm: query,
    };
  }
}

/**
 * Get detailed information about a Wikidata entity
 */
export async function getWikidataEntity(
  entityId: string,
  language: string = 'en'
): Promise<WikidataEntity | null> {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: entityId,
    languages: language,
    props: 'labels|descriptions|aliases',
    format: 'json',
    origin: '*',
  });

  try {
    const response = await fetch(`${WIKIDATA_API_BASE}?${params}`);
    if (!response.ok) {
      throw new Error(`Wikidata API error: ${response.status}`);
    }

    const data = await response.json();
    const entity = data.entities?.[entityId];

    if (!entity || entity.missing) {
      return null;
    }

    return {
      id: entityId,
      label: entity.labels?.[language]?.value || entityId,
      description: entity.descriptions?.[language]?.value,
      aliases: entity.aliases?.[language]?.map((a: { value: string }) => a.value) || [],
    };
  } catch (error) {
    console.error('[WikidataService] Get entity error:', error);
    return null;
  }
}

/**
 * Get related concepts for a Wikidata entity
 */
async function getRelatedConcepts(
  entityId: string,
  language: string = 'en'
): Promise<Array<{ id: string; label: string; relationshipType: 'parent' | 'child' | 'related' | 'synonym' }>> {
  const restUrl = `https://www.wikidata.org/w/rest.php/wikibase/v1/entities/items/${entityId}/statements`;
  
  try {
    const response = await fetch(restUrl);
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const relatedConcepts: Array<{ id: string; label: string; relationshipType: 'parent' | 'child' | 'related' | 'synonym' }> = [];
    
    const propertyMappings: Record<string, 'parent' | 'child' | 'related' | 'synonym'> = {
      'P31': 'parent',
      'P279': 'parent',
      'P361': 'related',
      'P527': 'child',
      'P460': 'synonym',
    };

    for (const [propId, relType] of Object.entries(propertyMappings)) {
      const statements = data[propId];
      if (statements && Array.isArray(statements)) {
        for (const stmt of statements.slice(0, 5)) {
          const value = stmt.value?.content;
          if (value && typeof value === 'string' && value.startsWith('Q')) {
            const relatedEntity = await getWikidataEntity(value, language);
            if (relatedEntity) {
              relatedConcepts.push({
                id: value,
                label: relatedEntity.label,
                relationshipType: relType,
              });
            }
          }
        }
      }
    }

    return relatedConcepts;
  } catch (error) {
    console.error('[WikidataService] Get related concepts error:', error);
    return [];
  }
}

/**
 * Enrich a tag with Wikidata information
 */
export async function enrichTagWithWikidata(
  tagName: string,
  language: string = 'en'
): Promise<WikidataEnrichmentResult | null> {
  const searchResult = await searchWikidataEntities(tagName, language, 5);
  
  if (searchResult.entities.length === 0) {
    return null;
  }

  const bestMatch = searchResult.entities[0];
  const relatedConcepts = await getRelatedConcepts(bestMatch.id, language);
  
  const categories = relatedConcepts
    .filter(c => c.relationshipType === 'parent')
    .map(c => c.label);

  return {
    wikidataId: bestMatch.id,
    label: bestMatch.label,
    description: bestMatch.description,
    relatedConcepts,
    categories,
  };
}

/**
 * Get tag suggestions based on Wikidata relationships
 */
export async function getWikidataTagSuggestions(
  existingTags: string[],
  language: string = 'en',
  maxSuggestions: number = 10
): Promise<Array<{ tag: string; source: string; confidence: number }>> {
  const suggestions: Array<{ tag: string; source: string; confidence: number }> = [];
  const seenTags = new Set(existingTags.map(t => t.toLowerCase()));

  for (const tag of existingTags.slice(0, 3)) {
    const enrichment = await enrichTagWithWikidata(tag, language);
    
    if (enrichment) {
      for (const concept of enrichment.relatedConcepts) {
        const normalizedLabel = concept.label.toLowerCase();
        if (!seenTags.has(normalizedLabel)) {
          seenTags.add(normalizedLabel);
          suggestions.push({
            tag: concept.label,
            source: `wikidata:${concept.relationshipType}`,
            confidence: concept.relationshipType === 'synonym' ? 0.9 : 
                       concept.relationshipType === 'parent' ? 0.7 : 
                       concept.relationshipType === 'child' ? 0.6 : 0.5,
          });
        }
      }

      for (const category of enrichment.categories) {
        const normalizedCategory = category.toLowerCase();
        if (!seenTags.has(normalizedCategory)) {
          seenTags.add(normalizedCategory);
          suggestions.push({
            tag: category,
            source: 'wikidata:category',
            confidence: 0.6,
          });
        }
      }
    }
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSuggestions);
}
