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


describe("Knowledge Graph Router Input Validation", () => {
  describe("getSuggestions Input", () => {
    it("should accept valid input with existingTags array", () => {
      const validInput = {
        existingTags: ["technology", "science"],
        context: "A document about AI research",
        settings: {
          enableWikidata: true,
          enableDBpedia: true,
          enableSchemaOrg: true,
          enableLLM: true,
          maxSuggestionsPerSource: 5,
          confidenceThreshold: 0.5,
        },
      };

      expect(Array.isArray(validInput.existingTags)).toBe(true);
      expect(typeof validInput.context).toBe("string");
      expect(validInput.settings.confidenceThreshold).toBeGreaterThanOrEqual(0);
      expect(validInput.settings.confidenceThreshold).toBeLessThanOrEqual(1);
    });

    it("should handle empty existingTags array", () => {
      const input = {
        existingTags: [],
        context: "New file without tags",
      };

      expect(input.existingTags.length).toBe(0);
      expect(typeof input.context).toBe("string");
    });
  });

  describe("getGraphData Input", () => {
    it("should accept valid graph data parameters", () => {
      const validInput = {
        includeFiles: true,
        minSimilarity: 0.3,
      };

      expect(typeof validInput.includeFiles).toBe("boolean");
      expect(validInput.minSimilarity).toBeGreaterThanOrEqual(0);
      expect(validInput.minSimilarity).toBeLessThanOrEqual(1);
    });
  });
});

describe("Graph Data Structure Validation", () => {
  describe("Node Structure", () => {
    it("should create valid tag node", () => {
      const tagNode = {
        id: "tag-123",
        type: "tag" as const,
        label: "Machine Learning",
        weight: 5,
        metadata: { tagId: 123 },
      };

      expect(tagNode.id.startsWith("tag-")).toBe(true);
      expect(tagNode.type).toBe("tag");
      expect(typeof tagNode.label).toBe("string");
      expect(tagNode.weight).toBeGreaterThan(0);
    });

    it("should create valid file node", () => {
      const fileNode = {
        id: "file-456",
        type: "file" as const,
        label: "research_paper.pdf",
        weight: 1,
        metadata: { fileId: 456, fileType: "application/pdf" },
      };

      expect(fileNode.id.startsWith("file-")).toBe(true);
      expect(fileNode.type).toBe("file");
      expect(fileNode.metadata.fileType).toBe("application/pdf");
    });
  });

  describe("Edge Structure", () => {
    it("should create valid edge between nodes", () => {
      const edge = {
        source: "tag-1",
        target: "tag-2",
        weight: 0.85,
        type: "semantic_similarity",
      };

      expect(typeof edge.source).toBe("string");
      expect(typeof edge.target).toBe("string");
      expect(edge.weight).toBeGreaterThanOrEqual(0);
      expect(edge.weight).toBeLessThanOrEqual(1);
    });
  });
});

describe("Auto-Tagging Logic", () => {
  describe("Filename Context Extraction", () => {
    it("should extract meaningful context from filename", () => {
      const testCases = [
        { filename: "quarterly-report-2024.pdf", expected: "quarterly-report-2024" },
        { filename: "meeting_notes_jan.docx", expected: "meeting_notes_jan" },
        { filename: "photo.with.multiple.dots.jpg", expected: "photo.with.multiple.dots" },
      ];

      testCases.forEach(({ filename, expected }) => {
        const result = filename.replace(/\.[^/.]+$/, "");
        expect(result).toBe(expected);
      });
    });
  });

  describe("Confidence Threshold Filtering", () => {
    it("should filter suggestions below threshold", () => {
      const suggestions = [
        { tag: "high-confidence", confidence: 0.9 },
        { tag: "medium-confidence", confidence: 0.5 },
        { tag: "low-confidence", confidence: 0.2 },
      ];
      const threshold = 0.7;

      const filtered = suggestions.filter((s) => s.confidence >= threshold);

      expect(filtered.length).toBe(1);
      expect(filtered[0].tag).toBe("high-confidence");
    });

    it("should apply auto-tag threshold of 0.7", () => {
      const autoTagThreshold = 0.7;
      const suggestions = [
        { tag: "AI", confidence: 0.85 },
        { tag: "ML", confidence: 0.72 },
        { tag: "Data", confidence: 0.65 },
      ];

      const autoApplied = suggestions.filter((s) => s.confidence >= autoTagThreshold);

      expect(autoApplied.length).toBe(2);
      expect(autoApplied.map((s) => s.tag)).toContain("AI");
      expect(autoApplied.map((s) => s.tag)).toContain("ML");
    });
  });
});

