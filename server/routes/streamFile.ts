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
 * HEAD /api/files/stream/:sessionToken
 * 
 * Supports:
 * - HEAD requests for metadata discovery (used by browsers before video playback)
 * - Range requests for video seeking (partial content)
 * - Full file download (for non-media files or explicit download)
 */

// Default range size for open-ended range requests (no end byte specified).
// 10MB gives the browser enough buffer for smooth video playback while keeping
// memory usage reasonable. The browser will make follow-up requests as needed.
const DEFAULT_RANGE_SIZE = 10 * 1024 * 1024; // 10MB

async function getSessionAndChunks(sessionToken: string) {
  const drizzle = await getDb();
  if (!drizzle) return null;

  const [session] = await drizzle
    .select()
    .from(resumableUploadSessions)
    .where(
      and(
        eq(resumableUploadSessions.sessionToken, sessionToken),
        eq(resumableUploadSessions.status, "completed")
      )
    );

  if (!session) return null;

  // If it has a direct S3 URL, return it for redirect
  if (session.finalFileUrl && !session.finalFileUrl.includes('/api/files/stream/')) {
    return { session, chunks: [], redirectUrl: session.finalFileUrl };
  }

  const chunks = await drizzle
    .select()
    .from(resumableUploadChunks)
    .where(eq(resumableUploadChunks.sessionId, session.id))
    .orderBy(resumableUploadChunks.chunkIndex);

  return { session, chunks, redirectUrl: null };
}

/**
 * Stream the specified byte range from chunks to the response.
 * Handles cross-chunk boundaries correctly by computing exact offsets.
 */
async function streamRange(
  res: Response,
  chunks: any[],
  chunkSize: number,
  rangeStart: number,
  rangeEnd: number
) {
  const contentLength = rangeEnd - rangeStart + 1;
  let bytesWritten = 0;

  // Find which chunks contain the requested range
  const startChunkIndex = Math.floor(rangeStart / chunkSize);
  const endChunkIndex = Math.floor(rangeEnd / chunkSize);

  for (let i = startChunkIndex; i <= endChunkIndex && i < chunks.length; i++) {
    if (res.destroyed) break;

    const chunk = chunks[i];
    const chunkStartByte = i * chunkSize; // Global byte offset where this chunk starts

    try {
      const { url } = await storageGet(chunk.storageKey);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[StreamFile] Failed to fetch chunk ${i}: HTTP ${response.status}`);
        break;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Calculate the slice of this chunk that falls within the requested range
      const sliceStart = Math.max(0, rangeStart - chunkStartByte);
      const sliceEnd = Math.min(buffer.length, rangeEnd - chunkStartByte + 1);

      if (sliceStart < sliceEnd) {
        const slice = buffer.subarray(sliceStart, sliceEnd);
        const canContinue = res.write(slice);
        bytesWritten += slice.length;

        // Handle backpressure
        if (!canContinue && !res.destroyed) {
          await new Promise<void>((resolve) => res.once("drain", resolve));
        }
      }

      if (bytesWritten >= contentLength) break;
    } catch (error) {
      console.error(`[StreamFile] Error streaming chunk ${i}:`, error);
      break;
    }
  }
}

// HEAD request handler - returns metadata without streaming any data
// This is critical for video playback: browsers send HEAD first to discover file size
router.head("/api/files/stream/:sessionToken", async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;
    if (!sessionToken) {
      return res.status(400).json({ error: "Missing session token" });
    }

    const result = await getSessionAndChunks(sessionToken);
    if (!result) {
      return res.status(404).json({ error: "File not found or not yet completed" });
    }

    if (result.redirectUrl) {
      return res.redirect(result.redirectUrl);
    }

    const { session } = result;
    const totalSize = Number(session.fileSize);

    res.writeHead(200, {
      "Content-Type": session.mimeType,
      "Content-Length": totalSize,
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${encodeURIComponent(session.filename)}"`,
      "Cache-Control": "public, max-age=86400",
    });
    res.end();
  } catch (error) {
    console.error("[StreamFile] HEAD error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to get file info" });
    }
  }
});

// GET request handler - streams data with range support
router.get("/api/files/stream/:sessionToken", async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;
    if (!sessionToken) {
      return res.status(400).json({ error: "Missing session token" });
    }

    const result = await getSessionAndChunks(sessionToken);
    if (!result) {
      return res.status(404).json({ error: "File not found or not yet completed" });
    }

    if (result.redirectUrl) {
      return res.redirect(result.redirectUrl);
    }

    const { session, chunks } = result;

    if (chunks.length === 0) {
      return res.status(404).json({ error: "No chunks found for this file" });
    }

    const totalSize = Number(session.fileSize);
    const mimeType = session.mimeType;
    const filename = session.filename;
    const chunkSize = session.chunkSize;
    const rangeHeader = req.headers.range;
    const isMedia = mimeType.startsWith("video/") || mimeType.startsWith("audio/");

    if (rangeHeader) {
      // Parse range header: "bytes=start-end" or "bytes=start-"
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const rangeStart = parseInt(parts[0], 10);
      
      // If end byte is specified, honor it exactly.
      // If not specified (open-ended), serve DEFAULT_RANGE_SIZE bytes.
      // This gives the browser enough buffer for smooth video playback.
      const rangeEnd = parts[1] && parts[1].length > 0
        ? Math.min(parseInt(parts[1], 10), totalSize - 1)
        : Math.min(rangeStart + DEFAULT_RANGE_SIZE - 1, totalSize - 1);
      
      const contentLength = rangeEnd - rangeStart + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength,
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
      });

      await streamRange(res, chunks, chunkSize, rangeStart, rangeEnd);
      res.end();
    } else if (isMedia) {
      // For media files without Range header: return 200 with Accept-Ranges
      // and stream the data. The browser will then switch to range requests for seeking.
      // Send headers IMMEDIATELY so the browser doesn't time out.
      const isDownload = req.query.download === 'true';
      const disposition = isDownload ? 'attachment' : 'inline';
      
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Content-Length": totalSize,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(filename)}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      });

      // Stream all chunks sequentially
      for (let i = 0; i < chunks.length; i++) {
        if (res.destroyed) break;
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
          if (!canContinue && !res.destroyed) {
            await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        } catch (error) {
          console.error(`[StreamFile] Error streaming chunk ${i}:`, error);
          break;
        }
      }

      res.end();
    } else {
      // Non-media full file download
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
        if (res.destroyed) break;
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

          if (!canContinue && !res.destroyed) {
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
