import { getDb } from "../db";
import { users, fileActivityLogs } from "../../drizzle/schema";
import { sql, and, gte, lte, eq, inArray } from "drizzle-orm";

export interface CohortDefinition {
  name: string;
  startDate: Date;
  endDate: Date;
  userIds?: number[]; // Optional: specific user IDs to include
}

export interface CohortMetrics {
  cohortName: string;
  totalUsers: number;
  activeUsers: number;
  totalActivities: number;
  averageActivitiesPerUser: number;
  retentionDay1: number;
  retentionDay7: number;
  retentionDay30: number;
  activityBreakdown: {
    upload: number;
    view: number;
    edit: number;
    tag: number;
    share: number;
    delete: number;
    enrich: number;
    export: number;
  };
}

/**
 * Analyze a cohort of users
 */
export async function analyzeCohort(cohort: CohortDefinition): Promise<CohortMetrics> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  // Get users in the cohort (users who joined during the period)
  const cohortUsersQuery = database
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        gte(users.createdAt, cohort.startDate),
        lte(users.createdAt, cohort.endDate)
      )
    );

  // If specific user IDs are provided, filter by them
  const cohortUsers = cohort.userIds
    ? await database
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(users.id, cohort.userIds),
            gte(users.createdAt, cohort.startDate),
            lte(users.createdAt, cohort.endDate)
          )
        )
    : await cohortUsersQuery;

  const totalUsers = cohortUsers.length;

  if (totalUsers === 0) {
    return {
      cohortName: cohort.name,
      totalUsers: 0,
      activeUsers: 0,
      totalActivities: 0,
      averageActivitiesPerUser: 0,
      retentionDay1: 0,
      retentionDay7: 0,
      retentionDay30: 0,
      activityBreakdown: {
        upload: 0,
        view: 0,
        edit: 0,
        tag: 0,
        share: 0,
        delete: 0,
        enrich: 0,
        export: 0,
      },
    };
  }

  const userIds = cohortUsers.map((u) => u.id);

  // Get active users (users who have any activity)
  const activeUsersResult = await database.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT ${fileActivityLogs.userId}) as count
    FROM ${fileActivityLogs}
    WHERE ${fileActivityLogs.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})
  `);
  const activeUsers = Number((activeUsersResult[0] as any)[0]?.count || 0);

  // Get total activities
  const totalActivitiesResult = await database.execute<{ count: number }>(sql`
    SELECT COUNT(*) as count
    FROM ${fileActivityLogs}
    WHERE ${fileActivityLogs.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})
  `);
  const totalActivities = Number((totalActivitiesResult[0] as any)[0]?.count || 0);

  // Calculate average activities per user
  const averageActivitiesPerUser = totalUsers > 0 ? Math.round(totalActivities / totalUsers) : 0;

  // Calculate retention rates
  const retentionDay1 = await calculateCohortRetention(userIds, cohort.startDate, 1);
  const retentionDay7 = await calculateCohortRetention(userIds, cohort.startDate, 7);
  const retentionDay30 = await calculateCohortRetention(userIds, cohort.startDate, 30);

  // Get activity breakdown
  const activityBreakdown = await getCohortActivityBreakdown(userIds);

  return {
    cohortName: cohort.name,
    totalUsers,
    activeUsers,
    totalActivities,
    averageActivitiesPerUser,
    retentionDay1,
    retentionDay7,
    retentionDay30,
    activityBreakdown,
  };
}

/**
 * Calculate retention rate for a cohort
 */
async function calculateCohortRetention(
  userIds: number[],
  cohortStartDate: Date,
  daysAfter: number
): Promise<number> {
  const database = await getDb();
  if (!database || userIds.length === 0) return 0;

  const targetDate = new Date(cohortStartDate);
  targetDate.setDate(targetDate.getDate() + daysAfter);

  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Count users who had activity on the target day
  const activeOnDayResult = await database.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT ${fileActivityLogs.userId}) as count
    FROM ${fileActivityLogs}
    WHERE ${fileActivityLogs.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})
      AND ${fileActivityLogs.createdAt} >= ${dayStart}
      AND ${fileActivityLogs.createdAt} <= ${dayEnd}
  `);

  const activeOnDay = Number((activeOnDayResult[0] as any)[0]?.count || 0);
  return Math.round((activeOnDay / userIds.length) * 100);
}

/**
 * Get activity breakdown for a cohort
 */
async function getCohortActivityBreakdown(userIds: number[]): Promise<{
  upload: number;
  view: number;
  edit: number;
  tag: number;
  share: number;
  delete: number;
  enrich: number;
  export: number;
}> {
  const database = await getDb();
  if (!database || userIds.length === 0) {
    return {
      upload: 0,
      view: 0,
      edit: 0,
      tag: 0,
      share: 0,
      delete: 0,
      enrich: 0,
      export: 0,
    };
  }

  const breakdownResult = await database.execute<{
    activityType: string;
    count: number;
  }>(sql`
    SELECT 
      ${fileActivityLogs.activityType} as activityType,
      COUNT(*) as count
    FROM ${fileActivityLogs}
    WHERE ${fileActivityLogs.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})
    GROUP BY ${fileActivityLogs.activityType}
  `);

  const breakdown = {
    upload: 0,
    view: 0,
    edit: 0,
    tag: 0,
    share: 0,
    delete: 0,
    enrich: 0,
    export: 0,
  };

  ((breakdownResult[0] as unknown) as any[]).forEach((row: any) => {
    const type = row.activityType as keyof typeof breakdown;
    if (type in breakdown) {
      breakdown[type] = Number(row.count);
    }
  });

  return breakdown;
}

/**
 * Compare multiple cohorts
 */
export async function compareCohorts(cohorts: CohortDefinition[]): Promise<CohortMetrics[]> {
  const results: CohortMetrics[] = [];

  for (const cohort of cohorts) {
    const metrics = await analyzeCohort(cohort);
    results.push(metrics);
  }

  return results;
}
