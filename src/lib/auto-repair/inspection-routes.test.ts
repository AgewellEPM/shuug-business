// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { inspectionFixture, inspectionOwner, fixtureTechnician } from "./inspection-fixture";
import { requireIdentity } from "../auth/identity";
import { requireSectionAccess } from "../permissions/guard";
import { GET, POST } from "@/app/api/auto-repair/inspections/route";
import { GET as personalGet, POST as personalPost } from "@/app/api/workspace/me/inspections/route";
vi.mock("../auth/identity", () => ({ requireIdentity: vi.fn() })); vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));
let dir: string, f: ReturnType<typeof inspectionFixture>; const base = "https://inspection.example.test";
const request = (body: unknown, origin = base) => new Request(base + "/api/auto-repair/inspections", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const start = () => ({ requestId: randomUUID(), action: "inspection.start", input: { id: f.id, revision: 1 } });
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-inspection-route-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); f = inspectionFixture(); vi.mocked(requireIdentity).mockResolvedValue(inspectionOwner as never); vi.mocked(requireSectionAccess).mockResolvedValue(); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("requires Services access for managers, while assigned employees use their own protected area", async () => { vi.mocked(requireIdentity).mockResolvedValue(f.tech as never); vi.mocked(requireSectionAccess).mockRejectedValue(new Error("Denied")); expect((await GET()).status).toBe(403); expect((await POST(request(start()))).status).toBe(403); const personal = await personalGet(); expect(personal.status).toBe(200); expect(personal.headers.get("Cache-Control")).toContain("no-store"); expect((await personal.json()).inspections[0].id).toBe(f.id); expect((await personalPost(request(start()))).status).toBe(200); });
it("rejects anonymous access, foreign origins and manager-action smuggling through personal routes", async () => { expect((await POST(request(start(), "https://other.test"))).status).toBe(403); vi.mocked(requireIdentity).mockResolvedValue(f.tech as never); expect((await personalPost(request({ requestId: randomUUID(), action: "inspection.cancel", input: { id: f.id, revision: 1, reason: "Forged manager" } }))).status).toBe(400); vi.mocked(requireIdentity).mockRejectedValue(new Error("Sign in")); expect((await personalGet()).status).toBe(403); expect((await personalPost(request(start()))).status).toBe(403); });
it("does not expose another employee's job and rejects oversized photo requests", async () => { const other = fixtureTechnician("Unassigned employee"); vi.mocked(requireIdentity).mockResolvedValue(other as never); expect((await (await personalGet()).json()).inspections).toHaveLength(0); expect((await personalPost(request(start()))).status).toBe(400); vi.mocked(requireIdentity).mockResolvedValue(f.tech as never); expect((await personalPost(request({ requestId: randomUUID(), action: "inspection.photo", input: { data: "x".repeat(750001) } }))).status).toBe(400); });
