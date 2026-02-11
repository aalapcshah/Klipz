const CSRF_COOKIE_NAME = "_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Read the CSRF token from the cookie.
 */
export function getCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Get headers object with CSRF token included.
 * Use this when making direct fetch() calls to API endpoints.
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  if (token) {
    return { [CSRF_HEADER_NAME]: token };
  }
  return {};
}

/**
 * Enhanced fetch that automatically includes CSRF token.
 * Drop-in replacement for globalThis.fetch for API calls.
 */
export function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getCsrfToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set(CSRF_HEADER_NAME, token);
  }
  return globalThis.fetch(input, {
    ...init,
    headers,
  });
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
