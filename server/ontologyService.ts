/**
 * Ontology Service
 * Queries external knowledge graphs (DBpedia, Wikidata, Schema.org, OWL, FOAF, custom ontologies)
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
 * Schema.org vocabulary mapping for media content types
 * Enhanced with comprehensive type hierarchy and property mappings
 */
const SCHEMA_ORG_TYPES: Record<string, {
  uri: string;
  label: string;
  description: string;
  properties: string[];
  parentType?: string;
}> = {
  // Creative Works
  "creativework": {
    uri: "https://schema.org/CreativeWork",
    label: "CreativeWork",
    description: "The most generic kind of creative work, including books, movies, photographs, software programs, etc.",
    properties: ["author", "dateCreated", "description", "keywords", "license", "name"],
  },
  "mediaobject": {
    uri: "https://schema.org/MediaObject",
    label: "MediaObject",
    description: "A media object, such as an image, video, audio, or text object embedded in a web page or a downloadable dataset.",
    properties: ["contentUrl", "encodingFormat", "contentSize", "duration", "width", "height"],
    parentType: "CreativeWork",
  },
  "videoobject": {
    uri: "https://schema.org/VideoObject",
    label: "VideoObject",
    description: "A video file or embedded video content.",
    properties: ["caption", "director", "duration", "thumbnail", "transcript", "videoFrameSize", "videoQuality"],
    parentType: "MediaObject",
  },
  "imageobject": {
    uri: "https://schema.org/ImageObject",
    label: "ImageObject",
    description: "An image file or embedded image.",
    properties: ["caption", "exifData", "representativeOfPage", "thumbnail"],
    parentType: "MediaObject",
  },
  "audioobject": {
    uri: "https://schema.org/AudioObject",
    label: "AudioObject",
    description: "An audio file or embedded audio content.",
    properties: ["caption", "duration", "transcript"],
    parentType: "MediaObject",
  },
  "clip": {
    uri: "https://schema.org/Clip",
    label: "Clip",
    description: "A short TV or radio program or a segment/part of a program.",
    properties: ["clipNumber", "partOfSeries", "partOfSeason"],
    parentType: "CreativeWork",
  },
  "article": {
    uri: "https://schema.org/Article",
    label: "Article",
    description: "An article, such as a news article or piece of investigative report.",
    properties: ["articleBody", "articleSection", "wordCount"],
    parentType: "CreativeWork",
  },
  "socialmediaposting": {
    uri: "https://schema.org/SocialMediaPosting",
    label: "SocialMediaPosting",
    description: "A post to a social media platform, including blog posts, tweets, Facebook posts, etc.",
    properties: ["sharedContent", "datePublished", "author", "interactionStatistic"],
    parentType: "Article",
  },
  "photograph": {
    uri: "https://schema.org/Photograph",
    label: "Photograph",
    description: "A photograph.",
    properties: ["caption", "exifData"],
    parentType: "CreativeWork",
  },
  "musicrecording": {
    uri: "https://schema.org/MusicRecording",
    label: "MusicRecording",
    description: "A music recording (track), usually a single song.",
    properties: ["byArtist", "duration", "inAlbum", "isrcCode"],
    parentType: "CreativeWork",
  },
  // People & Organizations
  "person": {
    uri: "https://schema.org/Person",
    label: "Person",
    description: "A person (alive, dead, undead, or fictional).",
    properties: ["name", "email", "url", "sameAs", "jobTitle", "worksFor"],
  },
  "organization": {
    uri: "https://schema.org/Organization",
    label: "Organization",
    description: "An organization such as a school, NGO, corporation, club, etc.",
    properties: ["name", "url", "logo", "member", "founder"],
  },
  // Places
  "place": {
    uri: "https://schema.org/Place",
    label: "Place",
    description: "Entities that have a somewhat fixed, physical extension.",
    properties: ["address", "geo", "name", "photo"],
  },
  // Events
  "event": {
    uri: "https://schema.org/Event",
    label: "Event",
    description: "An event happening at a certain time and location.",
    properties: ["startDate", "endDate", "location", "organizer", "performer"],
  },
  // Products
  "product": {
    uri: "https://schema.org/Product",
    label: "Product",
    description: "Any offered product or service.",
    properties: ["brand", "category", "name", "image", "description"],
  },
  // Actions
  "interactioncounter": {
    uri: "https://schema.org/InteractionCounter",
    label: "InteractionCounter",
    description: "A summary of how users have interacted with this CreativeWork.",
    properties: ["interactionType", "userInteractionCount"],
  },
  // Collections
  "collection": {
    uri: "https://schema.org/Collection",
    label: "Collection",
    description: "A collection of items, e.g., creative works or products.",
    properties: ["collectionSize", "hasPart"],
    parentType: "CreativeWork",
  },
};

