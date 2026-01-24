import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../routers";
import { getDb } from "../db";
import type { inferProcedureInput } from "@trpc/server";
import type { AppRouter } from "../routers";

describe("Annotation Templates Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let mockUser: { id: number; openId: string; name: string; email: string; role: "user" | "admin" };

  beforeEach(async () => {
    // Create a mock user for testing
    mockUser = {
      id: 1,
      openId: "test-user-templates",
      name: "Test User",
      email: "test@example.com",
      role: "user",
    };

    // Create authenticated caller
    caller = appRouter.createCaller({
      user: mockUser,
      req: {} as any,
      res: {} as any,
    });
  });

  it("should save a new annotation template", async () => {
    const input: inferProcedureInput<AppRouter["annotationTemplates"]["saveTemplate"]> = {
      name: "Red Highlight Box",
      description: "A red rectangular highlight for important areas",
      templateData: {
        tool: "rectangle",
        color: "#FF0000",
        strokeWidth: 3,
      },
    };

    const result = await caller.annotationTemplates.saveTemplate(input);

    expect(result.success).toBe(true);
    expect(result.templateId).toBeDefined();
  });

  it("should retrieve all templates for the user", async () => {
    // First save a template
    await caller.annotationTemplates.saveTemplate({
      name: "Test Template 1",
      templateData: {
        tool: "circle",
        color: "#00FF00",
        strokeWidth: 2,
      },
    });

    await caller.annotationTemplates.saveTemplate({
      name: "Test Template 2",
      templateData: {
        tool: "arrow",
        color: "#0000FF",
        strokeWidth: 4,
      },
    });

    const templates = await caller.annotationTemplates.getTemplates();

    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.some((t) => t.name === "Test Template 1")).toBe(true);
    expect(templates.some((t) => t.name === "Test Template 2")).toBe(true);
  });

  it("should delete a template", async () => {
    // Save a template first
    const saveResult = await caller.annotationTemplates.saveTemplate({
      name: "Template to Delete",
      templateData: {
        tool: "pen",
        color: "#FFFF00",
        strokeWidth: 1,
      },
    });

    // Delete it
    const deleteResult = await caller.annotationTemplates.deleteTemplate({
      templateId: saveResult.templateId,
    });

    expect(deleteResult.success).toBe(true);

    // Verify it's deleted
    const templates = await caller.annotationTemplates.getTemplates();
    expect(templates.some((t) => t.id === saveResult.templateId)).toBe(false);
  });

  it("should apply a template and return its data", async () => {
    // Save a template first
    const saveResult = await caller.annotationTemplates.saveTemplate({
      name: "Template to Apply",
      templateData: {
        tool: "rectangle",
        color: "#FF00FF",
        strokeWidth: 5,
        text: "Sample text",
      },
    });

    // Apply it
    const templateData = await caller.annotationTemplates.applyTemplate({
      templateId: saveResult.templateId,
    });

    expect(templateData.tool).toBe("rectangle");
    expect(templateData.color).toBe("#FF00FF");
    expect(templateData.strokeWidth).toBe(5);
    expect(templateData.text).toBe("Sample text");
  });

  it("should not allow deleting another user's template", async () => {
    // Create another user's caller
    const otherUser = {
      id: 999,
      openId: "other-user",
      name: "Other User",
      email: "other@example.com",
      role: "user" as const,
    };

    const otherCaller = appRouter.createCaller({
      user: otherUser,
      req: {} as any,
      res: {} as any,
    });

    // Save a template as first user
    const saveResult = await caller.annotationTemplates.saveTemplate({
      name: "Protected Template",
      templateData: {
        tool: "circle",
        color: "#000000",
        strokeWidth: 2,
      },
    });

    // Try to delete as other user
    await expect(
      otherCaller.annotationTemplates.deleteTemplate({
        templateId: saveResult.templateId,
      })
    ).rejects.toThrow(/permission/);
  });
});
