/**
 * Embedding Service - LLM-based tag embedding generation and similarity calculation
 */

import { invokeLLM } from "../_core/llm";

/**
 * Generate a semantic embedding for a tag using LLM
 */
export async function generateTagEmbedding(tagName: string): Promise<number[]> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a semantic analysis assistant. Given a tag/keyword, analyze its meaning and return a JSON array of 10 numbers between 0 and 1 representing its semantic profile across these dimensions:
1. Concreteness (0=abstract, 1=concrete)
2. Temporality (0=timeless, 1=time-specific)
3. Formality (0=casual, 1=formal)
4. Technicality (0=general, 1=technical)
5. Emotionality (0=neutral, 1=emotional)
6. Specificity (0=broad, 1=specific)
7. Action-orientation (0=static, 1=action)
8. Social (0=individual, 1=social)
9. Physical (0=conceptual, 1=physical)
10. Creative (0=factual, 1=creative)

Return ONLY the JSON array, no explanation.`
        },
        {
          role: "user",
          content: `Analyze the tag: "${tagName}"`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "embedding",
          strict: true,
          schema: {
            type: "object",
            properties: {
              values: {
                type: "array",
                items: { type: "number" },
                description: "Array of 10 numbers between 0 and 1"
              }
            },
            required: ["values"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') {
      const parsed = JSON.parse(content);
      if (parsed.values && Array.isArray(parsed.values) && parsed.values.length === 10) {
        return parsed.values;
      }
    }
    
    return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  } catch (error) {
    console.error('[EmbeddingService] Error generating embedding:', error);
    return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  }
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find similar tags based on embedding similarity
 */
export function findSimilarTags(
  targetEmbedding: number[],
  tagEmbeddings: Array<{ tagName: string; embedding: number[] }>,
  threshold: number = 0.7,
  maxResults: number = 10
): Array<{ tagName: string; similarity: number }> {
  const similarities = tagEmbeddings
    .map(({ tagName, embedding }) => ({
      tagName,
      similarity: cosineSimilarity(targetEmbedding, embedding)
    }))
    .filter(({ similarity }) => similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);

  return similarities;
}

/**
 * Get LLM-based tag suggestions using semantic analysis
 */
export async function getLLMTagSuggestions(
  existingTags: string[],
  context?: string,
  maxSuggestions: number = 10
): Promise<Array<{ tag: string; source: string; confidence: number; reason: string }>> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a metadata tagging assistant. Given a list of existing tags and optional context, suggest related tags that would complement the existing ones. Consider:
- Synonyms and related concepts
- Parent categories and subcategories
- Commonly co-occurring tags
- Domain-specific terminology

Return a JSON object with an array of suggestions.`
        },
        {
          role: "user",
          content: `Existing tags: ${existingTags.join(', ')}
${context ? `Context: ${context}` : ''}

Suggest ${maxSuggestions} related tags that would complement these.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tag_suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tag: { type: "string", description: "The suggested tag" },
                    confidence: { type: "number", description: "Confidence score 0-1" },
                    reason: { type: "string", description: "Brief reason for suggestion" }
                  },
                  required: ["tag", "confidence", "reason"],
                  additionalProperties: false
                }
              }
            },
            required: ["suggestions"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') {
      const parsed = JSON.parse(content);
      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        return parsed.suggestions.map((s: { tag: string; confidence: number; reason: string }) => ({
          tag: s.tag,
          source: 'llm',
          confidence: s.confidence,
          reason: s.reason
        }));
      }
    }

    return [];
  } catch (error) {
    console.error('[EmbeddingService] Error getting LLM suggestions:', error);
    return [];
  }
}

/**
 * Classify a tag into categories using LLM
 */
export async function classifyTag(
  tagName: string,
  availableCategories: string[]
): Promise<Array<{ category: string; confidence: number }>> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a tag classification assistant. Given a tag and a list of available categories, determine which categories the tag belongs to.`
        },
        {
          role: "user",
          content: `Tag: "${tagName}"
Available categories: ${availableCategories.join(', ')}

Classify this tag into the appropriate categories.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              classifications: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    confidence: { type: "number" }
                  },
                  required: ["category", "confidence"],
                  additionalProperties: false
                }
              }
            },
            required: ["classifications"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') {
      const parsed = JSON.parse(content);
      if (parsed.classifications && Array.isArray(parsed.classifications)) {
        return parsed.classifications.filter(
          (c: { category: string; confidence: number }) => availableCategories.includes(c.category)
        );
      }
    }

    return [];
  } catch (error) {
    console.error('[EmbeddingService] Error classifying tag:', error);
    return [];
  }
}
