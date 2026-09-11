import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

/**
 * The public marketing + docs site must be reachable without a login, even in
 * production where auth is on. The app itself must still redirect to login.
 * One assertion PER public prefix so a regressed prefix names itself.
 */
const BASE = "https://shuug.example";
const req = (path: string) => new NextRequest(new URL(path, BASE));

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