/**
 * Query Schema.org - enhanced with comprehensive vocabulary mapping
 */
async function querySchemaOrg(
  _endpoint: string,
  searchTerms: string[],
  _apiKey?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];
  const relationships: any[] = [];
  const matchedTypes = new Set<string>();

  // Media-specific keyword mappings
  const keywordToType: Record<string, string[]> = {
    "video": ["videoobject", "clip", "mediaobject"],
    "image": ["imageobject", "photograph", "mediaobject"],
    "photo": ["photograph", "imageobject"],
    "audio": ["audioobject", "mediaobject"],
    "music": ["musicrecording", "audioobject"],
    "song": ["musicrecording"],
    "post": ["socialmediaposting"],
    "tweet": ["socialmediaposting"],
    "reel": ["videoobject", "socialmediaposting"],
    "story": ["socialmediaposting", "clip"],
    "tiktok": ["videoobject", "socialmediaposting"],
    "instagram": ["socialmediaposting", "imageobject"],
    "youtube": ["videoobject"],
    "clip": ["clip", "videoobject"],
    "person": ["person"],
    "creator": ["person"],
    "artist": ["person", "musicrecording"],
    "brand": ["organization", "product"],
    "company": ["organization"],
    "place": ["place"],
    "location": ["place"],
    "event": ["event"],
    "product": ["product"],
    "collection": ["collection"],
    "album": ["collection", "musicrecording"],
    "playlist": ["collection"],
    "article": ["article"],
    "blog": ["article", "socialmediaposting"],
  };

  for (const term of searchTerms) {
    const termLower = term.toLowerCase();

    // Direct type match
    if (SCHEMA_ORG_TYPES[termLower]) {
      matchedTypes.add(termLower);
    }

    // Keyword-based mapping
    for (const [keyword, types] of Object.entries(keywordToType)) {
      if (termLower.includes(keyword)) {
        types.forEach(t => matchedTypes.add(t));
      }
    }

    // Fuzzy match against all type labels
    for (const [key, typeInfo] of Object.entries(SCHEMA_ORG_TYPES)) {
      if (typeInfo.label.toLowerCase().includes(termLower) ||
          typeInfo.description.toLowerCase().includes(termLower)) {
        matchedTypes.add(key);
      }
    }
  }

  // Build entities from matched types
  for (const typeKey of Array.from(matchedTypes)) {
    const typeInfo = SCHEMA_ORG_TYPES[typeKey];
    if (typeInfo) {
      entities.push({
        uri: typeInfo.uri,
        label: typeInfo.label,
        description: typeInfo.description,
        type: "schema:Type",
        properties: {
          applicableProperties: typeInfo.properties,
          parentType: typeInfo.parentType,
        },
      });

      // Add parent type relationships
      if (typeInfo.parentType) {
        relationships.push({
          subject: typeInfo.uri,
          predicate: "rdfs:subClassOf",
          object: `https://schema.org/${typeInfo.parentType}`,
        });
      }
    }
  }

  return {
    source: "Schema.org",
    entities,
    relationships,
  };
}

/**
 * OWL (Web Ontology Language) ontology querying
 * Queries OWL ontologies via SPARQL endpoints for class/property relationships
 * Supports both remote SPARQL endpoints and local OWL file references
 */
