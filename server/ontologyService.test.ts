import { describe, it, expect } from "vitest";

// We test the exported utility functions from ontologyService
// The query functions are internal, but we can test the helpers
import {
  extractSemanticTags,
  generateEnhancedDescription,
  getOntologyDefaults,
  type OntologyQueryResult,
} from "./ontologyService";

describe("ontologyService", () => {
  describe("extractSemanticTags", () => {
    it("should extract labels and types from ontology results", () => {
      const results: OntologyQueryResult[] = [
        {
          source: "Schema.org",
          entities: [
            {
              uri: "https://schema.org/VideoObject",
              label: "VideoObject",
              description: "A video file",
              type: "schema:Type",
            },
            {
              uri: "https://schema.org/Person",
              label: "Person",
              description: "A person",
              type: "schema:Type",
            },
          ],
          relationships: [],
        },
      ];

      const tags = extractSemanticTags(results);
      expect(tags).toContain("videoobject");
      expect(tags).toContain("person");
      expect(tags).toContain("schema:type"); // from schema:Type (split on / and # keeps the prefix)
    });

    it("should limit to 20 tags maximum", () => {
      const entities = Array.from({ length: 30 }, (_, i) => ({
        uri: `https://example.org/entity${i}`,
        label: `Entity${i}`,
        type: `Type${i}`,
      }));

      const results: OntologyQueryResult[] = [
        { source: "Test", entities, relationships: [] },
      ];

      const tags = extractSemanticTags(results);
      expect(tags.length).toBeLessThanOrEqual(20);
    });

    it("should deduplicate tags", () => {
      const results: OntologyQueryResult[] = [
        {
          source: "Source1",
          entities: [
            { uri: "a", label: "Video", type: "Type" },
          ],
          relationships: [],
        },
        {
          source: "Source2",
          entities: [
            { uri: "b", label: "Video", type: "Type" },
          ],
          relationships: [],
        },
      ];

      const tags = extractSemanticTags(results);
      const videoCount = tags.filter(t => t === "video").length;
      expect(videoCount).toBe(1);
    });

    it("should return empty array for empty results", () => {
      const tags = extractSemanticTags([]);
      expect(tags).toEqual([]);
    });
  });

  describe("generateEnhancedDescription", () => {
    it("should append entity descriptions to original description", () => {
      const results: OntologyQueryResult[] = [
        {
          source: "DBpedia",
          entities: [
            {
              uri: "http://dbpedia.org/resource/Music",
              label: "Music",
              description: "An art form and cultural activity",
            },
          ],
          relationships: [],
        },
      ];

      const enhanced = generateEnhancedDescription("Original text", results);
      expect(enhanced).toContain("Original text");
      expect(enhanced).toContain("Related Information:");
      expect(enhanced).toContain("Music: An art form and cultural activity");
    });

    it("should return original description when no results", () => {
      const enhanced = generateEnhancedDescription("Original text", []);
      expect(enhanced).toBe("Original text");
    });

    it("should return original description when entities have no descriptions", () => {
      const results: OntologyQueryResult[] = [
        {
          source: "Test",
          entities: [
            { uri: "a", label: "Test" },
          ],
          relationships: [],
        },
      ];

      const enhanced = generateEnhancedDescription("Original text", results);
      expect(enhanced).toBe("Original text");
    });

    it("should limit to top 3 entities per source", () => {
      const entities = Array.from({ length: 10 }, (_, i) => ({
        uri: `https://example.org/entity${i}`,
        label: `Entity${i}`,
        description: `Description for entity ${i}`,
      }));

      const results: OntologyQueryResult[] = [
        { source: "Test", entities, relationships: [] },
      ];

      const enhanced = generateEnhancedDescription("Original", results);
      // Should only have 3 entity descriptions
      const entityLines = enhanced.split("\n").filter(l => l.startsWith("Entity"));
      expect(entityLines.length).toBe(3);
    });
  });

  describe("getOntologyDefaults", () => {
    it("should return correct defaults for dbpedia", () => {
      const defaults = getOntologyDefaults("dbpedia");
      expect(defaults.name).toBe("DBpedia");
      expect(defaults.endpoint).toBe("https://dbpedia.org/sparql");
      expect(defaults.description).toBeTruthy();
    });

    it("should return correct defaults for wikidata", () => {
      const defaults = getOntologyDefaults("wikidata");
      expect(defaults.name).toBe("Wikidata");
      expect(defaults.endpoint).toBe("https://query.wikidata.org/sparql");
    });

    it("should return correct defaults for schema_org", () => {
      const defaults = getOntologyDefaults("schema_org");
      expect(defaults.name).toBe("Schema.org");
      expect(defaults.description).toContain("media content");
    });

    it("should return correct defaults for owl", () => {
      const defaults = getOntologyDefaults("owl");
      expect(defaults.name).toBe("OWL Ontology");
      expect(defaults.description).toContain("Web Ontology Language");
      expect(defaults.description).toContain("SPARQL");
    });

    it("should return correct defaults for foaf", () => {
      const defaults = getOntologyDefaults("foaf");
      expect(defaults.name).toBe("FOAF (Friend of a Friend)");
      expect(defaults.description).toContain("people");
      expect(defaults.description).toContain("relationships");
    });

    it("should return correct defaults for custom", () => {
      const defaults = getOntologyDefaults("custom");
      expect(defaults.name).toBe("Custom Ontology");
    });

    it("should return unknown for unrecognized type", () => {
      const defaults = getOntologyDefaults("nonexistent");
      expect(defaults.name).toBe("Unknown");
    });
  });
});
