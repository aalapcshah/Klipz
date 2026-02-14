import { invokeLLM } from "../_core/llm";
import * as db from "../db";

/**
 * Auto-match: fire-and-forget file matching after transcription or captioning completes.
 * Runs visual caption file matching for a single video against all user files.
 */
export async function runAutoFileMatch(params: {
  fileId: number;
  userId: number;
  minRelevanceScore?: number;
}): Promise<void> {
  const { fileId, userId, minRelevanceScore = 0.3 } = params;

  try {
    // Check if visual captions exist and are completed
    const caption = await db.getVisualCaptionByFileId(fileId);
    if (!caption || caption.status !== "completed") {
      console.log(`[AutoMatch] Skipping file ${fileId}: no completed captions`);
      return;
    }

    const captions = caption.captions as Array<{
      timestamp: number;
      caption: string;
      entities: string[];
      confidence: number;
    }>;

    if (!captions || captions.length === 0) {
      console.log(`[AutoMatch] Skipping file ${fileId}: no captions data`);
      return;
    }

    // Get all user's files for matching (excluding the video itself)
    const userFiles = await db.getFilesByUserId(userId);
    const candidateFiles = userFiles.filter((f) => f.id !== fileId);

    if (candidateFiles.length === 0) {
      console.log(`[AutoMatch] Skipping file ${fileId}: no candidate files`);
      return;
    }

    // Check if matches already exist (skip if recently generated)
    const existingMatches = await db.getVisualCaptionFileMatches(fileId);
    if (existingMatches && existingMatches.length > 0) {
      console.log(`[AutoMatch] Skipping file ${fileId}: matches already exist (${existingMatches.length} matches)`);
      return;
    }

    console.log(`[AutoMatch] Starting auto-match for file ${fileId} against ${candidateFiles.length} candidate files`);

    // Build file catalog
    const fileCatalog = candidateFiles
      .map(
        (f, idx) =>
          `${idx + 1}. "${f.filename}" - Title: "${f.title || "N/A"}" - Description: "${f.description || "N/A"}" - AI Analysis: "${f.aiAnalysis?.substring(0, 200) || "N/A"}" - Keywords: ${(f.extractedKeywords as string[])?.join(", ") || "N/A"}`
      )
      .join("\n");

    const captionSummary = captions
      .map(
        (c) =>
          `[${c.timestamp.toFixed(1)}s] ${c.caption} | Entities: ${c.entities.join(", ")}`
      )
      .join("\n");

    const matchResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a file-matching expert. Given video captions with timestamps and a library of files, identify which files are relevant to specific moments in the video. Return matches with relevance scores.\n\nFor each match, explain WHY the file is relevant.`,
        },
        {
          role: "user",
          content: `Match these video captions to relevant files.\n\nVIDEO CAPTIONS:\n${captionSummary}\n\nFILE LIBRARY:\n${fileCatalog}\n\nOnly include matches with relevance >= ${minRelevanceScore}.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "file_matches",
          strict: true,
          schema: {
            type: "object",
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    fileIndex: { type: "number" },
                    timestamp: { type: "number" },
                    relevanceScore: { type: "number" },
                    matchedEntities: { type: "array", items: { type: "string" } },
                    reasoning: { type: "string" },
                  },
                  required: ["fileIndex", "timestamp", "relevanceScore", "matchedEntities", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
            required: ["matches"],
            additionalProperties: false,
          },
        },
      },
    });

    const matchContent = matchResponse.choices[0]?.message?.content;
    const matchStr = typeof matchContent === "string" ? matchContent : JSON.stringify(matchContent);
    const matchResult = matchStr ? JSON.parse(matchStr) : { matches: [] };
    const rawMatches = matchResult.matches || [];

    let savedCount = 0;
    for (const match of rawMatches) {
      const file = candidateFiles[match.fileIndex - 1];
      if (!file || match.relevanceScore < minRelevanceScore) continue;

      const closestCaption = captions.reduce((prev, curr) =>
        Math.abs(curr.timestamp - match.timestamp) < Math.abs(prev.timestamp - match.timestamp)
          ? curr
          : prev
      );

      await db.createVisualCaptionFileMatch({
        visualCaptionId: caption.id,
        videoFileId: fileId,
        suggestedFileId: file.id,
        userId,
        timestamp: match.timestamp,
        captionText: closestCaption.caption,
        matchedEntities: match.matchedEntities,
        relevanceScore: match.relevanceScore,
        matchReasoning: match.reasoning,
      });
      savedCount++;
    }

    console.log(`[AutoMatch] Completed for file ${fileId}: ${savedCount} matches saved`);
  } catch (error: any) {
    console.error(`[AutoMatch] Failed for file ${fileId}:`, error.message);
  }
}
