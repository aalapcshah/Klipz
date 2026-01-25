import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { fileVersions, files } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const fileVersionsRouter = router({
  // Get version history for a file
  list: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Verify file ownership
      const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);
      
      if (!file || file.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      const versions = await db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId))
        .orderBy(desc(fileVersions.versionNumber));
      
      return { versions };
    }),

  // Create a new version snapshot of current file state
  create: protectedProcedure
    .input(z.object({
      fileId: z.number(),
      changeDescription: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Verify file ownership and get current file state
      const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);
      
      if (!file || file.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Get current version number
      const latestVersion = await db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId))
        .orderBy(desc(fileVersions.versionNumber))
        .limit(1);
      
      const nextVersionNumber = latestVersion.length > 0 
        ? latestVersion[0].versionNumber + 1 
        : 1;
      
      // Create version snapshot from current file state
      await db.insert(fileVersions).values({
        fileId: input.fileId,
        userId: ctx.user.id,
        versionNumber: nextVersionNumber,
        changeDescription: input.changeDescription || `Version ${nextVersionNumber}`,
        fileKey: file.fileKey,
        url: file.url,
        filename: file.filename,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        title: file.title,
        description: file.description,
        aiAnalysis: file.aiAnalysis,
        ocrText: file.ocrText,
        detectedObjects: file.detectedObjects as any,
      });
      
      return { success: true, versionNumber: nextVersionNumber };
    }),

  // Restore a previous version
  restore: protectedProcedure
    .input(z.object({
      fileId: z.number(),
      versionId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Verify file ownership
      const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);
      
      if (!file || file.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Get the version to restore
      const [version] = await db
        .select()
        .from(fileVersions)
        .where(and(
          eq(fileVersions.id, input.versionId),
          eq(fileVersions.fileId, input.fileId)
        ))
        .limit(1);
      
      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      
      // Create a backup version with current state before restoring
      const latestVersion = await db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId))
        .orderBy(desc(fileVersions.versionNumber))
        .limit(1);
      
      const nextVersionNumber = latestVersion.length > 0 
        ? latestVersion[0].versionNumber + 1 
        : 1;
      
      await db.insert(fileVersions).values({
        fileId: input.fileId,
        userId: ctx.user.id,
        versionNumber: nextVersionNumber,
        changeDescription: `Backup before restoring to version ${version.versionNumber}`,
        fileKey: file.fileKey,
        url: file.url,
        filename: file.filename,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        title: file.title,
        description: file.description,
        aiAnalysis: file.aiAnalysis,
        ocrText: file.ocrText,
        detectedObjects: file.detectedObjects as any,
      });
      
      // Restore the file to the selected version
      await db
        .update(files)
        .set({
          fileKey: version.fileKey,
          url: version.url,
          filename: version.filename,
          mimeType: version.mimeType,
          fileSize: version.fileSize,
          title: version.title,
          description: version.description,
          aiAnalysis: version.aiAnalysis,
          ocrText: version.ocrText,
          detectedObjects: version.detectedObjects as any,
          updatedAt: new Date(),
        })
        .where(eq(files.id, input.fileId));
      
      return { success: true, restoredVersion: version.versionNumber };
    }),

  // Compare two versions
  compare: protectedProcedure
    .input(z.object({
      fileId: z.number(),
      versionId1: z.number(),
      versionId2: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Verify file ownership
      const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);
      
      if (!file || file.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Get both versions
      const [version1] = await db
        .select()
        .from(fileVersions)
        .where(and(
          eq(fileVersions.id, input.versionId1),
          eq(fileVersions.fileId, input.fileId)
        ))
        .limit(1);
      
      const [version2] = await db
        .select()
        .from(fileVersions)
        .where(and(
          eq(fileVersions.id, input.versionId2),
          eq(fileVersions.fileId, input.fileId)
        ))
        .limit(1);
      
      if (!version1 || !version2) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      
      // Calculate differences
      const differences = {
        filename: version1.filename !== version2.filename,
        fileSize: version1.fileSize !== version2.fileSize,
        title: version1.title !== version2.title,
        description: version1.description !== version2.description,
        mimeType: version1.mimeType !== version2.mimeType,
      };
      
      return {
        version1,
        version2,
        differences,
      };
    }),

  // Delete a version
  delete: protectedProcedure
    .input(z.object({
      fileId: z.number(),
      versionId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Verify file ownership
      const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);
      
      if (!file || file.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Delete the version
      await db
        .delete(fileVersions)
        .where(and(
          eq(fileVersions.id, input.versionId),
          eq(fileVersions.fileId, input.fileId)
        ));
      
      return { success: true };
    }),
});
