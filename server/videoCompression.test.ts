import { describe, it, expect, vi, beforeEach } from "vitest";
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
    getDb: vi.fn(),
  };
});

// Mock storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "compressed-key", url: "https://s3.example.com/compressed.mp4" }),
  storageGet: vi.fn().mockResolvedValue({ key: "original-key", url: "https://s3.example.com/original.mp4" }),
}));

// Mock child_process spawn and exec for FFmpeg
vi.mock("child_process", async () => {
  const actual = await vi.importActual("child_process");
  return {
    ...actual,
    spawn: vi.fn(),
    exec: vi.fn((cmd: string, cb: Function) => cb(null, "", "")),
  };
});

// Mock fs module
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    mkdtempSync: vi.fn().mockReturnValue("/tmp/video-compress-test"),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from("compressed-data")),
    statSync: vi.fn().mockReturnValue({ size: 1000000 }),
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
    rmdirSync: vi.fn(),
  };
});

const db = await import("./db");

describe("videoCompression", () => {
  const caller = appRouter.createCaller(createAuthContext());
  const unauthCaller = appRouter.createCaller(createUnauthContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPresets", () => {
    it("should return compression presets for authenticated user", async () => {
      const presets = await caller.videoCompression.getPresets();

      expect(presets).toBeInstanceOf(Array);
      expect(presets.length).toBe(3);

      const keys = presets.map((p) => p.key);
      expect(keys).toContain("high");
      expect(keys).toContain("medium");
      expect(keys).toContain("low");

      // Each preset should have required fields
      for (const preset of presets) {
        expect(preset).toHaveProperty("key");
        expect(preset).toHaveProperty("label");
        expect(preset).toHaveProperty("maxResolution");
        expect(preset).toHaveProperty("videoBitrate");
        expect(preset).toHaveProperty("audioBitrate");
      }
    });

    it("should include audio bitrate in all presets", async () => {
      const presets = await caller.videoCompression.getPresets();

      for (const preset of presets) {
        expect(preset.audioBitrate).toBeTruthy();
        expect(preset.audioBitrate).toMatch(/\d+k/);
      }
    });

    it("should reject unauthenticated requests", async () => {
      await expect(
        unauthCaller.videoCompression.getPresets()
      ).rejects.toThrow();
    });
  });

  describe("compress", () => {
    it("should reject unauthenticated requests", async () => {
      await expect(
        unauthCaller.videoCompression.compress({
          fileId: 1,
          quality: "medium",
        })
      ).rejects.toThrow();
    });

    it("should reject when database is not available", async () => {
      (db.getDb as any).mockResolvedValue(null);

      await expect(
        caller.videoCompression.compress({
          fileId: 1,
          quality: "medium",
        })
      ).rejects.toThrow("Database not available");
    });

    it("should reject when file is not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      await expect(
        caller.videoCompression.compress({
          fileId: 99999,
          quality: "medium",
        })
      ).rejects.toThrow("File not found");
    });

    it("should reject when file is not a video", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 1,
                userId: 1,
                fileKey: "test-key",
                url: "https://example.com/file.pdf",
                filename: "document.pdf",
                mimeType: "application/pdf",
                fileSize: 5000000,
              },
            ]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      await expect(
        caller.videoCompression.compress({
          fileId: 1,
          quality: "medium",
        })
      ).rejects.toThrow("File is not a video");
    });

    it("should start compression for a valid video file", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 1,
                userId: 1,
                fileKey: "user-1/videos/test.mp4",
                url: "https://s3.example.com/test.mp4",
                filename: "test.mp4",
                mimeType: "video/mp4",
                fileSize: 50000000,
              },
            ]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const result = await caller.videoCompression.compress({
        fileId: 1,
        quality: "medium",
      });

      expect(result).toEqual({ started: true, fileId: 1 });
    });

    it("should validate quality input", async () => {
      await expect(
        caller.videoCompression.compress({
          fileId: 1,
          quality: "invalid" as any,
        })
      ).rejects.toThrow();
    });
  });

  describe("getStatus", () => {
    it("should return idle status for unknown file", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const status = await caller.videoCompression.getStatus({
        fileId: 99999,
      });

      expect(status.status).toBe("idle");
      expect(status.progress).toBe(0);
    });

    it("should reject unauthenticated requests", async () => {
      await expect(
        unauthCaller.videoCompression.getStatus({ fileId: 1 })
      ).rejects.toThrow();
    });

    it("should return completed status from database", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                compressionStatus: "completed",
                compressedSize: 25000000,
                fileSize: 50000000,
              },
            ]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const status = await caller.videoCompression.getStatus({
        fileId: 100,
      });

      expect(status.status).toBe("complete");
      expect(status.progress).toBe(100);
    });

    it("should return failed status from database", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                compressionStatus: "failed",
                compressedSize: null,
                fileSize: 50000000,
              },
            ]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const status = await caller.videoCompression.getStatus({
        fileId: 101,
      });

      expect(status.status).toBe("failed");
    });
  });

  describe("getBatchStatus", () => {
    it("should return empty object for unknown files", async () => {
      const statuses = await caller.videoCompression.getBatchStatus({
        fileIds: [99998, 99997],
      });

      expect(statuses).toEqual({});
    });

    it("should reject unauthenticated requests", async () => {
      await expect(
        unauthCaller.videoCompression.getBatchStatus({ fileIds: [1, 2] })
      ).rejects.toThrow();
    });
  });

  describe("estimateSize", () => {
    it("should return size estimate for a video file", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                fileSize: 100000000, // 100MB
                mimeType: "video/mp4",
                filename: "test.mp4",
              },
            ]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const estimate = await caller.videoCompression.estimateSize({
        fileId: 1,
        quality: "medium",
      });

      expect(estimate.originalSize).toBe(100000000);
      expect(estimate.estimatedSize).toBeLessThan(100000000);
      expect(estimate.savings).toBeGreaterThan(0);
      expect(estimate.quality).toBe("medium");
      expect(estimate.preset).toBeTruthy();
    });

    it("should return higher savings for lower quality", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                fileSize: 100000000,
                mimeType: "video/mp4",
                filename: "test.mp4",
              },
            ]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const highEstimate = await caller.videoCompression.estimateSize({
        fileId: 1,
        quality: "high",
      });
      const lowEstimate = await caller.videoCompression.estimateSize({
        fileId: 1,
        quality: "low",
      });

      expect(lowEstimate.savings).toBeGreaterThan(highEstimate.savings);
      expect(lowEstimate.estimatedSize).toBeLessThan(highEstimate.estimatedSize);
    });

    it("should reject for non-video files", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                fileSize: 5000000,
                mimeType: "image/jpeg",
                filename: "photo.jpg",
              },
            ]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      await expect(
        caller.videoCompression.estimateSize({
          fileId: 1,
          quality: "medium",
        })
      ).rejects.toThrow("File is not a video");
    });

    it("should reject unauthenticated requests", async () => {
      await expect(
        unauthCaller.videoCompression.estimateSize({
          fileId: 1,
          quality: "medium",
        })
      ).rejects.toThrow();
    });
  });

  describe("batchCompress", () => {
    it("should reject unauthenticated requests", async () => {
      await expect(
        unauthCaller.videoCompression.batchCompress({
          fileIds: [1, 2],
          quality: "medium",
        })
      ).rejects.toThrow();
    });

    it("should reject when database is not available", async () => {
      (db.getDb as any).mockResolvedValue(null);

      await expect(
        caller.videoCompression.batchCompress({
          fileIds: [1, 2],
          quality: "medium",
        })
      ).rejects.toThrow("Database not available");
    });

    it("should start compression for multiple valid video files", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 1,
                userId: 1,
                fileKey: "user-1/videos/test1.mp4",
                url: "https://s3.example.com/test1.mp4",
                filename: "test1.mp4",
                mimeType: "video/mp4",
                fileSize: 50000000,
              },
            ]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const result = await caller.videoCompression.batchCompress({
        fileIds: [1, 2],
        quality: "medium",
      });

      expect(result.totalCount).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.startedCount).toBeGreaterThanOrEqual(1);
    });

    it("should handle mix of valid and invalid files", async () => {
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([
                  {
                    id: 1,
                    userId: 1,
                    fileKey: "user-1/videos/test1.mp4",
                    url: "https://s3.example.com/test1.mp4",
                    filename: "test1.mp4",
                    mimeType: "video/mp4",
                    fileSize: 50000000,
                  },
                ]);
              }
              // Second file not found
              return Promise.resolve([]);
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const result = await caller.videoCompression.batchCompress({
        fileIds: [1, 2],
        quality: "high",
      });

      expect(result.totalCount).toBe(2);
      expect(result.results).toHaveLength(2);
      // At least one should have started, one should have failed
      const started = result.results.filter((r) => r.started);
      const failed = result.results.filter((r) => !r.started);
      expect(started.length).toBe(1);
      expect(failed.length).toBe(1);
      expect(failed[0].error).toBe("File not found");
    });

    it("should validate quality input", async () => {
      await expect(
        caller.videoCompression.batchCompress({
          fileIds: [1],
          quality: "invalid" as any,
        })
      ).rejects.toThrow();
    });

    it("should require at least one fileId", async () => {
      await expect(
        caller.videoCompression.batchCompress({
          fileIds: [],
          quality: "medium",
        })
      ).rejects.toThrow();
    });
  });

  describe("revert", () => {
    it("should reject unauthenticated requests", async () => {
      await expect(
        unauthCaller.videoCompression.revert({ fileId: 1 })
      ).rejects.toThrow();
    });

    it("should reject when database is not available", async () => {
      (db.getDb as any).mockResolvedValue(null);

      await expect(
        caller.videoCompression.revert({ fileId: 1 })
      ).rejects.toThrow("Database not available");
    });

    it("should reject when file is not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      await expect(
        caller.videoCompression.revert({ fileId: 99999 })
      ).rejects.toThrow("File not found");
    });

    it("should reject when no original file to revert to", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 1,
                userId: 1,
                fileKey: "current-key",
                url: "https://example.com/current.mp4",
                originalFileKey: null,
                originalUrl: null,
                fileSize: 50000000,
              },
            ]),
          }),
        }),
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      await expect(
        caller.videoCompression.revert({ fileId: 1 })
      ).rejects.toThrow("No original file to revert to");
    });

    it("should revert to original file when original exists", async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      });
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn()
              .mockResolvedValueOnce([
                {
                  id: 1,
                  userId: 1,
                  fileKey: "compressed-key",
                  url: "https://example.com/compressed.mp4",
                  originalFileKey: "original-key",
                  originalUrl: "https://example.com/original.mp4",
                  fileSize: 50000000,
                },
              ])
              // Second call for video record lookup
              .mockResolvedValueOnce([]),
          }),
        }),
        update: mockUpdate,
      };
      (db.getDb as any).mockResolvedValue(mockDb);

      const result = await caller.videoCompression.revert({ fileId: 1 });

      expect(result).toEqual({ reverted: true });
      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});
