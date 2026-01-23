import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { eq, and, like, or, sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

export const semanticSearchRouter = router({
  /**
   * Parse natural language query and search files
   */
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Use LLM to parse the natural language query
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a search query parser. Extract search parameters from natural language queries. Return ONLY a JSON object with 'keywords' (array of search terms), 'fileTypes' (array of mime type prefixes like 'image/', 'video/'), 'dateRange' (object with 'start' and 'end' ISO dates if mentioned), and 'locations' (array of location names if mentioned)."
          },
          {
            role: "user",
            content: `Parse this search query: "${input.query}"`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "search_parameters",
            strict: true,
            schema: {
              type: "object",
              properties: {
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "Search keywords extracted from query"
                },
                fileTypes: {
                  type: "array",
                  items: { type: "string" },
                  description: "File type filters (e.g., 'image/', 'video/')"
                },
                dateRange: {
                  type: "object",
                  properties: {
                    start: { type: "string", description: "Start date in ISO format" },
                    end: { type: "string", description: "End date in ISO format" }
                  },
                  required: [],
                  additionalProperties: false
                },
                locations: {
                  type: "array",
                  items: { type: "string" },
                  description: "Location names mentioned in query"
                }
              },
              required: ["keywords", "fileTypes", "dateRange", "locations"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0].message.content;
      const searchParams = JSON.parse(typeof content === "string" ? content : "{}");

      // Build database query based on parsed parameters
      const conditions = [eq(files.userId, ctx.user.id)];

      // Add keyword search (search in title, description, filename, tags)
      if (searchParams.keywords && searchParams.keywords.length > 0) {
        const keywordConditions = searchParams.keywords.flatMap((keyword: string) => [
          like(files.title, `%${keyword}%`),
          like(files.description, `%${keyword}%`),
          like(files.filename, `%${keyword}%`),
          like(files.aiAnalysis, `%${keyword}%`),
        ]);
        conditions.push(or(...keywordConditions)!);
      }

      // Add file type filter
      if (searchParams.fileTypes && searchParams.fileTypes.length > 0) {
        const typeConditions = searchParams.fileTypes.map((type: string) =>
          like(files.mimeType, `${type}%`)
        );
        conditions.push(or(...typeConditions)!);
      }

      // Add date range filter
      if (searchParams.dateRange?.start || searchParams.dateRange?.end) {
        if (searchParams.dateRange.start) {
          conditions.push(sql`${files.createdAt} >= ${new Date(searchParams.dateRange.start)}`);
        }
        if (searchParams.dateRange.end) {
          conditions.push(sql`${files.createdAt} <= ${new Date(searchParams.dateRange.end)}`);
        }
      }

      // Execute search query
      const results = await db
        .select()
        .from(files)
        .where(and(...conditions))
        .limit(50);

      // Calculate relevance scores using AI
      const scoredResults = await Promise.all(
        results.map(async (file) => {
          try {
            const scoreResponse = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: "Rate the relevance of this file to the search query on a scale of 0-100. Return ONLY a JSON object with a 'score' field."
                },
                {
                  role: "user",
                  content: `Query: "${input.query}"\n\nFile: ${file.title || file.filename}\nDescription: ${file.description || "N/A"}\nAI Analysis: ${file.aiAnalysis || "N/A"}`
                }
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "relevance_score",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      score: {
                        type: "integer",
                        description: "Relevance score from 0 to 100"
                      }
                    },
                    required: ["score"],
                    additionalProperties: false
                  }
                }
              }
            });

            const scoreContent = scoreResponse.choices[0].message.content;
            const scoreResult = JSON.parse(typeof scoreContent === "string" ? scoreContent : "{}");
            
            return {
              ...file,
              relevanceScore: scoreResult.score || 0
            };
          } catch (error) {
            console.error(`Failed to score file ${file.id}:`, error);
            return {
              ...file,
              relevanceScore: 50 // Default score
            };
          }
        })
      );

      // Sort by relevance score
      scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      return {
        query: input.query,
        parsedParams: searchParams,
        results: scoredResults,
        totalResults: scoredResults.length,
      };
    }),
});
