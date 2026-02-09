/**
 * Knowledge Graph Router Tests
 * 
 * Tests the knowledge graph service integrations using mocked external APIs.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the external API calls - must be before imports
vi.mock("./services/wikidataService");
vi.mock("./services/dbpediaService");
vi.mock("./services/schemaOrgService");

import {
  searchWikidataEntities,
  enrichTagWithWikidata,
} from "./services/wikidataService";

import {
  searchDBpediaEntities,
  getDBpediaTagSuggestions,
} from "./services/dbpediaService";

import {
  classifyContentByTags,
  getAllSchemaTypes,
} from "./services/schemaOrgService";

describe("Knowledge Graph Services", () => {
  describe("Wikidata Service", () => {
    it("should search for entities", async () => {
      vi.mocked(searchWikidataEntities).mockResolvedValue({
        entities: [{ id: "Q123", label: "Test Entity", description: "A test entity" }],
        searchTerm: "cooking",
      });

      const results = await searchWikidataEntities("cooking", "en", 5);
      
      expect(results).toBeDefined();
      expect(results.entities).toBeDefined();
      expect(Array.isArray(results.entities)).toBe(true);
      expect(results.entities.length).toBeGreaterThan(0);
      expect(results.entities[0]).toHaveProperty("id");
      expect(results.entities[0]).toHaveProperty("label");
    });

    it("should enrich a tag with Wikidata data", async () => {
      vi.mocked(enrichTagWithWikidata).mockResolvedValue({
        wikidataId: "Q123",
        label: "cooking",
        description: "The art of preparing food",
        relatedConcepts: [
          { id: "Q2095", label: "food", relationshipType: "parent" },
          { id: "Q3456", label: "recipe", relationshipType: "related" },
        ],
        categories: ["Activity", "Skill"],
      });

      const result = await enrichTagWithWikidata("cooking", "en");
      
      expect(result).toBeDefined();
      expect(result!.wikidataId).toBe("Q123");
      expect(result!.label).toBe("cooking");
      expect(result!.relatedConcepts.length).toBeGreaterThan(0);
    });
  });

  describe("DBpedia Service", () => {
    it("should search for entities", async () => {
      vi.mocked(searchDBpediaEntities).mockResolvedValue([
        {
          uri: "http://dbpedia.org/resource/Cooking",
          label: "Cooking",
          abstract: "Cooking is the art of preparing food",
          categories: ["Food preparation"],
        }
      ]);

      const results = await searchDBpediaEntities("cooking", 5);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("uri");
      expect(results[0]).toHaveProperty("label");
    });

    it("should get tag suggestions", async () => {
      vi.mocked(getDBpediaTagSuggestions).mockResolvedValue([
        { tag: "Food", source: "dbpedia", confidence: 0.8 },
        { tag: "Recipe", source: "dbpedia", confidence: 0.7 },
      ]);

      const results = await getDBpediaTagSuggestions("cooking");
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("Schema.org Service", () => {
    it("should classify content by tags", async () => {
      vi.mocked(classifyContentByTags).mockReturnValue([
        {
          type: { id: "HowTo", label: "How To", description: "Instructions", keywords: ["tutorial"] },
          confidence: 0.8,
          matchedKeywords: ["cooking"],
        }
      ]);

      const results = classifyContentByTags(["cooking", "recipe", "tutorial"]);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("type");
      expect(results[0]).toHaveProperty("confidence");
    });

    it("should return all schema types", async () => {
      vi.mocked(getAllSchemaTypes).mockReturnValue([
        { id: "HowTo", label: "How To", description: "Instructions", keywords: ["tutorial"] }
      ]);

      const types = getAllSchemaTypes();
      
      expect(types).toBeDefined();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });
  });
});

describe("Knowledge Graph Integration", () => {
  it("should combine results from multiple sources", async () => {
    vi.mocked(searchWikidataEntities).mockResolvedValue({
      entities: [{ id: "Q123", label: "Video", description: "A video" }],
      searchTerm: "video",
    });
    vi.mocked(searchDBpediaEntities).mockResolvedValue([
      { uri: "http://dbpedia.org/resource/Video", label: "Video", abstract: "A video", categories: ["Media"] }
    ]);
    vi.mocked(classifyContentByTags).mockReturnValue([
      { type: { id: "VideoObject", label: "Video Object", description: "A video", keywords: ["video"] }, confidence: 0.9, matchedKeywords: ["video"] }
    ]);

    const wikidataResults = await searchWikidataEntities("video", "en", 3);
    const dbpediaResults = await searchDBpediaEntities("video", 3);
    const schemaResults = classifyContentByTags(["video", "media"]);

    expect(wikidataResults.entities.length).toBeGreaterThan(0);
    expect(dbpediaResults.length).toBeGreaterThan(0);
    expect(schemaResults.length).toBeGreaterThan(0);
  });
});
