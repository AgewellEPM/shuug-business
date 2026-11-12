// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/identity", () => ({ requireOwnerAccess: mocks.owner }));
import { GET, POST } from "@/app/api/communications/route";
import { POST as twilioInbound } from "@/app/api/communications/twilio/inbound/route";
import { POST as twilioStatus } from "@/app/api/communications/twilio/status/route";
import { POST as mailgun } from "@/app/api/communications/mailgun/route";
import { communicationSnapshot } from "./store";
let directory: string;
const base = "https://shop.example.invalid";
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-comms-api-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DATABASE_URL", "");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No provider request is allowed."); }));
  mocks.owner.mockResolvedValue({ id: "workspace-owner", name: "Synthetic owner", isOwner: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });
const request = (command: unknown, origin: string | null = base) => new Request(`${base}/api/communications`, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(command) });
it("requires owner access and exact Origin before any message or preference change", async () => {
  mocks.owner.mockRejectedValue(new Error("Sign in")); expect((await GET()).status).toBe(403);
  const command = { command: "queue", input: { eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Sample", body: "Fictional message", purpose: "manual" } };
  expect((await POST(request(command))).status).toBe(403);
  mocks.owner.mockResolvedValue({ id: "workspace-owner", name: "Synthetic owner", isOwner: true });
  expect((await POST(request(command, null))).status).toBe(403); expect((await POST(request(command, "https://untrusted.example.invalid"))).status).toBe(403);
  expect(communicationSnapshot().messages).toHaveLength(0);
  const response = await POST(request(command)); expect(response.status).toBe(200);
  const result = await response.json(); expect(result.messages).toHaveLength(1); expect(result.messages[0].body).toBe("Fictional message");
  const dispatch = await POST(request({ command: "dispatch", limit: 20 })); expect(dispatch.status).toBe(200); expect(fetch).not.toHaveBeenCalled();
});
it("fails closed on unsigned provider callbacks without leaking credentials", async () => {
  const form = () => new Request(`${base}/api/communications/twilio/inbound`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "Body=STOP&From=%2B18605550101" });
  expect((await twilioInbound(form())).status).toBe(403); expect((await twilioStatus(form())).status).toBe(403);
  const result = await mailgun(new Request(`${base}/api/communications/mailgun`, { method: "POST", body: "{}" })); expect(result.status).toBe(403);
  expect(communicationSnapshot().inbound).toEqual([]); expect(communicationSnapshot().consents).toEqual([]); expect(fetch).not.toHaveBeenCalled();
});
