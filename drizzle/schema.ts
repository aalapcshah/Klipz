import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, boolean, json, uniqueIndex, index } from "drizzle-orm/mysql-core";
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
  
  // Access tracking for cleanup
  lastAccessedAt: timestamp("lastAccessedAt").defaultNow().notNull(),
  qualityScore: int("qualityScore").default(0), // 0-100 quality score
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * Voice annotations table - timestamped voice notes for videos
 */
export const voiceAnnotations = mysqlTable("voice_annotations", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(), // Foreign key to files table
  userId: int("userId").notNull(),
  
  // Voice recording info
  audioUrl: text("audioUrl").notNull(), // S3 URL for voice annotation
  audioKey: varchar("audioKey", { length: 512 }).notNull(), // S3 key
  duration: int("duration").notNull(), // Duration in seconds
  
  // Timestamp in video
  videoTimestamp: int("videoTimestamp").notNull(), // Timestamp in video (seconds)
  
  // Transcription (optional)
  transcript: text("transcript"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VoiceAnnotation = typeof voiceAnnotations.$inferSelect;
export type InsertVoiceAnnotation = typeof voiceAnnotations.$inferInsert;

/**
 * Visual annotations table - drawings and overlays on videos
 */
export const visualAnnotations = mysqlTable("visual_annotations", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(), // Foreign key to files table
  userId: int("userId").notNull(),
  
  // Drawing image info
  imageUrl: text("imageUrl").notNull(), // S3 URL for drawing overlay image
  imageKey: varchar("imageKey", { length: 512 }).notNull(), // S3 key
  
  // Timestamp in video
  videoTimestamp: int("videoTimestamp").notNull(), // Timestamp in video (seconds)
  
  // Duration the annotation should appear (seconds)
  duration: int("duration").default(5).notNull(), // How long annotation is visible
  
  // Optional description
  description: text("description"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VisualAnnotation = typeof visualAnnotations.$inferSelect;
export type InsertVisualAnnotation = typeof visualAnnotations.$inferInsert;

/**
 * Annotation history table - tracks all changes to annotations
 */
export const annotationHistory = mysqlTable("annotation_history", {
  id: int("id").autoincrement().primaryKey(),
  annotationId: int("annotationId").notNull(), // ID of the annotation that was changed
  annotationType: mysqlEnum("annotationType", ["voice", "visual"]).notNull(),
  userId: int("userId").notNull(),
  
  // Change tracking
  changeType: mysqlEnum("changeType", ["created", "edited", "deleted"]).notNull(),
  
  // Previous state (JSON snapshot before change)
  previousState: json("previousState"), // Stores the full annotation object before change
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Annotation Templates - User-saved annotation styles for reuse
 */
export const annotationTemplates = mysqlTable("annotation_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Template info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Template style (JSON with color, strokeWidth, shapes, etc.)
  style: json("style").notNull(), // { color, strokeWidth, shapes: [{type, ...}] }
  
  // Preview thumbnail
  thumbnailUrl: text("thumbnailUrl"),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  
  // Usage tracking
  usageCount: int("usageCount").default(0).notNull(),
  
  // Sharing settings
  visibility: mysqlEnum("visibility", ["private", "team", "public"]).default("private").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Annotation Comments - Comment threads on annotations for collaboration
 */
export const annotationComments = mysqlTable("annotation_comments", {
  id: int("id").autoincrement().primaryKey(),
  annotationId: int("annotationId").notNull(),
  annotationType: mysqlEnum("annotationType", ["voice", "visual"]).notNull(),
  userId: int("userId").notNull(),
  
  // Comment content
  content: text("content").notNull(),
  
  // Threading
  parentCommentId: int("parentCommentId"), // For nested replies
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Annotation Approvals - Approval workflow for team reviews
 */
export const annotationApprovals = mysqlTable("annotation_approvals", {
  id: int("id").autoincrement().primaryKey(),
  annotationId: int("annotationId").notNull(),
  annotationType: mysqlEnum("annotationType", ["voice", "visual"]).notNull(),
  userId: int("userId").notNull(),
  
  // Approval status
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  comment: text("comment"), // Optional comment with approval/rejection
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnnotationTemplate = typeof annotationTemplates.$inferSelect;
export type InsertAnnotationTemplate = typeof annotationTemplates.$inferInsert;

export type AnnotationComment = typeof annotationComments.$inferSelect;
export type InsertAnnotationComment = typeof annotationComments.$inferInsert;

export type AnnotationApproval = typeof annotationApprovals.$inferSelect;
export type InsertAnnotationApproval = typeof annotationApprovals.$inferInsert;

export type AnnotationHistory = typeof annotationHistory.$inferSelect;
export type InsertAnnotationHistory = typeof annotationHistory.$inferInsert;

/**
 * Notifications - In-app and email notifications for user actions
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Recipient
  
  // Notification content
  type: mysqlEnum("type", ["approval_approved", "approval_rejected", "comment_reply", "approval_requested"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  
  // Related entities
  annotationId: int("annotationId"),
  annotationType: mysqlEnum("annotationType", ["voice", "visual"]),
  relatedUserId: int("relatedUserId"), // User who triggered the notification
  relatedUserName: varchar("relatedUserName", { length: 255 }),
  
  // Status
  read: boolean("read").default(false).notNull(),
  readAt: timestamp("readAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Notification Preferences - User settings for notification delivery
 */
export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Email notifications
  emailOnApproval: boolean("emailOnApproval").default(true).notNull(),
  emailOnComment: boolean("emailOnComment").default(true).notNull(),
  emailOnApprovalRequest: boolean("emailOnApprovalRequest").default(true).notNull(),
  
  // In-app notifications
  inAppOnApproval: boolean("inAppOnApproval").default(true).notNull(),
  inAppOnComment: boolean("inAppOnComment").default(true).notNull(),
  inAppOnApprovalRequest: boolean("inAppOnApprovalRequest").default(true).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

/**
 * Keyboard Shortcuts - User-customized keyboard shortcuts
 */
export const keyboardShortcuts = mysqlTable("keyboard_shortcuts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Shortcut definition
  action: varchar("action", { length: 100 }).notNull(), // e.g., "playPause", "addComment", "approve"
  key: varchar("key", { length: 50 }).notNull(), // e.g., "Space", "c", "a"
  modifiers: json("modifiers").$type<string[]>(), // e.g., ["ctrl", "shift"]
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KeyboardShortcut = typeof keyboardShortcuts.$inferSelect;
export type InsertKeyboardShortcut = typeof keyboardShortcuts.$inferInsert;

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
  
  // Link to files table for unified annotation support
  fileId: int("fileId"), // Optional: links to files table for annotations
  
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


/**
 * User onboarding progress table - tracks tutorial completion
 */
export const userOnboarding = mysqlTable("user_onboarding", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Tutorial completion tracking
  tutorialCompleted: boolean("tutorialCompleted").default(false).notNull(),
  tutorialSkipped: boolean("tutorialSkipped").default(false).notNull(),
  
  // Individual step completion
  uploadFileCompleted: boolean("uploadFileCompleted").default(false).notNull(),
  createAnnotationCompleted: boolean("createAnnotationCompleted").default(false).notNull(),
  useTemplateCompleted: boolean("useTemplateCompleted").default(false).notNull(),
  addCommentCompleted: boolean("addCommentCompleted").default(false).notNull(),
  approveAnnotationCompleted: boolean("approveAnnotationCompleted").default(false).notNull(),
  useKeyboardShortcutCompleted: boolean("useKeyboardShortcutCompleted").default(false).notNull(),
  
  // Timestamps
  tutorialStartedAt: timestamp("tutorialStartedAt"),
  tutorialCompletedAt: timestamp("tutorialCompletedAt"),
  lastStepCompletedAt: timestamp("lastStepCompletedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserOnboarding = typeof userOnboarding.$inferSelect;
export type InsertUserOnboarding = typeof userOnboarding.$inferInsert;

export const userOnboardingRelations = relations(userOnboarding, ({ one }) => ({
  user: one(users, {
    fields: [userOnboarding.userId],
    references: [users.id],
  }),
}));

// ============= RECENTLY VIEWED FILES TABLE =============
export const recentlyViewedFiles = mysqlTable("recently_viewed_files", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  fileId: int("fileId").notNull(),
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
}, (table) => ({
  userFileIndex: uniqueIndex("user_file_idx").on(table.userId, table.fileId),
}));

export type RecentlyViewedFile = typeof recentlyViewedFiles.$inferSelect;
export type InsertRecentlyViewedFile = typeof recentlyViewedFiles.$inferInsert;

export const recentlyViewedFilesRelations = relations(recentlyViewedFiles, ({ one }) => ({
  user: one(users, {
    fields: [recentlyViewedFiles.userId],
    references: [users.id],
  }),
  file: one(files, {
    fields: [recentlyViewedFiles.fileId],
    references: [files.id],
  }),
}));


// ============= FILE ACTIVITY LOGS TABLE =============
export const fileActivityLogs = mysqlTable("file_activity_logs", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  fileId: int("fileId"),
  activityType: mysqlEnum("activityType", ["upload", "view", "edit", "tag", "share", "delete", "enrich", "export"]).notNull(),
  details: text("details"), // JSON string with additional details
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIndex: index("user_idx").on(table.userId),
  fileIndex: index("file_idx").on(table.fileId),
  activityTypeIndex: index("activity_type_idx").on(table.activityType),
  createdAtIndex: index("created_at_idx").on(table.createdAt),
}));

export type FileActivityLog = typeof fileActivityLogs.$inferSelect;
export type InsertFileActivityLog = typeof fileActivityLogs.$inferInsert;

export const fileActivityLogsRelations = relations(fileActivityLogs, ({ one }) => ({
  user: one(users, {
    fields: [fileActivityLogs.userId],
    references: [users.id],
  }),
  file: one(files, {
    fields: [fileActivityLogs.fileId],
    references: [files.id],
  }),
}));

// ============= ACTIVITY NOTIFICATION PREFERENCES TABLE =============
export const activityNotificationPreferences = mysqlTable("activity_notification_preferences", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().unique(),
  
  // Notification toggles for each activity type
  enableUploadNotifications: boolean("enableUploadNotifications").default(true).notNull(),
  enableViewNotifications: boolean("enableViewNotifications").default(false).notNull(),
  enableEditNotifications: boolean("enableEditNotifications").default(true).notNull(),
  enableTagNotifications: boolean("enableTagNotifications").default(true).notNull(),
  enableShareNotifications: boolean("enableShareNotifications").default(true).notNull(),
  enableDeleteNotifications: boolean("enableDeleteNotifications").default(true).notNull(),
  enableEnrichNotifications: boolean("enableEnrichNotifications").default(true).notNull(),
  enableExportNotifications: boolean("enableExportNotifications").default(true).notNull(),
  
  // Quiet hours (24-hour format HH:MM)
  quietHoursStart: varchar("quietHoursStart", { length: 5 }), // e.g., "22:00"
  quietHoursEnd: varchar("quietHoursEnd", { length: 5 }), // e.g., "08:00"
  
  // Email digest frequency
  emailDigestFrequency: mysqlEnum("emailDigestFrequency", ["immediate", "daily", "weekly", "disabled"]).default("immediate").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIndex: uniqueIndex("activity_notif_user_idx").on(table.userId),
}));

export type ActivityNotificationPreference = typeof activityNotificationPreferences.$inferSelect;
export type InsertActivityNotificationPreference = typeof activityNotificationPreferences.$inferInsert;

export const activityNotificationPreferencesRelations = relations(activityNotificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [activityNotificationPreferences.userId],
    references: [users.id],
  }),
}));


// ============= SCHEDULED REPORTS TABLE =============
export const scheduledReports = mysqlTable("scheduled_reports", {
  id: int("id").primaryKey().autoincrement(),
  
  // Report configuration
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Schedule
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly"]).notNull(),
  dayOfWeek: int("dayOfWeek"), // 0-6 for weekly reports (0 = Sunday)
  dayOfMonth: int("dayOfMonth"), // 1-31 for monthly reports
  timeOfDay: varchar("timeOfDay", { length: 5 }).notNull(), // HH:MM format
  
  // Filters
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  userId: int("userId"), // Filter by specific user, null = all users
  activityType: varchar("activityType", { length: 50 }), // Filter by activity type
  
  // Delivery
  recipients: text("recipients").notNull(), // Comma-separated email addresses
  format: mysqlEnum("format", ["csv", "excel"]).default("excel").notNull(),
  
  // Status
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  
  createdBy: int("createdBy").notNull(), // Admin who created it
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  createdByIndex: index("scheduled_reports_created_by_idx").on(table.createdBy),
  nextRunIndex: index("scheduled_reports_next_run_idx").on(table.nextRunAt),
}));

export type ScheduledReport = typeof scheduledReports.$inferSelect;
export type InsertScheduledReport = typeof scheduledReports.$inferInsert;

export const scheduledReportsRelations = relations(scheduledReports, ({ one }) => ({
  creator: one(users, {
    fields: [scheduledReports.createdBy],
    references: [users.id],
  }),
}));


// ============= ENGAGEMENT ALERTS TABLE =============
export const engagementAlerts = mysqlTable("engagement_alerts", {
  id: int("id").primaryKey().autoincrement(),
  
  // Alert configuration
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Metric to monitor
  metricType: mysqlEnum("metricType", ["dau", "wau", "mau", "retention_day1", "retention_day7", "retention_day30"]).notNull(),
  
  // Threshold
  thresholdType: mysqlEnum("thresholdType", ["below", "above"]).notNull(),
  thresholdValue: int("thresholdValue").notNull(),
  
  // Notification settings
  notifyEmails: text("notifyEmails").notNull(), // Comma-separated email addresses
  checkFrequency: mysqlEnum("checkFrequency", ["hourly", "daily", "weekly"]).default("daily").notNull(),
  
  // Status
  enabled: boolean("enabled").default(true).notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  lastValue: int("lastValue"),
  
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  createdByIndex: index("engagement_alerts_created_by_idx").on(table.createdBy),
  enabledIndex: index("engagement_alerts_enabled_idx").on(table.enabled),
}));

export type EngagementAlert = typeof engagementAlerts.$inferSelect;
export type InsertEngagementAlert = typeof engagementAlerts.$inferInsert;

export const engagementAlertsRelations = relations(engagementAlerts, ({ one }) => ({
  creator: one(users, {
    fields: [engagementAlerts.createdBy],
    references: [users.id],
  }),
}));


export const alertNotificationLog = mysqlTable("alert_notification_log", {
  id: int("id").autoincrement().primaryKey(),
  alertId: int("alertId").notNull(),
  triggeredAt: timestamp("triggeredAt").notNull(),
  metricValue: float("metricValue").notNull(),
  thresholdValue: float("thresholdValue").notNull(),
  status: mysqlEnum("status", ["triggered", "resolved", "acknowledged"]).notNull().default("triggered"),
  resolvedAt: timestamp("resolvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlertNotificationLog = typeof alertNotificationLog.$inferSelect;
export type InsertAlertNotificationLog = typeof alertNotificationLog.$inferInsert;


export const savedCohortComparisons = mysqlTable("saved_cohort_comparisons", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cohort1Name: varchar("cohort1Name", { length: 255 }).notNull(),
  cohort1StartDate: timestamp("cohort1StartDate").notNull(),
  cohort1EndDate: timestamp("cohort1EndDate").notNull(),
  cohort2Name: varchar("cohort2Name", { length: 255 }).notNull(),
  cohort2StartDate: timestamp("cohort2StartDate").notNull(),
  cohort2EndDate: timestamp("cohort2EndDate").notNull(),
  results: json("results").notNull(), // Store the comparison results
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SavedCohortComparison = typeof savedCohortComparisons.$inferSelect;
export type InsertSavedCohortComparison = typeof savedCohortComparisons.$inferInsert;


export const generatedReports = mysqlTable("generated_reports", {
  id: int("id").primaryKey().autoincrement(),
  scheduledReportId: int("scheduledReportId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  format: mysqlEnum("format", ["csv", "excel"]).notNull(),
  fileKey: text("fileKey").notNull(), // S3 file key
  fileUrl: text("fileUrl").notNull(), // S3 file URL
  fileSize: int("fileSize"), // File size in bytes
  recordCount: int("recordCount"), // Number of records in report
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  userId: int("userId"), // Filter: specific user or null for all users
  activityType: varchar("activityType", { length: 100 }), // Filter: activity type
  generatedBy: int("generatedBy").notNull(), // Admin who generated/scheduled the report
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
}, (table) => ({
  scheduledReportIdIndex: index("generated_reports_scheduled_report_id_idx").on(table.scheduledReportId),
  generatedByIndex: index("generated_reports_generated_by_idx").on(table.generatedBy),
  generatedAtIndex: index("generated_reports_generated_at_idx").on(table.generatedAt),
}));

export type GeneratedReport = typeof generatedReports.$inferSelect;


export const dashboardLayoutPreferences = mysqlTable("dashboard_layout_preferences", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  layout: mysqlEnum("layout", ["monitoring", "analytics", "balanced"]).notNull().default("balanced"),
  widgetVisibility: json("widgetVisibility").$type<Record<string, boolean>>(), // Which widgets are visible
  updatedAt: timestamp("updatedAt").defaultNow().notNull().onUpdateNow(),
}, (table) => ({
  userIdIndex: index("dashboard_layout_preferences_user_id_idx").on(table.userId),
}));

export type DashboardLayoutPreference = typeof dashboardLayoutPreferences.$inferSelect;


/**
 * Video tags table - stores unique tags for organizing videos
 */
export const videoTags = mysqlTable("video_tags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Tags are user-specific
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).default("#3b82f6"), // Hex color code
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIndex: index("video_tags_user_id_idx").on(table.userId),
  userNameIndex: index("video_tags_user_name_idx").on(table.userId, table.name),
}));

export type VideoTag = typeof videoTags.$inferSelect;
export type InsertVideoTag = typeof videoTags.$inferInsert;

/**
 * Video tag assignments - junction table linking videos to tags
 */
export const videoTagAssignments = mysqlTable("video_tag_assignments", {
  id: int("id").autoincrement().primaryKey(),
  videoId: int("videoId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  videoIdIndex: index("video_tag_assignments_video_id_idx").on(table.videoId),
  tagIdIndex: index("video_tag_assignments_tag_id_idx").on(table.tagId),
  uniqueAssignment: index("video_tag_assignments_unique_idx").on(table.videoId, table.tagId),
}));

export type VideoTagAssignment = typeof videoTagAssignments.$inferSelect;
export type InsertVideoTagAssignment = typeof videoTagAssignments.$inferInsert;
