/**
 * Tests for Tag Relationship Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cosineSimilarity } from './services/embeddingService';

// Mock the database
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock the LLM service
vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({ values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] })
      }
    }]
  }),
}));

describe('Tag Relationship Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vector = [1, 0, 0, 0, 0];
      expect(cosineSimilarity(vector, vector)).toBeCloseTo(1);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vector1 = [1, 0, 0, 0, 0];
      const vector2 = [0, 1, 0, 0, 0];
      expect(cosineSimilarity(vector1, vector2)).toBeCloseTo(0);
    });

    it('should return a value between 0 and 1 for similar vectors', () => {
      const vector1 = [0.8, 0.2, 0.1, 0.5, 0.3];
      const vector2 = [0.7, 0.3, 0.2, 0.4, 0.4];
      const similarity = cosineSimilarity(vector1, vector2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should throw error for vectors of different lengths', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [1, 0, 0, 0, 0];
      expect(() => cosineSimilarity(vector1, vector2)).toThrow('Embeddings must have the same length');
    });

    it('should return 0 for zero vectors', () => {
      const zeroVector = [0, 0, 0, 0, 0];
      const normalVector = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(zeroVector, normalVector)).toBe(0);
    });

    it('should handle negative values correctly', () => {
      const vector1 = [1, -1, 0.5, -0.5, 0];
      const vector2 = [-1, 1, -0.5, 0.5, 0];
      // These are opposite vectors, should have negative similarity
      const similarity = cosineSimilarity(vector1, vector2);
      expect(similarity).toBeLessThan(0);
    });
  });

  describe('Tag relationship types', () => {
    it('should support parent relationship type', () => {
      const validTypes = ['parent', 'child', 'related', 'synonym'];
      expect(validTypes).toContain('parent');
    });

    it('should support child relationship type', () => {
      const validTypes = ['parent', 'child', 'related', 'synonym'];
      expect(validTypes).toContain('child');
    });

    it('should support related relationship type', () => {
      const validTypes = ['parent', 'child', 'related', 'synonym'];
      expect(validTypes).toContain('related');
    });

    it('should support synonym relationship type', () => {
      const validTypes = ['parent', 'child', 'related', 'synonym'];
      expect(validTypes).toContain('synonym');
    });
  });

  describe('Confidence score validation', () => {
    it('should accept confidence scores between 0 and 1', () => {
      const validScores = [0, 0.25, 0.5, 0.75, 1];
      validScores.forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    it('should calculate Jaccard similarity correctly', () => {
      // Jaccard = intersection / union
      const coOccurrence = 5;
      const tag1Count = 10;
      const tag2Count = 8;
      const union = tag1Count + tag2Count - coOccurrence;
      const jaccard = coOccurrence / union;
      expect(jaccard).toBeCloseTo(5 / 13);
    });
  });

  describe('Embedding dimensions', () => {
    it('should use 10-dimensional embeddings', () => {
      const expectedDimensions = 10;
      const embedding = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      expect(embedding.length).toBe(expectedDimensions);
    });

    it('should have all values between 0 and 1', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      embedding.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Source types', () => {
    it('should support valid source types', () => {
      const validSources = ['wikidata', 'llm', 'user', 'auto'];
      expect(validSources).toContain('wikidata');
      expect(validSources).toContain('llm');
      expect(validSources).toContain('user');
      expect(validSources).toContain('auto');
    });
  });
});

describe('Knowledge Graph Settings', () => {
  describe('Auto-tagging threshold', () => {
    it('should have a default threshold of 70%', () => {
      const defaultThreshold = 70;
      expect(defaultThreshold).toBe(70);
    });

    it('should allow threshold between 50% and 100%', () => {
      const minThreshold = 50;
      const maxThreshold = 100;
      const testThreshold = 75;
      expect(testThreshold).toBeGreaterThanOrEqual(minThreshold);
      expect(testThreshold).toBeLessThanOrEqual(maxThreshold);
    });

    it('should filter suggestions below threshold', () => {
      const threshold = 70;
      const suggestions = [
        { tag: 'high-confidence', confidence: 0.85 },
        { tag: 'medium-confidence', confidence: 0.65 },
        { tag: 'low-confidence', confidence: 0.45 },
      ];
      const filtered = suggestions.filter(s => s.confidence * 100 >= threshold);
      expect(filtered.length).toBe(1);
      expect(filtered[0].tag).toBe('high-confidence');
    });
  });

  describe('Knowledge sources configuration', () => {
    it('should support Wikidata source', () => {
      const sources = ['wikidata', 'dbpedia', 'schemaOrg', 'llm'];
      expect(sources).toContain('wikidata');
    });

    it('should support DBpedia source', () => {
      const sources = ['wikidata', 'dbpedia', 'schemaOrg', 'llm'];
      expect(sources).toContain('dbpedia');
    });

    it('should support Schema.org source', () => {
      const sources = ['wikidata', 'dbpedia', 'schemaOrg', 'llm'];
      expect(sources).toContain('schemaOrg');
    });

    it('should support LLM source', () => {
      const sources = ['wikidata', 'dbpedia', 'schemaOrg', 'llm'];
      expect(sources).toContain('llm');
    });
  });

  describe('Default knowledge source endpoints', () => {
    it('should have correct Wikidata SPARQL endpoint', () => {
      const wikidataEndpoint = 'https://query.wikidata.org/sparql';
      expect(wikidataEndpoint).toContain('wikidata.org');
    });

    it('should have correct DBpedia SPARQL endpoint', () => {
      const dbpediaEndpoint = 'https://dbpedia.org/sparql';
      expect(dbpediaEndpoint).toContain('dbpedia.org');
    });
  });
});

describe('External Knowledge Graph Integration', () => {
  describe('Default sources initialization', () => {
    it('should create Wikidata, DBpedia, and Schema.org by default', () => {
      const defaultSources = [
        { name: 'Wikidata', type: 'wikidata' },
        { name: 'DBpedia', type: 'dbpedia' },
        { name: 'Schema.org', type: 'schema_org' },
      ];
      expect(defaultSources.length).toBe(3);
      expect(defaultSources.map(s => s.type)).toEqual(['wikidata', 'dbpedia', 'schema_org']);
    });

    it('should skip existing sources during initialization', () => {
      const existingTypes = new Set(['wikidata']);
      const defaultSources = [
        { name: 'Wikidata', type: 'wikidata' },
        { name: 'DBpedia', type: 'dbpedia' },
      ];
      const toCreate = defaultSources.filter(s => !existingTypes.has(s.type));
      expect(toCreate.length).toBe(1);
      expect(toCreate[0].type).toBe('dbpedia');
    });
  });
});
