// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { GET, POST } from "@/app/api/restaurant/business/route";
import { GET as finance } from "@/app/api/restaurant/finance/route";
import { restaurantBusinessSnapshot } from "./business";
import { requireSectionAccess } from "../permissions/guard";
import { requireOwnerAccess } from "../auth/identity";
vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));
vi.mock("../auth/identity", () => ({ requireIdentity: vi.fn(async () => ({ id: "staff-1", name: "Staff" })), requireOwnerAccess: vi.fn(async () => ({ id: "owner" })) }));
let dir: string;
const base = "https://restaurant.example.test";
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-restaurant-route-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); vi.mocked(requireSectionAccess).mockResolvedValue(); vi.mocked(requireOwnerAccess).mockResolvedValue({ id: "owner" } as never); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const request = (action: string, input: unknown, origin = base) => new Request(base + "/api/restaurant/business", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ action, input, requestId: randomUUID() }) });
it("rejects foreign origins before creating restaurant records", async () => { expect((await POST(request("supplier.save", {}, "https://attacker.test"))).status).toBe(403); expect(restaurantBusinessSnapshot().suppliers).toHaveLength(0); });
it("requires Operations edit for every prep mutation and rejects foreign-origin batch requests", async () => {
  for (const action of ["prep.recipe.save", "prep.start", "prep.complete", "prep.discard"]) {
    vi.mocked(requireSectionAccess).mockImplementation(async (section, access) => { if (section !== "operations" || access !== "view") throw new Error("Denied"); });
    expect((await POST(request(action, {}))).status).toBe(403);
    vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "money") throw new Error("Denied"); });
    expect((await POST(request(action, {}))).status).toBe(403);
    vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "operations") throw new Error("Denied"); });
    expect((await POST(request(action, {}))).status).toBe(400);
    expect((await POST(request(action, {}, "https://foreign.test"))).status).toBe(403);
  }
  expect(restaurantBusinessSnapshot().prepBatches ?? []).toEqual([]);
});
it("returns operational projections without financial records to operations-only staff", async () => { vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section === "money") throw new Error("Denied"); }); const r = await GET(new Request(base + "/api/restaurant/business")); expect(r.status).toBe(200); const data = await r.json(); expect(data.financial).toBeNull(); expect(data.ingredients).toEqual([]); });
it("allows a finance-only role to read restaurant books and post verified transfers without accessing operations", async () => {
  vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "money") throw new Error("Denied"); });
  expect((await GET(new Request(base + "/api/restaurant/business"))).status).toBe(403); const response = await finance(new Request(base + "/api/restaurant/finance")), data = await response.json(); expect(response.status).toBe(200); expect(data.financial).not.toBeNull(); expect(data.website.orders).toEqual([]); expect(data.menu).toEqual([]);
  expect((await POST(request("drawer.transfer", { amount: 100, direction: "in", reference: "Finance withdrawal", evidence: "Verified bank withdrawal", confirmed: true }))).status).toBe(200);
  expect((await POST(request("supplier.save", { name: "Forbidden", email: "", phone: "", active: true }))).status).toBe(403);
});
it("denies payment and configuration actions to staff without the required authority", async () => {
  vi.mocked(requireSectionAccess).mockImplementation(async (section, action) => { if (section === "money" && action === "edit") throw new Error("Denied"); });
  expect((await POST(request("tender", {}))).status).toBe(403); vi.mocked(requireOwnerAccess).mockRejectedValue(new Error("Denied")); expect((await POST(request("configure", {}))).status).toBe(403);
});
it("allows authorized restaurant edits and records the authenticated actor", async () => { const r = await POST(request("supplier.save", { name: "Approved supplier", email: "", phone: "", active: true })); expect(r.status).toBe(200); expect(restaurantBusinessSnapshot().audit[0].actor).toBe("Staff (staff-1)"); });
it("denies anonymous access and malformed action bodies", async () => { vi.mocked(requireSectionAccess).mockRejectedValue(new Error("Sign in")); expect((await GET(new Request(base + "/api/restaurant/business"))).status).toBe(403); expect((await POST(request("supplier.save", {}))).status).toBe(403); vi.mocked(requireSectionAccess).mockResolvedValue(); expect((await POST(request("execute-code", {}))).status).toBe(400); });
it("separates campaign editing, owner publication and advertising payment authority", async () => {
  vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "operations") throw new Error("Denied"); });
  expect((await POST(request("special.save", {}))).status).toBe(403); expect((await POST(request("special.spend", {}))).status).toBe(403);
  vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "marketing") throw new Error("Denied"); });
  // Authorized campaign editing reaches validation; insufficient authority is rejected first.
  expect((await POST(request("special.save", {}))).status).toBe(400); expect((await POST(request("special.spend", {}))).status).toBe(403);
  vi.mocked(requireOwnerAccess).mockRejectedValue(new Error("Denied")); expect((await POST(request("special.publish", {}))).status).toBe(403);
});
it("allows operations to count but requires Money edit to approve or return a stocktake", async () => {
  const send = async (action: string, input: unknown) => { const r = await POST(request(action, input)); expect(r.status).toBe(200); return (await r.json()).result.id as string; };
  await send("configure", { name: "Count route fixture", timezone: "UTC", businessDayStartHour: 0, taxBasisPoints: 0, taxReviewed: true });
  const supplier = await send("supplier.save", { name: "Count supplier", email: "", phone: "", active: true }), ingredient = await send("ingredient.save", { name: "Count rice", unit: "g", reorderAt: 0, targetStock: 100, supplierId: supplier, active: true });
  vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "operations") throw new Error("Denied"); });
  const id = await send("stocktake.start", { reference: "ROUTE-COUNT", ingredientIds: [ingredient], note: "Confirmed empty stock shelf" }); await send("stocktake.submit", { id, revision: 1, confirmed: true });
  expect((await POST(request("stocktake.post", { id, revision: 2, reviewed: true, evidence: "Reviewed zero stock" }))).status).toBe(403);
  expect((await POST(request("stocktake.return", { id, revision: 2, reason: "Double check shelf" }))).status).toBe(403);
  vi.mocked(requireSectionAccess).mockImplementation(async (section, action) => { if (section !== "money" || action === "edit") throw new Error("Denied"); });
  const view = await (await finance(new Request(base + "/api/restaurant/finance"))).json(); expect(view.stocktakes[0].status).toBe("submitted"); expect(view.menu).toEqual([]); expect((await POST(request("stocktake.post", { id, revision: 2, reviewed: true, evidence: "Reviewed" }))).status).toBe(403);
  vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "money") throw new Error("Denied"); });
  expect((await POST(request("stocktake.start", {}))).status).toBe(403); await send("stocktake.post", { id, revision: 2, reviewed: true, evidence: "Verified zero inventory count" });
  expect(restaurantBusinessSnapshot().stocktakes![0].postedBy).toBe("Staff (staff-1)");
});
it("requires Money edit access for guest credits, paid cancellation and recorded refunds", async () => {
  for (const action of ["credit.issue", "credit.cancel", "refund.record"]) {
    vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "operations") throw new Error("Denied"); }); expect((await POST(request(action, {}))).status).toBe(403);
    vi.mocked(requireSectionAccess).mockImplementation(async (section, access) => { if (section !== "money" || access !== "view") throw new Error("Denied"); }); expect((await POST(request(action, {}))).status).toBe(403);
    vi.mocked(requireSectionAccess).mockImplementation(async section => { if (section !== "money") throw new Error("Denied"); }); expect((await POST(request(action, {}))).status).toBe(400);
  }
});
