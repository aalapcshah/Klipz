import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-open-id",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "user-open-id",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Admin Share Analytics", () => {
  describe("getShareAnalytics", () => {
    it("should allow admin users to access share analytics", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Should not throw for admin users
      const result = await caller.admin.getShareAnalytics();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("shares");
      expect(result).toHaveProperty("stats");
    });

    it("should deny access to non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.admin.getShareAnalytics()).rejects.toThrow();
    });

    it("should deny access to unauthenticated users", async () => {
      const ctx = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.admin.getShareAnalytics()).rejects.toThrow();
    });
  });

  describe("getShareAccessLogs", () => {
    it("should allow admin users to view access logs", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.admin.getShareAccessLogs({ shareLinkId: 1, limit: 50 });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should deny access to non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.admin.getShareAccessLogs({ shareLinkId: 1, limit: 50 })
      ).rejects.toThrow();
    });
  });

  describe("revokeShareLink", () => {
    it("should deny access to non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.admin.revokeShareLink({ id: 1 })
      ).rejects.toThrow();
    });

    it("should deny access to unauthenticated users", async () => {
      const ctx = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.admin.revokeShareLink({ id: 1 })
      ).rejects.toThrow();
    });
  });
});

describe("Admin System Overview", () => {
  describe("getSystemOverview", () => {
    it("should allow admin users to access system overview", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.admin.getSystemOverview();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("storage");
      expect(result).toHaveProperty("filesByType");
      expect(result).toHaveProperty("enrichmentStatus");
    });

    it("should deny access to non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.admin.getSystemOverview()).rejects.toThrow();
    });

    it("should deny access to unauthenticated users", async () => {
      const ctx = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.admin.getSystemOverview()).rejects.toThrow();
    });
  });
});
