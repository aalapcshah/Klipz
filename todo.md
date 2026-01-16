# MetaClips MVP - Development TODO

## Phase 1: Database Schema & Core Models
- [x] Design files table with metadata fields
- [x] Design tags table with relationships
- [x] Design videos table for recordings
- [x] Design annotations table for video timestamps
- [x] Design knowledge_graph_edges table for relationships
- [x] Design voice_recordings table for audio metadata
- [x] Push database schema with `pnpm db:push`

## Phase 2: Authentication & Storage Setup
- [x] Configure S3 storage helpers for file uploads
- [x] Set up OpenAI API integration for AI enrichment
- [x] Configure voice transcription service
- [x] Test authentication flow with user roles

## Phase 3: File Upload & Management
- [x] Create file upload UI with drag-and-drop
- [x] Implement voice recording component for tagging
- [x] Build file grid/list view with filters
- [x] Create file detail view with metadata editor
- [x] Implement file deletion and updates
- [x] Add file type icons and thumbnails

## Phase 4: AI Enrichment Pipeline
- [x] Create AI analysis procedure for images
- [x] Implement OCR text extraction
- [x] Build object detection integration
- [x] Create auto-tagging from AI analysis
- [x] Add manual tag management
- [x] Show enrichment status and progress

## Phase 5: Semantic Search
- [x] Build search UI with filters
- [x] Implement full-text search across metadata
- [ ] Add tag-based filtering
- [ ] Create search results view
- [ ] Add search suggestions

## Phase 6: Knowledge Graph
- [x] Calculate semantic similarity between files
- [x] Build graph data structure
- [x] Create interactive graph visualization
- [x] Add node filtering and exploration
- [x] Show relationship strength indicators

## Phase 7: Video Recording & Annotation
- [x] Build webcam recording interface
- [ ] Implement live speech-to-text transcription
- [ ] Create keyword detection from transcript
- [ ] Build auto-matching algorithm for files
- [ ] Show suggested annotations in real-time
- [ ] Create timeline visualization

## Phase 8: Video Export
- [ ] Build annotation editor UI
- [ ] Implement video player with overlay preview
- [ ] Create export configuration options
- [ ] Generate video with picture-in-picture overlays
- [ ] Add export progress tracking
- [ ] Support multiple export formats

## Phase 9: Polish & Testing
- [ ] Add loading states and error handling
- [ ] Implement responsive design for mobile
- [ ] Add user onboarding/tutorial
- [ ] Test all workflows end-to-end
- [ ] Fix bugs and edge cases
- [ ] Optimize performance

## Phase 10: Deployment
- [ ] Write comprehensive tests
- [ ] Create project checkpoint
- [ ] Document API and features
- [ ] Prepare user documentation