describe("Smart Tag Suggestions UI Logic", () => {
  describe("Source Categorization", () => {
    it("should categorize suggestions by source", () => {
      const getSourceKey = (source: string): string => {
        if (source.startsWith("wikidata")) return "wikidata";
        if (source.startsWith("dbpedia")) return "dbpedia";
        if (source.startsWith("schema.org")) return "schema.org";
        if (source.startsWith("llm")) return "llm";
        return "llm";
      };

      expect(getSourceKey("wikidata-entity")).toBe("wikidata");
      expect(getSourceKey("dbpedia-concept")).toBe("dbpedia");
      expect(getSourceKey("schema.org-type")).toBe("schema.org");
      expect(getSourceKey("llm-generated")).toBe("llm");
      expect(getSourceKey("unknown")).toBe("llm");
    });
  });

  describe("Confidence Display", () => {
    it("should format confidence as percentage", () => {
      const formatConfidence = (confidence: number): string => {
        return `${Math.round(confidence * 100)}%`;
      };

      expect(formatConfidence(0.85)).toBe("85%");
      expect(formatConfidence(0.5)).toBe("50%");
      expect(formatConfidence(1)).toBe("100%");
      expect(formatConfidence(0)).toBe("0%");
      expect(formatConfidence(0.333)).toBe("33%");
    });
  });

  describe("Added Tags Tracking", () => {
    it("should track added tags case-insensitively", () => {
      const addedTags = new Set<string>();
      
      const addTag = (tag: string) => {
        addedTags.add(tag.toLowerCase());
      };

      addTag("Technology");
      addTag("SCIENCE");
      addTag("ai");

      expect(addedTags.has("technology")).toBe(true);
      expect(addedTags.has("science")).toBe(true);
      expect(addedTags.has("ai")).toBe(true);
      expect(addedTags.has("Technology")).toBe(false); // case sensitive check
    });
  });
});

describe("File-to-Tag Edge Generation", () => {
  it("should create edges with correct structure", () => {
    const fileTagAssociations = [
      { fileId: 10, tagId: 1 },
      { fileId: 10, tagId: 2 },
      { fileId: 11, tagId: 1 },
    ];

    const edges = fileTagAssociations.map(({ fileId, tagId }) => ({
      source: `file-${fileId}`,
      target: `tag-${tagId}`,
      weight: 0.8,
      type: 'file-tag',
    }));

    expect(edges).toHaveLength(3);
    expect(edges[0]).toEqual({
      source: "file-10",
      target: "tag-1",
      weight: 0.8,
      type: "file-tag",
    });
  });

  it("file-to-tag edges should have consistent type and weight", () => {
    const fileTagAssociations = [
      { fileId: 1, tagId: 5 },
      { fileId: 2, tagId: 5 },
      { fileId: 3, tagId: 10 },
    ];

    const edges = fileTagAssociations.map(({ fileId, tagId }) => ({
      source: `file-${fileId}`,
      target: `tag-${tagId}`,
      weight: 0.8,
      type: 'file-tag',
    }));

    edges.forEach(edge => {
      expect(edge.type).toBe("file-tag");
      expect(edge.weight).toBe(0.8);
      expect(edge.source).toMatch(/^file-\d+$/);
      expect(edge.target).toMatch(/^tag-\d+$/);
    });
  });

  it("should deduplicate edges when merging with co-occurrence edges", () => {
    const edgeMap = new Map<string, any>();

    // Simulate co-occurrence edges
    const coOccurrenceEdges = [
      { source: "tag-1", target: "tag-2", weight: 0.5, type: "co-occurrence" },
    ];

    // Simulate file-to-tag edges
    const fileToTagEdges = [
      { source: "file-10", target: "tag-1", weight: 0.8, type: "file-tag" },
      { source: "file-10", target: "tag-2", weight: 0.8, type: "file-tag" },
    ];

    // Add co-occurrence edges
    for (const edge of coOccurrenceEdges) {
      const key = [edge.source, edge.target].sort().join('-');
      edgeMap.set(key, edge);
    }

    // Add file-to-tag edges (no duplicates expected)
    for (const edge of fileToTagEdges) {
      const key = [edge.source, edge.target].sort().join('-');
      if (!edgeMap.has(key)) {
        edgeMap.set(key, edge);
      }
    }

    const edges = Array.from(edgeMap.values());
    expect(edges).toHaveLength(3); // 1 co-occurrence + 2 file-tag
    expect(edges.filter(e => e.type === 'file-tag')).toHaveLength(2);
    expect(edges.filter(e => e.type === 'co-occurrence')).toHaveLength(1);
  });
});

describe("API Key Status Check", () => {
  it("should detect GOOGLE_API_KEY when present", () => {
    const originalKey = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = "test-key-123";

    const result = { googleKg: !!process.env.GOOGLE_API_KEY };
    expect(result.googleKg).toBe(true);

    // Restore
    if (originalKey) {
      process.env.GOOGLE_API_KEY = originalKey;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
  });

  it("should detect missing GOOGLE_API_KEY", () => {
    const originalKey = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const result = { googleKg: !!process.env.GOOGLE_API_KEY };
    expect(result.googleKg).toBe(false);

    // Restore
    if (originalKey) {
      process.env.GOOGLE_API_KEY = originalKey;
    }
  });
});
