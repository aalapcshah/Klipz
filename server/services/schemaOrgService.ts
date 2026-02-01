/**
 * Schema.org Service - Integration with Schema.org vocabulary for content classification
 */

export interface SchemaType {
  id: string;
  label: string;
  description?: string;
  parentTypes: string[];
  properties: string[];
}

// Common Schema.org types relevant to media content
const SCHEMA_TYPES: Record<string, SchemaType> = {
  'VideoObject': {
    id: 'VideoObject',
    label: 'Video',
    description: 'A video file or stream',
    parentTypes: ['MediaObject', 'CreativeWork'],
    properties: ['duration', 'videoQuality', 'transcript', 'caption'],
  },
  'ImageObject': {
    id: 'ImageObject',
    label: 'Image',
    description: 'An image file',
    parentTypes: ['MediaObject', 'CreativeWork'],
    properties: ['caption', 'exifData', 'representativeOfPage'],
  },
  'AudioObject': {
    id: 'AudioObject',
    label: 'Audio',
    description: 'An audio file or stream',
    parentTypes: ['MediaObject', 'CreativeWork'],
    properties: ['duration', 'transcript', 'bitrate'],
  },
  'MediaObject': {
    id: 'MediaObject',
    label: 'Media',
    description: 'A media object such as image, video, or audio',
    parentTypes: ['CreativeWork'],
    properties: ['contentSize', 'contentUrl', 'encodingFormat', 'uploadDate'],
  },
  'CreativeWork': {
    id: 'CreativeWork',
    label: 'Creative Work',
    description: 'The most generic kind of creative work',
    parentTypes: ['Thing'],
    properties: ['author', 'dateCreated', 'keywords', 'license'],
  },
  'HowTo': {
    id: 'HowTo',
    label: 'How-To',
    description: 'Instructions for how to achieve a result',
    parentTypes: ['CreativeWork'],
    properties: ['step', 'tool', 'supply', 'totalTime'],
  },
  'Recipe': {
    id: 'Recipe',
    label: 'Recipe',
    description: 'A recipe for cooking',
    parentTypes: ['HowTo', 'CreativeWork'],
    properties: ['cookTime', 'ingredients', 'nutrition', 'recipeYield'],
  },
  'Review': {
    id: 'Review',
    label: 'Review',
    description: 'A review of an item',
    parentTypes: ['CreativeWork'],
    properties: ['reviewBody', 'reviewRating', 'itemReviewed'],
  },
  'Event': {
    id: 'Event',
    label: 'Event',
    description: 'An event happening at a certain time and location',
    parentTypes: ['Thing'],
    properties: ['startDate', 'endDate', 'location', 'performer'],
  },
  'Person': {
    id: 'Person',
    label: 'Person',
    description: 'A person',
    parentTypes: ['Thing'],
    properties: ['name', 'jobTitle', 'affiliation', 'knows'],
  },
  'Product': {
    id: 'Product',
    label: 'Product',
    description: 'A product offered for sale',
    parentTypes: ['Thing'],
    properties: ['brand', 'model', 'sku', 'offers'],
  },
  'MusicRecording': {
    id: 'MusicRecording',
    label: 'Music Recording',
    description: 'A music recording',
    parentTypes: ['CreativeWork'],
    properties: ['byArtist', 'duration', 'inAlbum', 'isrcCode'],
  },
  'Movie': {
    id: 'Movie',
    label: 'Movie',
    description: 'A movie or film',
    parentTypes: ['CreativeWork'],
    properties: ['actor', 'director', 'duration', 'trailer'],
  },
  'Podcast': {
    id: 'Podcast',
    label: 'Podcast',
    description: 'A podcast series',
    parentTypes: ['CreativeWork'],
    properties: ['webFeed', 'actor'],
  },
  'EducationalContent': {
    id: 'EducationalContent',
    label: 'Educational Content',
    description: 'Content with educational purpose',
    parentTypes: ['CreativeWork'],
    properties: ['educationalLevel', 'learningResourceType'],
  },
};

