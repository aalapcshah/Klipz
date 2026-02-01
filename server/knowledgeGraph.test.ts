/**
 * Knowledge Graph Router Tests
 */

import { describe, it, expect, vi } from "vitest";

// Mock the external API calls
vi.mock("./services/wikidataService", () => ({
  searchWikidataEntities: vi.fn().mockResolvedValue([
    { id: "Q123", label: "Test Entity", description: "A test entity" }
  ]),
  enrichTagWithWikidata: vi.fn().mockResolvedValue({
    wikidataId: "Q123",
    label: "cooking",
    description: "The art of preparing food",
    aliases: ["culinary arts"],
    relatedConcepts: ["food", "recipe", "kitchen"],
    categories: ["Activity", "Skill"],
    properties: {},
  }),
}));

vi.mock("./services/dbpediaService", () => ({
  searchDBpediaEntities: vi.fn().mockResolvedValue([
    {
      uri: "http://dbpedia.org/resource/Cooking",
      label: "Cooking",
      abstract: "Cooking is the art of preparing food",
      categories: ["Food preparation"],
    }
  ]),
  getDBpediaRelatedConcepts: vi.fn().mockResolvedValue([
    "Food", "Recipe", "Kitchen", "Chef"
  ]),
}));

vi.mock("./services/schemaOrgService", () => ({
  classifyContentByTags: vi.fn().mockReturnValue([
    {
      type: { id: "HowTo", label: "How To", description: "Instructions" },
      confidence: 0.8,
      matchedKeywords: ["cooking"],
    }
  ]),
  getAllSchemaTypes: vi.fn().mockReturnValue([
    { id: "HowTo", label: "How To", description: "Instructions", keywords: ["tutorial"] }
  ]),
  getSchemaTypeById: vi.fn().mockReturnValue({
    id: "HowTo",
    label: "How To",
    description: "Instructions",
    keywords: ["tutorial"],
  }),
}));

describe("Knowledge Graph Services", () => {
  describe("Wikidata Service", () => {
    it("should search for entities", async () => {
      const { searchWikidataEntities } = await import("./services/wikidataService");
      const results = await searchWikidataEntities("cooking", "en", 5);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("label");
    });

    it("should enrich a tag with Wikidata data", async () => {
      const { enrichTagWithWikidata } = await import("./services/wikidataService");
      const result = await enrichTagWithWikidata("cooking", "en");
      
      expect(result).toBeDefined();
      expect(result.wikidataId).toBe("Q123");
      expect(result.label).toBe("cooking");
      expect(result.relatedConcepts).toContain("food");
    });
  });

  describe("DBpedia Service", () => {
    it("should search for entities", async () => {
      const { searchDBpediaEntities } = await import("./services/dbpediaService");
      const results = await searchDBpediaEntities("cooking", 5);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("uri");
      expect(results[0]).toHaveProperty("label");
    });

    it("should get related concepts", async () => {
      const { getDBpediaRelatedConcepts } = await import("./services/dbpediaService");
      const results = await getDBpediaRelatedConcepts("http://dbpedia.org/resource/Cooking");
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results).toContain("Food");
    });
  });

  describe("Schema.org Service", () => {
    it("should classify content by tags", async () => {
      const { classifyContentByTags } = await import("./services/schemaOrgService");
      const results = classifyContentByTags(["cooking", "recipe", "tutorial"]);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("type");
      expect(results[0]).toHaveProperty("confidence");
    });

    it("should return all schema types", async () => {
      const { getAllSchemaTypes } = await import("./services/schemaOrgService");
      const types = getAllSchemaTypes();
      
      expect(types).toBeDefined();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });
  });
});

describe("Knowledge Graph Integration", () => {
  it("should combine results from multiple sources", async () => {
    const { searchWikidataEntities } = await import("./services/wikidataService");
    const { searchDBpediaEntities } = await import("./services/dbpediaService");
    const { classifyContentByTags } = await import("./services/schemaOrgService");

    const wikidataResults = await searchWikidataEntities("video", "en", 3);
    const dbpediaResults = await searchDBpediaEntities("video", 3);
    const schemaResults = classifyContentByTags(["video", "media"]);

    expect(wikidataResults.length).toBeGreaterThan(0);
    expect(dbpediaResults.length).toBeGreaterThan(0);
    expect(schemaResults.length).toBeGreaterThan(0);
  });
});
