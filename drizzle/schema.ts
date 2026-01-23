import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, boolean, json } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  
  // Extended profile fields
  location: varchar("location", { length: 255 }),
  age: int("age"),
  bio: text("bio"),
  reasonForUse: text("reasonForUse"),
  company: varchar("company", { length: 255 }),
  jobTitle: varchar("jobTitle", { length: 255 }),
  profileCompleted: boolean("profileCompleted").default(false).notNull(),
  
  // Account status
  accountStatus: mysqlEnum("accountStatus", ["active", "deactivated", "suspended"]).default("active").notNull(),
  deactivatedAt: timestamp("deactivatedAt"),
  
  // Subscription and premium features
  subscriptionTier: mysqlEnum("subscriptionTier", ["free", "premium", "enterprise"]).default("free").notNull(),
  knowledgeGraphUsageCount: int("knowledgeGraphUsageCount").default(0).notNull(),
  knowledgeGraphUsageLimit: int("knowledgeGraphUsageLimit").default(10).notNull(), // Free tier: 10 queries/month
  subscriptionExpiresAt: timestamp("subscriptionExpiresAt"),
  
  // Stripe integration
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Files table - stores all uploaded media and documents
 */
export const files = mysqlTable("files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // File storage info
  fileKey: varchar("fileKey", { length: 512 }).notNull(), // S3 key
  url: text("url").notNull(), // S3 public URL
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  fileSize: int("fileSize").notNull(), // bytes
  
  // User-provided metadata
  title: varchar("title", { length: 255 }),
  description: text("description"),
  
  // Voice recording metadata
  voiceRecordingUrl: text("voiceRecordingUrl"), // S3 URL for voice tag
  voiceTranscript: text("voiceTranscript"), // Transcribed text
  
  // AI enrichment data
  aiAnalysis: text("aiAnalysis"), // AI-generated description
  ocrText: text("ocrText"), // Extracted text from image/PDF
  detectedObjects: json("detectedObjects").$type<string[]>(), // Detected objects/elements
  
  // Extracted file metadata (EXIF, IPTC, XMP)
  extractedMetadata: text("extractedMetadata"), // Raw metadata from file (JSON string)
  extractedKeywords: json("extractedKeywords").$type<string[]>(), // Keywords from metadata
  
  // Enrichment status
  enrichmentStatus: mysqlEnum("enrichmentStatus", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  enrichedAt: timestamp("enrichedAt"),
  
  // Duplicate detection
  perceptualHash: varchar("perceptualHash", { length: 64 }), // Image hash for duplicate detection
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * Tags table - hierarchical tagging system
 */
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  userId: int("userId").notNull(),
  source: mysqlEnum("source", ["manual", "ai", "voice", "metadata"]).notNull(), // How tag was created
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

/**
 * File-Tag relationships (many-to-many)
 */
export const fileTags = mysqlTable("fileTags", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileTag = typeof fileTags.$inferSelect;
export type InsertFileTag = typeof fileTags.$inferInsert;

/**
 * Videos table - recorded videos with annotations
 */
export const videos = mysqlTable("videos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Video file info
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: text("url").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  duration: int("duration").notNull(), // seconds
  
  // Metadata
  title: varchar("title", { length: 255 }),
  description: text("description"),
  
  // Transcription
  transcript: text("transcript"), // Full video transcript
  
  // Export status
  exportStatus: mysqlEnum("exportStatus", ["draft", "processing", "completed", "failed"]).default("draft").notNull(),
  exportedUrl: text("exportedUrl"), // URL of exported video with overlays
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;

/**
 * Annotations table - links files to video timestamps
 */
export const annotations = mysqlTable("annotations", {
  id: int("id").autoincrement().primaryKey(),
  videoId: int("videoId").notNull(),
  fileId: int("fileId").notNull(),
  
  // Timing
  startTime: float("startTime").notNull(), // seconds
  endTime: float("endTime").notNull(), // seconds
  
  // Display properties
  position: mysqlEnum("position", ["left", "right", "center"]).default("right").notNull(),
  keyword: varchar("keyword", { length: 255 }), // Keyword that triggered this annotation
  
  // Confidence and source
  confidence: float("confidence"), // 0-100, how confident the auto-match was
  source: mysqlEnum("source", ["auto", "manual"]).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = typeof annotations.$inferInsert;

/**
 * Knowledge graph edges - semantic relationships between files
 */
export const knowledgeGraphEdges = mysqlTable("knowledgeGraphEdges", {
  id: int("id").autoincrement().primaryKey(),
  sourceFileId: int("sourceFileId").notNull(),
  targetFileId: int("targetFileId").notNull(),
  
  // Relationship metadata
  relationshipType: mysqlEnum("relationshipType", ["semantic", "temporal", "hierarchical"]).notNull(),
  strength: float("strength").notNull(), // 0-100, similarity score
  
  // Computed metadata
  sharedTags: json("sharedTags").$type<string[]>(), // Tags both files share
  sharedKeywords: json("sharedKeywords").$type<string[]>(), // Keywords both files share
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeGraphEdge = typeof knowledgeGraphEdges.$inferSelect;
export type InsertKnowledgeGraphEdge = typeof knowledgeGraphEdges.$inferInsert;

/**
 * Saved Searches - Store frequently-used search filter combinations
 */
export const savedSearches = mysqlTable("saved_searches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  
  // Search parameters stored as JSON
  query: text("query"),
  fileType: varchar("fileType", { length: 100 }),
  tagIds: json("tagIds").$type<number[]>(),
  enrichmentStatus: mysqlEnum("enrichmentStatus", ["pending", "processing", "completed", "failed"]),
  dateFrom: timestamp("dateFrom"),
  dateTo: timestamp("dateTo"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedSearch = typeof savedSearches.$inferSelect;
export type InsertSavedSearch = typeof savedSearches.$inferInsert;

/**
 * Collections - Group files into named collections/projects
 */
export const collections = mysqlTable("collections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }), // Hex color code
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Collection = typeof collections.$inferSelect;
export type InsertCollection = typeof collections.$inferInsert;

/**
 * Collection Files - Junction table for many-to-many relationship
 */
export const collectionFiles = mysqlTable("collection_files", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  fileId: int("fileId").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});

export type CollectionFile = typeof collectionFiles.$inferSelect;
export type InsertCollectionFile = typeof collectionFiles.$inferInsert;

/**
 * Smart Collections - Dynamic collections based on rules
 */
export const smartCollections = mysqlTable("smart_collections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }), // Hex color code
  icon: varchar("icon", { length: 50 }), // Icon name
  
  // Rule configuration stored as JSON
  rules: json("rules").$type<{
    field: string; // e.g., "fileSize", "enrichmentStatus", "mimeType", "createdAt"
    operator: string; // e.g., ">", "<", "=", "contains", "startsWith"
    value: any; // The value to compare against
    logic?: "AND" | "OR"; // How to combine with next rule
  }[]>().notNull(),
  
  // Cache the count for performance
  cachedFileCount: int("cachedFileCount").default(0).notNull(),
  lastEvaluatedAt: timestamp("lastEvaluatedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SmartCollection = typeof smartCollections.$inferSelect;
export type InsertSmartCollection = typeof smartCollections.$inferInsert;

/**
 * File Versions - Track file history and enable version restoration
 */
export const fileVersions = mysqlTable("file_versions", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(), // Reference to parent file
  userId: int("userId").notNull(), // User who created this version
  
  // Version metadata
  versionNumber: int("versionNumber").notNull(), // Sequential version number
  changeDescription: text("changeDescription"), // What changed in this version
  
  // Snapshot of file state at this version
  fileKey: varchar("fileKey", { length: 512 }).notNull(), // S3 key for this version
  url: text("url").notNull(), // S3 URL for this version
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  fileSize: int("fileSize").notNull(),
  
  // Metadata snapshot
  title: varchar("title", { length: 255 }),
  description: text("description"),
  
  // AI enrichment snapshot
  aiAnalysis: text("aiAnalysis"),
  ocrText: text("ocrText"),
  detectedObjects: json("detectedObjects").$type<string[]>(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileVersion = typeof fileVersions.$inferSelect;
export type InsertFileVersion = typeof fileVersions.$inferInsert;

/**
 * Metadata templates table - stores user-created reusable metadata templates
 */
export const metadataTemplates = mysqlTable("metadata_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  name: varchar("name", { length: 100 }).notNull(), // Template name (e.g., "Legal Document")
  category: varchar("category", { length: 50 }).default("General"), // Template category (e.g., "Work", "Personal", "Legal")
  titlePattern: varchar("titlePattern", { length: 255 }), // Title pattern with placeholders
  descriptionPattern: text("descriptionPattern"), // Description pattern with placeholders
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MetadataTemplate = typeof metadataTemplates.$inferSelect;
export type InsertMetadataTemplate = typeof metadataTemplates.$inferInsert;

/**
 * Metadata history table - tracks previously used metadata for suggestions
 */
export const metadataHistory = mysqlTable("metadata_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Track what metadata was used
  title: varchar("title", { length: 255 }),
  description: text("description"),
  
  // Context for suggestions
  fileType: varchar("fileType", { length: 100 }), // MIME type category (image, video, pdf, etc.)
  usageCount: int("usageCount").default(1).notNull(), // How many times this metadata was used
  
  lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MetadataHistory = typeof metadataHistory.$inferSelect;
export type InsertMetadataHistory = typeof metadataHistory.$inferInsert;

/**
 * Relations for Drizzle ORM
 */
export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
  videos: many(videos),
  tags: many(tags),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  fileTags: many(fileTags),
  annotations: many(annotations),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  fileTags: many(fileTags),
}));

export const fileTagsRelations = relations(fileTags, ({ one }) => ({
  file: one(files, {
    fields: [fileTags.fileId],
    references: [files.id],
  }),
  tag: one(tags, {
    fields: [fileTags.tagId],
    references: [tags.id],
  }),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  user: one(users, {
    fields: [videos.userId],
    references: [users.id],
  }),
  annotations: many(annotations),
}));

export const annotationsRelations = relations(annotations, ({ one }) => ({
  video: one(videos, {
    fields: [annotations.videoId],
    references: [videos.id],
  }),
  file: one(files, {
    fields: [annotations.fileId],
    references: [files.id],
  }),
}));


/**
 * External Knowledge Graph Configurations (Premium Feature)
 * Stores connections to external ontologies and knowledge bases
 */
export const externalKnowledgeGraphs = mysqlTable("external_knowledge_graphs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Configuration
  name: varchar("name", { length: 255 }).notNull(), // User-friendly name
  type: mysqlEnum("type", ["dbpedia", "wikidata", "schema_org", "custom"]).notNull(),
  endpoint: text("endpoint"), // SPARQL endpoint or API URL
  apiKey: text("apiKey"), // Encrypted API key if needed
  
  // Settings
  enabled: boolean("enabled").default(true).notNull(),
  priority: int("priority").default(0).notNull(), // Higher priority = consulted first
  
  // Custom ontology configuration (for type="custom")
  ontologyUrl: text("ontologyUrl"), // URL to OWL/RDF file
  namespacePrefix: varchar("namespacePrefix", { length: 100 }), // e.g., "ex:"
  
  // Usage tracking
  lastUsedAt: timestamp("lastUsedAt"),
  usageCount: int("usageCount").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExternalKnowledgeGraph = typeof externalKnowledgeGraphs.$inferSelect;
export type InsertExternalKnowledgeGraph = typeof externalKnowledgeGraphs.$inferInsert;

export const externalKnowledgeGraphsRelations = relations(externalKnowledgeGraphs, ({ one }) => ({
  user: one(users, {
    fields: [externalKnowledgeGraphs.userId],
    references: [users.id],
  }),
}));

/**
 * Scheduled Exports table - stores recurring export jobs
 */
export const scheduledExports = mysqlTable("scheduled_exports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Export configuration
  name: varchar("name", { length: 255 }).notNull(),
  exportType: mysqlEnum("exportType", ["video", "files", "metadata"]).notNull(),
  format: mysqlEnum("format", ["mp4", "csv", "json", "zip"]).notNull(),
  
  // Scheduling
  schedule: mysqlEnum("schedule", ["daily", "weekly", "monthly"]).notNull(),
  scheduleTime: varchar("scheduleTime", { length: 10 }).notNull(), // HH:MM format
  dayOfWeek: int("dayOfWeek"), // 0-6 for weekly, null for others
  dayOfMonth: int("dayOfMonth"), // 1-31 for monthly, null for others
  timezone: varchar("timezone", { length: 50 }).default("UTC").notNull(),
  
  // Filters and options
  collectionId: int("collectionId"), // Optional: export specific collection
  filters: text("filters"), // JSON string of filter criteria
  includeMetadata: boolean("includeMetadata").default(true).notNull(),
  
  // Notification settings
  emailNotification: boolean("emailNotification").default(true).notNull(),
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  
  // Status tracking
  isActive: boolean("isActive").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "failed", "pending"]),
  nextRunAt: timestamp("nextRunAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledExport = typeof scheduledExports.$inferSelect;
export type InsertScheduledExport = typeof scheduledExports.$inferInsert;

/**
 * Export History table - tracks all export executions
 */
export const exportHistory = mysqlTable("export_history", {
  id: int("id").autoincrement().primaryKey(),
  scheduledExportId: int("scheduledExportId"),
  userId: int("userId").notNull(),
  
  // Export details
  exportType: mysqlEnum("exportType", ["video", "files", "metadata"]).notNull(),
  format: mysqlEnum("format", ["mp4", "csv", "json", "zip"]).notNull(),
  
  // Results
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  fileUrl: text("fileUrl"), // S3 URL of exported file
  fileSize: int("fileSize"), // bytes
  itemCount: int("itemCount"), // number of files/videos exported
  
  // Error tracking
  errorMessage: text("errorMessage"),
  
  // Timing
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExportHistory = typeof exportHistory.$inferSelect;
export type InsertExportHistory = typeof exportHistory.$inferInsert;


/**
 * Image Annotations table - stores drawing annotations on images (lightbox drawings)
 */
export const imageAnnotations = mysqlTable("image_annotations", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  userId: int("userId").notNull(),
  
  // Annotation data stored as JSON
  annotationData: json("annotationData").notNull(), // Array of strokes, shapes, text objects
  
  // Metadata
  version: int("version").default(1).notNull(), // For versioning annotations
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImageAnnotation = typeof imageAnnotations.$inferSelect;
export type InsertImageAnnotation = typeof imageAnnotations.$inferInsert;


/**
 * Enrichment Queue table - manages background AI enrichment jobs
 */
export const enrichmentQueue = mysqlTable("enrichment_queue", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  userId: int("userId").notNull(),
  
  // Job status
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  priority: int("priority").default(0).notNull(), // Higher number = higher priority
  
  // Retry logic
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(3).notNull(),
  
  // Error tracking
  errorMessage: text("errorMessage"),
  
  // Timing
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
});

export type EnrichmentQueue = typeof enrichmentQueue.$inferSelect;
export type InsertEnrichmentQueue = typeof enrichmentQueue.$inferInsert;

/**
 * User consents table - GDPR compliance
 */
export const userConsents = mysqlTable("userConsents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  consentType: mysqlEnum("consentType", ["terms_of_service", "privacy_policy", "marketing_emails", "data_processing"]).notNull(),
  consented: boolean("consented").notNull(),
  consentedAt: timestamp("consentedAt").defaultNow().notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }), // IPv6 support
  userAgent: text("userAgent"),
});

export type UserConsent = typeof userConsents.$inferSelect;
export type InsertUserConsent = typeof userConsents.$inferInsert;

/**
 * Email preferences table - subscription management
 */
export const emailPreferences = mysqlTable("emailPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  marketingEmails: boolean("marketingEmails").default(false).notNull(),
  productUpdates: boolean("productUpdates").default(true).notNull(),
  securityAlerts: boolean("securityAlerts").default(true).notNull(),
  unsubscribeToken: varchar("unsubscribeToken", { length: 64 }).unique(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailPreference = typeof emailPreferences.$inferSelect;
export type InsertEmailPreference = typeof emailPreferences.$inferInsert;
