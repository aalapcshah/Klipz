import { getDb } from "../db";
import { users, fileActivityLogs } from "../../drizzle/schema";
import { sql, gte, and, eq } from "drizzle-orm";

export interface EngagementMetrics {
  dau: number; // Daily Active Users
  wau: number; // Weekly Active Users
  mau: number; // Monthly Active Users
  retentionDay1: number; // % of users who return after 1 day
  retentionDay7: number; // % of users who return after 7 days
  retentionDay30: number; // % of users who return after 30 days
  featureAdoption: {
    feature: string;
    userCount: number;
    percentage: number;
  }[];
}

/**
 * Calculate Daily Active Users (last 24 hours)
 */
export async function calculateDAU(): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await database
    .select({
      count: sql<number>`COUNT(DISTINCT ${fileActivityLogs.userId})`,
    })
    .from(fileActivityLogs)
    .where(gte(fileActivityLogs.createdAt, oneDayAgo));

  return result[0]?.count || 0;
}

/**
 * Calculate Weekly Active Users (last 7 days)
 */
export async function calculateWAU(): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await database
    .select({
      count: sql<number>`COUNT(DISTINCT ${fileActivityLogs.userId})`,
    })
    .from(fileActivityLogs)
    .where(gte(fileActivityLogs.createdAt, sevenDaysAgo));

  return result[0]?.count || 0;
}

/**
 * Calculate Monthly Active Users (last 30 days)
 */
export async function calculateMAU(): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await database
    .select({
      count: sql<number>`COUNT(DISTINCT ${fileActivityLogs.userId})`,
    })
    .from(fileActivityLogs)
    .where(gte(fileActivityLogs.createdAt, thirtyDaysAgo));

  return result[0]?.count || 0;
}

/**
 * Calculate retention rate for a specific day
 */
async function calculateRetention(daysAgo: number): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  // Get users who signed up N days ago
  const signupDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const signupDateEnd = new Date(signupDate.getTime() + 24 * 60 * 60 * 1000);

  const signedUpUsersResult = await database
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(users)
    .where(
      and(
        gte(users.createdAt, signupDate),
        sql`${users.createdAt} < ${signupDateEnd}`
      )
    );

  const signedUpUsers = signedUpUsersResult[0]?.count || 0;

  if (signedUpUsers === 0) return 0;

  // Get users who returned after signup day
  const returnedUsersResult = await database
    .select({
      count: sql<number>`COUNT(DISTINCT ${users.id})`,
    })
    .from(users)
    .innerJoin(fileActivityLogs, eq(users.id, fileActivityLogs.userId))
    .where(
      and(
        gte(users.createdAt, signupDate),
        sql`${users.createdAt} < ${signupDateEnd}`,
        gte(fileActivityLogs.createdAt, signupDateEnd)
      )
    );

  const returnedUsers = returnedUsersResult[0]?.count || 0;

  return (returnedUsers / signedUpUsers) * 100;
}

/**
 * Calculate Day 1 retention
 */
export async function calculateRetentionDay1(): Promise<number> {
  return calculateRetention(1);
}

/**
 * Calculate Day 7 retention
 */
export async function calculateRetentionDay7(): Promise<number> {
  return calculateRetention(7);
}

/**
 * Calculate Day 30 retention
 */
export async function calculateRetentionDay30(): Promise<number> {
  return calculateRetention(30);
}

/**
 * Calculate feature adoption metrics
 */
export async function calculateFeatureAdoption(): Promise<
  { feature: string; userCount: number; percentage: number }[]
> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  // Get total users
  const totalUsersResult = await database
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(users);
  const totalUsers = totalUsersResult[0]?.count || 1; // Avoid division by zero

  // Get users per activity type (feature)
  const featureUsageRaw = await database
    .select({
      feature: fileActivityLogs.activityType,
      userCount: sql<number>`COUNT(DISTINCT ${fileActivityLogs.userId})`,
    })
    .from(fileActivityLogs)
    .groupBy(fileActivityLogs.activityType);

  return featureUsageRaw.map((item) => ({
    feature: item.feature,
    userCount: item.userCount,
    percentage: (item.userCount / totalUsers) * 100,
  }));
}

/**
 * Get all engagement metrics
 */
export async function getAllEngagementMetrics(): Promise<EngagementMetrics> {
  const [dau, wau, mau, retentionDay1, retentionDay7, retentionDay30, featureAdoption] =
    await Promise.all([
      calculateDAU(),
      calculateWAU(),
      calculateMAU(),
      calculateRetentionDay1(),
      calculateRetentionDay7(),
      calculateRetentionDay30(),
      calculateFeatureAdoption(),
    ]);

  return {
    dau,
    wau,
    mau,
    retentionDay1,
    retentionDay7,
    retentionDay30,
    featureAdoption,
  };
}

/**
 * Get engagement trends over time (last 30 days)
 */
export async function getEngagementTrends(): Promise<{
  dates: string[];
  dauTrend: number[];
}> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get daily active users for each day
  const result = await database.execute<{
    activity_date: string;
    user_count: number;
  }>(sql`
    SELECT 
      DATE(${fileActivityLogs.createdAt}) as activity_date,
      COUNT(DISTINCT ${fileActivityLogs.userId}) as user_count
    FROM ${fileActivityLogs}
    WHERE ${fileActivityLogs.createdAt} >= ${thirtyDaysAgo}
    GROUP BY activity_date
    ORDER BY activity_date
  `);

  const dailyActiveUsersRaw = result[0] as unknown as any[];
  const dates = dailyActiveUsersRaw.map((item: any) => item.activity_date);
  const dauTrend = dailyActiveUsersRaw.map((item: any) => Number(item.user_count));

  return {
    dates,
    dauTrend,
  };
}
