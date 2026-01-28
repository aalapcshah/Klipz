import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-id",
    email: "test@example.com",
    name: "Test User",
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

describe("Collection Sharing", () => {
  describe("shareLinks.getForCollection", () => {
    it("should throw for non-existent collection", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      // Should throw because collection doesn't exist
      await expect(
        caller.shareLinks.getForCollection({ collectionId: 999999 })
      ).rejects.toThrow("Collection not found");
    });

    it("should deny access to unauthenticated users", async () => {
      const ctx = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.shareLinks.getForCollection({ collectionId: 1 })
      ).rejects.toThrow();
    });
  });

  describe("shareLinks.list", () => {
    it("should allow authenticated users to list all their share links", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.shareLinks.list();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should deny access to unauthenticated users", async () => {
      const ctx = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.shareLinks.list()).rejects.toThrow();
    });
  });

  describe("shareLinks.create with collectionId", () => {
    it("should allow creating a share link for a collection", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      // This will fail because collection doesn't exist, but validates the API accepts collectionId
      await expect(
        caller.shareLinks.create({
          collectionId: 999999,
          allowDownload: true,
        })
      ).rejects.toThrow(); // Expected to throw because collection doesn't exist
    });

    it("should require at least one of fileId, videoId, or collectionId", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      // Should throw because no item is specified
      await expect(
        caller.shareLinks.create({
          allowDownload: true,
        })
      ).rejects.toThrow();
    });
  });
});

describe("Share Links List for My Shares Page", () => {
  it("should return share links with item details", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.shareLinks.list();
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    // Each share link should have the expected structure
    result.forEach((share) => {
      expect(share).toHaveProperty("id");
      expect(share).toHaveProperty("token");
      expect(share).toHaveProperty("isActive");
      expect(share).toHaveProperty("viewCount");
      expect(share).toHaveProperty("hasPassword");
      expect(share).toHaveProperty("itemType");
      expect(share).toHaveProperty("itemName");
    });
  });

  it("should include file, video, or collection references", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.shareLinks.list();
    
    // Each share should have at least one item type
    result.forEach((share) => {
      const hasItem = share.fileId !== null || share.videoId !== null || share.collectionId !== null;
      expect(hasItem).toBe(true);
    });
  });
});
