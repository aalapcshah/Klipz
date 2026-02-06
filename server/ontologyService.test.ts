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

    it("should return correct defaults for google_kg", () => {
      const defaults = getOntologyDefaults("google_kg");
      expect(defaults.name).toBe("Google Knowledge Graph");
      expect(defaults.endpoint).toBe("https://kgsearch.googleapis.com/v1/entities:search");
      expect(defaults.description).toContain("entity");
      expect(defaults.description).toContain("API key");
    });

    it("should return correct defaults for musicbrainz", () => {
      const defaults = getOntologyDefaults("musicbrainz");
      expect(defaults.name).toBe("MusicBrainz");
      expect(defaults.endpoint).toBe("https://musicbrainz.org/ws/2");
      expect(defaults.description).toContain("music");
      expect(defaults.description).toContain("No API key");
    });

    it("should return unknown for unrecognized type", () => {
      const defaults = getOntologyDefaults("nonexistent");
      expect(defaults.name).toBe("Unknown");
    });
  });

  describe("Google Knowledge Graph integration", () => {
    it("should have google_kg in the ontology defaults", () => {
      const defaults = getOntologyDefaults("google_kg");
      expect(defaults).toBeDefined();
      expect(defaults.name).not.toBe("Unknown");
    });

    it("should extract semantic tags from Google KG results", () => {
      const results: OntologyQueryResult[] = [
        {
          source: "Google Knowledge Graph",
          entities: [
            {
              uri: "kg:/m/0dl567",
              label: "Taylor Swift",
              description: "American singer-songwriter",
              type: "Person, MusicGroup",
              properties: {
                resultScore: 4850,
                types: ["Person", "MusicGroup"],
                source: "Google Knowledge Graph",
              },
            },
          ],
          relationships: [
            {
              subject: "Taylor Swift",
              predicate: "rdf:type",
              object: "schema:Person",
            },
          ],
        },
      ];

      const tags = extractSemanticTags(results);
      expect(tags).toContain("taylor swift");
    });
  });

  describe("MusicBrainz integration", () => {
    it("should have musicbrainz in the ontology defaults", () => {
      const defaults = getOntologyDefaults("musicbrainz");
      expect(defaults).toBeDefined();
      expect(defaults.name).not.toBe("Unknown");
    });

    it("should extract semantic tags from MusicBrainz results", () => {
      const results: OntologyQueryResult[] = [
        {
          source: "MusicBrainz",
          entities: [
            {
              uri: "https://musicbrainz.org/artist/abc123",
              label: "Dijon",
              description: "Artist | (R&B singer-songwriter) | Country: US",
              type: "musicbrainz:Person",
              properties: {
                mbid: "abc123",
                type: "Person",
                country: "US",
                score: 95,
                tags: ["r&b", "soul"],
                source: "MusicBrainz",
              },
            },
            {
              uri: "https://musicbrainz.org/recording/def456",
              label: "Talk Down",
              description: "Recording | by Dijon | Duration: 3:45",
              type: "musicbrainz:Recording",
              properties: {
                mbid: "def456",
                artists: ["Dijon"],
                duration: 225000,
                score: 90,
                source: "MusicBrainz",
              },
            },
          ],
          relationships: [
            {
              subject: "Dijon",
              predicate: "musicbrainz:performed",
              object: "Talk Down",
            },
            {
              subject: "Dijon",
              predicate: "musicbrainz:genre",
              object: "r&b",
            },
          ],
        },
      ];

      const tags = extractSemanticTags(results);
      expect(tags).toContain("dijon");
      expect(tags).toContain("talk down");
    });

    it("should generate enhanced description from MusicBrainz results", () => {
      const results: OntologyQueryResult[] = [
        {
          source: "MusicBrainz",
          entities: [
            {
              uri: "https://musicbrainz.org/artist/abc123",
              label: "Dijon",
              description: "R&B singer-songwriter from the US",
            },
          ],
          relationships: [],
        },
      ];

      const enhanced = generateEnhancedDescription("YouTube video reference", results);
      expect(enhanced).toContain("YouTube video reference");
      expect(enhanced).toContain("Dijon: R&B singer-songwriter from the US");
    });
  });
});
