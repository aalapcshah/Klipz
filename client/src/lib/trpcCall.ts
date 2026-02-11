import superjson from "superjson";
import { getCsrfToken } from "./csrf";

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
export async function trpcCall<T>(
  procedure: string,
  input: any,
  method: 'mutation' | 'query' = 'mutation',
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  const { timeoutMs = 120_000, signal } = options ?? {};
  
  // Create a timeout abort controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  
  // Combine external signal with timeout signal
  const combinedSignal = signal
    ? combineAbortSignals(signal, timeoutController.signal)
    : timeoutController.signal;

  let response: Response;

  try {
    if (method === 'query') {
      // Queries use GET with input in the URL
      const serialized = superjson.serialize(input);
      const encodedInput = encodeURIComponent(JSON.stringify(serialized));
      const queryHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const queryToken = getCsrfToken();
      if (queryToken) queryHeaders["x-csrf-token"] = queryToken;
      response = await fetch(`/api/trpc/${procedure}?input=${encodedInput}`, {
        method: "GET",
        headers: queryHeaders,
        credentials: "include",
        signal: combinedSignal,
      });
    } else {
      // Mutations use POST with input in the body
      const serialized = superjson.serialize(input);
      const mutationHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const mutationToken = getCsrfToken();
      if (mutationToken) mutationHeaders["x-csrf-token"] = mutationToken;
      response = await fetch(`/api/trpc/${procedure}`, {
        method: "POST",
        headers: mutationHeaders,
        credentials: "include",
        body: JSON.stringify(serialized),
        signal: combinedSignal,
      });
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      if (signal?.aborted) {
        throw new Error(`tRPC call ${procedure} was cancelled`);
      }
      throw new Error(`tRPC call ${procedure} timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
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

/**
 * Combine multiple AbortSignals into one that aborts when any of them abort.
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
