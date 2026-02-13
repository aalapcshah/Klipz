import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { voiceAnnotations, files, users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePut } from "../storage";
import { transcribeAudio } from "../_core/voiceTranscription";
import { logTeamActivity } from "../lib/teamActivity";

export const voiceAnnotationsRouter = router({
  /**
   * Save a voice annotation for a video file
   */
  saveAnnotation: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        audioDataUrl: z.string(), // Base64 data URL
        duration: z.number(),
        videoTimestamp: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify file belongs to user
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.user.id)))
        .limit(1);

      if (!file) {
        throw new Error("File not found or access denied");
      }

      // Convert base64 data URL to buffer
      const base64Data = input.audioDataUrl.split(",")[1];
      const audioBuffer = Buffer.from(base64Data, "base64");

      // Generate unique key for S3
      const timestamp = Date.now();
      const audioKey = `voice-annotations/${ctx.user.id}/${input.fileId}/${timestamp}.webm`;

      // Upload to S3
      const { url: audioUrl } = await storagePut(audioKey, audioBuffer, "audio/webm");

      // Transcribe audio in background (don't block response)
      let transcript: string | null = null;
      try {
        const transcription = await transcribeAudio({
          audioUrl,
          language: "en",
        });
        // Check if transcription was successful
        if ("text" in transcription) {
          transcript = transcription.text;
        } else {
          console.error("Transcription error:", transcription.error);
        }
      } catch (error) {
        console.error("Transcription failed:", error);
        // Continue without transcription
      }

      // Save to database
      const [annotation] = await db
        .insert(voiceAnnotations)
        .values({
          fileId: input.fileId,
          userId: ctx.user.id,
          audioUrl,
          audioKey,
          duration: input.duration,
          videoTimestamp: input.videoTimestamp,
          transcript,
        })
        .$returningId();

      // Log team activity if user belongs to a team
      if (ctx.user.teamId) {
        logTeamActivity({
          teamId: ctx.user.teamId,
          actorId: ctx.user.id,
          actorName: ctx.user.name || null,
          type: "annotation_created",
          details: { filename: file.filename || "a file", annotationType: "voice" },
        }).catch(() => {}); // fire-and-forget
      }

      return {
        id: annotation.id,
        audioUrl,
        videoTimestamp: input.videoTimestamp,
        duration: input.duration,
        transcript,
      };
    }),

  /**
   * Get all voice annotations for a file
   */
  getAnnotations: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify file belongs to user
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.user.id)))
        .limit(1);

      if (!file) {
        throw new Error("File not found or access denied");
      }

      // Get all annotations for this file with user information
      const annotations = await db
        .select({
          id: voiceAnnotations.id,
          fileId: voiceAnnotations.fileId,
          userId: voiceAnnotations.userId,
          audioUrl: voiceAnnotations.audioUrl,
          audioKey: voiceAnnotations.audioKey,
          duration: voiceAnnotations.duration,
          videoTimestamp: voiceAnnotations.videoTimestamp,
          transcript: voiceAnnotations.transcript,
          createdAt: voiceAnnotations.createdAt,
          // User information
          userName: users.name,
          userEmail: users.email,
        })
        .from(voiceAnnotations)
        .leftJoin(users, eq(voiceAnnotations.userId, users.id))
        .where(eq(voiceAnnotations.fileId, input.fileId))
        .orderBy(voiceAnnotations.videoTimestamp);

      return annotations;
    }),

  /**
   * Get all voice annotations for a file (alias for getAnnotations)
   */
  getByFileId: protectedProcedure
    .input(z.object({ fileId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify file belongs to user
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.user.id)))
        .limit(1);

      if (!file) {
        throw new Error("File not found or access denied");
      }

      // Get all annotations for this file
      const annotations = await db
        .select()
        .from(voiceAnnotations)
        .where(eq(voiceAnnotations.fileId, input.fileId));

      return annotations;
    }),

  /**
   * Delete a voice annotation
   */
  deleteAnnotation: protectedProcedure
    .input(z.object({ annotationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify annotation belongs to user
      const [annotation] = await db
        .select()
        .from(voiceAnnotations)
        .where(
          and(
            eq(voiceAnnotations.id, input.annotationId),
            eq(voiceAnnotations.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!annotation) {
        throw new Error("Annotation not found or access denied");
      }

      // Delete from database
      await db
        .delete(voiceAnnotations)
        .where(eq(voiceAnnotations.id, input.annotationId));

      // Note: S3 cleanup can be done via lifecycle policy or background job
      return { success: true };
    }),
});
