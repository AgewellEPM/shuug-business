import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { proxy, config } from "./proxy";

/**
 * The public marketing + docs site must be reachable without a login, even in
 * production where auth is on. The app itself must still redirect to login.
 * One assertion PER public prefix so a regressed prefix names itself.
 */
const BASE = "https://shuug.example";
const req = (path: string) => new NextRequest(new URL(path, BASE));
afterEach(() => vi.unstubAllEnvs());

describe("proxy auth gate", () => {
  beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_ENABLED", "true"); });

  const PUBLIC: Array<[string, string]> = [
    ["welcome home", "/welcome"],
    ["welcome industry", "/welcome/restaurant"],
    ["docs home", "/docs"],
    ["docs article", "/docs/invoicing"],
    ["tour", "/tour"],
    ["site asset path", "/site/index.html"],
  ];
  for (const [label, path] of PUBLIC) {
    it(`serves ${label} (${path}) without redirecting to login`, () => {
      const res = proxy(req(path));
      // NextResponse.next() has no location header; a redirect would set one to /api/auth/login.
      expect(res.headers.get("location")).toBeNull();
    });
  }

  it("still redirects a real app route to login when unauthenticated", () => {
    const res = proxy(req("/orders"));
    expect(res.headers.get("location")).toContain("/api/auth/login");
  });
});

describe("dedicated client-owned customer route gate", () => {
  beforeEach(() => { vi.stubEnv("GIGTAX_REQUIRE_CLIENT_ONLY", "true"); vi.stubEnv("AUTH_ENABLED", "true"); });
  it("matches every legacy customer entry point, denies before body reads, and prevents namespace lookalikes", async () => {
    for (const path of ["/api/website/customer", "/api/website/customer/driver/session", "/api/website/customer/driver/reputation", "/api/website/customer/driver/referrals", "/api/website/customer/secure/activation", "/api/website/customer/secure/social/start", "/api/website/customer/connections/uber/callback", "/api/website/customer/client-only-legacy/objects"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: BASE + path }), path).toBe(true);
      const request = new NextRequest(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "Synthetic forbidden private payload" });
      const response = proxy(request); expect(response.status, path).toBe(409); expect(request.bodyUsed, path).toBe(false);
      expect(response.headers.get("location")).toBeNull(); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
  it("permits the exact new namespace and read-only health while leaving OAuth callback and owner routes outside the API matcher", () => {
    for (const path of ["/api/website/customer/client-only", "/api/website/customer/client-only/native-session", "/api/website/customer/client-only/staff/client-invitations", "/api/website/customer/driver/health"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: BASE + path }), path).toBe(true);
      const response = proxy(req(path)); expect(response.headers.get("x-middleware-next"), path).toBe("1"); expect(response.headers.get("location")).toBeNull();
    }
    expect(proxy(new NextRequest(BASE + "/api/website/customer/driver/health", { method: "POST" })).status).toBe(409);
    for (const path of ["/api/auth/login", "/api/auth/social/manage", "/api/auth/social/google/callback", "/api/auth/social/apple/callback"]) expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: BASE + path }), path).toBe(false);
  });
  it("preserves generic customer API behavior when the dedicated profile flag is absent", () => {
    vi.stubEnv("GIGTAX_REQUIRE_CLIENT_ONLY", "false");
    for (const path of ["/api/website/customer", "/api/website/customer/driver/reputation", "/api/website/customer/secure/session"]) {
      const response = proxy(req(path)); expect(response.headers.get("x-middleware-next")).toBe("1"); expect(response.headers.get("location")).toBeNull();
    }
  });
});
