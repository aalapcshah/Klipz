import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user",
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
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// Mock db module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getFileById: vi.fn(),
    getVisualCaptionByFileId: vi.fn(),
    createVisualCaption: vi.fn(),
    updateVisualCaption: vi.fn(),
    deleteVisualCaptionFileMatches: vi.fn(),
    getFilesByUserId: vi.fn(),
    searchVisualCaptions: vi.fn(),
    getAllVisualCaptionsByUser: vi.fn(),
    updateVisualCaptionFileMatchStatus: vi.fn(),
  };
});

// Mock LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

const db = await import("./db");
const { invokeLLM } = await import("./_core/llm");

describe("videoVisualCaptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCaptions", () => {
    it("returns null when no captions exist", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      (db.getVisualCaptionByFileId as any).mockResolvedValue(null);

      const result = await caller.videoVisualCaptions.getCaptions({ fileId: 1 });
      expect(result).toBeNull();
    });

    it("returns captions when they exist for the user", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const mockCaption = {
        id: 1,
        fileId: 1,
        userId: 1,
        status: "completed",
        captions: [
          { timestamp: 0, caption: "Test caption", entities: ["test"], confidence: 0.95 },
        ],
        totalFramesAnalyzed: 1,
      };
      (db.getVisualCaptionByFileId as any).mockResolvedValue(mockCaption);

      const result = await caller.videoVisualCaptions.getCaptions({ fileId: 1 });
      expect(result).toEqual(mockCaption);
    });

    it("throws FORBIDDEN when accessing another user's captions", async () => {
      const ctx = createAuthContext(2);
      const caller = appRouter.createCaller(ctx);

      const mockCaption = {
        id: 1,
        fileId: 1,
        userId: 1, // Different user
        status: "completed",
        captions: [],
      };
      (db.getVisualCaptionByFileId as any).mockResolvedValue(mockCaption);

      await expect(
        caller.videoVisualCaptions.getCaptions({ fileId: 1 })
      ).rejects.toThrow("You do not have permission to view these captions");
    });

    it("requires authentication", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.videoVisualCaptions.getCaptions({ fileId: 1 })
      ).rejects.toThrow("Please login");
    });
  });

  describe("editCaption", () => {
    it("updates a caption at the given timestamp", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const mockCaption = {
        id: 1,
        fileId: 1,
        userId: 1,
        status: "completed",
        captions: [
          { timestamp: 0, caption: "Original caption", entities: ["test"], confidence: 0.95 },
          { timestamp: 5, caption: "Second caption", entities: ["other"], confidence: 0.9 },
        ],
      };
      (db.getVisualCaptionByFileId as any).mockResolvedValue(mockCaption);
      (db.updateVisualCaption as any).mockResolvedValue(undefined);

      const result = await caller.videoVisualCaptions.editCaption({
        fileId: 1,
        timestamp: 0,
        newCaption: "Updated caption text",
      });

      expect(result.success).toBe(true);
      expect(result.updatedCaption.caption).toBe("Updated caption text");
      expect(db.updateVisualCaption).toHaveBeenCalledWith(1, {
        captions: expect.arrayContaining([
          expect.objectContaining({ timestamp: 0, caption: "Updated caption text" }),
        ]),
      });
    });

    it("throws NOT_FOUND when caption at timestamp doesn't exist", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const mockCaption = {
        id: 1,
        fileId: 1,
        userId: 1,
        status: "completed",
        captions: [
          { timestamp: 0, caption: "Original", entities: [], confidence: 0.9 },
        ],
      };
      (db.getVisualCaptionByFileId as any).mockResolvedValue(mockCaption);

      await expect(
        caller.videoVisualCaptions.editCaption({
          fileId: 1,
          timestamp: 999,
          newCaption: "Won't work",
        })
      ).rejects.toThrow("Caption at this timestamp not found");
    });

    it("throws FORBIDDEN when editing another user's captions", async () => {
      const ctx = createAuthContext(2);
      const caller = appRouter.createCaller(ctx);

      const mockCaption = {
        id: 1,
        fileId: 1,
        userId: 1,
        status: "completed",
        captions: [
          { timestamp: 0, caption: "Original", entities: [], confidence: 0.9 },
        ],
      };
      (db.getVisualCaptionByFileId as any).mockResolvedValue(mockCaption);

      await expect(
        caller.videoVisualCaptions.editCaption({
          fileId: 1,
          timestamp: 0,
          newCaption: "Hacked",
        })
      ).rejects.toThrow("You do not have permission to edit these captions");
    });
  });

  describe("exportSubtitles", () => {
    it("exports SRT format correctly", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const mockCaption = {
        id: 1,
        fileId: 1,
        userId: 1,
        status: "completed",
        captions: [
          { timestamp: 0, caption: "First caption", entities: [], confidence: 0.9 },
          { timestamp: 5, caption: "Second caption", entities: [], confidence: 0.85 },
        ],
      };
      (db.getVisualCaptionByFileId as any).mockResolvedValue(mockCaption);

      const result = await caller.videoVisualCaptions.exportSubtitles({
        fileId: 1,
        format: "srt",
      });

      expect(result.filename).toBe("captions_1.srt");
      expect(result.format).toBe("srt");
      expect(result.content).toContain("00:00:00,000 --> 00:00:05,000");
      expect(result.content).toContain("First caption");
      expect(result.content).toContain("Second caption");
      // SRT uses comma for millisecond separator
      expect(result.content).not.toContain("WEBVTT");
    });

    it("exports VTT format correctly", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const mockCaption = {
        id: 1,
        fileId: 1,
        userId: 1,
        status: "completed",
        captions: [
          { timestamp: 0, caption: "First caption", entities: [], confidence: 0.9 },
          { timestamp: 5, caption: "Second caption", entities: [], confidence: 0.85 },
        ],
      };
      (db.getVisualCaptionByFileId as any).mockResolvedValue(mockCaption);

      const result = await caller.videoVisualCaptions.exportSubtitles({
        fileId: 1,
        format: "vtt",
      });

      expect(result.filename).toBe("captions_1.vtt");
      expect(result.format).toBe("vtt");
      expect(result.content).toContain("WEBVTT");
      // VTT uses period for millisecond separator
      expect(result.content).toContain("00:00:00.000 --> 00:00:05.000");
      expect(result.content).toContain("First caption");
    });

    it("throws NOT_FOUND when no completed captions exist", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      (db.getVisualCaptionByFileId as any).mockResolvedValue(null);

      await expect(
        caller.videoVisualCaptions.exportSubtitles({ fileId: 1, format: "srt" })
      ).rejects.toThrow("Completed visual captions not found");
    });
  });

  describe("searchCaptions", () => {
    it("returns search results from db helper", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const mockResults = [
        {
          fileId: 1,
          filename: "test-video.mp4",
          title: "Test Video",
          url: "https://example.com/video.mp4",
          mimeType: "video/mp4",
          timestamp: 5,
          caption: "A man speaking about IRS",
          entities: ["IRS", "man"],
          confidence: 0.9,
        },
      ];
      (db.searchVisualCaptions as any).mockResolvedValue(mockResults);

      const result = await caller.videoVisualCaptions.searchCaptions({
        query: "IRS",
      });

      expect(result).toEqual(mockResults);
      expect(db.searchVisualCaptions).toHaveBeenCalledWith(1, "IRS");
    });

    it("requires non-empty query", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.videoVisualCaptions.searchCaptions({ query: "" })
      ).rejects.toThrow();
    });
  });

  describe("getAllCaptions", () => {
    it("returns all captions for the user", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const mockCaptions = [
        { id: 1, fileId: 1, userId: 1, status: "completed", totalFramesAnalyzed: 10 },
        { id: 2, fileId: 2, userId: 1, status: "completed", totalFramesAnalyzed: 5 },
      ];
      (db.getAllVisualCaptionsByUser as any).mockResolvedValue(mockCaptions);

      const result = await caller.videoVisualCaptions.getAllCaptions();
      expect(result).toEqual(mockCaptions);
      expect(db.getAllVisualCaptionsByUser).toHaveBeenCalledWith(1);
    });
  });

  describe("updateMatchStatus", () => {
    it("updates match status to accepted", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      (db.updateVisualCaptionFileMatchStatus as any).mockResolvedValue(undefined);

      const result = await caller.videoVisualCaptions.updateMatchStatus({
        matchId: 1,
        status: "accepted",
        feedback: "helpful",
      });

      expect(result.success).toBe(true);
      expect(db.updateVisualCaptionFileMatchStatus).toHaveBeenCalledWith(
        1,
        "accepted",
        "helpful"
      );
    });

    it("updates match status to dismissed", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      (db.updateVisualCaptionFileMatchStatus as any).mockResolvedValue(undefined);

      const result = await caller.videoVisualCaptions.updateMatchStatus({
        matchId: 2,
        status: "dismissed",
        feedback: "not_helpful",
      });

      expect(result.success).toBe(true);
      expect(db.updateVisualCaptionFileMatchStatus).toHaveBeenCalledWith(
        2,
        "dismissed",
        "not_helpful"
      );
    });
  });

  describe("generateCaptions", () => {
    it("throws NOT_FOUND when file doesn't exist", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      (db.getFileById as any).mockResolvedValue(null);

      await expect(
        caller.videoVisualCaptions.generateCaptions({ fileId: 999 })
      ).rejects.toThrow("Video file not found");
    });

    it("throws FORBIDDEN when accessing another user's file", async () => {
      const ctx = createAuthContext(2);
      const caller = appRouter.createCaller(ctx);

      (db.getFileById as any).mockResolvedValue({
        id: 1,
        userId: 1,
        mimeType: "video/mp4",
        url: "https://example.com/video.mp4",
      });

      await expect(
        caller.videoVisualCaptions.generateCaptions({ fileId: 1 })
      ).rejects.toThrow("You do not have permission to analyze this video");
    });

    it("throws BAD_REQUEST when file is not a video", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      (db.getFileById as any).mockResolvedValue({
        id: 1,
        userId: 1,
        mimeType: "image/png",
        url: "https://example.com/image.png",
      });

      await expect(
        caller.videoVisualCaptions.generateCaptions({ fileId: 1 })
      ).rejects.toThrow("File is not a video");
    });
  });
});
