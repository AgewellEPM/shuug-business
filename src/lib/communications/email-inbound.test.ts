// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "@/app/api/email/inbound/route";
import { saveSecrets } from "../connections/vault";
import { listEmails } from "../email/store";
let directory: string;
const legacySecret = "synthetic-legacy-inbound-secret", vaultSecret = "synthetic-vault-inbound-secret";
const sample = { from: "sample@example.invalid", subject: "Fictional service request", body: "Please inspect a fictional check engine light." };
function request(payload: unknown, secret?: string, extra: Record<string, string> = {}) {
  return new Request("https://shop.example.invalid/api/email/inbound", { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "X-Inbound-Secret": secret } : {}), ...extra }, body: JSON.stringify(payload) });
}
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-email-inbound-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("EMAIL_INBOUND_SECRET", "");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network is permitted in this fixture."); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("fails closed without a configured secret or a matching caller credential", async () => {
  expect((await POST(request(sample))).status).toBe(503);
  vi.stubEnv("EMAIL_INBOUND_SECRET", legacySecret);
  expect((await POST(request(sample))).status).toBe(401);
  expect((await POST(request(sample, "incorrect-secret"))).status).toBe(401);
  expect(listEmails()).toEqual([]); expect(fetch).not.toHaveBeenCalled();
});
it("preserves existing environment configuration and common provider aliases", async () => {
  vi.stubEnv("EMAIL_INBOUND_SECRET", legacySecret);
  const response = await POST(request({ From: "Sam Example <sample@example.invalid>", FromName: "Sam Example", Subject: "Service question", TextBody: "Fictional repair question.", MessageID: "adapter-metadata" }, legacySecret));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(listEmails()[0]).toMatchObject({ from: "Sam Example <sample@example.invalid>", fromName: "Sam Example", subject: "Service question", body: "Fictional repair question." });
  expect(fetch).not.toHaveBeenCalled();
});
it("prefers the native vault secret and accepts the existing sender/plain aliases", async () => {
  vi.stubEnv("EMAIL_INBOUND_SECRET", legacySecret); saveSecrets({ EMAIL_INBOUND_SECRET: vaultSecret });
  expect((await POST(request(sample, legacySecret))).status).toBe(401);
  expect((await POST(request({ sender: "sample@example.invalid", plain: "Fictional request with no subject." }, vaultSecret))).status).toBe(200);
  expect(listEmails()).toHaveLength(1); expect(listEmails()[0].body).toBe("Fictional request with no subject.");
});
it("bounds actual bytes and rejects malformed or oversized fields without ingesting", async () => {
  saveSecrets({ EMAIL_INBOUND_SECRET: vaultSecret });
  expect((await POST(request(sample, vaultSecret, { "Content-Length": "64001" }))).status).toBe(413);
  expect((await POST(request({ ...sample, body: "x".repeat(70000) }, vaultSecret))).status).toBe(413);
  for (const payload of [null, [], { ...sample, from: { address: sample.from } }, { ...sample, from: "not-an-email" }, { ...sample, from: "Bad\r\n<sample@example.invalid>" }, { ...sample, subject: "x".repeat(501) }, { ...sample, body: "x".repeat(48001) }]) {
    expect((await POST(request(payload, vaultSecret))).status).toBe(400);
  }
  expect(listEmails()).toEqual([]); expect(fetch).not.toHaveBeenCalled();
});
