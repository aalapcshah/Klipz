import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { nanoid } from "nanoid";
import { exportVideoWithAnnotations } from "./videoExport";

export const appRouter = router({
  savedSearches: router({
    list: protectedProcedure.query(({ ctx }) => db.getSavedSearchesByUser(ctx.user.id)),
    
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          query: z.string().optional(),
          fileType: z.string().optional(),
          tagIds: z.array(z.number()).optional(),
          enrichmentStatus: z.enum(["pending", "processing", "completed", "failed"]).optional(),
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

  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ============= STORAGE ROUTER =============
  storage: router({
    // Upload file data to S3
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
      .input(z.object({ collectionId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
      const files = input?.collectionId
        ? await db.getFilesByCollection(ctx.user.id, input.collectionId)
        : await db.getFilesByUserId(ctx.user.id);
      
      // Get tags for each file
      const filesWithTags = await Promise.all(
        files.map(async (file) => {
          const tags = await db.getFileTagsWithNames(file.id);
          return { ...file, tags };
        })
      );
      
      return filesWithTags;
    }),

    // Get single file with full details
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
        })
      )
      .mutation(async ({ input, ctx }) => {
        const fileId = await db.createFile({
          ...input,
          userId: ctx.user.id,
          enrichmentStatus: "pending",
        });
        
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
        
        await db.deleteFile(input.id);
        return { success: true };
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
  fileVersions: router({    // Create a new version snapshot
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
  }),

  // ============= VIDEOS ROUTER =============
  videos: router({
    // List all videos
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getVideosByUserId(ctx.user.id);
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
        const videoId = await db.createVideo({
          ...input,
          userId: ctx.user.id,
          exportStatus: "draft",
        });
        
        return { id: videoId };
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
  }),

  // ============= VIDEO EXPORT ROUTER =============
  videoExport: router({
    // Export video with annotations
    export: protectedProcedure
      .input(
        z.object({
          videoId: z.number(),
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
});

export type AppRouter = typeof appRouter;

// ============= HELPER FUNCTIONS =============

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