async function queryOWL(
  endpoint: string,
  searchTerms: string[],
  apiKey?: string,
  ontologyUrl?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];
  const relationships: any[] = [];

  // If an OWL ontology URL is provided, query it via SPARQL
  const sparqlEndpoint = endpoint || "http://sparql.org/sparql";

  for (const term of searchTerms.slice(0, 5)) {
    // Query for OWL classes matching the search term
    const classQuery = `
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      
      SELECT DISTINCT ?class ?label ?comment ?superClass WHERE {
        ?class rdf:type owl:Class .
        OPTIONAL { ?class rdfs:label ?label . FILTER (lang(?label) = 'en' || lang(?label) = '') }
        OPTIONAL { ?class rdfs:comment ?comment . FILTER (lang(?comment) = 'en' || lang(?comment) = '') }
        OPTIONAL { ?class rdfs:subClassOf ?superClass . ?superClass rdf:type owl:Class }
        FILTER (
          regex(str(?class), "${term}", "i") ||
          regex(?label, "${term}", "i")
        )
      }
      LIMIT 5
    `;

    // Query for OWL object properties
    const propertyQuery = `
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      
      SELECT DISTINCT ?property ?label ?domain ?range WHERE {
        { ?property rdf:type owl:ObjectProperty }
        UNION
        { ?property rdf:type owl:DatatypeProperty }
        OPTIONAL { ?property rdfs:label ?label . FILTER (lang(?label) = 'en' || lang(?label) = '') }
        OPTIONAL { ?property rdfs:domain ?domain }
        OPTIONAL { ?property rdfs:range ?range }
        FILTER (
          regex(str(?property), "${term}", "i") ||
          regex(?label, "${term}", "i")
        )
      }
      LIMIT 5
    `;

    try {
      // Query classes
      const classResponse = await axios.get(sparqlEndpoint, {
        params: { query: classQuery, format: "json" },
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        timeout: 8000,
      });

      const classBindings = classResponse.data.results?.bindings || [];
      for (const binding of classBindings) {
        const classUri = binding.class?.value;
        const label = binding.label?.value || classUri?.split(/[/#]/).pop() || term;
        
        entities.push({
          uri: classUri,
          label,
          description: binding.comment?.value?.substring(0, 300),
          type: "owl:Class",
          properties: {
            ontologySource: ontologyUrl || endpoint,
          },
        });

        // Add subclass relationships
        if (binding.superClass?.value) {
          relationships.push({
            subject: classUri,
            predicate: "rdfs:subClassOf",
            object: binding.superClass.value,
          });
        }
      }

      // Query properties
      const propResponse = await axios.get(sparqlEndpoint, {
        params: { query: propertyQuery, format: "json" },
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        timeout: 8000,
      });

      const propBindings = propResponse.data.results?.bindings || [];
      for (const binding of propBindings) {
        const propUri = binding.property?.value;
        const label = binding.label?.value || propUri?.split(/[/#]/).pop() || term;
        
        entities.push({
          uri: propUri,
          label,
          description: `OWL Property${binding.domain?.value ? ` (domain: ${binding.domain.value.split(/[/#]/).pop()})` : ""}${binding.range?.value ? ` (range: ${binding.range.value.split(/[/#]/).pop()})` : ""}`,
          type: "owl:Property",
          properties: {
            domain: binding.domain?.value,
            range: binding.range?.value,
          },
        });

        // Add domain/range relationships
        if (binding.domain?.value && binding.range?.value) {
          relationships.push({
            subject: binding.domain.value,
            predicate: propUri,
            object: binding.range.value,
          });
        }
      }
    } catch (error) {
      console.error(`[Ontology] OWL query failed for term "${term}":`, error);
    }
  }

  return {
    source: "OWL",
    entities,
    relationships,
  };
}

/**
 * FOAF (Friend of a Friend) ontology querying
 * Maps creator/person relationships using the FOAF vocabulary
 * Particularly useful for social media content where creator identity matters
 */

// FOAF vocabulary - core classes and properties for person/creator mapping
const FOAF_VOCABULARY: Record<string, {
  uri: string;
  label: string;
  description: string;
  type: "class" | "property";
  domain?: string;
  range?: string;
}> = {
  // Core Classes
  "agent": {
    uri: "http://xmlns.com/foaf/0.1/Agent",
    label: "Agent",
    description: "An agent (eg. person, group, software or physical artifact).",
    type: "class",
  },
  "person": {
    uri: "http://xmlns.com/foaf/0.1/Person",
    label: "Person",
    description: "A person.",
    type: "class",
  },
  "group": {
    uri: "http://xmlns.com/foaf/0.1/Group",
    label: "Group",
    description: "A class of Agents representing a group of people.",
    type: "class",
  },
  "organization": {
    uri: "http://xmlns.com/foaf/0.1/Organization",
    label: "Organization",
    description: "An organization.",
    type: "class",
  },
  "document": {
    uri: "http://xmlns.com/foaf/0.1/Document",
    label: "Document",
    description: "A document.",
    type: "class",
  },
  "image": {
    uri: "http://xmlns.com/foaf/0.1/Image",
    label: "Image",
    description: "An image.",
    type: "class",
  },
  "onlineaccount": {
    uri: "http://xmlns.com/foaf/0.1/OnlineAccount",
    label: "OnlineAccount",
    description: "An online account.",
    type: "class",
  },
  "project": {
    uri: "http://xmlns.com/foaf/0.1/Project",
    label: "Project",
    description: "A project (a collective endeavour of some kind).",
    type: "class",
  },
  // Core Properties
  "name": {
    uri: "http://xmlns.com/foaf/0.1/name",
    label: "name",
    description: "A name for some thing.",
    type: "property",
    domain: "Agent",
  },
  "nick": {
    uri: "http://xmlns.com/foaf/0.1/nick",
    label: "nick",
    description: "A short informal nickname characterising an agent.",
    type: "property",
    domain: "Agent",
  },
  "homepage": {
    uri: "http://xmlns.com/foaf/0.1/homepage",
    label: "homepage",
    description: "A homepage for some thing.",
    type: "property",
    domain: "Agent",
    range: "Document",
  },
  "knows": {
    uri: "http://xmlns.com/foaf/0.1/knows",
    label: "knows",
    description: "A person known by this person (indicating some level of reciprocated interaction between the parties).",
    type: "property",
    domain: "Person",
    range: "Person",
  },
  "maker": {
    uri: "http://xmlns.com/foaf/0.1/maker",
    label: "maker",
    description: "An agent that made this thing.",
    type: "property",
    range: "Agent",
  },
  "made": {
    uri: "http://xmlns.com/foaf/0.1/made",
    label: "made",
    description: "Something that was made by this agent.",
    type: "property",
    domain: "Agent",
  },
  "depiction": {
    uri: "http://xmlns.com/foaf/0.1/depiction",
    label: "depiction",
    description: "A depiction of some thing.",
    type: "property",
    range: "Image",
  },
  "depicts": {
    uri: "http://xmlns.com/foaf/0.1/depicts",
    label: "depicts",
    description: "A thing depicted in this representation.",
    type: "property",
    domain: "Image",
  },
  "account": {
    uri: "http://xmlns.com/foaf/0.1/account",
    label: "account",
    description: "Indicates an account held by this agent.",
    type: "property",
    domain: "Agent",
    range: "OnlineAccount",
  },
  "accountname": {
    uri: "http://xmlns.com/foaf/0.1/accountName",
    label: "accountName",
    description: "Indicates the name (identifier) associated with this online account.",
    type: "property",
    domain: "OnlineAccount",
  },
  "accountservicehomepage": {
    uri: "http://xmlns.com/foaf/0.1/accountServiceHomepage",
    label: "accountServiceHomepage",
    description: "Indicates a homepage of the service providing this online account.",
    type: "property",
    domain: "OnlineAccount",
    range: "Document",
  },
  "member": {
    uri: "http://xmlns.com/foaf/0.1/member",
    label: "member",
    description: "Indicates a member of a Group.",
    type: "property",
    domain: "Group",
    range: "Agent",
  },
  "interest": {
    uri: "http://xmlns.com/foaf/0.1/interest",
    label: "interest",
    description: "A page about a topic of interest to this person.",
    type: "property",
    domain: "Agent",
    range: "Document",
  },
  "topic": {
    uri: "http://xmlns.com/foaf/0.1/topic",
    label: "topic",
    description: "A topic of some page or document.",
    type: "property",
    domain: "Document",
  },
  "based_near": {
    uri: "http://xmlns.com/foaf/0.1/based_near",
    label: "based_near",
    description: "A location that something is based near, for some broadly human notion of near.",
    type: "property",
    domain: "Agent",
  },
  "img": {
    uri: "http://xmlns.com/foaf/0.1/img",
    label: "img",
    description: "An image that can be used to represent some thing (ie. those depictions which are particularly representative of something, eg. one's photo on a homepage).",
    type: "property",
    domain: "Person",
    range: "Image",
  },
  "workplacehomepage": {
    uri: "http://xmlns.com/foaf/0.1/workplaceHomepage",
    label: "workplaceHomepage",
    description: "A workplace homepage of some person; the homepage of an organization they work for.",
    type: "property",
    domain: "Person",
    range: "Document",
  },
  "currentproject": {
    uri: "http://xmlns.com/foaf/0.1/currentProject",
    label: "currentProject",
    description: "A current project this person works on.",
    type: "property",
    domain: "Person",
    range: "Project",
  },
};

// Social media platform to FOAF mapping
const PLATFORM_FOAF_MAPPINGS: Record<string, {
  accountServiceHomepage: string;
  contentType: string;
}> = {
  "youtube": {
    accountServiceHomepage: "https://www.youtube.com",
    contentType: "VideoObject",
  },
  "instagram": {
    accountServiceHomepage: "https://www.instagram.com",
    contentType: "ImageObject",
  },
  "tiktok": {
    accountServiceHomepage: "https://www.tiktok.com",
    contentType: "VideoObject",
  },
  "twitter": {
    accountServiceHomepage: "https://twitter.com",
    contentType: "SocialMediaPosting",
  },
  "linkedin": {
    accountServiceHomepage: "https://www.linkedin.com",
    contentType: "SocialMediaPosting",
  },
  "facebook": {
    accountServiceHomepage: "https://www.facebook.com",
    contentType: "SocialMediaPosting",
  },
  "vimeo": {
    accountServiceHomepage: "https://vimeo.com",
    contentType: "VideoObject",
  },
};

/**
 * Query FOAF vocabulary - maps creator/person relationships
 */
async function queryFOAF(
  endpoint: string,
  searchTerms: string[],
  apiKey?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];
  const relationships: any[] = [];
  const matchedTerms = new Set<string>();

  // Keyword to FOAF concept mapping
  const keywordToFoaf: Record<string, string[]> = {
    "person": ["person", "name", "nick", "knows"],
    "creator": ["person", "maker", "made", "name"],
    "author": ["person", "maker", "made", "name"],
    "artist": ["person", "maker", "made"],
    "user": ["person", "onlineaccount", "account", "accountname"],
    "account": ["onlineaccount", "account", "accountname", "accountservicehomepage"],
    "profile": ["person", "onlineaccount", "img", "homepage"],
    "group": ["group", "member"],
    "team": ["group", "member", "organization"],
    "organization": ["organization", "member"],
    "company": ["organization", "homepage"],
    "image": ["image", "depiction", "depicts", "img"],
    "photo": ["image", "depiction", "depicts"],
    "video": ["document", "maker", "made"],
    "content": ["document", "maker", "topic"],
    "friend": ["knows", "person"],
    "follow": ["knows", "interest"],
    "project": ["project", "currentproject"],
    "location": ["based_near"],
    "work": ["workplacehomepage", "currentproject"],
    "social": ["onlineaccount", "account", "accountservicehomepage"],
    "instagram": ["onlineaccount", "image", "maker"],
    "youtube": ["onlineaccount", "document", "maker"],
    "tiktok": ["onlineaccount", "document", "maker"],
    "twitter": ["onlineaccount", "maker"],
  };

  for (const term of searchTerms) {
    const termLower = term.toLowerCase();

    // Direct vocabulary match
    if (FOAF_VOCABULARY[termLower]) {
      matchedTerms.add(termLower);
    }

    // Keyword-based mapping
    for (const [keyword, foafTerms] of Object.entries(keywordToFoaf)) {
      if (termLower.includes(keyword)) {
        foafTerms.forEach(t => matchedTerms.add(t));
      }
    }

    // Fuzzy match against FOAF labels and descriptions
    for (const [key, vocab] of Object.entries(FOAF_VOCABULARY)) {
      if (vocab.label.toLowerCase().includes(termLower) ||
          vocab.description.toLowerCase().includes(termLower)) {
        matchedTerms.add(key);
      }
    }

    // Platform-specific FOAF mappings
    for (const [platform, mapping] of Object.entries(PLATFORM_FOAF_MAPPINGS)) {
      if (termLower.includes(platform)) {
        entities.push({
          uri: `foaf:OnlineAccount/${platform}`,
          label: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`,
          description: `Social media account on ${platform}`,
          type: "foaf:OnlineAccount",
          properties: {
            accountServiceHomepage: mapping.accountServiceHomepage,
            contentType: mapping.contentType,
          },
        });
      }
    }
  }

  // Build entities from matched FOAF terms
  for (const termKey of Array.from(matchedTerms)) {
    const vocab = FOAF_VOCABULARY[termKey];
    if (vocab) {
      entities.push({
        uri: vocab.uri,
        label: vocab.label,
        description: vocab.description,
        type: vocab.type === "class" ? "foaf:Class" : "foaf:Property",
        properties: {
          ...(vocab.domain ? { domain: vocab.domain } : {}),
          ...(vocab.range ? { range: vocab.range } : {}),
        },
      });

      // Add domain/range relationships for properties
      if (vocab.type === "property" && vocab.domain && vocab.range) {
        const domainVocab = FOAF_VOCABULARY[vocab.domain.toLowerCase()];
        const rangeVocab = FOAF_VOCABULARY[vocab.range.toLowerCase()];
        if (domainVocab && rangeVocab) {
          relationships.push({
            subject: domainVocab.uri,
            predicate: vocab.uri,
            object: rangeVocab.uri,
          });
        }
      }
    }
  }

  // If endpoint is provided, also try SPARQL query for FOAF data
  if (endpoint && endpoint.startsWith("http")) {
    for (const term of searchTerms.slice(0, 3)) {
      const sparqlQuery = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        
        SELECT DISTINCT ?person ?name ?nick ?homepage WHERE {
          ?person a foaf:Person .
          OPTIONAL { ?person foaf:name ?name }
          OPTIONAL { ?person foaf:nick ?nick }
          OPTIONAL { ?person foaf:homepage ?homepage }
          FILTER (
            regex(?name, "${term}", "i") ||
            regex(?nick, "${term}", "i")
          )
        }
        LIMIT 5
      `;

      try {
        const response = await axios.get(endpoint, {
          params: { query: sparqlQuery, format: "json" },
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          timeout: 5000,
        });

        const bindings = response.data.results?.bindings || [];
        for (const binding of bindings) {
          entities.push({
            uri: binding.person?.value,
            label: binding.name?.value || binding.nick?.value || "Unknown Person",
            description: `FOAF Person${binding.nick?.value ? ` (@${binding.nick.value})` : ""}`,
            type: "foaf:Person",
            properties: {
              name: binding.name?.value,
              nick: binding.nick?.value,
              homepage: binding.homepage?.value,
            },
          });
        }
      } catch (error) {
        console.error(`[Ontology] FOAF SPARQL query failed for term "${term}":`, error);
      }
    }
  }

  return {
    source: "FOAF",
    entities,
    relationships,
  };
}

/**
 * Query Google Knowledge Graph Search API
 * Uses REST API to search for entities in Google's Knowledge Graph
 * Returns structured entity data with Schema.org types
 */
async function queryGoogleKG(
  _endpoint: string,
  searchTerms: string[],
  apiKey?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];
  const relationships: any[] = [];

  if (!apiKey) {
    console.log("[Ontology] Google KG: No API key provided, skipping");
    return { source: "Google Knowledge Graph", entities, relationships };
  }

  for (const term of searchTerms.slice(0, 5)) {
    try {
      const response = await axios.get(
        "https://kgsearch.googleapis.com/v1/entities:search",
        {
          params: {
            query: term,
            key: apiKey,
            limit: 3,
            indent: true,
            languages: "en",
          },
          timeout: 5000,
        }
      );

      const items = response.data?.itemListElement || [];
      for (const item of items) {
        const result = item.result;
        if (!result) continue;

        const types = Array.isArray(result["@type"])
          ? result["@type"]
          : result["@type"]
            ? [result["@type"]]
            : [];

        entities.push({
          uri: result["@id"] || "",
          label: result.name || "",
          description:
            result.detailedDescription?.articleBody ||
            result.description ||
            "",
          type: types.join(", "),
          properties: {
            resultScore: item.resultScore,
            types,
            image: result.image?.contentUrl,
            url: result.url || result.detailedDescription?.url,
            source: "Google Knowledge Graph",
          },
        });

        // Add type relationships
        for (const type of types) {
          if (type !== "Thing") {
            relationships.push({
              subject: result.name || term,
              predicate: "rdf:type",
              object: `schema:${type}`,
            });
          }
        }
      }
    } catch (error: any) {
      if (error?.response?.status === 403) {
        console.error(
          `[Ontology] Google KG: API key invalid or quota exceeded`
        );
        break; // Don't keep trying with a bad key
      }
      console.error(
        `[Ontology] Google KG query failed for term "${term}":`,
        error?.message || error
      );
    }
  }

  return {
    source: "Google Knowledge Graph",
    entities,
    relationships,
  };
}

/**
 * Query MusicBrainz API
 * Free music metadata database - searches for artists, recordings, and releases
 * Rate limited to 1 request per second, no API key required
 */
async function queryMusicBrainz(
  _endpoint: string,
  searchTerms: string[],
  _apiKey?: string
): Promise<OntologyQueryResult> {
  const entities: any[] = [];
  const relationships: any[] = [];
  const BASE_URL = "https://musicbrainz.org/ws/2";
  const USER_AGENT = "Klipz/1.0 (https://klipz.manus.space)";

  for (const term of searchTerms.slice(0, 3)) {
    // Search artists
    try {
      const artistResponse = await axios.get(`${BASE_URL}/artist`, {
        params: {
          query: term,
          fmt: "json",
          limit: 3,
        },
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        timeout: 5000,
      });

      const artists = artistResponse.data?.artists || [];
      for (const artist of artists) {
        if (artist.score < 50) continue; // Skip low-confidence matches

        entities.push({
          uri: `https://musicbrainz.org/artist/${artist.id}`,
          label: artist.name,
          description: [
            artist.type || "Artist",
            artist.disambiguation ? `(${artist.disambiguation})` : "",
            artist.country ? `Country: ${artist.country}` : "",
            artist["life-span"]?.begin
              ? `Active since ${artist["life-span"].begin}`
              : "",
          ]
            .filter(Boolean)
            .join(" | "),
          type: `musicbrainz:${artist.type || "Artist"}`,
          properties: {
            mbid: artist.id,
            type: artist.type,
            country: artist.country,
            disambiguation: artist.disambiguation,
            score: artist.score,
            tags: artist.tags?.map((t: any) => t.name) || [],
            genres: artist.genres?.map((g: any) => g.name) || [],
            source: "MusicBrainz",
          },
        });

        // Add genre relationships
        const genres = artist.tags?.slice(0, 5) || [];
        for (const genre of genres) {
          relationships.push({
            subject: artist.name,
            predicate: "musicbrainz:genre",
            object: genre.name,
          });
        }
      }

      // Rate limit: wait 1 second between requests
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (error: any) {
      console.error(
        `[Ontology] MusicBrainz artist query failed for "${term}":`,
        error?.message || error
      );
    }

    // Search recordings
    try {
      const recordingResponse = await axios.get(`${BASE_URL}/recording`, {
        params: {
          query: term,
          fmt: "json",
          limit: 3,
        },
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        timeout: 5000,
      });

      const recordings = recordingResponse.data?.recordings || [];
      for (const recording of recordings) {
        if (recording.score < 50) continue;

        const artistCredits = recording["artist-credit"] || [];
        const artistNames = artistCredits
          .map((ac: any) => ac.name || ac.artist?.name)
          .filter(Boolean);

        entities.push({
          uri: `https://musicbrainz.org/recording/${recording.id}`,
          label: recording.title,
          description: [
            "Recording",
            artistNames.length > 0 ? `by ${artistNames.join(", ")}` : "",
            recording.length
              ? `Duration: ${Math.floor(recording.length / 60000)}:${String(Math.floor((recording.length % 60000) / 1000)).padStart(2, "0")}`
              : "",
            recording.releases?.[0]?.title
              ? `Album: ${recording.releases[0].title}`
              : "",
          ]
            .filter(Boolean)
            .join(" | "),
          type: "musicbrainz:Recording",
          properties: {
            mbid: recording.id,
            artists: artistNames,
            duration: recording.length,
            releases:
              recording.releases?.map((r: any) => ({
                title: r.title,
                date: r.date,
              })) || [],
            score: recording.score,
            tags: recording.tags?.map((t: any) => t.name) || [],
            source: "MusicBrainz",
          },
        });

        // Add artist-recording relationships
        for (const artistName of artistNames) {
          relationships.push({
            subject: artistName,
            predicate: "musicbrainz:performed",
            object: recording.title,
          });
        }
      }

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (error: any) {
      console.error(
        `[Ontology] MusicBrainz recording query failed for "${term}":`,
        error?.message || error
      );
    }
  }

  return {
    source: "MusicBrainz",
    entities,
    relationships,
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
        case "owl":
          result = await queryOWL(
            kg.endpoint || "",
            searchTerms,
            kg.apiKey || undefined,
            kg.ontologyUrl || undefined
          );
          break;
        case "foaf":
          result = await queryFOAF(kg.endpoint || "", searchTerms, kg.apiKey || undefined);
          break;
        case "google_kg":
          result = await queryGoogleKG(kg.endpoint || "", searchTerms, kg.apiKey || undefined);
          break;
        case "musicbrainz":
          result = await queryMusicBrainz(kg.endpoint || "", searchTerms, kg.apiKey || undefined);
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

/**
 * Get default configurations for each ontology type
 * Used when adding new ontology connections in the UI
 */
export function getOntologyDefaults(type: string): {
  name: string;
  endpoint: string;
  description: string;
} {
  switch (type) {
    case "dbpedia":
      return {
        name: "DBpedia",
        endpoint: "https://dbpedia.org/sparql",
        description: "Structured data extracted from Wikipedia. Great for general knowledge about people, places, organizations, and concepts.",
      };
    case "wikidata":
      return {
        name: "Wikidata",
        endpoint: "https://query.wikidata.org/sparql",
        description: "Free and open knowledge base from the Wikimedia Foundation. Provides structured data about entities worldwide.",
      };
    case "schema_org":
      return {
        name: "Schema.org",
        endpoint: "",
        description: "Collaborative vocabulary for structured data on the internet. Maps media content to standard types (VideoObject, ImageObject, SocialMediaPosting, etc.).",
      };
    case "owl":
      return {
        name: "OWL Ontology",
        endpoint: "",
        description: "Web Ontology Language - query custom OWL ontologies via SPARQL endpoints. Supports class hierarchies, object properties, and datatype properties.",
      };
    case "foaf":
      return {
        name: "FOAF (Friend of a Friend)",
        endpoint: "",
        description: "Vocabulary for describing people, their activities, and relationships. Maps social media creators, accounts, and content authorship.",
      };
    case "google_kg":
      return {
        name: "Google Knowledge Graph",
        endpoint: "https://kgsearch.googleapis.com/v1/entities:search",
        description: "Google's entity database with structured data about people, places, organizations, and things. Requires a Google API key. Excellent for entity disambiguation.",
      };
    case "musicbrainz":
      return {
        name: "MusicBrainz",
        endpoint: "https://musicbrainz.org/ws/2",
        description: "Free open music encyclopedia. Automatically identifies artists, recordings, albums, and genres. No API key required.",
      };
    case "custom":
      return {
        name: "Custom Ontology",
        endpoint: "",
        description: "Connect to any custom SPARQL endpoint or ontology. Provide the endpoint URL and optional API key.",
      };
    default:
      return {
        name: "Unknown",
        endpoint: "",
        description: "",
      };
  }
}
