/**
 * DBpedia Service - Integration with DBpedia for Wikipedia-derived semantic data
 */

export interface DBpediaEntity {
  uri: string;
  label: string;
  abstract?: string;
  thumbnail?: string;
  categories: string[];
  types: string[];
}

export interface DBpediaSearchResult {
  entities: DBpediaEntity[];
  searchTerm: string;
}

const DBPEDIA_LOOKUP_API = 'https://lookup.dbpedia.org/api/search';

/**
 * Search DBpedia for entities matching a query
 */
export async function searchDBpediaEntities(
  query: string,
  maxResults: number = 10
): Promise<DBpediaSearchResult> {
  const params = new URLSearchParams({
    query: query,
    maxResults: maxResults.toString(),
    format: 'json',
  });

  try {
    const response = await fetch(`${DBPEDIA_LOOKUP_API}?${params}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`DBpedia API error: ${response.status}`);
    }

    const data = await response.json();
    
    const entities: DBpediaEntity[] = (data.docs || []).map((item: {
      resource: string[];
      label: string[];
      comment?: string[];
      thumbnail?: string[];
      category?: string[];
      typeName?: string[];
    }) => ({
      uri: item.resource?.[0] || '',
      label: item.label?.[0] || '',
      abstract: item.comment?.[0],
      thumbnail: item.thumbnail?.[0],
      categories: item.category || [],
      types: item.typeName || [],
    }));

    return { entities, searchTerm: query };
  } catch (error) {
    console.error('[DBpediaService] Search error:', error);
    return { entities: [], searchTerm: query };
  }
}

/**
 * Get tag suggestions from DBpedia based on existing tags
 */
export async function getDBpediaTagSuggestions(
  existingTags: string[],
  maxSuggestions: number = 10
): Promise<Array<{ tag: string; source: string; confidence: number }>> {
  const suggestions: Array<{ tag: string; source: string; confidence: number }> = [];
  const seenTags = new Set(existingTags.map(t => t.toLowerCase()));

  for (const tag of existingTags.slice(0, 3)) {
    const searchResult = await searchDBpediaEntities(tag, 3);
    
    if (searchResult.entities.length > 0) {
      const entity = searchResult.entities[0];
      
      // Add categories as suggestions
      for (const category of entity.categories.slice(0, 5)) {
        const categoryName = category.split('/').pop()?.replace(/_/g, ' ') || '';
        if (categoryName && !seenTags.has(categoryName.toLowerCase())) {
          seenTags.add(categoryName.toLowerCase());
          suggestions.push({
            tag: categoryName,
            source: 'dbpedia:category',
            confidence: 0.7,
          });
        }
      }

      // Add types as suggestions
      for (const type of entity.types.slice(0, 3)) {
        const typeName = type.split('/').pop()?.replace(/_/g, ' ') || '';
        if (typeName && !seenTags.has(typeName.toLowerCase())) {
          seenTags.add(typeName.toLowerCase());
          suggestions.push({
            tag: typeName,
            source: 'dbpedia:type',
            confidence: 0.8,
          });
        }
      }
    }
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSuggestions);
}

/**
 * Extract clean label from DBpedia URI
 */
export function extractLabelFromUri(uri: string): string {
  const match = uri.match(/\/([^\/]+)$/);
  return match ? match[1].replace(/_/g, ' ') : uri;
}
