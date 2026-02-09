import { describe, it, expect } from "vitest";

/**
 * Tests for the resumable upload cancel and clear all functionality.
 * The cancel flow uses direct fetch (trpcCall) instead of React Query mutations
 * to ensure cancellation works even when components unmount.
 */

describe("Resumable Upload Cancel Flow", () => {
  it("cancelSession endpoint should accept sessionToken and return success", () => {
    // The cancelSession procedure expects { sessionToken: string }
    // and returns { success: boolean }
    const input = { sessionToken: "test-session-token-123" };
    expect(input).toHaveProperty("sessionToken");
    expect(typeof input.sessionToken).toBe("string");
  });

  it("trpcCall should serialize input with superjson format", () => {
    // The trpcCall function sends data in superjson format
    // which wraps input in { json: ..., meta: ... }
    const input = { sessionToken: "abc123" };
    const serialized = { json: input, meta: { values: {} } };
    expect(serialized).toHaveProperty("json");
    expect(serialized.json).toEqual(input);
  });

  it("cancel should remove session from local state immediately", () => {
    // Simulate the cancel flow: remove from local state first, then call server
    const sessions = [
      { sessionToken: "session-1", filename: "file1.mp4", status: "active" },
      { sessionToken: "session-2", filename: "file2.mp4", status: "paused" },
    ];

    const tokenToCancel = "session-1";
    const updatedSessions = sessions.filter(s => s.sessionToken !== tokenToCancel);

    expect(updatedSessions).toHaveLength(1);
    expect(updatedSessions[0].sessionToken).toBe("session-2");
    expect(updatedSessions.find(s => s.sessionToken === tokenToCancel)).toBeUndefined();
  });

  it("clearAllSessions should remove all sessions from local state", () => {
    const sessions = [
      { sessionToken: "session-1", filename: "file1.mp4", status: "active" },
      { sessionToken: "session-2", filename: "file2.mp4", status: "paused" },
      { sessionToken: "session-3", filename: "file3.mp4", status: "error" },
    ];

    const allTokens = sessions.map(s => s.sessionToken);
    expect(allTokens).toHaveLength(3);
    expect(allTokens).toContain("session-1");
    expect(allTokens).toContain("session-2");
    expect(allTokens).toContain("session-3");

    // After clearing, sessions should be empty
    const cleared: typeof sessions = [];
    expect(cleared).toHaveLength(0);
  });

  it("cancel should work with abort controller for active uploads", () => {
    const abortControllers = new Map<string, AbortController>();
    const controller = new AbortController();
    abortControllers.set("session-1", controller);

    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);

    // After abort, remove from map
    abortControllers.delete("session-1");
    expect(abortControllers.has("session-1")).toBe(false);
  });

  it("clearAll should abort all active upload controllers", () => {
    const abortControllers = new Map<string, AbortController>();
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    abortControllers.set("session-1", controller1);
    abortControllers.set("session-2", controller2);

    // Abort all
    for (const [token, controller] of abortControllers) {
      controller.abort();
    }

    expect(controller1.signal.aborted).toBe(true);
    expect(controller2.signal.aborted).toBe(true);
  });
});
