// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/permissions/guard", () => ({ requireSectionAccess: mocks.guard }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { connectIntegrationAction } from "@/app/integrations/actions";
import { readVault, saveSecrets } from "../connections/vault";
let directory: string;
const twilio = { TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`, TWILIO_AUTH_TOKEN: "synthetic-private-twilio-token", TWILIO_FROM_NUMBER: "(860) 555-0101", TWILIO_MODE: "test" };
const mailgun = { MAILGUN_API_KEY: "synthetic-private-mailgun-key", MAILGUN_DOMAIN: "MAIL.EXAMPLE.INVALID", MAILGUN_FROM_EMAIL: "service@mail.example.invalid", MAILGUN_REGION: "EU", MAILGUN_MODE: "test", MAILGUN_WEBHOOK_SIGNING_KEY: "synthetic-private-signing-key" };
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-hub-actions-")); vi.stubEnv("DEALDESK_DATA_DIR", directory);
  saveSecrets({ COMMUNICATIONS_SEND_ENABLED: "false" }); mocks.guard.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Provider calls are forbidden in this fixture."); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });
it("validates Twilio mode/account/phone before saving, without activating or contacting providers", async () => {
  for (const patch of [{ TWILIO_MODE: "production" }, { TWILIO_ACCOUNT_SID: "not-an-account" }, { TWILIO_FROM_NUMBER: "123" }]) {
    const response = await connectIntegrationAction("twilio", { ...twilio, ...patch }); expect(response.ok).toBe(false);
    expect(readVault()).toEqual({ COMMUNICATIONS_SEND_ENABLED: "false" });
  }
  const response = await connectIntegrationAction("twilio", twilio); expect(response.ok).toBe(true);
  expect(response.message).toContain("not been verified"); expect(response.message).not.toContain(twilio.TWILIO_AUTH_TOKEN);
  expect(readVault()).toMatchObject({ TWILIO_FROM_NUMBER: "+18605550101", COMMUNICATIONS_SEND_ENABLED: "false" }); expect(fetch).not.toHaveBeenCalled();
});
it("validates Mailgun region/mode/sender and preserves other hub providers", async () => {
  for (const patch of [{ MAILGUN_MODE: "enabled" }, { MAILGUN_REGION: "CA" }, { MAILGUN_FROM_EMAIL: "different@another.example.invalid" }, { MAILGUN_DOMAIN: "https://mail.example.invalid/path" }]) {
    expect((await connectIntegrationAction("mailgun", { ...mailgun, ...patch })).ok).toBe(false);
    expect(readVault()).toEqual({ COMMUNICATIONS_SEND_ENABLED: "false" });
  }
  expect((await connectIntegrationAction("mailgun", mailgun)).ok).toBe(true);
  expect(readVault()).toMatchObject({ MAILGUN_DOMAIN: "mail.example.invalid", MAILGUN_MODE: "test", MAILGUN_REGION: "EU", COMMUNICATIONS_SEND_ENABLED: "false" });
  expect((await connectIntegrationAction("godaddy", { GODADDY_API_KEY: "synthetic-key", GODADDY_API_SECRET: "synthetic-secret" })).ok).toBe(true);
  expect(readVault().GODADDY_API_KEY).toBe("synthetic-key"); expect(fetch).not.toHaveBeenCalled();
});
it("requires admin authority and cannot smuggle the outbound send switch through credentials", async () => {
  mocks.guard.mockRejectedValueOnce(new Error("Owner access required")); expect((await connectIntegrationAction("twilio", twilio)).ok).toBe(false);
  expect((await connectIntegrationAction("twilio", { ...twilio, COMMUNICATIONS_SEND_ENABLED: "true" })).ok).toBe(false);
  expect(readVault()).toEqual({ COMMUNICATIONS_SEND_ENABLED: "false" }); expect(fetch).not.toHaveBeenCalled();
});
