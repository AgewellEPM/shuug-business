// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { createLinkedCustomer, saveCustomerSettings, customerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled } from "../customer-access/accounts";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { saveDriverRecord } from "../rideshare-driver/store";
import { GET, POST } from "@/app/api/website/customer/driver/reputation/route";
import { POST as coach } from "@/app/api/website/customer/driver/coach/route";
import { readReputation, updateReputation, initReputation, staffReputation } from "./store";
import { isReputationQuestion, reputationAnswer, reputationGuide } from "./guide";

const peel = vi.hoisted(() => ({ available: false, attest: vi.fn() }));
vi.mock("../driver-coach/peel", () => ({ peelCoachAvailable: () => peel.available, attestFinancialFacts: peel.attest }));
const base = "https://workspace.example.com", path = "/api/website/customer/driver/reputation";
let directory: string, alpha: { id: string; clientId: string; token: string }, beta: typeof alpha;
const rating = () => ({ id: randomUUID(), platformID: "uber", platformName: "Uber", recordedAt: "2026-11-07T02:00:00Z", score: 4.8, scale: 5, reviewCount: 25, notes: "Copied from my app", deleted: false });
const review = () => ({ id: randomUUID(), platformID: "uber", platformName: "Uber", recordedAt: "2026-11-07T03:00:00Z", text: "Please double-check the items", sentiment: "mixed", topics: ["accuracy"], deleted: false });
const request = (token?: string, body?: unknown, browser = false, origin?: string) => new Request(base + path, { method: body ? "POST" : "GET", headers: {
  ...(token ? browser ? { Cookie: `shuug_customer=${token}` } : { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-reputation-`);
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, APP_BASE_URL: base, DEMO_DATA: "false", DATABASE_URL: "" })) vi.stubEnv(key, value);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, servicePortal: true, pricing: false, ordering: false, orderStatus: false, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), "Synthetic-reputation-password");
    return { id: user.id, clientId: client.id, token: signInCustomer(user.email, "Synthetic-reputation-password") };
  }
  alpha = await account("Alpha"); beta = await account("Beta"); peel.available = false; peel.attest.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("shares the complete account state across native and browser with explicit immutable mutation acknowledgments", async () => {
  const input = { action: "addRating", mutationId: randomUUID(), rating: rating() };
  const first = await POST(request(alpha.token, input)); expect(first.status).toBe(200); const saved = await first.json();
  expect(saved.acknowledgedMutationId).toBe(input.mutationId); expect(saved.ratings[0]).toMatchObject({ ...input.rating, recordedAt: new Date(input.rating.recordedAt).toISOString() });
  expect(await (await POST(request(alpha.token, input))).json()).toEqual(saved);
  const browser = await (await GET(request(alpha.token, undefined, true))).json();
  expect(browser.ratings).toEqual(saved.ratings); expect(browser).not.toHaveProperty("acknowledgedMutationId");
  expect((await (await GET(request(beta.token))).json()).ratings).toEqual([]);
  expect((await POST(request(alpha.token, { ...input, rating: { ...input.rating, score: 4.1 } }))).status).toBe(409);
  expect((await POST(request(alpha.token, { ...input, mutationId: randomUUID(), rating: { ...input.rating, score: 4.1 } }))).status).toBe(409);
  expect(staffReputation()[0].state.ratings).toHaveLength(1);
});
it("retains explicit deletion tombstones and prevents stale add retries from resurrecting a record", async () => {
  const row = review(), add = { action: "addReview", mutationId: randomUUID(), review: row };
  updateReputation(alpha.token, add);
  const remove = { action: "deleteReview", mutationId: randomUUID(), id: row.id };
  const deleted = updateReputation(alpha.token, remove); expect(deleted.reviews[0].deleted).toBe(true);
  expect(updateReputation(alpha.token, remove)).toEqual(deleted);
  expect(updateReputation(alpha.token, add).reviews[0].deleted).toBe(true);
  expect(() => updateReputation(alpha.token, { ...add, mutationId: randomUUID() })).toThrow("cannot be changed or restored");
  expect((await POST(request(beta.token, remove))).status).toBe(404);
  expect((await POST(request(alpha.token, { action: "deleteRating", mutationId: randomUUID(), id: randomUUID() }))).status).toBe(404);
});
it("checks session revocation, service access, origin, payload boundaries and current client binding", async () => {
  expect((await GET(request())).status).toBe(401);
  expect((await POST(request(alpha.token, { action: "addRating", mutationId: randomUUID(), rating: rating() }, true))).status).toBe(403);
  expect((await POST(request(alpha.token, { action: "addRating", mutationId: randomUUID(), rating: rating() }, true, base))).status).toBe(200);
  const input = { action: "addReview", mutationId: randomUUID(), review: review() };
  expect((await POST(request(alpha.token, input, false, "https://attacker.example"))).status).toBe(403);
  for (const invalid of [{ ...rating(), score: 5.1 }, { ...rating(), scale: 10 }, { ...rating(), reviewCount: -1 }, { ...rating(), notes: "x".repeat(501) }]) {
    expect((await POST(request(alpha.token, { action: "addRating", mutationId: randomUUID(), rating: invalid }))).status).toBe(400);
  }
  saveCustomerSettings({ ...customerSettings(), servicePortal: false }); expect((await GET(request(alpha.token))).status).toBe(404);
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });
  workspaceDatabase(db => db.prepare("UPDATE customer_accounts SET clientId=? WHERE id=?").run(beta.clientId, alpha.id), true);
  expect(readReputation(alpha.token).ratings).toEqual([]);
  setCustomerEnabled(alpha.id, false); expect((await GET(request(alpha.token))).status).toBe(401);
});
it("keeps full bounded history including deleted records and rejects capacity instead of silently pruning", async () => {
  workspaceDatabase(db => { initReputation(db); const insert = db.prepare("INSERT INTO driver_reputation VALUES(?,?,?,?,?,?)");
    for (let i = 0; i < 500; i++) { const row = { ...rating(), deleted: true }; insert.run(alpha.id, alpha.clientId, "rating", row.id, JSON.stringify(row), "fixture"); }
  }, true);
  expect(readReputation(alpha.token).ratings).toHaveLength(500);
  const response = await POST(request(alpha.token, { action: "addRating", mutationId: randomUUID(), rating: rating() }));
  expect(response.status).toBe(413); expect(readReputation(alpha.token).ratings).toHaveLength(500);
  expect(updateReputation(alpha.token, { action: "addReview", mutationId: randomUUID(), review: review() }).reviews).toHaveLength(1);
});
it("keeps scales and dates separate and derives improvements only from selected mixed or negative review topics", () => {
  const first = rating(), later = { ...first, id: randomUUID(), score: 4.9, recordedAt: "2026-11-08T02:00:00Z" };
  const percent = { ...first, id: randomUUID(), score: 97, scale: 100 };
  const mixed = review(), positive = { ...mixed, id: randomUUID(), sentiment: "positive" as const, topics: ["communication" as const] };
  const unreviewed = { ...mixed, id: randomUUID(), sentiment: "unreviewed" as const, topics: ["timing" as const] };
  const data = { apiVersion: 1 as const, ratings: [first, later, percent], reviews: [mixed, positive, unreviewed] } as Parameters<typeof reputationGuide>[0];
  const guide = reputationGuide(data);
  expect(guide.snapshots).toHaveLength(1); expect(guide.snapshots.find(row => row.includes("4.9/5"))).toContain("previous same-scale snapshot 4.8/5");
  expect(guide.suggestions.map(row => row.topic)).toEqual(["accuracy"]); expect(guide.strengths.join(" ")).toContain("communication");
  expect(reputationAnswer(data).text).toContain("No platform thresholds");
  expect(isReputationQuestion("Review my expenses")).toBe(false); expect(isReputationQuestion("What do my customer reviews suggest?")).toBe(true);
});
it("answers reputation chat from the same scoped records and never invokes financial Peel attestation for that question", async () => {
  updateReputation(alpha.token, { action: "addReview", mutationId: randomUUID(), review: { ...review(), text: "ALPHA ACCURACY NOTE" } });
  updateReputation(beta.token, { action: "addReview", mutationId: randomUUID(), review: { ...review(), text: "BETA PRIVATE" } });
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { id: randomUUID(), revision: 0, deleted: false, kind: "trip", body: {
    startedAt: "2026-11-06T12:00:00Z", endedAt: "2026-11-06T13:00:00Z", distanceMeters: 0, classification: "business", source: "manual", purpose: "Store job", notes: "", hasGaps: false, sampleCount: 0, rideRole: "shopping", earningsCents: 1800, platformFeesCents: 200 } } });
  peel.available = true;
  const response = await coach(new Request(base + "/api/website/customer/driver/coach", { method: "POST", headers: { Authorization: `Bearer ${alpha.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "message", mutationId: randomUUID(), messageId: randomUUID(), text: "How can I improve my ratings and reviews?", from: "2026-11-01", through: "2026-11-30" }) }));
  expect(response.status).toBe(200); const result = await response.json(), answer = result.messages.at(-1);
  expect(answer.text).toContain("accuracy"); expect(answer.text).not.toContain("BETA PRIVATE");
  expect(answer.engine).toBe("record-rules"); expect(result.engine.peelAvailable).toBe(false); expect(peel.attest).not.toHaveBeenCalled();
});
