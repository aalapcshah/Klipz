import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { files, fileVersions, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("File Versioning", () => {
  let testUserId: number;
  let testFileId: number;
  let caller: any;

  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up test data
    await db.delete(fileVersions).where(eq(fileVersions.userId, 99999));
    await db.delete(files).where(eq(files.userId, 99999));
    await db.delete(users).where(eq(users.id, 99999));

    // Create test user
    await db.insert(users).values({
      id: 99999,
      openId: "test-version-user",
      name: "Version Test User",
      email: "version@test.com",
      role: "user",
    });
    testUserId = 99999;

    // Create test file
    await db.insert(files).values({
      id: 99999,
      userId: testUserId,
      fileKey: "test-file-key",
      url: "https://example.com/test.jpg",
      filename: "test.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024,
      title: "Test File",
      description: "Original description",
      enrichmentStatus: "pending",
    });
    testFileId = 99999;

    // Create caller with test user context
    caller = appRouter.createCaller({
      user: {
        id: testUserId,
        openId: "test-version-user",
        name: "Version Test User",
        email: "version@test.com",
        role: "user",
      },
      req: {} as any,
      res: {} as any,
    });
  });

  it("should create a version snapshot", async () => {
    const result = await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Initial version",
    });

    expect(result.success).toBe(true);
    expect(result.versionNumber).toBe(1);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const versions = await db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, testFileId));

    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].changeDescription).toBe("Initial version");
    expect(versions[0].filename).toBe("test.jpg");
    expect(versions[0].title).toBe("Test File");
  });

  it("should list all versions for a file", async () => {
    // Create multiple versions
    await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Version 1",
    });
    await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Version 2",
    });
    await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Version 3",
    });

    const result = await caller.fileVersions.list({ fileId: testFileId });

    expect(result.versions).toHaveLength(3);
    // Should be ordered by version number descending
    expect(result.versions[0].versionNumber).toBe(3);
    expect(result.versions[1].versionNumber).toBe(2);
    expect(result.versions[2].versionNumber).toBe(1);
  });

  it("should restore a previous version", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create initial version
    await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Version 1",
    });

    // Update file
    await db.update(files)
      .set({
        title: "Updated Title",
        description: "Updated description",
      })
      .where(eq(files.id, testFileId));

    // Create second version
    await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Version 2 with updates",
    });

    // Get version 1 ID
    const versions = await db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, testFileId));
    const version1 = versions.find(v => v.versionNumber === 1);
    if (!version1) throw new Error("Version 1 not found");

    // Restore version 1
    const result = await caller.fileVersions.restore({
      fileId: testFileId,
      versionId: version1.id,
    });

    expect(result.success).toBe(true);

    // Check that file was restored
    const [restoredFile] = await db
      .select()
      .from(files)
      .where(eq(files.id, testFileId));

    expect(restoredFile.title).toBe("Test File"); // Original title
    expect(restoredFile.description).toBe("Original description"); // Original description

    // Check that backup version was created
    const allVersions = await db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, testFileId));

    expect(allVersions).toHaveLength(3); // 2 original + 1 backup
    const backupVersion = allVersions.find(v => 
      v.changeDescription?.includes("Backup before restoring")
    );
    expect(backupVersion).toBeDefined();
  });

  it("should increment version numbers correctly", async () => {
    // Create 5 versions
    for (let i = 1; i <= 5; i++) {
      const result = await caller.fileVersions.create({
        fileId: testFileId,
        changeDescription: `Version ${i}`,
      });
      expect(result.versionNumber).toBe(i);
    }

    const result = await caller.fileVersions.list({ fileId: testFileId });
    expect(result.versions).toHaveLength(5);
    expect(result.versions[0].versionNumber).toBe(5);
    expect(result.versions[4].versionNumber).toBe(1);
  });

  it("should prevent unauthorized access to versions", async () => {
    // Create version as test user
    await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Test version",
    });

    // Create another user
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(users).values({
      id: 99998,
      openId: "other-user",
      name: "Other User",
      email: "other@test.com",
      role: "user",
    });

    // Create caller with different user
    const otherCaller = appRouter.createCaller({
      user: {
        id: 99998,
        openId: "other-user",
        name: "Other User",
        email: "other@test.com",
        role: "user",
      },
      req: {} as any,
      res: {} as any,
    });

    // Try to list versions - should fail
    await expect(
      otherCaller.fileVersions.list({ fileId: testFileId })
    ).rejects.toThrow();

    // Try to create version - should fail
    await expect(
      otherCaller.fileVersions.create({
        fileId: testFileId,
        changeDescription: "Unauthorized",
      })
    ).rejects.toThrow();

    // Clean up
    await db.delete(users).where(eq(users.id, 99998));
  });

  it("should capture all file metadata in version snapshot", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Update file with rich metadata
    await db.update(files)
      .set({
        aiAnalysis: "AI detected a landscape photo",
        ocrText: "Some text from OCR",
        detectedObjects: JSON.stringify(["tree", "mountain", "sky"]),
      })
      .where(eq(files.id, testFileId));

    // Create version
    await caller.fileVersions.create({
      fileId: testFileId,
      changeDescription: "Version with metadata",
    });

    // Check version has all metadata
    const versions = await db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, testFileId));

    expect(versions).toHaveLength(1);
    expect(versions[0].aiAnalysis).toBe("AI detected a landscape photo");
    expect(versions[0].ocrText).toBe("Some text from OCR");
    expect(versions[0].detectedObjects).toBeDefined();
  });

  it("should handle empty version list", async () => {
    const result = await caller.fileVersions.list({ fileId: testFileId });
    expect(result.versions).toHaveLength(0);
  });

  it("should use default change description when not provided", async () => {
    const result = await caller.fileVersions.create({
      fileId: testFileId,
    });

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const versions = await db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, testFileId));

    expect(versions[0].changeDescription).toBe("Version 1");
  });
});
