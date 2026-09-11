// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { GET, POST } from "./route";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { saveExpense, readExpense } from "@/lib/expenses/store";
import { blankExpense } from "@/lib/expenses/model";
import { expenseAccountingData } from "@/lib/expenses/accounting";
vi.mock("@/lib/permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/identity", () => ({ requireIdentity: vi.fn(async () => ({ id: "accountant", name: "Accountant" })) }));
let directory: string, id: string;
const base = "https://expenses.example.test";
beforeEach(() => { directory = mkdtempSync(`${tmpdir()}/shuug-expense-route-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.mocked(requireSectionAccess).mockResolvedValue(); id = saveExpense({ status: "recorded", fields: { ...blankExpense("2026-01-01"), merchant: "Fixture", amountCents: 10000, paymentStatus: "unpaid" } }).expense!.id; });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { force: true, recursive: true }); });
const payload = () => ({ requestId: randomUUID(), action: "expense.post", input: { id, revision: 1, dueDate: "2026-02-01", homeAmountCents: 10000, conversionEvidence: "", allocations: [{ accountNumber: 6000, purpose: "operating", amountCents: 10000 }], settlement: null, reviewed: true, evidence: "Reviewed original invoice" } });
const request = (body: unknown, origin = base) => new Request(base + "/api/accounting/expenses", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
it("uses Money view/edit permissions and rejects foreign-origin or oversized mutations", async () => {
  vi.mocked(requireSectionAccess).mockRejectedValue(new Error("Denied")); expect((await GET()).status).toBe(403); expect((await POST(request(payload()))).status).toBe(403);
  vi.mocked(requireSectionAccess).mockImplementation(async (_section, action) => { if (action === "edit") throw new Error("Read only"); }); expect((await GET()).status).toBe(200); expect((await POST(request(payload()))).status).toBe(403);
  vi.mocked(requireSectionAccess).mockResolvedValue(); expect((await POST(request(payload(), "https://foreign.test"))).status).toBe(403); expect((await POST(request({ extra: "x".repeat(100001) }))).status).toBe(400); expect(expenseAccountingData().entries).toHaveLength(0);
});
it("posts one durable entry on exact retries and returns current revision with private accounting history", async () => {
  const body = payload(), first = await POST(request(body)); expect(first.status).toBe(200); expect((await first.json()).expense.accounting.postedBy).toBe("Accountant (accountant)");
  expect((await POST(request(body))).status).toBe(200); expect(readExpense(id).revision).toBe(2);
  const response = await GET(), data = await response.json(); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(data.entries).toHaveLength(1); expect(data.audit.at(-1).actor).toBe("Accountant (accountant)");
});
