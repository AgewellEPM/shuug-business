// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { authPage, readAuthForm } from "./forms";

const origin = "https://workspace.example.com";
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "gigtax-auth-form-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory);
  vi.stubEnv("APP_BASE_URL", origin);
  vi.stubEnv("DEMO_DATA", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

it("keeps the MFA form's Origin available while suppressing external referrers", async () => {
  const response = authPage("Verify your sign-in", '<form method="post" action="/api/auth/login"></form>');
  // Unlike no-referrer, same-origin preserves the real Origin on a native form
  // POST to this service. It still suppresses referrers on cross-origin requests.
  expect(response.headers.get("referrer-policy")).toBe("same-origin");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
  const request = new Request(origin + "/api/auth/login", {
    method: "POST", headers: { Origin: origin }, body: "code=123456&challenge=synthetic",
  });
  expect((await readAuthForm(request)).get("challenge")).toBe("synthetic");
});

it.each([null, "null", "https://unrelated.example", "https://workspace.example.com.attacker.example"])(
  "refuses untrusted form origin %s before reading credentials",
  async value => {
    const request = new Request(origin + "/api/auth/login", {
      method: "POST", headers: value === null ? {} : { Origin: value }, body: "password=synthetic",
    });
    await expect(readAuthForm(request)).rejects.toThrow("Origin not permitted");
    expect(request.bodyUsed).toBe(false);
  },
);

it("keeps the authentication payload bounded", async () => {
  const request = new Request(origin + "/api/auth/login", {
    method: "POST", headers: { Origin: origin }, body: "password=" + "a".repeat(8000),
  });
  await expect(readAuthForm(request)).rejects.toThrow("Form too large");
});
