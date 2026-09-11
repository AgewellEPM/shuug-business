/**
 * Security response headers applied to every response by middleware. Baseline
 * hardening: clickjacking, MIME-sniffing, referrer leakage, feature access, and
 * a Content-Security-Policy. HSTS is only meaningful over HTTPS so it's added in
 * production. The CSP allows Next's inline runtime + Tailwind inline styles; it's
 * intentionally not nonce-strict yet (documented tightening step).
 */
export function securityHeaders(isProd: boolean): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    // Next injects inline bootstrap scripts; dev also needs eval for HMR.
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "connect-src 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "X-DNS-Prefetch-Control": "off",
  };
  if (isProd) headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  return headers;
}
