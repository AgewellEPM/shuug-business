import { describe, it, expect } from "vitest";
import { decide } from "./rate-limit";
import { securityHeaders } from "./headers";
import { redact } from "../observability/log";
import { canAccessPath } from "../permissions/model";

describe("rate-limit decide", () => {
  it("allows up to the limit inside a window, then blocks", () => {
    const limit = 3, win = 1000;
    let bucket = undefined as undefined | { count: number; resetAt: number };
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const r = decide(bucket, 100, limit, win); // same 'now' → same window
      results.push(r.decision.allowed);
      bucket = r.next;
    }
    expect(results).toEqual([true, true, true, false, false]);
  });
  it("resets after the window elapses", () => {
    const first = decide(undefined, 0, 2, 1000);
    const used = decide(first.next, 0, 2, 1000);
    expect(used.decision.allowed).toBe(true);
    const afterReset = decide(used.next, 2000, 2, 1000); // now past resetAt
    expect(afterReset.decision.allowed).toBe(true);
    expect(afterReset.decision.remaining).toBe(1);
  });
});

describe("securityHeaders", () => {
  it("sets the baseline headers; HSTS only in prod", () => {
    const dev = securityHeaders(false);
    expect(dev["X-Frame-Options"]).toBe("DENY");
    expect(dev["X-Content-Type-Options"]).toBe("nosniff");
    expect(dev["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
    expect(securityHeaders(true)["Strict-Transport-Security"]).toContain("max-age=");
  });
  it("drops unsafe-eval from script-src in prod", () => {
    expect(securityHeaders(true)["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(securityHeaders(false)["Content-Security-Policy"]).toContain("unsafe-eval");
  });
});

describe("log redaction", () => {
  it("masks secret-looking keys, recursively, keeps the rest", () => {
    const out = redact({ user: "pat", apiKey: "sk-123", nested: { refreshToken: "r", ok: 1 } }) as Record<string, unknown>;
    expect(out.user).toBe("pat");
    expect(out.apiKey).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).refreshToken).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
  });
});

describe("canAccessPath (middleware gate)", () => {
  it("lets Owner reach admin, blocks Sales from admin, everyone gets home", () => {
    expect(canAccessPath("/admin", "Owner")).toBe(true);
    expect(canAccessPath("/admin", "Sales")).toBe(false);
    expect(canAccessPath("/", "Sales")).toBe(true);
    expect(canAccessPath("/today", "Warehouse")).toBe(true);
    expect(canAccessPath("/marketing", "Warehouse")).toBe(false);
  });
});
