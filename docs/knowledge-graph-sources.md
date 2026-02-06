# Knowledge Graph Sources for Klipz

## Reference Document — Additional Data Sources for the Knowledge Graph

This document catalogs all current and potential external data sources that can be connected to the Klipz knowledge graph to enrich media file metadata with semantic information.

---

## Currently Implemented Sources

| Source | Type | Endpoint | Status | Notes |
|--------|------|----------|--------|-------|
| **DBpedia** | SPARQL | `https://dbpedia.org/sparql` | Enabled | Queries linked data extracted from Wikipedia infoboxes. Returns entity URIs, labels, abstracts, and types. |
| **Wikidata** | SPARQL | `https://query.wikidata.org/sparql` | Enabled | Queries the Wikidata knowledge base for entity labels and descriptions. Free, no API key required. |
| **Schema.org** | Local Vocabulary | N/A (local matching) | Enabled | Enhanced mapping with 15+ media types: VideoObject, ImageObject, AudioObject, SocialMediaPosting, Person, Organization, MusicRecording, InteractionCounter, Collection, and more. Includes type hierarchy relationships. |
| **OWL (Web Ontology Language)** | SPARQL | User-configured | Disabled by default | Queries custom OWL ontologies via SPARQL for class hierarchies, object/datatype properties, and domain/range constraints. Requires user to provide SPARQL endpoint URL. |
| **FOAF (Friend of a Friend)** | Local + SPARQL | Optional endpoint | Enabled | Maps creator identities across social platforms (YouTube, Instagram, TikTok, Twitter, LinkedIn, Facebook, Vimeo). Provides person/agent identity, social accounts, and creator-content relationships. |
| **Custom Ontology** | SPARQL/REST | User-configured | Available | Users can configure custom OWL/RDF ontology endpoints for domain-specific vocabularies. |

---

## Recommended New Sources — High Priority

### 1. Google Knowledge Graph Search API
- **URL**: `https://developers.google.com/knowledge-graph`
- **Type**: REST API (JSON-LD)
- **Auth**: API key (free tier: 100,000 calls/day)
- **What it provides**: Entity search across Google's knowledge graph — returns structured data about people, places, organizations, events, and creative works using Schema.org types.
- **Why it matters for Klipz**: When a user uploads a video mentioning "Dijon" (the artist), Google KG can disambiguate and return structured info about the musician vs. the city. Excellent for entity linking from captions and descriptions.
- **Integration effort**: Low — simple REST API, JSON response, no SPARQL needed.

### 2. MusicBrainz
- **URL**: `https://musicbrainz.org/doc/MusicBrainz_API`
- **Type**: REST API (JSON/XML)
- **Auth**: Free, no key required (rate limit: 1 req/sec with User-Agent header)
- **What it provides**: Comprehensive music metadata — artists, albums, tracks, release dates, labels, genres, relationships between artists, ISRCs, and MBIDs (persistent identifiers).
- **Why it matters for Klipz**: Directly relevant for music video content. When a user uploads a music video or audio clip, MusicBrainz can identify the artist, album, genre, and related artists. Enables automatic music tagging.
- **Integration effort**: Low — well-documented REST API with Python/JS clients available.

### 3. The Movie Database (TMDB)
- **URL**: `https://developer.themoviedb.org/docs/getting-started`
- **Type**: REST API (JSON)
- **Auth**: Free API key (requires account registration)
- **What it provides**: Movie and TV show metadata — titles, synopses, cast, crew, genres, release dates, ratings, production companies, keywords, and poster/backdrop images.
- **Why it matters for Klipz**: When users upload clips from movies or TV shows, TMDB can identify the source content and enrich with cast, genre, and production metadata. Also useful for thumbnail matching.
- **Integration effort**: Low — straightforward REST API with excellent documentation.

### 4. ConceptNet
- **URL**: `https://conceptnet.io/` / `https://api.conceptnet.io/`
- **Type**: REST API (JSON-LD)
- **Auth**: Free, no key required
- **What it provides**: A commonsense knowledge graph with 21 relationship types (IsA, UsedFor, CapableOf, HasProperty, etc.) across 300+ languages. Contains ~34 million assertions about everyday concepts.
- **Why it matters for Klipz**: Enables semantic understanding of content beyond named entities. If a video caption mentions "cooking," ConceptNet can infer related concepts like "kitchen," "recipe," "food," "chef." Excellent for expanding tag suggestions.
- **Integration effort**: Low — simple REST API, well-documented.

