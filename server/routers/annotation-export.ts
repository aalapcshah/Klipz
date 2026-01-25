import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { voiceAnnotations, visualAnnotations, users, files } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import PDFDocument from "pdfkit";
import { Readable } from "stream";

/**
 * Annotation Export Router
 * Handles exporting annotations to PDF and CSV formats with creator attribution
 */
export const annotationExportRouter = router({
  /**
   * Export annotations for a file in specified format (PDF or CSV)
   */
  exportAnnotations: protectedProcedure
    .input(
      z.object({
        fileId: z.number(),
        format: z.enum(["pdf", "csv"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get file information
      const file = await db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.user.id)))
        .limit(1);

      if (!file || file.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found or access denied" });
      }

      const fileInfo = file[0];

      // Get voice annotations with user information
      const voiceAnns = await db
        .select({
          id: voiceAnnotations.id,
          videoTimestamp: voiceAnnotations.videoTimestamp,
          duration: voiceAnnotations.duration,
          transcript: voiceAnnotations.transcript,
          createdAt: voiceAnnotations.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(voiceAnnotations)
        .leftJoin(users, eq(voiceAnnotations.userId, users.id))
        .where(eq(voiceAnnotations.fileId, input.fileId))
        .orderBy(voiceAnnotations.videoTimestamp);

      // Get visual annotations with user information
      const visualAnns = await db
        .select({
          id: visualAnnotations.id,
          videoTimestamp: visualAnnotations.videoTimestamp,
          duration: visualAnnotations.duration,
          imageUrl: visualAnnotations.imageUrl,
          createdAt: visualAnnotations.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(visualAnnotations)
        .leftJoin(users, eq(visualAnnotations.userId, users.id))
        .where(eq(visualAnnotations.fileId, input.fileId))
        .orderBy(visualAnnotations.videoTimestamp);

      // Format timestamp as MM:SS
      const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      };

      if (input.format === "csv") {
        // Generate CSV
        let csv = "Type,Timestamp,Duration,Content,Creator Name,Creator Email,Created At\n";

        for (const ann of voiceAnns) {
          const row = [
            "Voice",
            formatTime(ann.videoTimestamp),
            `${ann.duration}s`,
            `"${(ann.transcript || "").replace(/"/g, '""')}"`, // Escape quotes
            ann.userName || "Unknown",
            ann.userEmail || "",
            new Date(ann.createdAt).toISOString(),
          ];
          csv += row.join(",") + "\n";
        }

        for (const ann of visualAnns) {
          const row = [
            "Drawing",
            formatTime(ann.videoTimestamp),
            `${ann.duration}s`,
            `"${ann.imageUrl}"`,
            ann.userName || "Unknown",
            ann.userEmail || "",
            new Date(ann.createdAt).toISOString(),
          ];
          csv += row.join(",") + "\n";
        }

        return {
          format: "csv" as const,
          content: csv,
          filename: `${fileInfo.filename}_annotations.csv`,
        };
      } else {
        // Generate PDF
        return new Promise<{ format: "pdf"; content: string; filename: string }>((resolve, reject) => {
          const doc = new PDFDocument({ margin: 50 });
          const chunks: Buffer[] = [];

          doc.on("data", (chunk: Buffer) => chunks.push(chunk));
          doc.on("end", () => {
            const pdfBuffer = Buffer.concat(chunks);
            const base64 = pdfBuffer.toString("base64");
            resolve({
              format: "pdf" as const,
              content: base64,
              filename: `${fileInfo.filename}_annotations.pdf`,
            });
          });
          doc.on("error", reject);

          // PDF Header
          doc.fontSize(20).text("Video Annotations Report", { align: "center" });
          doc.moveDown();
          doc.fontSize(12).text(`File: ${fileInfo.filename}`, { align: "center" });
          doc.fontSize(10).text(`Exported: ${new Date().toLocaleString()}`, { align: "center" });
          doc.moveDown(2);

          // Voice Annotations Section
          if (voiceAnns.length > 0) {
            doc.fontSize(16).text("Voice Annotations", { underline: true });
            doc.moveDown();

            for (const ann of voiceAnns) {
              doc.fontSize(12).fillColor("#000000");
              doc.text(`Timestamp: ${formatTime(ann.videoTimestamp)} (${ann.duration}s)`, { continued: false });
              doc.fontSize(10).fillColor("#666666");
              doc.text(`Created by: ${ann.userName || "Unknown"} (${ann.userEmail || "N/A"})`, { continued: false });
              doc.text(`Date: ${new Date(ann.createdAt).toLocaleString()}`, { continued: false });
              doc.moveDown(0.5);
              doc.fontSize(11).fillColor("#000000");
              doc.text(ann.transcript || "(No transcript)", { indent: 20 });
              doc.moveDown(1.5);

              // Add page break if needed
              if (doc.y > 700) {
                doc.addPage();
              }
            }
          }

          // Visual Annotations Section
          if (visualAnns.length > 0) {
            if (voiceAnns.length > 0) {
              doc.moveDown(2);
            }
            doc.fontSize(16).fillColor("#000000").text("Drawing Annotations", { underline: true });
            doc.moveDown();

            for (const ann of visualAnns) {
              doc.fontSize(12).fillColor("#000000");
              doc.text(`Timestamp: ${formatTime(ann.videoTimestamp)} (${ann.duration}s)`, { continued: false });
              doc.fontSize(10).fillColor("#666666");
              doc.text(`Created by: ${ann.userName || "Unknown"} (${ann.userEmail || "N/A"})`, { continued: false });
              doc.text(`Date: ${new Date(ann.createdAt).toLocaleString()}`, { continued: false });
              doc.fontSize(10).fillColor("#0066cc");
              doc.text(`Image: ${ann.imageUrl}`, { link: ann.imageUrl, continued: false });
              doc.moveDown(1.5);

              // Add page break if needed
              if (doc.y > 700) {
                doc.addPage();
              }
            }
          }

          // Handle empty case
          if (voiceAnns.length === 0 && visualAnns.length === 0) {
            doc.fontSize(12).fillColor("#666666").text("No annotations found for this video.", { align: "center" });
          }

          doc.end();
        });
      }
    }),
});
