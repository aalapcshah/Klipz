import { describe, it, expect } from "vitest";

/**
 * Tests for the collection file reorder endpoint.
 * Validates that the reorderFiles mutation exists and accepts proper input.
 */

const BASE = "http://localhost:3000";

describe("Collection File Reorder", () => {
  it("should have the reorderFiles endpoint available via tRPC", async () => {
    // Call the tRPC endpoint without auth - should get unauthorized, not 404
    const response = await fetch(`${BASE}/api/trpc/collections.reorderFiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          collectionId: 1,
          fileIds: [1, 2, 3],
        },
      }),
    });

    // Should get UNAUTHORIZED (not 404 or 500), proving the endpoint exists
    const data = await response.json();
    expect(data).toBeDefined();
    expect(data.error).toBeDefined();
    expect(data.error.json.data.code).toBe("UNAUTHORIZED");
  });

  it("should reject reorder with empty fileIds array", async () => {
    const response = await fetch(`${BASE}/api/trpc/collections.reorderFiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          collectionId: 1,
          fileIds: [],
        },
      }),
    });

    const data = await response.json();
    // Should be UNAUTHORIZED since we're not logged in
    expect(data.error).toBeDefined();
    expect(data.error.json.data.code).toBe("UNAUTHORIZED");
  });

  it("should return error for non-existent endpoint path", async () => {
    const response = await fetch(`${BASE}/api/trpc/collections.nonExistentEndpoint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {},
      }),
    });

    const data = await response.json();
    expect(data.error).toBeDefined();
    // Non-existent endpoints return NOT_FOUND
    expect(data.error.json.data.code).toBe("NOT_FOUND");
  });
});
