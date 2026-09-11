// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { requireSectionAccess } from "../permissions/guard";
import { GET } from "@/app/api/restaurant/reports/route";
import { GET as finance } from "@/app/api/restaurant/finance/route";
import { GET as operations, POST } from "@/app/api/restaurant/business/route";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));
vi.mock("../auth/identity", () => ({ requireIdentity: vi.fn(async () => ({ id: "finance-employee", name: "Accountant" })), requireOwnerAccess: vi.fn(async () => ({})) }));
let dir: string;
const base = "https://restaurant.example.test";
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-report-route-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); vi.mocked(requireSectionAccess).mockResolvedValue(); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const req = (query = "") => new Request(base + "/api/restaurant/reports" + query);
const close = () => executeRestaurantCommand({ requestId: randomUUID(), action: "close", input: { date: "2026-08-03", operated: true, openMinutes: 120, countedCash: 0, note: "PRIVATE MANAGER EVIDENCE", reviewed: true } }, "Private manager").id;
it("keeps report JSON and CSV private to Money viewers and excludes internal evidence", async () => {
  close(); vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "money") throw new Error("Denied"); });
  const response = await GET(req("?from=2026-08-03&to=2026-08-03")), report = await response.json(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(report.period).toMatchObject({ openDays: 1, openMinutes: 120 }); expect(JSON.stringify(report)).not.toContain("PRIVATE"); expect(JSON.stringify(report)).not.toContain("Private manager");
  const csv = await GET(req("?from=2026-08-03&to=2026-08-03&format=csv")); expect(csv.headers.get("content-disposition")).toContain("attachment"); expect(await csv.text()).toContain("2026-08-03,yes,120,0");
  vi.mocked(requireSectionAccess).mockRejectedValue(new Error("Denied")); expect((await GET(req())).status).toBe(403); expect((await GET(req("?format=csv"))).status).toBe(403);
});
it("uses the same validated filters on report, finance and operations reads", async () => {
  close(); const query = "?from=2026-08-04&to=2026-08-04&basis=open_day";
  const report = await (await GET(req(query))).json(); expect(report.period.openDays).toBe(0); expect(report.period.unreviewedDays).toBe(1);
  expect((await (await finance(req(query))).json()).financial.report).toEqual(report); expect((await (await operations(req(query))).json()).financial.report).toEqual(report);
  for (const get of [GET, finance, operations]) { expect((await get(req("?from=2026-08-03"))).status).toBe(400); expect((await get(req("?from=2026-08-04&to=2026-08-03"))).status).toBe(400); }
});
it("requires Money edit and same origin for reviewed opening-time corrections and retains stale-review protection", async () => {
  const closeId = close();
  const body = { action: "hours.review", requestId: randomUUID(), input: { closeId, revision: 1, openMinutes: 90, evidence: "Verified 30-minute closure", reviewed: true } };
  const post = (origin = base) => POST(new Request(base + "/api/restaurant/business", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));
  vi.mocked(requireSectionAccess).mockImplementation(async (section, permission) => { if (section !== "money" || permission !== "view") throw new Error("Denied"); }); expect((await post()).status).toBe(403);
  vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "money") throw new Error("Denied"); }); expect((await post("https://other.example.test")).status).toBe(403); expect((await post()).status).toBe(200); expect((await post()).status).toBe(200);
  body.requestId = randomUUID(); expect((await post()).status).toBe(400); expect(restaurantBusinessSnapshot().serviceHours).toHaveLength(2); expect(restaurantBusinessSnapshot().serviceHours?.[1].actor).toBe("Accountant (finance-employee)");
});