### 5. GeoNames
- **URL**: `https://www.geonames.org/export/web-services.html`
- **Type**: REST API (JSON/XML)
- **Auth**: Free (requires username registration)
- **What it provides**: 11+ million geographical names — countries, cities, landmarks, postal codes, coordinates, timezone, population, elevation, and administrative divisions.
- **Why it matters for Klipz**: Location enrichment for geotagged media. When EXIF data or captions contain location references, GeoNames can resolve them to structured geographic entities with coordinates, country, and administrative hierarchy.
- **Integration effort**: Low — simple REST API.

---

## Recommended New Sources — Medium Priority

### 6. Open Movie Database (OMDb)
- **URL**: `http://www.omdbapi.com/`
- **Type**: REST API (JSON)
- **Auth**: Free tier (1,000 daily limit) or paid ($1/month for 100,000)
- **What it provides**: Movie/TV metadata sourced from IMDb — title, year, rated, runtime, genre, director, actors, plot, language, country, awards, ratings (IMDb, Rotten Tomatoes, Metacritic), box office.
- **Why it matters for Klipz**: Complements TMDB with IMDb ratings and Rotten Tomatoes scores. Useful for enriching video clips from known movies/shows.
- **Integration effort**: Very low — single endpoint, query by title or IMDb ID.

### 7. Getty Vocabularies (AAT, TGN, ULAN)
- **URL**: `https://www.getty.edu/research/tools/vocabularies/lod/`
- **Type**: SPARQL / REST API (JSON-LD, RDF)
- **Auth**: Free, open access
- **What it provides**:
  - **AAT (Art & Architecture Thesaurus)**: 400,000+ terms for visual arts, architecture, decorative arts, material culture
  - **TGN (Thesaurus of Geographic Names)**: 2.2M+ names and places
  - **ULAN (Union List of Artist Names)**: 300,000+ artists and corporate bodies
- **Why it matters for Klipz**: Professional-grade vocabulary for categorizing visual content. When AI analysis identifies "oil painting" or "Gothic architecture" in an image, AAT provides the authoritative taxonomy. ULAN identifies artists.
- **Integration effort**: Medium — SPARQL endpoint, requires understanding of Getty's data model.

### 8. IPTC Media Topics / NewsCodes
- **URL**: `https://iptc.org/standards/media-topics/`
- **Type**: Taxonomy (SKOS/RDF download, or REST)
- **Auth**: Free, open standard
- **What it provides**: 1,200+ standardized terms for categorizing news and media content — organized hierarchically across topics like politics, economy, sports, entertainment, science, health, etc.
- **Why it matters for Klipz**: Industry-standard media classification. When enriching news clips or journalistic content, IPTC provides the canonical taxonomy used by Reuters, AP, and major news organizations.
- **Integration effort**: Medium — download taxonomy and implement local matching, or use SPARQL endpoint.

### 9. YAGO Knowledge Base
- **URL**: `https://yago-knowledge.org/`
- **Type**: SPARQL / Data dump (RDF)
- **Auth**: Free, open access
- **What it provides**: 50+ million entities and 2+ billion facts derived from Wikipedia, Wikidata, and WordNet. Combines factual knowledge with taxonomic classification. Strong temporal and spatial information.
- **Why it matters for Klipz**: More structured than raw Wikidata with better type hierarchy. Excellent for entity disambiguation — distinguishing "Dijon" the artist from "Dijon" the city with high confidence.
- **Integration effort**: Medium — SPARQL endpoint available, large dataset.

### 10. WordNet
- **URL**: `https://wordnet.princeton.edu/`
- **Type**: Local database / API wrappers
- **Auth**: Free, open source (Princeton license)
- **What it provides**: Lexical database of English — 155,000+ words organized into synsets (synonym sets) linked by semantic relations: synonymy, antonymy, hypernymy (is-a), meronymy (part-of), and more.
- **Why it matters for Klipz**: Enables semantic expansion of tags and search terms. If a file is tagged "automobile," WordNet can suggest related terms like "car," "vehicle," "sedan." Improves search recall.
- **Integration effort**: Low — available as npm package (`natural` or `wordnet-db`), no API calls needed.

---

## Recommended New Sources — Lower Priority / Specialized

### 11. Spotify Web API
- **URL**: `https://developer.spotify.com/documentation/web-api`
- **Type**: REST API (JSON)
- **Auth**: OAuth 2.0 (free developer account)
- **What it provides**: Music metadata — tracks, albums, artists, genres, audio features (danceability, energy, tempo, valence), related artists, and popularity scores.
- **Why it matters for Klipz**: Audio feature analysis for music content. Can identify genre, mood, and tempo of music in uploaded videos. Complements MusicBrainz with popularity and audio analysis data.
- **Integration effort**: Medium — requires OAuth flow.

