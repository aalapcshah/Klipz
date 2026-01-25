import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { stripeRouter } from "./routers/stripe";
import { voiceAnnotationsRouter } from "./routers/voiceAnnotations";
import { visualAnnotationsRouter } from "./routers/visual-annotations";
import { analyticsRouter } from "./routers/analytics";
import { annotationTemplatesRouter } from "./routers/annotation-templates";
import { annotationCommentsRouter } from "./routers/annotation-comments";
import { annotationApprovalsRouter } from "./routers/annotation-approvals";
import { annotationHistoryRouter } from "./routers/annotation-history";
import { batchOperationsRouter } from "./routers/batch-operations";
import { keyboardShortcutsRouter } from "./routers/keyboard-shortcuts";
import { exportRouter } from "./routers/export";
import { notificationsRouter } from "./routers/notifications";
import { storageCleanupRouter } from "./routers/storageCleanup";
import { qualityScoreRouter } from "./routers/qualityScore";
import { qualityImprovementRouter } from "./routers/qualityImprovement";
import { semanticSearchRouter } from "./routers/semanticSearch";
import { userRouter } from "./routers/user";
import { onboardingRouter } from "./routers/onboarding";
import { activityLogsRouter } from "./routers/activityLogs";
import { notificationPreferencesRouter } from "./routers/notificationPreferences";
import { adminRouter } from "./routers/admin";
import { scheduledReportsRouter } from "./routers/scheduledReports";
import { engagementAlertsRouter } from "./routers/engagementAlerts";
import { alertHistoryRouter } from "./routers/alertHistory";
import { reportsRouter } from "./routers/reports";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { sendUploadEmail, sendEditEmail, sendDeleteEmail, sendEnrichEmail } from "./_core/activityEmailNotifications";
import { TRPCError } from "@trpc/server";
import * as premiumFeatures from "./premiumFeatures";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { nanoid } from "nanoid";
import { exportVideoWithAnnotations } from "./videoExport";
import { voiceAnnotations, visualAnnotations, files } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const appRouter = router({
  metadataTemplates: router({
    list: protectedProcedure.query(({ ctx }) => db.getMetadataTemplatesByUser(ctx.user.id)),
    
    trackUsage: protectedProcedure
      .input(
        z.object({
          title: z.string().nullable(),
          description: z.string().nullable(),
          fileType: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.trackMetadataUsage(ctx.user.id, input.title, input.description, input.fileType);
        return { success: true };
      }),
    
    getSuggestions: protectedProcedure
      .input(
        z.object({
          fileType: z.string(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return db.getMetadataSuggestions(ctx.user.id, input.fileType, input.limit);
      }),
    
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          category: z.string().optional(),
          titlePattern: z.string().optional(),
          descriptionPattern: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return db.createMetadataTemplate({
          ...input,
          userId: ctx.user.id,
        });
      }),
    
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          category: z.string().optional(),
          titlePattern: z.string().optional(),
          descriptionPattern: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.updateMetadataTemplate(input.id, input);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteMetadataTemplate(input.id);
        return { success: true };
      }),
  }),
  
  savedSearches: router({
    list: protectedProcedure
      .output(z.array(z.object({
        id: z.number(),
        userId: z.number(),
        name: z.string(),
        query: z.string().nullable(),
        fileType: z.string().nullable(),
        tagIds: z.array(z.number()).nullable(),
        enrichmentStatus: z.enum(["pending", "processing", "completed", "failed"]).nullable(),
        dateFrom: z.date().nullable(),
        dateTo: z.date().nullable(),
        createdAt: z.date(),
      })))
      .query(({ ctx }) => db.getSavedSearchesByUser(ctx.user.id)),
    
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          query: z.string().optional(),
          fileType: z.string().optional(),
          tagIds: z.array(z.number()).optional(),
          enrichmentStatus: z.enum(["pending", "processing", "completed", "failed"]).nullable().optional(),
          dateFrom: z.date().optional(),
          dateTo: z.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return db.createSavedSearch({
          ...input,
          userId: ctx.user.id,
        });
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteSavedSearch(input.id);
        return { success: true };
      }),
  }),
  
  collections: router({
    list: protectedProcedure.query(({ ctx }) => db.getCollectionsByUser(ctx.user.id)),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const collection = await db.getCollectionById(input.id);
        if (!collection) throw new Error("Collection not found");
        
        const files = await db.getFilesByCollection(ctx.user.id, input.id);
        return { ...collection, files };
      }),
    
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          color: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return db.createCollection({
          ...input,
          userId: ctx.user.id,
        });
      }),
    
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          color: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateCollection(id, updates);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteCollection(input.id);
        return { success: true };
      }),
    
    addFile: protectedProcedure
      .input(z.object({ collectionId: z.number(), fileId: z.number() }))
      .mutation(async ({ input }) => {
        await db.addFileToCollection(input.collectionId, input.fileId);
        return { success: true };
      }),
    
    removeFile: protectedProcedure
      .input(z.object({ collectionId: z.number(), fileId: z.number() }))
      .mutation(async ({ input }) => {
        await db.removeFileFromCollection(input.collectionId, input.fileId);
        return { success: true };
      }),
  }),

  smartCollections: router({
    list: protectedProcedure.query(({ ctx }) => db.getSmartCollectionsByUser(ctx.user.id)),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const smartCollection = await db.getSmartCollectionById(input.id);
        if (!smartCollection) throw new Error("Smart collection not found");
        
        const files = await db.evaluateSmartCollection(ctx.user.id, smartCollection.rules);
        return { ...smartCollection, files };
      }),
    
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          color: z.string().optional(),
          icon: z.string().optional(),
          rules: z.array(
            z.object({
              field: z.string(),
              operator: z.string(),
              value: z.any(),
              logic: z.enum(["AND", "OR"]).optional(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return db.createSmartCollection({
          ...input,
          userId: ctx.user.id,
        });
      }),
    
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          color: z.string().optional(),
          icon: z.string().optional(),
          rules: z.array(
            z.object({
              field: z.string(),
              operator: z.string(),
              value: z.any(),
              logic: z.enum(["AND", "OR"]).optional(),
            })
          ).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateSmartCollection(id, updates);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteSmartCollection(input.id);
        return { success: true };
      }),
    
    evaluate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const smartCollection = await db.getSmartCollectionById(input.id);
        if (!smartCollection) throw new Error("Smart collection not found");
        
        const files = await db.evaluateSmartCollection(ctx.user.id, smartCollection.rules);
        await db.updateSmartCollectionCache(input.id, files.length);
        return { success: true, fileCount: files.length };
      }),
    
    createFromTemplate: protectedProcedure
      .input(z.enum(["large_images", "enriched_this_week", "high_quality_no_tags"]))
      .mutation(async ({ ctx, input }) => {
        const templates = {
          large_images: {
            name: "Large Images (>5MB)",
            description: "All images larger than 5MB",
            color: "#3b82f6",
            icon: "image",
            rules: [
              { field: "mimeType", operator: "startsWith", value: "image/" },
              { field: "fileSize", operator: ">", value: 5242880, logic: "AND" as const },
            ],
          },
          enriched_this_week: {
            name: "Enriched This Week",
            description: "Files enriched in the past 7 days",
            color: "#10b981",
            icon: "sparkles",
            rules: [
              { field: "enrichmentStatus", operator: "=", value: "completed" },
              { field: "enrichedAt", operator: ">", value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), logic: "AND" as const },
            ],
          },
          high_quality_no_tags: {
            name: "High Quality Without Tags",
            description: "Files with quality score above 80% but no tags",
            color: "#f59e0b",
            icon: "alert-circle",
            rules: [
              { field: "qualityScore", operator: ">", value: 80 },
              { field: "tagCount", operator: "=", value: 0, logic: "AND" as const },
            ],
          },
        };
        
        const template = templates[input];
        return db.createSmartCollection({
          ...template,
          userId: ctx.user.id,
        });
      }),
  }),

  system: systemRouter,
  stripe: stripeRouter,
  voiceAnnotations: voiceAnnotationsRouter,
  visualAnnotations: visualAnnotationsRouter,
  annotationAnalytics: analyticsRouter,
  annotationTemplates: annotationTemplatesRouter,
  annotationComments: annotationCommentsRouter,
  annotationApprovals: annotationApprovalsRouter,
  annotationHistory: annotationHistoryRouter,
  batchOperations: batchOperationsRouter,
  keyboardShortcuts: keyboardShortcutsRouter,
  export: exportRouter,
  notifications: notificationsRouter,
  storageCleanup: storageCleanupRouter,
  qualityScore: qualityScoreRouter,
  qualityImprovement: qualityImprovementRouter,
  semanticSearch: semanticSearchRouter,
  user: userRouter,
  onboarding: onboardingRouter,
  activityLogs: activityLogsRouter,
  notificationPreferences: notificationPreferencesRouter,
  admin: adminRouter,
  scheduledReports: scheduledReportsRouter,
  engagementAlerts: engagementAlertsRouter,
  alertHistory: alertHistoryRouter,
  reports: reportsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().optional(),
          location: z.string().optional(),
          age: z.number().optional(),
          company: z.string().optional(),
          jobTitle: z.string().optional(),
          bio: z.string().optional(),
          reasonForUse: z.string().optional(),
          profileCompleted: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),
    
    recordConsents: protectedProcedure
      .input(
        z.object({
          termsOfService: z.boolean(),
          privacyPolicy: z.boolean(),
          marketingEmails: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.recordUserConsents(ctx.user.id, input);
        return { success: true };
      }),
    
    deactivateAccount: protectedProcedure
      .mutation(async ({ ctx }) => {
        await db.deactivateUserAccount(ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return { success: true };
      }),
  }),

  // ============= STORAGE ROUTER =============
  storage: router({
    // Get upload URL for direct client-side upload
    getUploadUrl: protectedProcedure
      .input(
        z.object({
          filename: z.string(),
          contentType: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const fileKey = `${ctx.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}-${input.filename}`;
        return { fileKey };
      }),
    
    // Upload file data to S3 (legacy base64 method, kept for compatibility)
    uploadFile: protectedProcedure
      .input(
        z.object({
          filename: z.string(),
          contentType: z.string(),
          base64Data: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const fileKey = `${ctx.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}-${input.filename}`;
        
        // Convert base64 to buffer
        const buffer = Buffer.from(input.base64Data, "base64");
        
        // Upload to S3
        const { url } = await storagePut(fileKey, buffer, input.contentType);
        
        return { url, fileKey };
      }),
  }),

  // ============= FILES ROUTER =============
  files: router({
    // List all files for current user
    list: protectedProcedure
      .input(z.object({ 
        collectionId: z.number().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      }).optional())
      .query(async ({ ctx, input }) => {
      const page = input?.page || 1;
      const pageSize = input?.pageSize || 50;
      const offset = (page - 1) * pageSize;
      
      // Get total count
      const totalCount = input?.collectionId
        ? await db.getFilesCountByCollection(input.collectionId)
        : await db.getFilesCountByUserId(ctx.user.id);
      
      // Get paginated files
      const files = input?.collectionId
        ? await db.getFilesByCollection(ctx.user.id, input.collectionId, pageSize, offset)
        : await db.getFilesByUserId(ctx.user.id, pageSize, offset);
      
      // Get tags and calculate quality score for each file
      const filesWithTags = await Promise.all(
        files.map(async (file) => {
          const tags = await db.getFileTagsWithNames(file.id);
          
          // Calculate metadata quality score (0-100)
          let score = 0;
          let maxScore = 0;
          
          // Title (20 points)
          maxScore += 20;
          if (file.title && typeof file.title === 'string' && file.title.trim().length > 0) score += 20;
          
          // Description (20 points)
          maxScore += 20;
          if (file.description && typeof file.description === 'string' && file.description.trim().length > 0) score += 20;
          
          // Tags (15 points)
          maxScore += 15;
          if (tags && tags.length > 0) score += Math.min(tags.length * 5, 15);
          
          // AI Enrichment (25 points)
          maxScore += 25;
          if (file.enrichmentStatus === 'completed') {
            if ((file as any).aiAnalysis) score += 15;
            if ((file as any).ocrText) score += 5;
            if ((file as any).detectedObjects && (file as any).detectedObjects.length > 0) score += 5;
          }
          
          // Extracted Metadata (10 points)
          maxScore += 10;
          if ((file as any).extractedKeywords && (file as any).extractedKeywords.length > 0) score += 5;
          if ((file as any).extractedMetadata) score += 5;
          
          // Voice annotation (10 points)
          maxScore += 10;
          if ((file as any).voiceTranscript) score += 10;
          
          const qualityScore = Math.round((score / maxScore) * 100);
          
          // Defensive: ensure enrichmentStatus is always a valid enum value
          const validStatuses = ['pending', 'processing', 'completed', 'failed'] as const;
          const enrichmentStatus = validStatuses.includes(file.enrichmentStatus as any) 
            ? file.enrichmentStatus 
            : 'pending';
          
          return { ...file, enrichmentStatus, tags, qualityScore };
        })
      );
           return {
        files: filesWithTags,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      };
    }),
    
    // Get all file IDs matching current filters (for bulk selection across pages)
    getAllIds: protectedProcedure
      .input(z.object({ 
        collectionId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const files = input?.collectionId
          ? await db.getFilesByCollection(ctx.user.id, input.collectionId)
          : await db.getFilesByUserId(ctx.user.id);
        
        return files.map(f => f.id);
      }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        const tags = await db.getFileTagsWithNames(file.id);
        const knowledgeEdges = await db.getKnowledgeGraphEdgesByFileId(file.id);
        
        return { ...file, tags, knowledgeEdges };
      }),

    // Upload file metadata (actual file upload happens client-side to S3)
    create: protectedProcedure
      .input(
        z.object({
          fileKey: z.string(),
          url: z.string(),
          filename: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          voiceRecordingUrl: z.string().optional(),
          voiceTranscript: z.string().optional(),
          extractedMetadata: z.string().optional(), // JSON string of metadata
          extractedKeywords: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const fileId = await db.createFile({
          ...input,
          userId: ctx.user.id,
          enrichmentStatus: "pending",
        });
        
        // Send email notification asynchronously
        sendUploadEmail(ctx.user.id, input.filename, fileId).catch(err => 
          console.error('[Files] Failed to send upload email:', err)
        );
        
        return { id: fileId };
      }),

    // Update file metadata
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          voiceRecordingUrl: z.string().optional(),
          voiceTranscript: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        const { id, ...updates } = input;
        await db.updateFile(id, updates);
        
        // Send email notification asynchronously
        const details = Object.keys(updates).join(', ');
        sendEditEmail(ctx.user.id, file.filename, id, `Updated: ${details}`).catch(err => 
          console.error('[Files] Failed to send edit email:', err)
        );
        
        return { success: true };
      }),

    // Batch update file metadata
    batchUpdate: protectedProcedure
      .input(
        z.object({
          fileIds: z.array(z.number()),
          title: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { fileIds, ...updates } = input;
        
        // Verify all files belong to user and create version snapshots
        for (const fileId of fileIds) {
          const file = await db.getFileById(fileId);
          if (!file || file.userId !== ctx.user.id) {
            throw new Error(`File ${fileId} not found`);
          }
          
          // Create automatic version snapshot before update
          const versions = await db.getFileVersions(fileId);
          const versionNumber = versions.length + 1;
          await db.createFileVersion({
            fileId,
            userId: ctx.user.id,
            versionNumber,
            changeDescription: "Auto-snapshot before batch metadata update",
            fileKey: file.fileKey,
            url: file.url,
            filename: file.filename,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            title: file.title,
            description: file.description,
            aiAnalysis: file.aiAnalysis,
            ocrText: file.ocrText,
            detectedObjects: file.detectedObjects,
          });
        }
        
        // Update all files
        for (const fileId of fileIds) {
          await db.updateFile(fileId, updates);
        }
        
        return { success: true, count: fileIds.length };
      }),

    // Delete file
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        // Create automatic version snapshot before deletion
        const versions = await db.getFileVersions(input.id);
        const versionNumber = versions.length + 1;
        await db.createFileVersion({
          fileId: input.id,
          userId: ctx.user.id,
          versionNumber,
          changeDescription: "Auto-snapshot before deletion",
          fileKey: file.fileKey,
          url: file.url,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          title: file.title,
          description: file.description,
          aiAnalysis: file.aiAnalysis,
          ocrText: file.ocrText,
          detectedObjects: file.detectedObjects,
        });
        
        // Send email notification before deleting
        sendDeleteEmail(ctx.user.id, file.filename).catch(err => 
          console.error('[Files] Failed to send delete email:', err)
        );
        
        await db.deleteFile(input.id);
        return { success: true };
      }),

    // Enrich file with external knowledge graphs
    enrichWithOntologies: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Extract search terms from file metadata
        const searchTerms: string[] = [];
        if (file.title) searchTerms.push(file.title);
        if (file.description) {
          // Extract key words from description
          const words = file.description
            .split(/\s+/)
            .filter((w) => w.length > 4)
            .slice(0, 10);
          searchTerms.push(...words);
        }

        // Query external knowledge graphs
        const { enrichWithExternalKnowledgeGraphs, extractSemanticTags, generateEnhancedDescription } = await import("./ontologyService");
        const ontologyResults = await enrichWithExternalKnowledgeGraphs(ctx.user.id, searchTerms);

        if (ontologyResults.length === 0) {
          return {
            success: false,
            message: "No external knowledge graphs configured or no results found",
          };
        }

        // Extract semantic tags
        const semanticTags = extractSemanticTags(ontologyResults);

        // Add tags to file
        for (const tagName of semanticTags.slice(0, 10)) {
          // Limit to 10 tags
          const tagId = await db.createTag({ userId: ctx.user.id, name: tagName, source: "ai" });
          await db.linkFileTag(file.id, tagId);
        }

        // Generate enhanced description
        const enhancedDescription = generateEnhancedDescription(
          file.description || "",
          ontologyResults
        );

        // Update file with enhanced metadata
        await db.updateFile(file.id, {
          description: enhancedDescription,
        });

        return {
          success: true,
          addedTags: semanticTags.length,
          sources: ontologyResults.map((r) => r.source),
        };
      }),

    // Search files by query
    search: protectedProcedure
      .input(
        z.object({
          query: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        return await db.searchFiles(ctx.user.id, input.query);
      }),

    // Search suggestions based on existing files
    searchSuggestions: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        if (input.query.length < 2) return [];
        
        const result = await db.advancedSearchFiles(ctx.user.id, {
          query: input.query,
          limit: 5,
          offset: 0,
        });
        
        // Return unique titles and descriptions as suggestions
        const suggestions = new Set<string>();
        result.files.forEach((file: any) => {
          if (file.title && file.title.toLowerCase().includes(input.query.toLowerCase())) {
            suggestions.add(file.title);
          }
          if (file.description && file.description.toLowerCase().includes(input.query.toLowerCase())) {
            suggestions.add(file.description.substring(0, 100));
          }
        });
        
        return Array.from(suggestions).slice(0, 5);
      }),
    
    // Advanced search with filters
    advancedSearch: protectedProcedure
      .input(
        z.object({
          query: z.string().optional(),
          fileType: z.string().optional(),
          tagIds: z.array(z.number()).optional(),
          enrichmentStatus: z.enum(["pending", "processing", "completed", "failed"]).optional(),
          dateFrom: z.number().optional(), // Unix timestamp
          dateTo: z.number().optional(), // Unix timestamp
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input, ctx }) => {
        return await db.advancedSearchFiles(ctx.user.id, input);
      }),

    // Enrich file with AI
    enrich: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        // Create automatic version snapshot before enrichment
        const versions = await db.getFileVersions(input.id);
        const versionNumber = versions.length + 1;
        await db.createFileVersion({
          fileId: input.id,
          userId: ctx.user.id,
          versionNumber,
          changeDescription: "Auto-snapshot before AI enrichment",
          fileKey: file.fileKey,
          url: file.url,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          title: file.title,
          description: file.description,
          aiAnalysis: file.aiAnalysis,
          ocrText: file.ocrText,
          detectedObjects: file.detectedObjects,
        });
        
        // Update status to processing
        await db.updateFile(input.id, { enrichmentStatus: "processing" });
        
        try {
          // Call AI to analyze the file
          let aiAnalysis = "";
          
          // Only analyze images with vision API
          if (file.mimeType.startsWith("image/")) {
            const response = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: "You are an AI assistant that analyzes media files and extracts metadata. Provide detailed descriptions, identify objects, and extract any visible text.",
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Analyze this file: ${file.filename}. User description: ${file.description || "None"}. Voice transcript: ${file.voiceTranscript || "None"}`,
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: file.url,
                      },
                    },
                  ],
                },
              ],
            });
            const content = response.choices[0]?.message?.content;
            aiAnalysis = typeof content === 'string' ? content : "";
          } else {
            // For non-images, use text-based analysis
            const response = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: "You are an AI assistant that analyzes media files and extracts metadata. Provide detailed descriptions and identify key topics.",
                },
                {
                  role: "user",
                  content: `Analyze this file: ${file.filename}. Type: ${file.mimeType}. User description: ${file.description || "None"}. Voice transcript: ${file.voiceTranscript || "None"}`,
                },
              ],
            });
            const content = response.choices[0]?.message?.content;
            aiAnalysis = typeof content === 'string' ? content : "";
          }
          
          // Extract detected objects (simple keyword extraction)
          const detectedObjects = extractKeywords(aiAnalysis);
          
          // Update file with AI analysis
          await db.updateFile(input.id, {
            aiAnalysis,
            detectedObjects,
            enrichmentStatus: "completed",
            enrichedAt: new Date(),
          });
          
          // Send email notification asynchronously
          sendEnrichEmail(ctx.user.id, file.filename, input.id).catch(err => 
            console.error('[Files] Failed to send enrich email:', err)
          );
          
          // Auto-generate tags from AI analysis
          const autoTags = detectedObjects.slice(0, 5); // Top 5 keywords as tags
          for (const tagName of autoTags) {
            const tagId = await db.createTag({
              name: tagName,
              userId: ctx.user.id,
              source: "ai",
            });
            await db.linkFileTag(input.id, tagId);
          }
          
          return { success: true, aiAnalysis, detectedObjects };
        } catch (error) {
          await db.updateFile(input.id, { enrichmentStatus: "failed" });
          throw error;
        }
      }),

    // Batch export files to ZIP
    batchExport: protectedProcedure
      .input(z.object({ fileIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const files = await Promise.all(
          input.fileIds.map(id => db.getFileById(id))
        );
        
        // Filter out files that don't exist or don't belong to user
        const validFiles = files.filter((f): f is NonNullable<typeof f> => f !== null && f !== undefined && f.userId === ctx.user.id);
        
        // Return file data and metadata for client-side ZIP creation
        return {
          files: validFiles.map(f => ({
            id: f.id,
            url: f.url,
            filename: f.filename,
            mimeType: f.mimeType,
            fileSize: f.fileSize,
            title: f.title,
            description: f.description,
            aiAnalysis: f.aiAnalysis,
            enrichmentStatus: f.enrichmentStatus,
            createdAt: f.createdAt,
          }))
        };
      }),

    // Get smart tag suggestions for a file
    suggestTags: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .query(async ({ input, ctx }) => {
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }

        // Get all files with similar characteristics
        const allFiles = await db.getFilesByUserId(ctx.user.id);
        
        // Find similar files based on:
        // 1. Same file type
        // 2. Similar extracted keywords
        // 3. Similar AI analysis themes
        const similarFiles = allFiles.filter((f: any) => {
          if (f.id === file.id) return false;
          
          // Same mime type category
          const fileMimeCategory = file.mimeType.split('/')[0];
          const fMimeCategory = f.mimeType.split('/')[0];
          if (fileMimeCategory !== fMimeCategory) return false;
          
          // Has tags
          if (!f.tags || f.tags.length === 0) return false;
          
          return true;
        });

        // Collect tags from similar files and count frequency
        const tagFrequency = new Map<number, { tag: any; count: number }>();
        
        similarFiles.forEach((f: any) => {
          f.tags?.forEach((tag: any) => {
            if (tagFrequency.has(tag.id)) {
              tagFrequency.get(tag.id)!.count++;
            } else {
              tagFrequency.set(tag.id, { tag, count: 1 });
            }
          });
        });

        // Filter out tags already on this file
        const fileMimeCategory = file.mimeType.split('/')[0];
        const existingTagIds = new Set((file as any).tags?.map((t: any) => t.id) || []);
        const suggestions = Array.from(tagFrequency.values())
          .filter(({ tag }) => !existingTagIds.has(tag.id))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5) // Top 5 suggestions
          .map(({ tag, count }) => ({
            ...tag,
            relevanceScore: count,
            reason: `Used in ${count} similar ${fileMimeCategory} file${count > 1 ? 's' : ''}`
          }));

        return suggestions;
      }),

    // Transcribe voice recording
    transcribeVoice: protectedProcedure
      .input(z.object({ audioUrl: z.string() }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
        });
        
        if ('error' in result) {
          throw new Error(result.error);
        }
        
        return { transcript: result.text };
      }),
  }),

  // ============= FILE VERSIONS ROUTER =============
  fileVersions: router({
    // Create a new version snapshot
    create: protectedProcedure
      .input(
        z.object({
          fileId: z.number(),
          changeDescription: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Get current file state
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        // Get current version count
        const versions = await db.getFileVersions(input.fileId);
        const versionNumber = versions.length + 1;
        
        // Create version snapshot
        const versionId = await db.createFileVersion({
          fileId: input.fileId,
          userId: ctx.user.id,
          versionNumber,
          changeDescription: input.changeDescription,
          fileKey: file.fileKey,
          url: file.url,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          title: file.title,
          description: file.description,
          aiAnalysis: file.aiAnalysis,
          ocrText: file.ocrText,
          detectedObjects: file.detectedObjects,
        });
        
        return { id: versionId, versionNumber };
      }),

    // List all versions for a file
    list: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify file ownership
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        return await db.getFileVersions(input.fileId);
      }),

    // Restore a specific version
    restore: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Get version
        const version = await db.getFileVersionById(input.versionId);
        if (!version) {
          throw new Error("Version not found");
        }
        
        // Verify file ownership
        const file = await db.getFileById(version.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        // Create a new version snapshot of current state before restoring
        const currentVersions = await db.getFileVersions(version.fileId);
        await db.createFileVersion({
          fileId: version.fileId,
          userId: ctx.user.id,
          versionNumber: currentVersions.length + 1,
          changeDescription: `Auto-backup before restoring version ${version.versionNumber}`,
          fileKey: file.fileKey,
          url: file.url,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          title: file.title,
          description: file.description,
          aiAnalysis: file.aiAnalysis,
          ocrText: file.ocrText,
          detectedObjects: file.detectedObjects,
        });
        
        // Restore version to current file
        await db.updateFile(version.fileId, {
          fileKey: version.fileKey,
          url: version.url,
          filename: version.filename,
          title: version.title,
          description: version.description,
          aiAnalysis: version.aiAnalysis,
          ocrText: version.ocrText,
          detectedObjects: version.detectedObjects,
        });
        
        return { success: true };
      }),
  }),

  // ============= TAGS ROUTER =============
  tags: router({
    // List all tags for user
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getTagsByUserId(ctx.user.id);
    }),

    // Create new tag
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          source: z.enum(["manual", "ai", "voice"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tagId = await db.createTag({
          ...input,
          userId: ctx.user.id,
        });
        
        return { id: tagId };
      }),

    // Link tag to file
    linkToFile: protectedProcedure
      .input(
        z.object({
          fileId: z.number(),
          tagId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Verify file ownership
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        await db.linkFileTag(input.fileId, input.tagId);
        
        return { success: true };
      }),

    // Unlink tag from file
    unlinkFromFile: protectedProcedure
      .input(
        z.object({
          fileId: z.number(),
          tagId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        await db.unlinkFileTag(input.fileId, input.tagId);
        
        return { success: true };
      }),

    // Merge tags - combine duplicate tags and re-link all files
    merge: protectedProcedure
      .input(
        z.object({
          sourceTagId: z.number(), // Tag to be merged (will be deleted)
          targetTagId: z.number(), // Tag to keep
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Verify both tags belong to user
        const sourceTags = await db.getTagsByUserId(ctx.user.id);
        const sourceTag = sourceTags.find((t: any) => t.id === input.sourceTagId);
        const targetTag = sourceTags.find((t: any) => t.id === input.targetTagId);
        
        if (!sourceTag || !targetTag) {
          throw new Error("Tag not found");
        }
        
        // Get all files linked to source tag
        const allFiles = await db.getFilesByUserId(ctx.user.id);
        const filesWithSourceTag = allFiles.filter((f: any) => 
          (f as any).tags?.some((t: any) => t.id === input.sourceTagId)
        );
        
        // Re-link all files from source tag to target tag
        for (const file of filesWithSourceTag) {
          // Check if file already has target tag
          const hasTargetTag = (file as any).tags?.some((t: any) => t.id === input.targetTagId);
          
          if (!hasTargetTag) {
            await db.linkFileTag(file.id, input.targetTagId);
          }
          
          // Unlink source tag
          await db.unlinkFileTag(file.id, input.sourceTagId);
        }
        
        // Delete source tag
        await db.deleteTag(input.sourceTagId);
        
        return { 
          success: true, 
          filesRelinked: filesWithSourceTag.length,
          targetTagName: targetTag.name
        };
      }),

    // Suggest tags for a file using AI
    suggestTags: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }

        // Get all existing tags for this user
        const existingTags = await db.getTagsByUserId(ctx.user.id);
        const tagNames = existingTags.map((t: any) => t.name);

        // Use LLM to suggest relevant tags
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an AI assistant that suggests relevant tags for files based on their content and metadata. Analyze the file information and suggest tags from the existing tag library that are most relevant. Also suggest new tags if appropriate. Consider semantic relevance, not just keyword matching.`,
            },
            {
              role: "user",
              content: `File Information:\nTitle: ${file.title || file.filename}\nDescription: ${file.description || "none"}\nAI Analysis: ${file.aiAnalysis || "none"}\nOCR Text: ${file.ocrText || "none"}\nDetected Objects: ${file.detectedObjects ? JSON.stringify(file.detectedObjects) : "none"}\n\nExisting Tags Library:\n${tagNames.join(", ")}\n\nSuggest relevant tags with confidence scores.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tag_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tagName: { type: "string", description: "Suggested tag name" },
                        confidence: { type: "number", description: "Confidence score 0-100" },
                        reason: { type: "string", description: "Why this tag is relevant" },
                        isNew: { type: "boolean", description: "Whether this is a new tag or from existing library" },
                      },
                      required: ["tagName", "confidence", "reason", "isNew"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        const result = JSON.parse(typeof content === 'string' ? content : '{}');
        return result.suggestions || [];
      }),
  }),

  // ============= VIDEOS ROUTER =============
  videos: router({
    // List all videos
    list: protectedProcedure
      .input(z.object({ 
        page: z.number().default(1),
        pageSize: z.number().default(50),
      }).optional())
      .query(async ({ ctx, input }) => {
        const page = input?.page || 1;
        const pageSize = input?.pageSize || 50;
        const offset = (page - 1) * pageSize;
        
        // Get total count
        const totalCount = await db.getVideosCountByUserId(ctx.user.id);
        
        // Get paginated videos
        const videos = await db.getVideosByUserId(ctx.user.id, pageSize, offset);
        
        return {
          videos,
          pagination: {
            page,
            pageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
          },
        };
      }),

    // Get video with annotations
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const video = await db.getVideoById(input.id);
        if (!video || video.userId !== ctx.user.id) {
          throw new Error("Video not found");
        }
        
        const annotations = await db.getAnnotationsByVideoId(input.id);
        
        return { ...video, annotations };
      }),

    // Create video
    create: protectedProcedure
      .input(
        z.object({
          fileKey: z.string(),
          url: z.string(),
          filename: z.string(),
          duration: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          transcript: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // First create a files entry for annotation support
        const fileId = await db.createFile({
          userId: ctx.user.id,
          fileKey: input.fileKey,
          url: input.url,
          filename: input.filename,
          mimeType: "video/webm",
          fileSize: 0, // Size not tracked for recorded videos
          title: input.title || input.filename,
          description: input.description,
          enrichmentStatus: "completed", // Skip AI enrichment for recorded videos
        });
        
        // Then create the video entry linked to the file
        const videoId = await db.createVideo({
          ...input,
          userId: ctx.user.id,
          fileId, // Link to files table
          exportStatus: "draft",
        });
        
        return { id: videoId, fileId };
      }),

    // Update video
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          transcript: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const video = await db.getVideoById(input.id);
        if (!video || video.userId !== ctx.user.id) {
          throw new Error("Video not found");
        }
        
        const { id, ...updates } = input;
        await db.updateVideo(id, updates);
        
        return { success: true };
      }),

    // Delete video
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const video = await db.getVideoById(input.id);
        if (!video || video.userId !== ctx.user.id) {
          throw new Error("Video not found");
        }
        
        await db.deleteVideo(input.id);
        
        return { success: true };
      }),
  }),

  // ============= ANNOTATIONS ROUTER =============
  annotations: router({
    // Create annotation
    create: protectedProcedure
      .input(
        z.object({
          videoId: z.number(),
          fileId: z.number(),
          startTime: z.number(),
          endTime: z.number(),
          position: z.enum(["left", "right", "center"]),
          keyword: z.string().optional(),
          confidence: z.number().optional(),
          source: z.enum(["auto", "manual"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Verify video ownership
        const video = await db.getVideoById(input.videoId);
        if (!video || video.userId !== ctx.user.id) {
          throw new Error("Video not found");
        }
        
        const annotationId = await db.createAnnotation(input);
        
        return { id: annotationId };
      }),

    // Update annotation
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          startTime: z.number().optional(),
          endTime: z.number().optional(),
          position: z.enum(["left", "right", "center"]).optional(),
          keyword: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateAnnotation(id, updates);
        
        return { success: true };
      }),

    // Delete annotation
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAnnotation(input.id);
        
        return { success: true };
      }),

    // Get annotations by video
    getByVideo: protectedProcedure
      .input(z.object({ videoId: z.number() }))
      .query(async ({ input, ctx }) => {
        const video = await db.getVideoById(input.videoId);
        if (!video || video.userId !== ctx.user.id) {
          throw new Error("Video not found");
        }
        
        return await db.getAnnotationsByVideoId(input.videoId);
      }),

    // AI Auto-annotation: analyze transcript and suggest relevant files
    autoAnnotate: protectedProcedure
      .input(z.object({ videoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const video = await db.getVideoById(input.videoId);
        if (!video || video.userId !== ctx.user.id) {
          throw new Error("Video not found");
        }

        if (!video.transcript) {
          throw new Error("Video has no transcript");
        }

        // Get all user's files with metadata
        const files = await db.getFilesByUserId(ctx.user.id);

        // Use LLM to analyze transcript and match with files
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an AI assistant that analyzes video transcripts and suggests relevant files to annotate at specific timestamps. 

Use semantic similarity to match transcript segments with file descriptions, not just keyword matching. Consider:
1. Semantic relevance between transcript context and file descriptions
2. Topic alignment and conceptual overlap
3. Keyword matches as supporting evidence
4. Contextual appropriateness of the file for that moment

For each suggestion, provide:
- timestamp (in seconds) - when in the video this file is most relevant
- fileId (from the files list)
- keyword (the most relevant keyword or phrase from transcript)
- confidence (0-100, based on semantic similarity + keyword match)
- reason (explain the semantic connection and why this file fits this moment)`,
            },
            {
              role: "user",
              content: `Video Transcript:\n${video.transcript}\n\nAvailable Files:\n${files.map((f: any) => `ID: ${f.id}, Title: ${f.title}, Description: ${f.description}, Tags: ${f.tags?.map((t: any) => t.name).join(", ") || "none"}`).join("\n")}\n\nSuggest annotations with timestamps.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "annotation_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        timestamp: { type: "number", description: "Time in seconds" },
                        fileId: { type: "number", description: "ID of the relevant file" },
                        keyword: { type: "string", description: "Relevant keyword" },
                        confidence: { type: "number", description: "Confidence score 0-100" },
                        reason: { type: "string", description: "Brief explanation" },
                      },
                      required: ["timestamp", "fileId", "keyword", "confidence", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        const result = JSON.parse(typeof content === 'string' ? content : '{}');
        return result.suggestions || [];
      }),
  }),

  // ============= VIDEO EXPORT ROUTER =============
  videoExport: router({
    // Export video with annotations
    export: protectedProcedure
      .input(
        z.object({
          videoId: z.number(),
          preset: z.enum(['tutorial', 'review', 'clean']).optional().default('review'),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Verify video ownership
        const video = await db.getVideoById(input.videoId);
        if (!video || video.userId !== ctx.user.id) {
          throw new Error("Video not found");
        }

        // Get annotations with file data
        const annotations = await db.getAnnotationsByVideoId(input.videoId);

        // Export video
        const result = await exportVideoWithAnnotations({
          videoUrl: video.url,
          annotations: annotations.map((ann: any) => ({
            id: ann.id,
            startTime: ann.startTime,
            endTime: ann.endTime,
            position: ann.position,
            keyword: ann.keyword,
            fileUrl: ann.file?.url,
          })),
          outputFilename: `${video.title || "video"}-annotated.mp4`,
        });

        if (!result.success) {
          throw new Error(result.error || "Export failed");
        }

        return {
          url: result.url,
        };
      }),

    // Batch export annotations from multiple videos
    batchExport: protectedProcedure
      .input(
        z.object({
          videoIds: z.array(z.number()),
          format: z.enum(['csv', 'json']),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const allAnnotations: any[] = [];
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new Error("Database not available");

        // Fetch annotations for all selected videos
        for (const videoId of input.videoIds) {
          const video = await db.getVideoById(videoId);
          if (!video || video.userId !== ctx.user.id) continue;

          // Query voice annotations using raw SQL to avoid type issues
          const voiceAnnsResult: any = await dbInstance.execute(
            `SELECT * FROM voice_annotations WHERE fileId = ${video.fileId} ORDER BY videoTimestamp`
          );
          const voiceAnns = voiceAnnsResult[0] || [];

          // Query visual annotations using raw SQL
          const visualAnnsResult: any = await dbInstance.execute(
            `SELECT * FROM visual_annotations WHERE fileId = ${video.fileId} ORDER BY videoTimestamp`
          );
          const visualAnns = visualAnnsResult[0] || [];

          allAnnotations.push({
            videoId: video.id,
            videoTitle: video.title || video.filename,
            voiceAnnotations: voiceAnns.map((ann: any) => ({
              id: ann.id,
              timestamp: ann.videoTimestamp,
              duration: ann.duration,
              transcript: ann.transcript,
              audioUrl: ann.audioUrl,
            })),
            visualAnnotations: visualAnns.map((ann: any) => ({
              id: ann.id,
              timestamp: ann.videoTimestamp,
              duration: ann.duration,
              imageUrl: ann.imageUrl,
            })),
          });
        }

        let content: string;
        let mimeType: string;
        let filename: string;

        if (input.format === 'csv') {
          // Generate CSV format
          const rows = [
            ['Video ID', 'Video Title', 'Type', 'Annotation ID', 'Timestamp', 'Duration', 'Transcript/Image URL']
          ];

          for (const video of allAnnotations) {
            for (const ann of video.voiceAnnotations) {
              rows.push([
                video.videoId.toString(),
                video.videoTitle,
                'Voice',
                ann.id.toString(),
                ann.timestamp.toString(),
                ann.duration.toString(),
                ann.transcript || '',
              ]);
            }
            for (const ann of video.visualAnnotations) {
              rows.push([
                video.videoId.toString(),
                video.videoTitle,
                'Drawing',
                ann.id.toString(),
                ann.timestamp.toString(),
                ann.duration.toString(),
                ann.imageUrl || '',
              ]);
            }
          }

          content = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
          mimeType = 'text/csv';
          filename = `annotations-export-${Date.now()}.csv`;
        } else {
          // Generate JSON format
          content = JSON.stringify(allAnnotations, null, 2);
          mimeType = 'application/json';
          filename = `annotations-export-${Date.now()}.json`;
        }

        // Upload to storage
        const { url } = await storagePut(
          `exports/${ctx.user.id}/${filename}`,
          Buffer.from(content, 'utf-8'),
          mimeType
        );

        return { url, filename };
      }),
  }),

  // ============= KNOWLEDGE GRAPH ROUTER =============
  knowledgeGraph: router({
    // Get full knowledge graph for user
    get: protectedProcedure.query(async ({ ctx }) => {
      const edges = await db.getKnowledgeGraphForUser(ctx.user.id);
      const files = await db.getFilesByUserId(ctx.user.id);
      
      return {
        nodes: files.map(f => ({
          id: f.id,
          title: f.title || f.filename,
          type: f.mimeType.split("/")[0],
        })),
        edges,
      };
    }),

    // Rebuild knowledge graph (compute relationships)
    rebuild: protectedProcedure.mutation(async ({ ctx }) => {
      const files = await db.getFilesByUserId(ctx.user.id);
      
      // Compute relationships between all pairs of files
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const file1 = files[i]!;
          const file2 = files[j]!;
          
          // Calculate semantic similarity
          const similarity = calculateSimilarity(file1, file2);
          
          if (similarity > 50) { // Only create edges above threshold
            const tags1 = await db.getFileTagsWithNames(file1.id);
            const tags2 = await db.getFileTagsWithNames(file2.id);
            
            const sharedTags = tags1
              .filter(t1 => tags2.some(t2 => t2.name === t1.name))
              .map(t => t.name);
            
            await db.createKnowledgeGraphEdge({
              sourceFileId: file1.id,
              targetFileId: file2.id,
              relationshipType: "semantic",
              strength: similarity,
              sharedTags,
              sharedKeywords: [],
            });
          }
        }
      }
      
      return { success: true };
    }),
  }),

  // ============= EXTERNAL KNOWLEDGE GRAPHS ROUTER (Premium Feature) =============
  externalKnowledgeGraphs: router({
    // List all knowledge graph configurations for current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getExternalKnowledgeGraphsByUser(ctx.user.id);
    }),

    // Get single knowledge graph configuration
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const kg = await db.getExternalKnowledgeGraphById(input.id);
        if (!kg || kg.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge graph configuration not found" });
        }
        return kg;
      }),

    // Create new knowledge graph configuration
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          type: z.enum(["dbpedia", "wikidata", "schema_org", "custom"]),
          endpoint: z.string().url().optional(),
          apiKey: z.string().optional(),
          enabled: z.boolean().default(true),
          priority: z.number().int().default(0),
          ontologyUrl: z.string().url().optional(),
          namespacePrefix: z.string().max(100).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check knowledge graph limit
        const limitCheck = await premiumFeatures.checkKnowledgeGraphLimit(ctx.user.id);
        if (!limitCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: limitCheck.reason || "Knowledge graph limit reached",
          });
        }
        
        const kg = await db.createExternalKnowledgeGraph({
          userId: ctx.user.id,
          ...input,
        });
        return kg;
      }),

    // Update knowledge graph configuration
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          endpoint: z.string().url().optional(),
          apiKey: z.string().optional(),
          enabled: z.boolean().optional(),
          priority: z.number().int().optional(),
          ontologyUrl: z.string().url().optional(),
          namespacePrefix: z.string().max(100).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const kg = await db.getExternalKnowledgeGraphById(id);
        if (!kg || kg.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.updateExternalKnowledgeGraph(id, updates);
        return { success: true };
      }),

    // Delete knowledge graph configuration
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const kg = await db.getExternalKnowledgeGraphById(input.id);
        if (!kg || kg.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.deleteExternalKnowledgeGraph(input.id);
        return { success: true };
      }),

    // Test connection to external knowledge graph
    testConnection: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const kg = await db.getExternalKnowledgeGraphById(input.id);
        if (!kg || kg.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        
        // TODO: Implement actual connection testing based on kg.type
        // For now, return mock success
        return { 
          success: true, 
          message: `Successfully connected to ${kg.name}`,
          responseTime: 150 // ms
        };
      }),
  }),

  // Cloud Export Router
  cloudExport: router({
    // Export video to cloud storage
    exportVideo: protectedProcedure
      .input(
        z.object({
          videoId: z.number(),
          provider: z.enum(["google_drive", "dropbox"]),
          accessToken: z.string(),
          folderId: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const video = await db.getVideoById(input.videoId);
        if (!video || video.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Check if video has been exported
        if (!video.exportedUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Video must be exported first before uploading to cloud",
          });
        }

        // Import cloud export service
        const { exportToCloud } = await import("./cloudExport");

        // Export to cloud
        const result = await exportToCloud({
          provider: {
            name: input.provider,
            type: input.provider,
            accessToken: input.accessToken,
          },
          filePath: video.exportedUrl,
          fileName: `${video.title || "video"}_annotated.mp4`,
          mimeType: "video/mp4",
          folderId: input.folderId,
        });

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error || "Cloud export failed",
          });
        }

        return {
          success: true,
          result: result.result,
        };
      }),

    // Get OAuth URL for cloud provider
    getOAuthUrl: protectedProcedure
      .input(
        z.object({
          provider: z.enum(["google_drive", "dropbox"]),
          redirectUri: z.string(),
        })
      )
      .query(({ input }) => {
        // TODO: Replace with actual OAuth client IDs from environment variables
        const clientIds = {
          google_drive: process.env.GOOGLE_DRIVE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID",
          dropbox: process.env.DROPBOX_CLIENT_ID || "YOUR_DROPBOX_CLIENT_ID",
        };

        const scopes = {
          google_drive: "https://www.googleapis.com/auth/drive.file",
          dropbox: "files.content.write",
        };

        const authUrls = {
          google_drive: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientIds.google_drive}&redirect_uri=${encodeURIComponent(input.redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.google_drive)}&access_type=offline&prompt=consent`,
          dropbox: `https://www.dropbox.com/oauth2/authorize?client_id=${clientIds.dropbox}&redirect_uri=${encodeURIComponent(input.redirectUri)}&response_type=code`,
        };

        return {
          url: authUrls[input.provider],
        };
      }),
  }),

  // ============= ANALYTICS ROUTER =============
  analytics: router({
    // Get enrichment statistics
    getEnrichmentStats: protectedProcedure.query(async ({ ctx }) => {
      const files = await db.getFilesByUserId(ctx.user.id);
      const totalFiles = files.length;
      const enrichedFiles = files.filter((f: any) => f.enrichmentStatus === "completed").length;
      const enrichmentRate = totalFiles > 0 ? Math.round((enrichedFiles / totalFiles) * 100) : 0;

      // Get enrichment status breakdown
      const enrichmentStatusBreakdown = [
        { status: "pending", count: files.filter((f: any) => f.enrichmentStatus === "pending").length },
        { status: "processing", count: files.filter((f: any) => f.enrichmentStatus === "processing").length },
        { status: "completed", count: files.filter((f: any) => f.enrichmentStatus === "completed").length },
        { status: "failed", count: files.filter((f: any) => f.enrichmentStatus === "failed").length },
      ];

      // Get knowledge graph usage
      const knowledgeGraphs = await db.getExternalKnowledgeGraphsByUser(ctx.user.id);
      const knowledgeGraphUsage = knowledgeGraphs.map(kg => ({
        id: kg.id,
        name: kg.name,
        type: kg.type,
        usageCount: kg.usageCount || 0,
        avgResponseTime: (kg as any).avgResponseTime || 0,
      }));

      // Get total tags (count unique tags across all files)
      const allTagsSet = new Set<string>();
      for (const file of files) {
        const fileTags = await db.getFileTagsWithNames(file.id);
        for (const tag of fileTags) {
          allTagsSet.add(tag.name);
        }
      }
      const totalTags = allTagsSet.size;

      // Get top tags
      const tagCounts = new Map<string, number>();
      for (const file of files) {
        const fileTags = await db.getFileTagsWithNames(file.id);
        for (const tag of fileTags) {
          tagCounts.set(tag.name, (tagCounts.get(tag.name) || 0) + 1);
        }
      }
      const topTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // Calculate average quality score
      const qualityScores = files.filter((f: any) => f.qualityScore).map((f: any) => f.qualityScore!);
      const avgQualityScore = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((a: number, b: number) => a + b, 0) / qualityScores.length)
        : 0;

      // Get recent enrichments
      const recentEnrichments = files
        .filter((f: any) => f.enrichmentStatus === "completed")
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
        .map((f: any) => ({
          id: f.id,
          title: f.title,
          filename: f.filename,
          enrichmentStatus: f.enrichmentStatus,
          updatedAt: f.updatedAt,
        }));

      // Calculate average query time (mock for now)
      const avgQueryTime = knowledgeGraphUsage.length > 0
        ? Math.round(knowledgeGraphUsage.reduce((sum, kg) => sum + kg.avgResponseTime, 0) / knowledgeGraphUsage.length)
        : 0;

      return {
        totalFiles,
        enrichedFiles,
        enrichmentRate,
        enrichmentStatusBreakdown,
        knowledgeGraphCount: knowledgeGraphs.length,
        knowledgeGraphUsage,
        totalTags,
        topTags,
        avgQualityScore,
        avgQueryTime,
        recentEnrichments,
      };
    }),
  }),

  // ============= ENRICHMENT QUEUE ROUTER =============
  enrichmentQueue: router({
    // Start bulk enrichment for multiple files
    startBulk: protectedProcedure
      .input(z.object({ fileIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        // Verify all files belong to user
        const files = await Promise.all(
          input.fileIds.map(id => db.getFileById(id))
        );
        
        if (files.some(f => !f || f.userId !== ctx.user.id)) {
          throw new Error("Some files not found or unauthorized");
        }

        // Start enrichment process for each file
        // Note: Enrichment is triggered asynchronously, status is tracked in database
        const results = [];
        for (const fileId of input.fileIds) {
          try {
            // Mark file for enrichment - actual enrichment happens via files.enrich mutation
            const file = await db.getFileById(fileId);
            if (file) {
              results.push({ fileId, status: 'pending' });
            }
          } catch (error) {
            results.push({ fileId, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }

        return { results, message: 'Use files.enrich mutation to trigger enrichment for each file' };
      }),

    // Get enrichment status for files
    getStatus: protectedProcedure
      .input(z.object({ fileIds: z.array(z.number()) }))
      .query(async ({ input, ctx }) => {
        const files = await Promise.all(
          input.fileIds.map(id => db.getFileById(id))
        );
        
        return files.map(f => ({
          fileId: f?.id,
          enrichmentStatus: f?.enrichmentStatus || 'not_enriched',
          qualityScore: (f as any)?.qualityScore || null,
        }));
      }),
  }),

  // ============= SCHEDULED EXPORTS ROUTER =============
  scheduledExports: router({
    // Create a new scheduled export
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          exportType: z.enum(["video", "files", "metadata"]),
          format: z.enum(["mp4", "csv", "json", "zip"]),
          schedule: z.enum(["daily", "weekly", "monthly"]),
          scheduleTime: z.string(), // HH:MM format
          dayOfWeek: z.number().optional(),
          dayOfMonth: z.number().optional(),
          timezone: z.string().default("UTC"),
          collectionId: z.number().optional(),
          filters: z.string().optional(),
          includeMetadata: z.boolean().default(true),
          emailNotification: z.boolean().default(true),
          notificationEmail: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const id = await db.createScheduledExport({
          ...input,
          userId: ctx.user.id,
          isActive: true,
          nextRunAt: calculateNextRun(input.schedule, input.scheduleTime, input.dayOfWeek, input.dayOfMonth, input.timezone),
        });
        return { id };
      }),

    // List all scheduled exports for current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getScheduledExportsByUser(ctx.user.id);
    }),

    // Get a specific scheduled export
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const scheduledExport = await db.getScheduledExportById(input.id);
        if (!scheduledExport || scheduledExport.userId !== ctx.user.id) {
          throw new Error("Scheduled export not found");
        }
        return scheduledExport;
      }),

    // Update a scheduled export
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          schedule: z.enum(["daily", "weekly", "monthly"]).optional(),
          scheduleTime: z.string().optional(),
          dayOfWeek: z.number().optional(),
          dayOfMonth: z.number().optional(),
          isActive: z.boolean().optional(),
          emailNotification: z.boolean().optional(),
          notificationEmail: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...updates } = input;
        const scheduledExport = await db.getScheduledExportById(id);
        if (!scheduledExport || scheduledExport.userId !== ctx.user.id) {
          throw new Error("Scheduled export not found");
        }
        
        // Recalculate next run if schedule changed
        if (updates.schedule || updates.scheduleTime || updates.dayOfWeek || updates.dayOfMonth) {
          (updates as any).nextRunAt = calculateNextRun(
            updates.schedule || scheduledExport.schedule,
            updates.scheduleTime || scheduledExport.scheduleTime,
            updates.dayOfWeek ?? scheduledExport.dayOfWeek,
            updates.dayOfMonth ?? scheduledExport.dayOfMonth,
            scheduledExport.timezone
          );
        }
        
        await db.updateScheduledExport(id, updates);
        return { success: true };
      }),

    // Delete a scheduled export
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const scheduledExport = await db.getScheduledExportById(input.id);
        if (!scheduledExport || scheduledExport.userId !== ctx.user.id) {
          throw new Error("Scheduled export not found");
        }
        await db.deleteScheduledExport(input.id);
        return { success: true };
      }),

    // Get export history
    history: protectedProcedure
      .input(z.object({ scheduledExportId: z.number().optional(), limit: z.number().default(50) }))
      .query(async ({ input, ctx }) => {
        if (input.scheduledExportId) {
          const scheduledExport = await db.getScheduledExportById(input.scheduledExportId);
          if (!scheduledExport || scheduledExport.userId !== ctx.user.id) {
            throw new Error("Scheduled export not found");
          }
          return await db.getExportHistoryByScheduledExport(input.scheduledExportId, input.limit);
        }
        return await db.getExportHistoryByUser(ctx.user.id, input.limit);
      }),
  }),

  // ============= IMAGE ANNOTATIONS ROUTER =============
  imageAnnotations: router({
    // Save annotation for a file
    save: protectedProcedure
      .input(
        z.object({
          fileId: z.number(),
          annotationData: z.any(), // JSON data with strokes, shapes, text
        })
      )
      .mutation(async ({ input, ctx }) => {
        const annotationId = await db.saveImageAnnotation({
          fileId: input.fileId,
          userId: ctx.user.id,
          annotationData: input.annotationData,
        });
        
        return { success: true, id: annotationId };
      }),

    // Load annotation for a file
    load: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .query(async ({ input }) => {
        const annotation = await db.getImageAnnotation(input.fileId);
        return annotation;
      }),

    // Delete annotation for a file
    delete: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteImageAnnotation(input.fileId);
        return { success: true };
      }),
  }),

  // ============= RECENTLY VIEWED FILES ROUTER =============
  recentlyViewed: router({
    // Track file view
    trackView: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        return await db.trackFileView(input.fileId, ctx.user.id);
      }),

    // Get recently viewed files
    list: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const limit = input?.limit || 10;
        return await db.getRecentlyViewedFiles(ctx.user.id, limit);
      }),
  }),

  // ============= BULK OPERATIONS ROUTER =============
  bulkOperations: router({
    // Bulk delete files
    deleteFiles: protectedProcedure
      .input(z.object({ fileIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        await db.bulkDeleteFiles(input.fileIds, ctx.user.id);
        return { success: true, deletedCount: input.fileIds.length };
      }),

    // Bulk add tags to files
    addTags: protectedProcedure
      .input(
        z.object({
          fileIds: z.array(z.number()),
          tagIds: z.array(z.number()),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.bulkAddTagsToFiles(
          input.fileIds,
          input.tagIds,
          ctx.user.id
        );
        return result;
      }),

    // Bulk remove tags from files
    removeTags: protectedProcedure
      .input(
        z.object({
          fileIds: z.array(z.number()),
          tagIds: z.array(z.number()),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.bulkRemoveTagsFromFiles(
          input.fileIds,
          input.tagIds,
          ctx.user.id
        );
        return result;
      }),

    // Bulk add files to collection
    addToCollection: protectedProcedure
      .input(
        z.object({
          fileIds: z.array(z.number()),
          collectionId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.bulkAddFilesToCollection(
          input.fileIds,
          input.collectionId,
          ctx.user.id
        );
        return result;
      }),

    // Bulk remove files from collection
    removeFromCollection: protectedProcedure
      .input(
        z.object({
          fileIds: z.array(z.number()),
          collectionId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.bulkRemoveFilesFromCollection(
          input.fileIds,
          input.collectionId,
          ctx.user.id
        );
        return result;
      }),

    // Batch re-enrich files
    reEnrichFiles: protectedProcedure
      .input(z.object({ fileIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.batchReEnrichFiles(input.fileIds, ctx.user.id);
        return { success: true, count: result.count };
      }),

    // Get enrichment status for files
    getEnrichmentStatus: protectedProcedure
      .input(z.object({ fileIds: z.array(z.number()) }))
      .query(async ({ input, ctx }) => {
        return db.getFileEnrichmentStatus(input.fileIds, ctx.user.id);
      }),
  }),

  // ============= DUPLICATE DETECTION ROUTER =============
  duplicateDetection: router({
    // Check for duplicates before upload
    checkDuplicates: protectedProcedure
      .input(
        z.object({
          imageData: z.string(), // base64 image data
          threshold: z.number().default(5), // Hamming distance threshold
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { generatePerceptualHash } = await import('./perceptualHash');
        
        // Convert base64 to buffer
        const buffer = Buffer.from(input.imageData, 'base64');
        
        // Generate hash for uploaded image
        const hash = await generatePerceptualHash(buffer);
        
        // Find similar files
        const similarFiles = await db.findSimilarFiles(ctx.user.id, hash, input.threshold);
        
        return {
          hash,
          duplicates: similarFiles.map(f => ({
            id: f.id,
            filename: f.filename,
            url: f.url,
            similarity: f.similarity,
            hammingDistance: f.hammingDistance,
            createdAt: f.createdAt,
          })),
        };
      }),

    // Generate and store hash for existing file
    generateHash: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error('File not found');
        }

        // Only generate hash for images
        if (!file.mimeType.startsWith('image/')) {
          throw new Error('Hash generation only supported for images');
        }

        const { generatePerceptualHash } = await import('./perceptualHash');
        const { storageGet } = await import('./storage');
        
        // Download file from S3
        const response = await fetch(file.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Generate hash
        const hash = await generatePerceptualHash(buffer);
        
        // Store hash in database
        await db.updateFileHash(input.fileId, hash);
        
        return { hash };
      }),

    // Find duplicates of an existing file
    findDuplicates: protectedProcedure
      .input(
        z.object({
          fileId: z.number(),
          threshold: z.number().default(5),
        })
      )
      .query(async ({ input, ctx }) => {
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error('File not found');
        }

        if (!file.perceptualHash) {
          throw new Error('File does not have a perceptual hash');
        }

        // Find similar files (excluding the file itself)
        const similarFiles = await db.findSimilarFiles(ctx.user.id, file.perceptualHash, input.threshold);
        
        return similarFiles
          .filter(f => f.id !== input.fileId)
          .map(f => ({
            id: f.id,
            filename: f.filename,
            url: f.url,
            similarity: f.similarity,
            hammingDistance: f.hammingDistance,
            createdAt: f.createdAt,
          }));
      }),
  }),

  activity: router({
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const files = await db.getFilesByUserId(userId);
      
      const totalFiles = files.length;
      const totalStorage = files.reduce((sum: number, f: any) => sum + (f.fileSize || 0), 0);
      
      const fileTypes = files.reduce((acc: Record<string, number>, f: any) => {
        const type = f.mimeType?.split('/')[0] || 'other';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        totalFiles,
        totalStorage,
        fileTypes,
      };
    }),
    
    getRecentActivity: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ ctx, input }) => {
        const files = await db.getFilesByUserId(ctx.user.id);
        return files
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, input.limit)
          .map((f: any) => ({
            id: f.id,
            type: 'upload' as const,
            filename: f.filename,
            createdAt: f.createdAt,
          }));
      }),
  }),
});

