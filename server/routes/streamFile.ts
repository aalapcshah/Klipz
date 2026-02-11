import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { resumableUploadSessions, resumableUploadChunks } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storageGet } from "../storage";

const router = Router();

/**
 * Stream a file that was uploaded via resumable upload
 * Instead of re-assembling chunks into a single S3 file (which causes OOM/timeout),
 * this endpoint streams chunks directly from S3 in order.
 * 
 * GET /api/files/stream/:sessionToken
 * 
 * Supports:
 * - Full file download
 * - Range requests for video seeking (partial content)
 * - Proper Content-Type and Content-Disposition headers
 */
router.get("/api/files/stream/:sessionToken", async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;
    if (!sessionToken) {
      return res.status(400).json({ error: "Missing session token" });
    }

    const drizzle = await getDb();
    if (!drizzle) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Find the session
    const [session] = await drizzle
      .select()
      .from(resumableUploadSessions)
      .where(
        and(
          eq(resumableUploadSessions.sessionToken, sessionToken),
          eq(resumableUploadSessions.status, "completed")
        )
      );

    if (!session) {
      return res.status(404).json({ error: "File not found or not yet completed" });
    }

    // Check if this session uses chunk-based storage (no finalFileUrl means chunks)
    // If it has a finalFileUrl, redirect to it directly
    if (session.finalFileUrl && !session.finalFileUrl.includes('/api/files/stream/')) {
      return res.redirect(session.finalFileUrl);
    }

    // Get all chunks ordered
    const chunks = await drizzle
      .select()
      .from(resumableUploadChunks)
      .where(eq(resumableUploadChunks.sessionId, session.id))
      .orderBy(resumableUploadChunks.chunkIndex);

    if (chunks.length === 0) {
      return res.status(404).json({ error: "No chunks found for this file" });
    }

    const totalSize = Number(session.fileSize);
    const mimeType = session.mimeType;
    const filename = session.filename;

    // Handle Range requests for video seeking
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      // Parse range header: "bytes=start-end"
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const rangeStart = parseInt(parts[0], 10);
      const rangeEnd = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const contentLength = rangeEnd - rangeStart + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength,
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
      });

      // Find which chunks contain the requested range
      const chunkSize = session.chunkSize;
      const startChunkIndex = Math.floor(rangeStart / chunkSize);
      const endChunkIndex = Math.floor(rangeEnd / chunkSize);

      let bytesWritten = 0;
      let globalOffset = startChunkIndex * chunkSize;

      for (let i = startChunkIndex; i <= endChunkIndex && i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const { url } = await storageGet(chunk.storageKey);
          const response = await fetch(url);
          if (!response.ok) {
            console.error(`[StreamFile] Failed to fetch chunk ${i}: HTTP ${response.status}`);
            break;
          }

          const buffer = Buffer.from(await response.arrayBuffer());

          // Calculate the slice of this chunk that falls within the requested range
          const chunkStart = Math.max(0, rangeStart - globalOffset);
          const chunkEnd = Math.min(buffer.length, rangeEnd - globalOffset + 1);

          if (chunkStart < chunkEnd) {
            const slice = buffer.subarray(chunkStart, chunkEnd);
            res.write(slice);
            bytesWritten += slice.length;
          }

          globalOffset += buffer.length;

          if (bytesWritten >= contentLength) break;
        } catch (error) {
          console.error(`[StreamFile] Error streaming chunk ${i}:`, error);
          break;
        }
      }

      res.end();
    } else {
      // Full file download - stream all chunks sequentially
      const isDownload = req.query.download === 'true';
      const disposition = isDownload ? 'attachment' : 'inline';
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Content-Length": totalSize,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(filename)}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const { url } = await storageGet(chunk.storageKey);
          const response = await fetch(url);
          if (!response.ok) {
            console.error(`[StreamFile] Failed to fetch chunk ${i}: HTTP ${response.status}`);
            break;
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          const canContinue = res.write(buffer);

          // Handle backpressure
          if (!canContinue) {
            await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        } catch (error) {
          console.error(`[StreamFile] Error streaming chunk ${i}:`, error);
          break;
        }
      }

      res.end();
    }
  } catch (error) {
    console.error("[StreamFile] Unexpected error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream file" });
    }
  }
});

export default router;
