import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { voiceAnnotations, visualAnnotations, users } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

export const exportRouter = router({
  /**
   * Export annotations as CSV
   */
  exportCSV: protectedProcedure
    .input(
      z.object({
        annotationIds: z.array(z.number()),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let annotations: any[] = [];

      if (input.annotationType === "voice") {
        annotations = await db
          .select()
          .from(voiceAnnotations)
          .where(inArray(voiceAnnotations.id, input.annotationIds));
      } else {
        annotations = await db
          .select()
          .from(visualAnnotations)
          .where(inArray(visualAnnotations.id, input.annotationIds));
      }

      // Build CSV content
      const headers = [
        "ID",
        "File ID",
        "Timestamp",
        "Duration",
        input.annotationType === "voice" ? "Transcript" : "Description",
        "Created At",
      ];

      const rows = annotations.map((ann) => [
        ann.id,
        ann.fileId,
        ann.videoTimestamp,
        ann.duration,
        input.annotationType === "voice" ? ann.transcript || "" : ann.description || "",
        new Date(ann.createdAt).toISOString(),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      return {
        content: csvContent,
        filename: `annotations_${input.annotationType}_${Date.now()}.csv`,
        mimeType: "text/csv",
      };
    }),

  /**
   * Export annotations as JSON
   */
  exportJSON: protectedProcedure
    .input(
      z.object({
        annotationIds: z.array(z.number()),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let annotations: any[] = [];

      if (input.annotationType === "voice") {
        annotations = await db
          .select()
          .from(voiceAnnotations)
          .where(inArray(voiceAnnotations.id, input.annotationIds));
      } else {
        annotations = await db
          .select()
          .from(visualAnnotations)
          .where(inArray(visualAnnotations.id, input.annotationIds));
      }

      const jsonContent = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          annotationType: input.annotationType,
          count: annotations.length,
          annotations: annotations.map((ann) => ({
            id: ann.id,
            fileId: ann.fileId,
            userId: ann.userId,
            videoTimestamp: ann.videoTimestamp,
            duration: ann.duration,
            ...(input.annotationType === "voice"
              ? {
                  audioUrl: ann.audioUrl,
                  audioKey: ann.audioKey,
                  transcript: ann.transcript,
                }
              : {
                  imageUrl: ann.imageUrl,
                  imageKey: ann.imageKey,
                  description: ann.description,
                }),
            createdAt: ann.createdAt,
          })),
        },
        null,
        2
      );

      return {
        content: jsonContent,
        filename: `annotations_${input.annotationType}_${Date.now()}.json`,
        mimeType: "application/json",
      };
    }),

  /**
   * Export annotations as PDF (simplified text-based format)
   */
  exportPDF: protectedProcedure
    .input(
      z.object({
        annotationIds: z.array(z.number()),
        annotationType: z.enum(["voice", "visual"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let annotations: any[] = [];

      if (input.annotationType === "voice") {
        annotations = await db
          .select()
          .from(voiceAnnotations)
          .where(inArray(voiceAnnotations.id, input.annotationIds));
      } else {
        annotations = await db
          .select()
          .from(visualAnnotations)
          .where(inArray(visualAnnotations.id, input.annotationIds));
      }

      // For PDF, we'll return HTML that can be converted to PDF client-side
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Annotation Export</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .annotation { margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 10px; }
    .content { margin-top: 10px; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>${input.annotationType === "voice" ? "Voice" : "Visual"} Annotations Export</h1>
  <p>Exported on: ${new Date().toLocaleString()}</p>
  <p>Total annotations: ${annotations.length}</p>
  <hr>
  ${annotations
    .map(
      (ann) => `
    <div class="annotation">
      <div class="meta">
        <strong>ID:</strong> ${ann.id} | 
        <strong>Timestamp:</strong> ${formatTime(ann.videoTimestamp)} | 
        <strong>Duration:</strong> ${ann.duration}s |
        <strong>Created:</strong> ${new Date(ann.createdAt).toLocaleString()}
      </div>
      <div class="content">
        ${
          input.annotationType === "voice"
            ? `<strong>Transcript:</strong> ${ann.transcript || "No transcript"}`
            : `<strong>Description:</strong> ${ann.description || "No description"}`
        }
      </div>
    </div>
  `
    )
    .join("")}
</body>
</html>
      `;

      return {
        content: htmlContent,
        filename: `annotations_${input.annotationType}_${Date.now()}.html`,
        mimeType: "text/html",
      };
    }),
});

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hrs > 0 ? `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}` : `${mins}:${secs.toString().padStart(2, "0")}`;
}
