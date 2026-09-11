// @vitest-environment node
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
const access = vi.hoisted(() => ({ level: "edit" }));
vi.mock("@/lib/permissions/guard", () => ({ requireSectionAccess: async (section: string, level: string) => { if (section !== "money" || access.level === "none" || (level === "edit" && access.level !== "edit")) throw Error("Denied"); } }));
vi.mock("@/lib/auth/identity", () => ({ requireIdentity: async () => ({ id: "bookkeeper", name: "Fixture bookkeeper" }) }));
vi.mock("@/lib/data/workspace", () => ({ loadWorkspace: async () => ({ deals: [], orders: [{ id: "invoice-A", customerId: "customer-A", createdAt: "2026-07-01T12:00:00Z", status: "submitted", totalCents: 10000 }] }) }));
import { GET, POST } from "./route";
let dir: string;
const command = () => ({ requestId: randomUUID(), action: "payment.record", input: { invoiceId: "invoice-A", amountCents: 5000, feeCents: 50, method: "check", receivedAtISO: "2026-08-01", reference: "API-receipt", evidence: "Verified bank receipt", reviewed: true } });
const post = (body: unknown, origin = "http://localhost:3000") => POST(new Request("http://localhost:3000/api/accounting/receivables", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) }));
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "shuug-ar-api-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", "http://localhost:3000"); access.level = "edit"; });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("records against server-owned invoices and retains authenticated identity and private reads", async () => {
  const c = command(), response = await post(c); expect(response.status).toBe(200); expect(await (await post(c)).json()).toEqual(await response.json());
  const read = await GET(); expect(read.headers.get("cache-control")).toBe("private, no-store"); const result = await read.json();
  expect(result.payments).toHaveLength(1); expect(result.payments[0].actor).toBe("Fixture bookkeeper (bookkeeper)"); expect(result.statuses[0].balanceCents).toBe(5000);
  expect((await post({ ...command(), input: { ...c.input, reference: "Unknown invoice", invoiceId: "missing" } })).status).toBe(400);
});
it("enforces Money view/edit and origin boundaries before mutation", async () => {
  access.level = "none"; expect((await GET()).status).toBe(403); expect((await post(command())).status).toBe(403);
  access.level = "view"; expect((await GET()).status).toBe(200); expect((await post(command())).status).toBe(403);
  access.level = "edit"; expect((await post(command(), "https://foreign.example")).status).toBe(403); expect((await post(command(), "")).status).toBe(403);
});
it("rejects oversized, non-reviewed, invalid-date and invented accounting inputs", async () => {
  const c = command();
  for (const body of [{ ...c, pad: "x".repeat(100001) }, { ...c, input: { ...c.input, reviewed: false } }, { ...c, input: { ...c.input, receivedAtISO: "2026-02-30" } }, { ...c, input: { ...c.input, totalCents: 999999 } }]) expect((await post(body)).status).toBe(400);
  expect((await (await GET()).json()).payments).toHaveLength(0);
});
