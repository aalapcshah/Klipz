import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "../routers";
import type { Context } from "../_core/context";
import { getDb } from "../db";
import { annotationTemplates } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Annotation Templates Sharing", () => {
  const mockUser1 = {
    id: 1001,
    openId: "test-user-1",
    name: "User One",
    email: "user1@example.com",
    role: "user" as const,
  };

  const mockUser2 = {
    id: 1002,
    openId: "test-user-2",
    name: "User Two",
    email: "user2@example.com",
    role: "user" as const,
  };

  const mockContext1: Context = {
    user: mockUser1,
    req: {} as any,
    res: {} as any,
  };

  const mockContext2: Context = {
    user: mockUser2,
    req: {} as any,
    res: {} as any,
  };

  const caller1 = appRouter.createCaller(mockContext1);
  const caller2 = appRouter.createCaller(mockContext2);

  let privateTemplateId: number;
  let publicTemplateId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up test data
    await db.delete(annotationTemplates).where(eq(annotationTemplates.userId, mockUser1.id));
    await db.delete(annotationTemplates).where(eq(annotationTemplates.userId, mockUser2.id));
  });

  it("should create a private template by default", async () => {
    const result = await caller1.annotationTemplates.saveTemplate({
      name: "Private Template",
      description: "This is private",
      templateData: {
        tool: "pen",
        color: "#ff0000",
        strokeWidth: 2,
      },
    });

    expect(result.success).toBe(true);
    privateTemplateId = result.templateId;

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [template] = await db
      .select()
      .from(annotationTemplates)
      .where(eq(annotationTemplates.id, privateTemplateId))
      .limit(1);

    expect(template.visibility).toBe("private");
  });

  it("should update template visibility to public", async () => {
    await caller1.annotationTemplates.updateVisibility({
      templateId: privateTemplateId,
      visibility: "public",
    });

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [template] = await db
      .select()
      .from(annotationTemplates)
      .where(eq(annotationTemplates.id, privateTemplateId))
      .limit(1);

    expect(template.visibility).toBe("public");
    publicTemplateId = privateTemplateId;
  });

  it("should not allow non-owner to change visibility", async () => {
    await expect(
      caller2.annotationTemplates.updateVisibility({
        templateId: publicTemplateId,
        visibility: "private",
      })
    ).rejects.toThrow(/permission/i);
  });

  it("should get public templates", async () => {
    const publicTemplates = await caller2.annotationTemplates.getPublicTemplates();

    expect(publicTemplates.length).toBeGreaterThan(0);
    const found = publicTemplates.find((t) => t.id === publicTemplateId);
    expect(found).toBeDefined();
    expect(found?.name).toBe("Private Template"); // now public
  });

  it("should increment template usage count", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [before] = await db
      .select()
      .from(annotationTemplates)
      .where(eq(annotationTemplates.id, publicTemplateId))
      .limit(1);

    const initialCount = before.usageCount;

    await caller2.annotationTemplates.incrementUsage({
      templateId: publicTemplateId,
    });

    const [after] = await db
      .select()
      .from(annotationTemplates)
      .where(eq(annotationTemplates.id, publicTemplateId))
      .limit(1);

    expect(after.usageCount).toBe(initialCount + 1);
  });

  it("should get templates including shared ones", async () => {
    // User 2 creates their own template
    await caller2.annotationTemplates.saveTemplate({
      name: "User 2 Template",
      templateData: {
        tool: "circle",
        color: "#00ff00",
        strokeWidth: 3,
      },
    });

    const templates = await caller2.annotationTemplates.getTemplates({ includeShared: true });

    // Should have at least user 2's own template
    expect(templates.length).toBeGreaterThan(0);
    const ownTemplate = templates.find((t) => t.name === "User 2 Template");
    expect(ownTemplate).toBeDefined();
  });

  it("should limit public templates query", async () => {
    // Create multiple public templates
    for (let i = 0; i < 5; i++) {
      const result = await caller1.annotationTemplates.saveTemplate({
        name: `Public Template ${i}`,
        templateData: {
          tool: "rectangle",
          color: "#0000ff",
          strokeWidth: 1,
        },
      });

      await caller1.annotationTemplates.updateVisibility({
        templateId: result.templateId,
        visibility: "public",
      });
    }

    const limited = await caller2.annotationTemplates.getPublicTemplates({ limit: 3 });

    expect(limited.length).toBeLessThanOrEqual(3);
  });

  it("should order public templates by usage count", async () => {
    const templates = await caller2.annotationTemplates.getPublicTemplates({ limit: 10 });

    // Check if ordered by usage count (descending or equal)
    // Note: newly created templates will have usageCount = 0
    for (let i = 0; i < templates.length - 1; i++) {
      expect(templates[i].usageCount).toBeGreaterThanOrEqual(templates[i + 1].usageCount);
    }
    
    // Verify that the template we incremented earlier has higher usage count
    const incrementedTemplate = templates.find((t) => t.id === publicTemplateId);
    expect(incrementedTemplate).toBeDefined();
    expect(incrementedTemplate!.usageCount).toBeGreaterThan(0);
  });

  it("should not show private templates in public list", async () => {
    // Create a private template
    const result = await caller1.annotationTemplates.saveTemplate({
      name: "Secret Template",
      templateData: {
        tool: "pen",
        color: "#000000",
        strokeWidth: 5,
      },
    });

    // Ensure it's private
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [template] = await db
      .select()
      .from(annotationTemplates)
      .where(eq(annotationTemplates.id, result.templateId))
      .limit(1);

    expect(template.visibility).toBe("private");

    // Check public templates
    const publicTemplates = await caller2.annotationTemplates.getPublicTemplates();
    const found = publicTemplates.find((t) => t.id === result.templateId);

    expect(found).toBeUndefined();
  });
});
