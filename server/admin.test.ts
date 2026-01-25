import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Admin Functions", () => {
  let adminUserId: number;
  let regularUserId: number;

  beforeAll(async () => {
    // Create admin user
    const adminUser = {
      openId: `test-admin-${Date.now()}`,
      name: "Admin User",
      email: "admin@example.com",
    };
    await db.upsertUser(adminUser);
    const admin = await db.getUserByOpenId(adminUser.openId);
    if (!admin) throw new Error("Failed to create admin user");
    adminUserId = admin.id;

    // Manually set admin role (in real app, this would be done through admin panel)
    const database = await db.getDb();
    if (!database) throw new Error("Database not available");
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    await database.update(users).set({ role: "admin" }).where(eq(users.id, adminUserId));

    // Create regular user
    const regularUser = {
      openId: `test-regular-${Date.now()}`,
      name: "Regular User",
      email: "regular@example.com",
    };
    await db.upsertUser(regularUser);
    const regular = await db.getUserByOpenId(regularUser.openId);
    if (!regular) throw new Error("Failed to create regular user");
    regularUserId = regular.id;
  });

  it("should get system statistics", async () => {
    const database = await db.getDb();
    if (!database) throw new Error("Database not available");

    const { users, files, fileActivityLogs } = await import("../drizzle/schema");
    const { sql } = await import("drizzle-orm");

    // Get total users
    const totalUsersResult = await database
      .select({ count: sql<number>`COUNT(*)` })
      .from(users);
    const totalUsers = totalUsersResult[0]?.count || 0;

    // Get total files
    const totalFilesResult = await database
      .select({ count: sql<number>`COUNT(*)` })
      .from(files);
    const totalFiles = totalFilesResult[0]?.count || 0;

    // Get total activities
    const totalActivitiesResult = await database
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileActivityLogs);
    const totalActivities = totalActivitiesResult[0]?.count || 0;

    expect(totalUsers).toBeGreaterThan(0);
    expect(typeof totalFiles).toBe("number");
    expect(typeof totalActivities).toBe("number");
  });

  it("should get all users with statistics", async () => {
    const database = await db.getDb();
    if (!database) throw new Error("Database not available");

    const { users } = await import("../drizzle/schema");
    const { desc } = await import("drizzle-orm");

    const usersList = await database
      .select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(10);

    expect(usersList.length).toBeGreaterThan(0);
    expect(usersList[0]).toHaveProperty("id");
    expect(usersList[0]).toHaveProperty("name");
    expect(usersList[0]).toHaveProperty("role");
  });

  it("should get user statistics", async () => {
    const database = await db.getDb();
    if (!database) throw new Error("Database not available");

    const { users, files, fileActivityLogs } = await import("../drizzle/schema");
    const { eq, sql } = await import("drizzle-orm");

    // Get user info
    const [user] = await database
      .select()
      .from(users)
      .where(eq(users.id, regularUserId))
      .limit(1);

    expect(user).toBeDefined();
    expect(user.id).toBe(regularUserId);

    // Get file count
    const fileCountResult = await database
      .select({ count: sql<number>`COUNT(*)` })
      .from(files)
      .where(eq(files.userId, regularUserId));
    const fileCount = fileCountResult[0]?.count || 0;

    expect(typeof fileCount).toBe("number");
  });

  it("should update user role", async () => {
    const database = await db.getDb();
    if (!database) throw new Error("Database not available");

    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // Update role to admin
    await database
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, regularUserId));

    // Verify update
    const [updatedUser] = await database
      .select()
      .from(users)
      .where(eq(users.id, regularUserId))
      .limit(1);

    expect(updatedUser.role).toBe("admin");

    // Restore to user
    await database
      .update(users)
      .set({ role: "user" })
      .where(eq(users.id, regularUserId));
  });

  it("should verify admin role exists", async () => {
    const database = await db.getDb();
    if (!database) throw new Error("Database not available");

    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const [admin] = await database
      .select()
      .from(users)
      .where(eq(users.id, adminUserId))
      .limit(1);

    expect(admin).toBeDefined();
    expect(admin.role).toBe("admin");
  });
});
