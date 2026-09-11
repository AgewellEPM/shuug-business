// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { GET, POST } from "@/app/api/vehicles/vin/route";
import { requireIdentity } from "../auth/identity";
import { requireSectionAccess } from "../permissions/guard";
import { listRecords } from "../sdk/records";
vi.mock("../auth/identity", () => ({ requireIdentity: vi.fn(async () => ({ id: "staff", name: "Fixture staff" })) }));
vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));
let dir: string;
const base = "https://auto.example.test", input = { vin: "1HGCM82633A004352", modelYear: 2003, recordId: null, consent: true }, request = (origin = base, action = "lookup", body: unknown = input) => new Request(base + "/api/vehicles/vin", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ action, input: body }) });
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-vin-route-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); vi.mocked(requireIdentity).mockResolvedValue({ id: "staff", name: "Fixture staff" } as never); vi.mocked(requireSectionAccess).mockResolvedValue(); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Results: [{ VIN: input.vin, ErrorCode: "0", ErrorText: "Clean", Make: "HONDA", Model: "Accord", ModelYear: "2003" }] }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("rejects anonymous requests and foreign origins before sharing a VIN", async () => { expect((await POST(request("https://foreign.test"))).status).toBe(403); vi.mocked(requireIdentity).mockRejectedValue(new Error("Sign in")); expect((await POST(request())).status).toBe(403); expect(fetch).not.toHaveBeenCalled(); });
it("requires Services edit access for lookup/apply while allowing authorized read-only history", async () => { vi.mocked(requireSectionAccess).mockImplementation(async (section, action) => { if (section !== "services" || action === "edit") throw new Error("Denied"); }); expect((await GET()).status).toBe(200); expect((await POST(request())).status).toBe(403); expect((await POST(request(base, "apply", {}))).status).toBe(403); expect(fetch).not.toHaveBeenCalled(); });
it("returns a private actor-bound review and never creates a vehicle during lookup", async () => { const response = await POST(request()), data = await response.json(); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(data.review.result.canApply).toBe(true); expect(data.review.proof).toBeTruthy(); expect(listRecords("vehicles")).toHaveLength(0); });
it("rejects oversized and malformed requests without calling the provider", async () => { expect((await POST(request(base, "lookup", { ...input, notes: "x".repeat(25000) }))).status).toBe(400); expect((await POST(request(base, "lookup", { ...input, consent: false }))).status).toBe(400); expect(fetch).not.toHaveBeenCalled(); });