### 12. Discogs API
- **URL**: `https://www.discogs.com/developers`
- **Type**: REST API (JSON)
- **Auth**: Free (OAuth or token, rate limited)
- **What it provides**: Music release database — artists, labels, releases, master releases, genres, styles, tracklists, credits, and marketplace data.
- **Why it matters for Klipz**: Deep music catalog data including vinyl/CD releases, rare editions, and label information. Useful for music collectors and DJs managing media libraries.
- **Integration effort**: Low-Medium.

### 13. OpenStreetMap / Nominatim
- **URL**: `https://nominatim.openstreetmap.org/`
- **Type**: REST API (JSON)
- **Auth**: Free (usage policy applies)
- **What it provides**: Geocoding and reverse geocoding — converts addresses to coordinates and vice versa. POI data, building outlines, road networks.
- **Why it matters for Klipz**: Alternative to GeoNames for location enrichment. Better for street-level location data and POI identification in geotagged media.
- **Integration effort**: Low.

### 14. Internet Archive / Open Library
- **URL**: `https://openlibrary.org/developers/api`
- **Type**: REST API (JSON)
- **Auth**: Free, no key required
- **What it provides**: Book metadata — titles, authors, subjects, publishers, ISBNs, cover images. Also access to archived web pages and media.
- **Why it matters for Klipz**: Enrichment for book-related content, educational videos, or literary references found in captions.
- **Integration effort**: Low.

### 15. Clarifai Visual Recognition
- **URL**: `https://www.clarifai.com/`
- **Type**: REST API (JSON)
- **Auth**: Free tier (1,000 operations/month), paid plans available
- **What it provides**: AI-powered visual recognition — object detection, scene classification, face detection, celebrity recognition, NSFW detection, color analysis, and custom model training.
- **Why it matters for Klipz**: Supplements the existing AI visual analysis with specialized models. Celebrity recognition is particularly valuable for entertainment content.
- **Integration effort**: Medium — requires API key and credit management.

---

## Implementation Recommendations

### Phase 1 — Quick Wins (1-2 days each)
1. **Google Knowledge Graph API** — Best general-purpose entity enrichment
2. **MusicBrainz** — Essential for music content (no API key needed)
3. **ConceptNet** — Semantic expansion of tags (no API key needed)
4. **WordNet** — Local semantic relationships (npm package, no network calls)

### Phase 2 — Media-Specific (2-3 days each)
5. **TMDB** — Movie/TV identification
6. **GeoNames** — Location enrichment
7. **OMDb** — IMDb ratings and metadata

### Phase 3 — Professional/Specialized (3-5 days each)
8. **Getty Vocabularies** — Professional art/architecture taxonomy
9. **IPTC Media Topics** — News/media classification standard
10. **YAGO** — Advanced entity disambiguation

---

## Architecture Notes

### How Ontology Sources Are Used
1. User uploads a file (image, video, social media URL)
2. AI enrichment extracts keywords and entities from the content
3. Keywords are sent to all enabled ontology sources in priority order
4. Each source returns matching entities and relationships
5. Results are merged and used to:
   - Suggest additional tags
   - Build knowledge graph edges between files
   - Enrich file descriptions with related information
   - Map content to standard vocabularies (Schema.org, FOAF, OWL)

### Adding a New Source
1. Add the type to the `externalKnowledgeGraphs` table enum in `drizzle/schema.ts`
2. Run SQL to alter the enum: `ALTER TABLE external_knowledge_graphs MODIFY COLUMN type ENUM(...)`
3. Implement the query function in `server/ontologyService.ts`
4. Add the case to the `enrichWithExternalKnowledgeGraphs` switch statement
5. Add defaults in `getOntologyDefaults()`
6. Add the source to `KnowledgeGraphSettings.tsx` UI
7. Add the source to `initializeDefaults` mutation in `server/routers.ts`

### Configuration
All ontology sources are managed per-user via the Settings > Knowledge Graph page.
Each source can be:
- Enabled/disabled independently
- Assigned a priority (higher = consulted first)
- Configured with a custom endpoint URL (for OWL, FOAF, custom)
- Tested for connectivity

### Database Schema

The `externalKnowledgeGraphs.type` enum currently supports:
```
["dbpedia", "wikidata", "schema_org", "owl", "foaf", "custom"]
```

Future expansion candidates:
```
["google_kg", "musicbrainz", "tmdb", "conceptnet", "geonames", "omdb", "getty", "iptc", "yago", "wordnet", "spotify", "discogs", "osm", "openlibrary", "clarifai"]
```

---

*Last updated: February 6, 2026*