// Content type keywords mapping to Schema.org types
const CONTENT_TYPE_KEYWORDS: Record<string, string[]> = {
  'VideoObject': ['video', 'clip', 'footage', 'recording', 'stream', 'vlog'],
  'ImageObject': ['image', 'photo', 'picture', 'screenshot', 'graphic'],
  'AudioObject': ['audio', 'sound', 'voice', 'recording', 'podcast'],
  'HowTo': ['tutorial', 'guide', 'how-to', 'instructions', 'diy', 'walkthrough'],
  'Recipe': ['recipe', 'cooking', 'food', 'meal', 'dish', 'cuisine'],
  'Review': ['review', 'rating', 'opinion', 'critique', 'evaluation'],
  'Event': ['event', 'conference', 'meeting', 'webinar', 'concert'],
  'Person': ['interview', 'profile', 'biography', 'portrait'],
  'Product': ['product', 'unboxing', 'demo', 'showcase', 'comparison'],
  'MusicRecording': ['music', 'song', 'track', 'album', 'performance'],
  'Movie': ['movie', 'film', 'cinema', 'trailer'],
  'Podcast': ['podcast', 'episode', 'talk', 'discussion'],
  'EducationalContent': ['education', 'learning', 'course', 'lesson', 'lecture'],
};

/**
 * Classify content based on tags using Schema.org vocabulary
 */
export function classifyContentByTags(
  tags: string[]
): Array<{ type: SchemaType; confidence: number; matchedKeywords: string[] }> {
  const normalizedTags = tags.map(t => t.toLowerCase());
  const results: Array<{ type: SchemaType; confidence: number; matchedKeywords: string[] }> = [];

  for (const [typeId, keywords] of Object.entries(CONTENT_TYPE_KEYWORDS)) {
    const matchedKeywords = keywords.filter(kw => 
      normalizedTags.some(tag => tag.includes(kw) || kw.includes(tag))
    );

    if (matchedKeywords.length > 0) {
      const schemaType = SCHEMA_TYPES[typeId];
      if (schemaType) {
        results.push({
          type: schemaType,
          confidence: Math.min(0.9, 0.3 + (matchedKeywords.length * 0.2)),
          matchedKeywords,
        });
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get Schema.org type by ID
 */
export function getSchemaType(typeId: string): SchemaType | null {
  return SCHEMA_TYPES[typeId] || null;
}

/**
 * Get all available Schema.org types
 */
export function getAllSchemaTypes(): SchemaType[] {
  return Object.values(SCHEMA_TYPES);
}

/**
 * Get parent types for a Schema.org type
 */
export function getParentTypes(typeId: string): SchemaType[] {
  const type = SCHEMA_TYPES[typeId];
  if (!type) return [];

  return type.parentTypes
    .map(parentId => SCHEMA_TYPES[parentId])
    .filter(Boolean) as SchemaType[];
}

/**
 * Get tag suggestions based on Schema.org classification
 */
export function getSchemaOrgTagSuggestions(
  existingTags: string[],
  maxSuggestions: number = 10
): Array<{ tag: string; source: string; confidence: number }> {
  const suggestions: Array<{ tag: string; source: string; confidence: number }> = [];
  const seenTags = new Set(existingTags.map(t => t.toLowerCase()));

  const classifications = classifyContentByTags(existingTags);

  for (const classification of classifications.slice(0, 3)) {
    const { type, confidence } = classification;

    // Add the type label as a suggestion
    if (!seenTags.has(type.label.toLowerCase())) {
      seenTags.add(type.label.toLowerCase());
      suggestions.push({
        tag: type.label,
        source: 'schema.org:type',
        confidence: confidence * 0.9,
      });
    }

    // Add parent types as suggestions
    for (const parentType of getParentTypes(type.id)) {
      if (!seenTags.has(parentType.label.toLowerCase())) {
        seenTags.add(parentType.label.toLowerCase());
        suggestions.push({
          tag: parentType.label,
          source: 'schema.org:parent',
          confidence: confidence * 0.7,
        });
      }
    }

    // Add related keywords as suggestions
    const keywords = CONTENT_TYPE_KEYWORDS[type.id] || [];
    for (const keyword of keywords) {
      if (!seenTags.has(keyword)) {
        seenTags.add(keyword);
        suggestions.push({
          tag: keyword,
          source: 'schema.org:keyword',
          confidence: confidence * 0.6,
        });
      }
    }
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSuggestions);
}

/**
 * Generate structured data JSON-LD for a file based on its tags
 */
export function generateJsonLd(
  fileData: {
    name: string;
    url?: string;
    description?: string;
    tags: string[];
    createdAt?: Date;
  }
): Record<string, unknown> {
  const classifications = classifyContentByTags(fileData.tags);
  const primaryType = classifications[0]?.type.id || 'CreativeWork';

  return {
    '@context': 'https://schema.org',
    '@type': primaryType,
    name: fileData.name,
    ...(fileData.url && { url: fileData.url }),
    ...(fileData.description && { description: fileData.description }),
    keywords: fileData.tags.join(', '),
    ...(fileData.createdAt && { dateCreated: fileData.createdAt.toISOString() }),
  };
}