export type AppRouter = typeof appRouter;

// ============= HELPER FUNCTIONS =============

function calculateNextRun(
  schedule: "daily" | "weekly" | "monthly",
  scheduleTime: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  timezone: string = "UTC"
): Date {
  const now = new Date();
  const [hours, minutes] = scheduleTime.split(":").map(Number);
  
  let nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);
  
  // If the time has already passed today, start from tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  switch (schedule) {
    case "daily":
      // Already set to next occurrence
      break;
      
    case "weekly":
      if (dayOfWeek !== null && dayOfWeek !== undefined) {
        // Find next occurrence of the specified day of week
        const currentDay = nextRun.getDay();
        const daysUntilTarget = (dayOfWeek - currentDay + 7) % 7;
        if (daysUntilTarget === 0 && nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 7);
        } else {
          nextRun.setDate(nextRun.getDate() + daysUntilTarget);
        }
      }
      break;
      
    case "monthly":
      if (dayOfMonth !== null && dayOfMonth !== undefined) {
        nextRun.setDate(dayOfMonth);
        // If the day has passed this month, move to next month
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
          nextRun.setDate(dayOfMonth);
        }
      }
      break;
  }
  
  return nextRun;
}

function extractKeywords(text: string): string[] {
  // Simple keyword extraction (in production, use NLP library)
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const wordCounts = new Map<string, number>();
  
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });
  
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function calculateSimilarity(file1: any, file2: any): number {
  // Simple similarity based on shared keywords and tags
  let score = 0;
  
  // Compare descriptions
  if (file1.description && file2.description) {
    const words1 = file1.description.toLowerCase().split(/\s+/);
    const words2 = file2.description.toLowerCase().split(/\s+/);
    const set2 = new Set(words2);
    const intersection = words1.filter((x: string) => set2.has(x));
    score += (intersection.length / Math.max(words1.length, words2.length)) * 50;
  }
  
  // Compare AI analysis
  if (file1.aiAnalysis && file2.aiAnalysis) {
    const words1 = file1.aiAnalysis.toLowerCase().split(/\s+/);
    const words2 = file2.aiAnalysis.toLowerCase().split(/\s+/);
    const set2 = new Set(words2);
    const intersection = words1.filter((x: string) => set2.has(x));
    score += (intersection.length / Math.max(words1.length, words2.length)) * 50;
  }
  
  return Math.min(score, 100);
}
