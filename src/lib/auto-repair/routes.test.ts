// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { GET, POST } from "@/app/api/auto-repair/route";
import { requireIdentity } from "../auth/identity";
import { requireSectionAccess } from "../permissions/guard";
import { repairWorkspace } from "./service";
import { fixturePricing } from "./fixture";
vi.mock("../auth/identity", () => ({ requireIdentity: vi.fn(async () => ({ id: "staff", name: "Staff" })) }));
vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));
let dir: string; const base = "https://repair.example.test";
const request = (body: unknown, origin = base) => new Request(base + "/api/auto-repair", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const save = () => ({ action: "book.save", input: { requestId: randomUUID(), definition: fixturePricing("2026-09-21"), shareInTemplates: false } });
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-repair-route-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); vi.mocked(requireIdentity).mockResolvedValue({ id: "staff", name: "Staff" } as never); vi.mocked(requireSectionAccess).mockResolvedValue(); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("rejects anonymous users, missing services rights and foreign origins before mutation", async () => {
  expect((await POST(request(save(), "https://foreign.test"))).status).toBe(403); vi.mocked(requireIdentity).mockRejectedValue(new Error("Sign in")); expect((await POST(request(save()))).status).toBe(403); vi.mocked(requireSectionAccess).mockRejectedValue(new Error("Denied")); expect((await GET()).status).toBe(403); expect(repairWorkspace().books).toHaveLength(0);
});
it("allows Services read access while requiring edit permission for every command", async () => {
  vi.mocked(requireSectionAccess).mockImplementation(async (_, action) => { if (action === "edit") throw new Error("Read only"); }); expect((await GET()).status).toBe(200); expect((await POST(request(save()))).status).toBe(403); expect(repairWorkspace().books).toHaveLength(0);
});
it("persists the validated version and returns private uncached responses with retry receipts", async () => {
  const input = save(), response = await POST(request(input)); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(await (await POST(request(input))).json()).toEqual(await response.json()); expect((await (await GET()).json()).books).toHaveLength(1);
});
it("bounds payload size and rejects forged unknown fields and malformed commands", async () => {
  expect((await POST(request({ action: "other", input: {} }))).status).toBe(400); const payload = save(); expect((await POST(request({ ...payload, input: { ...payload.input, publishedBy: "someone" } }))).status).toBe(400); expect((await POST(request({ action: "book.save", input: { notes: "x".repeat(250001) } }))).status).toBe(400); expect(repairWorkspace().books).toHaveLength(0);
});
