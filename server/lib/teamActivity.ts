import { teamActivities, InsertTeamActivity } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Activity types that can be logged for a team
 */
export type TeamActivityType = InsertTeamActivity["type"];

/**
 * Log a team activity event.
 * This is a fire-and-forget helper — it catches errors internally
 * so callers don't need to worry about activity logging failures
 * breaking the main operation.
 */
export async function logTeamActivity(params: {
  teamId: number;
  actorId: number;
  actorName: string | null;
  type: NonNullable<TeamActivityType>;
  details?: Record<string, string | number | null>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(teamActivities).values({
      teamId: params.teamId,
      actorId: params.actorId,
      actorName: params.actorName || "Unknown",
      type: params.type,
      details: params.details || null,
    });
  } catch (err) {
    // Log but don't throw — activity logging should never break the main operation
    console.error("[TeamActivity] Failed to log activity:", err);
  }
}
