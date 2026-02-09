import superjson from "superjson";

/**
 * Direct tRPC call via fetch - bypasses React Query lifecycle entirely.
 * This ensures upload loops and other long-running operations survive
 * component unmounts and re-renders.
 *
 * Use this instead of useMutation().mutateAsync() when:
 * - Running in a loop (e.g., chunk uploads)
 * - The operation must survive component lifecycle changes
 * - You need stable function references without React hook dependencies
 */
export async function trpcCall<T>(procedure: string, input: any, method: 'mutation' | 'query' = 'mutation'): Promise<T> {
  let response: Response;

  if (method === 'query') {
    // Queries use GET with input in the URL
    const serialized = superjson.serialize(input);
    const encodedInput = encodeURIComponent(JSON.stringify(serialized));
    response = await fetch(`/api/trpc/${procedure}?input=${encodedInput}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } else {
    // Mutations use POST with input in the body
    const serialized = superjson.serialize(input);
    response = await fetch(`/api/trpc/${procedure}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(serialized),
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`tRPC call ${procedure} failed (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  if (json.error) {
    const errorMessage = json.error?.message || json.error?.json?.message || JSON.stringify(json.error);
    throw new Error(`tRPC error in ${procedure}: ${errorMessage}`);
  }

  // Deserialize superjson response
  const result = json.result?.data;
  if (result?.json !== undefined) {
    return superjson.deserialize({ json: result.json, meta: result.meta }) as T;
  }
  return result as T;
}
