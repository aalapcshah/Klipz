import { describe, it, expect } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    role: "user",
  };

  return {
    user,
    req: {} as any,
    res: {} as any,
  };
}

describe("keyboardShortcuts router", () => {
  it("should get default shortcuts", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const defaults = await caller.keyboardShortcuts.getDefaults();
    expect(defaults).toBeDefined();
    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults[0]).toHaveProperty("action");
    expect(defaults[0]).toHaveProperty("key");
    expect(defaults[0]).toHaveProperty("modifiers");
  });

  it("should get user shortcuts (empty initially)", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const shortcuts = await caller.keyboardShortcuts.getShortcuts();
    expect(Array.isArray(shortcuts)).toBe(true);
  });

  it("should create a custom shortcut", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.keyboardShortcuts.upsertShortcut({
      action: "playPause",
      key: "p",
      modifiers: [],
    });

    expect(result).toBeDefined();
    expect(result.action).toBe("playPause");
    expect(result.key).toBe("p");
  });

  it("should update an existing shortcut", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create initial shortcut
    await caller.keyboardShortcuts.upsertShortcut({
      action: "addComment",
      key: "c",
      modifiers: [],
    });

    // Update it
    const updated = await caller.keyboardShortcuts.upsertShortcut({
      action: "addComment",
      key: "k",
      modifiers: ["ctrl"],
    });

    expect(updated.key).toBe("k");
    expect(updated.modifiers).toContain("ctrl");
  });

  it("should detect shortcut conflicts", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create a shortcut
    await caller.keyboardShortcuts.upsertShortcut({
      action: "approve",
      key: "a",
      modifiers: [],
    });

    // Check for conflict
    const conflict = await caller.keyboardShortcuts.checkConflict({
      key: "a",
      modifiers: [],
    });

    expect(conflict.hasConflict).toBe(true);
    expect(conflict.conflictingAction).toBe("approve");
  });

  it("should not detect conflict when excluding the same action", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create a shortcut
    await caller.keyboardShortcuts.upsertShortcut({
      action: "reject",
      key: "r",
      modifiers: [],
    });

    // Check for conflict while excluding the same action
    const conflict = await caller.keyboardShortcuts.checkConflict({
      key: "r",
      modifiers: [],
      excludeAction: "reject",
    });

    expect(conflict.hasConflict).toBe(false);
  });

  it("should delete a shortcut", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create a shortcut
    await caller.keyboardShortcuts.upsertShortcut({
      action: "toggleDrawing",
      key: "d",
      modifiers: [],
    });

    // Delete it
    const result = await caller.keyboardShortcuts.deleteShortcut({
      action: "toggleDrawing",
    });

    expect(result.success).toBe(true);

    // Verify it's gone
    const shortcuts = await caller.keyboardShortcuts.getShortcuts();
    const found = shortcuts.find((s) => s.action === "toggleDrawing");
    expect(found).toBeUndefined();
  });

  it("should reset all shortcuts to defaults", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create some custom shortcuts
    await caller.keyboardShortcuts.upsertShortcut({
      action: "undo",
      key: "u",
      modifiers: ["ctrl"],
    });
    await caller.keyboardShortcuts.upsertShortcut({
      action: "redo",
      key: "r",
      modifiers: ["ctrl"],
    });

    // Reset all
    const result = await caller.keyboardShortcuts.resetToDefaults();
    expect(result.success).toBe(true);

    // Verify all are gone
    const shortcuts = await caller.keyboardShortcuts.getShortcuts();
    expect(shortcuts.length).toBe(0);
  });
});
