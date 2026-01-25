import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cloudStorageTokens } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Cloud Storage Integration Router
 * Handles OAuth and file uploads to Google Drive and Dropbox
 */
export const cloudStorageRouter = router({
  /**
   * Get stored cloud storage tokens for the user
   */
  getTokens: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const tokens = await db
      .select()
      .from(cloudStorageTokens)
      .where(eq(cloudStorageTokens.userId, ctx.user.id));

    return tokens.map(token => ({
      provider: token.provider,
      connected: true,
      email: token.email,
    }));
  }),

  /**
   * Save OAuth tokens for cloud storage provider
   */
  saveTokens: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["google_drive", "dropbox"]),
        accessToken: z.string(),
        refreshToken: z.string().optional(),
        expiresAt: z.number().optional(),
        email: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if token already exists
      const existing = await db
        .select()
        .from(cloudStorageTokens)
        .where(
          and(
            eq(cloudStorageTokens.userId, ctx.user.id),
            eq(cloudStorageTokens.provider, input.provider)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing token
        await db
          .update(cloudStorageTokens)
          .set({
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            email: input.email,
            updatedAt: new Date(),
          })
          .where(eq(cloudStorageTokens.id, existing[0].id));
      } else {
        // Insert new token
        await db.insert(cloudStorageTokens).values({
          userId: ctx.user.id,
          provider: input.provider,
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          email: input.email,
        });
      }

      return { success: true };
    }),

  /**
   * Disconnect cloud storage provider
   */
  disconnect: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["google_drive", "dropbox"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .delete(cloudStorageTokens)
        .where(
          and(
            eq(cloudStorageTokens.userId, ctx.user.id),
            eq(cloudStorageTokens.provider, input.provider)
          )
        );

      return { success: true };
    }),

  /**
   * Upload file to Google Drive
   */
  uploadToGoogleDrive: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        content: z.string(), // base64 for PDF or plain text for CSV
        mimeType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get stored token
      const tokenRecord = await db
        .select()
        .from(cloudStorageTokens)
        .where(
          and(
            eq(cloudStorageTokens.userId, ctx.user.id),
            eq(cloudStorageTokens.provider, "google_drive")
          )
        )
        .limit(1);

      if (!tokenRecord || tokenRecord.length === 0) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Google Drive not connected. Please connect your account first.",
        });
      }

      let accessToken = tokenRecord[0].accessToken;

      // Check if token is expired and refresh if needed
      if (tokenRecord[0].expiresAt && new Date(tokenRecord[0].expiresAt) < new Date()) {
        if (!tokenRecord[0].refreshToken) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Token expired and no refresh token available. Please reconnect.",
          });
        }

        // Refresh token logic would go here
        // For now, throw error to reconnect
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Token expired. Please reconnect your Google Drive account.",
        });
      }

      // Upload to Google Drive using multipart upload
      const boundary = "-------314159265358979323846";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const metadata = {
        name: input.filename,
        mimeType: input.mimeType,
      };

      const multipartRequestBody =
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${input.mimeType}\r\n` +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        input.content +
        closeDelim;

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to upload to Google Drive: ${error}`,
        });
      }

      const result = await response.json();
      return {
        success: true,
        fileId: result.id,
        webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
      };
    }),

  /**
   * Upload file to Dropbox
   */
  uploadToDropbox: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        content: z.string(), // base64 for PDF or plain text for CSV
        mimeType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get stored token
      const tokenRecord = await db
        .select()
        .from(cloudStorageTokens)
        .where(
          and(
            eq(cloudStorageTokens.userId, ctx.user.id),
            eq(cloudStorageTokens.provider, "dropbox")
          )
        )
        .limit(1);

      if (!tokenRecord || tokenRecord.length === 0) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Dropbox not connected. Please connect your account first.",
        });
      }

      let accessToken = tokenRecord[0].accessToken;

      // Dropbox tokens don't expire, but we should handle refresh if needed
      // Auto-refresh logic would go here based on the knowledge base requirement

      // Convert content to buffer
      const buffer = input.mimeType === "application/pdf"
        ? Buffer.from(input.content, "base64")
        : Buffer.from(input.content, "utf-8");

      // Upload to Dropbox
      const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: `/MetaClips/${input.filename}`,
            mode: "add",
            autorename: true,
            mute: false,
          }),
        },
        body: buffer,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to upload to Dropbox: ${error}`,
        });
      }

      const result = await response.json();

      // Create a shared link
      const linkResponse = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: result.path_display,
          settings: {
            requested_visibility: "public",
          },
        }),
      });

      let sharedLink = "";
      if (linkResponse.ok) {
        const linkResult = await linkResponse.json();
        sharedLink = linkResult.url;
      }

      return {
        success: true,
        path: result.path_display,
        sharedLink,
      };
    }),
});
