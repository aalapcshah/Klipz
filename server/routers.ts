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

export const appRouter = router({
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
    list: protectedProcedure.query(async ({ ctx }) => {
      const files = await db.getFilesByUserId(ctx.user.id);
      
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

    // Delete file
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
        await db.deleteFile(input.id);
        
        return { success: true };
      }),

    // Search files
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input, ctx }) => {
        return await db.searchFiles(ctx.user.id, input.query);
      }),

    // Enrich file with AI
    enrich: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new Error("File not found");
        }
        
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
