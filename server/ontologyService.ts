/**
 * Ontology Service
 * Queries external knowledge graphs (DBpedia, Wikidata, Schema.org, custom ontologies)
 * to enhance file metadata with semantic information
 */

import axios from "axios";
import * as db from "./db";

export interface OntologyQueryResult {
  source: string;
  entities: Array<{
    uri: string;
    label: string;
    description?: string;
    type?: string;
    properties?: Record<string, any>;
  }>;
  relationships: Array<{
    subject: string;
    predicate: string;
    object: string;
  }>;
}

/**
 * Query DBpedia SPARQL endpoint
 */
async function queryDBpedia(
  endpoint: string,
  searchTerms: string[],
  apiKey?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];
  const relationships: any[] = [];

  for (const term of searchTerms.slice(0, 5)) {
    // Limit to 5 terms
    const sparqlQuery = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbr: <http://dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT DISTINCT ?resource ?label ?abstract ?type WHERE {
        ?resource rdfs:label ?label .
        FILTER (regex(?label, "${term}", "i"))
        OPTIONAL { ?resource dbo:abstract ?abstract . FILTER (lang(?abstract) = 'en') }
        OPTIONAL { ?resource rdf:type ?type }
        FILTER (lang(?label) = 'en')
      }
      LIMIT 3
    `;

    try {
      const response = await axios.get(endpoint, {
        params: {
          query: sparqlQuery,
          format: "json",
        },
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        timeout: 5000,
      });

      const bindings = response.data.results?.bindings || [];
      for (const binding of bindings) {
        entities.push({
          uri: binding.resource?.value,
          label: binding.label?.value,
          description: binding.abstract?.value?.substring(0, 200),
          type: binding.type?.value,
        });
      }
    } catch (error) {
      console.error(`[Ontology] DBpedia query failed for term "${term}":`, error);
    }
  }

  return {
    source: "DBpedia",
    entities,
    relationships,
  };
}

/**
 * Query Wikidata SPARQL endpoint
 */
async function queryWikidata(
  endpoint: string,
  searchTerms: string[],
  apiKey?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];
  const relationships: any[] = [];

  for (const term of searchTerms.slice(0, 5)) {
    const sparqlQuery = `
      SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
        ?item rdfs:label "${term}"@en .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 3
    `;

    try {
      const response = await axios.get(endpoint, {
        params: {
          query: sparqlQuery,
          format: "json",
        },
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        timeout: 5000,
      });

      const bindings = response.data.results?.bindings || [];
      for (const binding of bindings) {
        entities.push({
          uri: binding.item?.value,
          label: binding.itemLabel?.value,
          description: binding.itemDescription?.value,
        });
      }
    } catch (error) {
      console.error(`[Ontology] Wikidata query failed for term "${term}":`, error);
    }
  }

  return {
    source: "Wikidata",
    entities,
    relationships,
  };
}

/**
 * Query Schema.org (REST API approach)
 */
async function querySchemaOrg(
  endpoint: string,
  searchTerms: string[],
  apiKey?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];

  // Schema.org doesn't have a query API, so we'll match against known types
  const schemaTypes = [
    "Person",
    "Organization",
    "Place",
    "Event",
    "Product",
    "CreativeWork",
    "Article",
    "VideoObject",
    "ImageObject",
  ];

  for (const term of searchTerms) {
    const matchedTypes = schemaTypes.filter((type) =>
      type.toLowerCase().includes(term.toLowerCase())
    );

    for (const type of matchedTypes) {
      entities.push({
        uri: `https://schema.org/${type}`,
        label: type,
        description: `Schema.org type: ${type}`,
        type: "schema:Type",
      });
    }
  }

  return {
    source: "Schema.org",
    entities,
    relationships: [],
  };
}

/**
 * Query custom ontology
 */
async function queryCustomOntology(
  endpoint: string,
  searchTerms: string[],
  apiKey?: string,
  namespacePrefix?: string
): Promise<OntologyQueryResult> {
  // Custom ontology querying would depend on the specific ontology format
  // This is a placeholder implementation
  return {
    source: "Custom Ontology",
    entities: [],
    relationships: [],
  };
}

/**
 * Main function to query all enabled external knowledge graphs for a user
 */
export async function enrichWithExternalKnowledgeGraphs(
  userId: number,
  searchTerms: string[]
): Promise<OntologyQueryResult[]> {
  // Get all enabled knowledge graphs for the user, ordered by priority
  const knowledgeGraphs = await db.getExternalKnowledgeGraphsByUser(userId);
  const enabledKGs = knowledgeGraphs.filter((kg) => kg.enabled);

  if (enabledKGs.length === 0) {
    return [];
  }

  const results: OntologyQueryResult[] = [];

  for (const kg of enabledKGs) {
    try {
      let result: OntologyQueryResult;

      switch (kg.type) {
        case "dbpedia":
          result = await queryDBpedia(kg.endpoint || "", searchTerms, kg.apiKey || undefined);
          break;
        case "wikidata":
          result = await queryWikidata(kg.endpoint || "", searchTerms, kg.apiKey || undefined);
          break;
        case "schema_org":
          result = await querySchemaOrg(kg.endpoint || "", searchTerms, kg.apiKey || undefined);
          break;
        case "custom":
          result = await queryCustomOntology(
            kg.endpoint || "",
            searchTerms,
            kg.apiKey || undefined,
            kg.namespacePrefix || undefined
          );
          break;
        default:
          continue;
      }

      if (result.entities.length > 0) {
        results.push(result);
      }

      // Update usage statistics
      await db.updateExternalKnowledgeGraph(kg.id, {
        usageCount: (kg.usageCount || 0) + 1,
        lastUsedAt: new Date(),
      });
    } catch (error) {
      console.error(`[Ontology] Failed to query ${kg.name}:`, error);
    }
  }

  return results;
}

/**
 * Extract semantic tags from ontology results
 */
export function extractSemanticTags(results: OntologyQueryResult[]): string[] {
  const tags = new Set<string>();

  for (const result of results) {
    for (const entity of result.entities) {
      // Add entity label as a tag
      if (entity.label) {
        tags.add(entity.label.toLowerCase());
      }

      // Add entity type as a tag
      if (entity.type) {
        const typeName = entity.type.split(/[/#]/).pop();
        if (typeName) {
          tags.add(typeName.toLowerCase());
        }
      }
    }
  }

  return Array.from(tags).slice(0, 20); // Limit to 20 tags
}

/**
 * Generate enhanced description from ontology results
 */
export function generateEnhancedDescription(
  originalDescription: string,
  results: OntologyQueryResult[]
): string {
  if (results.length === 0) {
    return originalDescription;
  }

  const entityDescriptions: string[] = [];

  for (const result of results) {
    for (const entity of result.entities.slice(0, 3)) {
      // Top 3 entities per source
      if (entity.description) {
        entityDescriptions.push(`${entity.label}: ${entity.description}`);
      }
    }
  }

  if (entityDescriptions.length === 0) {
    return originalDescription;
  }

  return `${originalDescription}\n\nRelated Information:\n${entityDescriptions.join("\n")}`;
}
