import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export const shareLinksRouter = router({
  // Create a new share link
  create: protectedProcedure
    .input(
      z.object({
        fileId: z.number().optional(),
        videoId: z.number().optional(),
        password: z.string().optional(),
        expiresAt: z.string().optional(), // ISO date string
        allowDownload: z.boolean().default(true),
        maxViews: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate that either fileId or videoId is provided
      if (!input.fileId && !input.videoId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either fileId or videoId must be provided",
        });
      }

      // Verify ownership of the file/video
      if (input.fileId) {
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File not found",
          });
        }
      }

      if (input.videoId) {
        const video = await db.getVideoById(input.videoId);
        if (!video || video.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Video not found",
          });
        }
      }

      // Generate unique token
      const token = nanoid(32);

      // Hash password if provided
      let passwordHash: string | undefined;
      if (input.password) {
        passwordHash = await bcrypt.hash(input.password, 10);
      }

      // Create share link
      const shareLinkId = await db.createShareLink({
        userId: ctx.user.id,
        fileId: input.fileId,
        videoId: input.videoId,
        token,
        passwordHash,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        allowDownload: input.allowDownload,
        maxViews: input.maxViews,
      });

      return {
        id: shareLinkId,
        token,
        url: `/share/${token}`,
      };
    }),

  // Get all share links for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const links = await db.getShareLinksByUserId(ctx.user.id);
    
    // Enrich with file/video info
    const enrichedLinks = await Promise.all(
      links.map(async (link) => {
        let itemName = "Unknown";
        let itemType: "file" | "video" = "file";
        
        if (link.fileId) {
          const file = await db.getFileById(link.fileId);
          itemName = file?.filename || "Deleted file";
          itemType = "file";
        } else if (link.videoId) {
          const video = await db.getVideoById(link.videoId);
          itemName = video?.title || "Deleted video";
          itemType = "video";
        }
        
        return {
          ...link,
          itemName,
          itemType,
          hasPassword: !!link.passwordHash,
          isExpired: link.expiresAt ? new Date(link.expiresAt) < new Date() : false,
        };
      })
    );
    
    return enrichedLinks;
  }),

  // Get share links for a specific file
  getForFile: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .query(async ({ ctx, input }) => {
      const file = await db.getFileById(input.fileId);
      if (!file || file.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      }
      
      const links = await db.getShareLinksForFile(input.fileId);
      return links.map((link) => ({
        ...link,
        hasPassword: !!link.passwordHash,
        isExpired: link.expiresAt ? new Date(link.expiresAt) < new Date() : false,
      }));
    }),

  // Get share links for a specific video
  getForVideo: protectedProcedure
    .input(z.object({ videoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const video = await db.getVideoById(input.videoId);
      if (!video || video.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
      }
      
      const links = await db.getShareLinksForVideo(input.videoId);
      return links.map((link) => ({
        ...link,
        hasPassword: !!link.passwordHash,
        isExpired: link.expiresAt ? new Date(link.expiresAt) < new Date() : false,
      }));
    }),

  // Update a share link
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        password: z.string().optional().nullable(), // null to remove password
        expiresAt: z.string().optional().nullable(), // null to remove expiration
        allowDownload: z.boolean().optional(),
        maxViews: z.number().optional().nullable(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const link = await db.getShareLinkById(input.id);
      if (!link || link.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found" });
      }

      const updates: Record<string, any> = {};
      
      if (input.password !== undefined) {
        updates.passwordHash = input.password 
          ? await bcrypt.hash(input.password, 10) 
          : null;
      }
      
      if (input.expiresAt !== undefined) {
        updates.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      }
      
      if (input.allowDownload !== undefined) {
        updates.allowDownload = input.allowDownload;
      }
      
      if (input.maxViews !== undefined) {
        updates.maxViews = input.maxViews;
      }
      
      if (input.isActive !== undefined) {
        updates.isActive = input.isActive;
      }

      await db.updateShareLink(input.id, updates);
      return { success: true };
    }),

  // Delete a share link
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const link = await db.getShareLinkById(input.id);
      if (!link || link.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found" });
      }

      await db.deleteShareLink(input.id);
      return { success: true };
    }),

  // Get access logs for a share link
  getAccessLogs: protectedProcedure
    .input(z.object({ id: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const link = await db.getShareLinkById(input.id);
      if (!link || link.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found" });
      }

      return db.getShareAccessLogs(input.id, input.limit);
    }),

  // Public endpoint to access shared content
  access: publicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const link = await db.getShareLinkByToken(input.token);
      
      if (!link) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found" });
      }

      // Check if link is active
      if (!link.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This share link has been disabled" });
      }

      // Check expiration
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This share link has expired" });
      }

      // Check max views
      if (link.maxViews && link.viewCount >= link.maxViews) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This share link has reached its view limit" });
      }

      // Check password
      if (link.passwordHash) {
        if (!input.password) {
          return { requiresPassword: true };
        }
        
        const isValid = await bcrypt.compare(input.password, link.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
        }
      }

      // Increment view count and log access
      await db.incrementShareLinkViewCount(link.id);
      
      // Get request info from context if available
      const req = (ctx as any).req;
      const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
      const userAgent = req?.headers?.['user-agent'] || null;
      
      await db.logShareAccess({
        shareLinkId: link.id,
        ipAddress,
        userAgent,
        action: "view",
      });

      // Get the shared content
      let content: any = null;
      let contentType: "file" | "video" = "file";

      if (link.fileId) {
        const file = await db.getFileById(link.fileId);
        if (file) {
          content = {
            id: file.id,
            filename: file.filename,
            url: file.url,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            title: file.title,
            description: file.description,
          };
          contentType = "file";
        }
      } else if (link.videoId) {
        const video = await db.getVideoById(link.videoId);
        if (video) {
          // Get annotations for the video
          const annotations = await db.getAnnotationsByVideoId(video.id);
          content = {
            id: video.id,
            title: video.title,
            url: video.url,
            thumbnailUrl: video.thumbnailUrl,
            duration: video.duration,
            description: video.description,
            annotations: annotations.map((a) => ({
              id: a.id,
              startTime: a.startTime,
              endTime: a.endTime,
              keyword: a.keyword,
              position: a.position,
              source: a.source,
            })),
          };
          contentType = "video";
        }
      }

      if (!content) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Shared content not found" });
      }

      return {
        requiresPassword: false,
        content,
        contentType,
        allowDownload: link.allowDownload,
        ownerName: (await db.getUserById(link.userId))?.name || "Unknown",
      };
    }),

  // Log download action
  logDownload: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await db.getShareLinkByToken(input.token);
      if (!link || !link.allowDownload) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Download not allowed" });
      }

      const req = (ctx as any).req;
      const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
      const userAgent = req?.headers?.['user-agent'] || null;

      await db.logShareAccess({
        shareLinkId: link.id,
        ipAddress,
        userAgent,
        action: "download",
      });

      return { success: true };
    }),
});
