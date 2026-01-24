import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

describe("Files Pagination", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testUserId: number;

  beforeAll(async () => {
    // Create test user
    await db.upsertUser({
      openId: "test-pagination-user",
      name: "Pagination Test User",
      email: "pagination@test.com",
      avatarUrl: null,
    });

    const user = await db.getUserByOpenId("test-pagination-user");
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;

    const ctx: TrpcContext = {
      user: {
        id: testUserId,
        openId: "test-pagination-user",
        name: "Pagination Test User",
        email: "pagination@test.com",
        role: "user",
        loginMethod: "manus",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    caller = appRouter.createCaller(ctx);
  });

  it("should return paginated files with correct structure", async () => {
    const result = await caller.files.list({ page: 1, pageSize: 10 });

    expect(result).toHaveProperty("files");
    expect(result).toHaveProperty("pagination");
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.pagination).toHaveProperty("page");
    expect(result.pagination).toHaveProperty("pageSize");
    expect(result.pagination).toHaveProperty("totalCount");
    expect(result.pagination).toHaveProperty("totalPages");
  });

  it("should respect page size parameter", async () => {
    const result = await caller.files.list({ page: 1, pageSize: 5 });

    expect(result.pagination.pageSize).toBe(5);
    expect(result.files.length).toBeLessThanOrEqual(5);
  });

  it("should calculate total pages correctly", async () => {
    const result = await caller.files.list({ page: 1, pageSize: 10 });

    const expectedTotalPages = Math.ceil(result.pagination.totalCount / 10);
    expect(result.pagination.totalPages).toBe(expectedTotalPages);
  });

  it("should default to page 1 and pageSize 50 when not specified", async () => {
    const result = await caller.files.list();

    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(50);
  });

  it("should handle different page sizes (25, 50, 100)", async () => {
    const sizes = [25, 50, 100];

    for (const size of sizes) {
      const result = await caller.files.list({ page: 1, pageSize: size });
      expect(result.pagination.pageSize).toBe(size);
      expect(result.files.length).toBeLessThanOrEqual(size);
    }
  });
});

describe("Onboarding Tutorial", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testUserId: number;

  beforeAll(async () => {
    // Create test user
    await db.upsertUser({
      openId: "test-onboarding-user",
      name: "Onboarding Test User",
      email: "onboarding@test.com",
      avatarUrl: null,
    });

    const user = await db.getUserByOpenId("test-onboarding-user");
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;

    const ctx: TrpcContext = {
      user: {
        id: testUserId,
        openId: "test-onboarding-user",
        name: "Onboarding Test User",
        email: "onboarding@test.com",
        role: "user",
        loginMethod: "manus",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    caller = appRouter.createCaller(ctx);
  });

  it("should get onboarding progress", async () => {
    const progress = await caller.onboarding.getProgress();

    expect(progress).toHaveProperty("userId");
    expect(progress).toHaveProperty("tutorialCompleted");
    expect(typeof progress.tutorialCompleted).toBe("boolean");
  });

  it("should update tutorial progress", async () => {
    const result = await caller.onboarding.updateProgress({
      tutorialCompleted: true,
    });

    expect(result.success).toBe(true);

    const progress = await caller.onboarding.getProgress();
    expect(progress.tutorialCompleted).toBe(true);
  });

  it("should restart tutorial", async () => {
    // First mark as completed
    await caller.onboarding.updateProgress({ tutorialCompleted: true });

    // Then restart
    const result = await caller.onboarding.restartTutorial();
    expect(result.success).toBe(true);

    const progress = await caller.onboarding.getProgress();
    expect(progress.tutorialCompleted).toBe(false);
  });
});

describe("Videos Pagination", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testUserId: number;

  beforeAll(async () => {
    // Create test user
    await db.upsertUser({
      openId: "test-videos-pagination-user",
      name: "Videos Pagination Test User",
      email: "videos-pagination@test.com",
      avatarUrl: null,
    });

    const user = await db.getUserByOpenId("test-videos-pagination-user");
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;

    const ctx: TrpcContext = {
      user: {
        id: testUserId,
        openId: "test-videos-pagination-user",
        name: "Videos Pagination Test User",
        email: "videos-pagination@test.com",
        role: "user",
        loginMethod: "manus",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    caller = appRouter.createCaller(ctx);
  });

  it("should return paginated videos with correct structure", async () => {
    const result = await caller.videos.list({ page: 1, pageSize: 10 });

    expect(result).toHaveProperty("videos");
    expect(result).toHaveProperty("pagination");
    expect(Array.isArray(result.videos)).toBe(true);
    expect(result.pagination).toHaveProperty("page");
    expect(result.pagination).toHaveProperty("pageSize");
    expect(result.pagination).toHaveProperty("totalCount");
    expect(result.pagination).toHaveProperty("totalPages");
  });

  it("should default to page 1 and pageSize 50 when not specified", async () => {
    const result = await caller.videos.list();

    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(50);
  });
});

describe("Bulk Selection Across Pages", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testUserId: number;

  beforeAll(async () => {
    // Create test user
    await db.upsertUser({
      openId: "test-bulk-selection-user",
      name: "Bulk Selection Test User",
      email: "bulk-selection@test.com",
      avatarUrl: null,
    });

    const user = await db.getUserByOpenId("test-bulk-selection-user");
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;

    const ctx: TrpcContext = {
      user: {
        id: testUserId,
        openId: "test-bulk-selection-user",
        name: "Bulk Selection Test User",
        email: "bulk-selection@test.com",
        role: "user",
        loginMethod: "manus",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    caller = appRouter.createCaller(ctx);
  });

  it("should return all file IDs for bulk selection", async () => {
    const allIds = await caller.files.getAllIds();

    expect(Array.isArray(allIds)).toBe(true);
    // Each ID should be a number
    allIds.forEach(id => {
      expect(typeof id).toBe("number");
    });
  });

  it("should return all file IDs matching collection filter", async () => {
    // This test assumes collections exist; if not, it will just return empty array
    const allIds = await caller.files.getAllIds({ collectionId: 1 });

    expect(Array.isArray(allIds)).toBe(true);
  });
});
