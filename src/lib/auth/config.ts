/**
 * Auth enforcement switch. Uses only process.env so it's readable in both the
 * Node server and the edge middleware. ON in production, or when AUTH_ENABLED
 * is "true". OFF in local dev by default so the owner's workflow is unbroken.
 */
export function authEnabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.AUTH_ENABLED === "true";
}

export const SESSION_COOKIE = "dd_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
