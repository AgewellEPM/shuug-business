// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled } from "../customer-access/accounts";
import { approveReferral, claimReferral, fulfillReferralReward, referralSummary, rejectReferral, requestReferralReward, staffReferralLedger } from "./referrals";
import { GET, POST } from "@/app/api/website/customer/driver/referrals/route";

let directory: string, alpha: { id: string; token: string; clientId: string }, beta: typeof alpha;
async function account(name: string) {
  const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
  const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
  acceptCustomerInvitation(issueCustomerInvitation(user.id), "Fixture-referral-password-only");
  return { id: user.id, clientId: client.id, token: signInCustomer(user.email, "Fixture-referral-password-only") };
}
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-driver-referral-`);
  for (const [key,value] of Object.entries({ DEALDESK_DATA_DIR: directory, APP_BASE_URL: "https://workspace.example.com", DEMO_DATA: "false", DATABASE_URL: "" })) vi.stubEnv(key,value);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  alpha = await account("Alpha"); beta = await account("Beta");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
function qualify(claimId: string) { approveReferral({ claimId, referrerUsesTaxPrep: true, firstPaidPreparationComplete: true, proof: "Synthetic paid tax-prep invoice" }, "fixture-staff"); }
it("creates a stable code, rejects self/duplicate claims and hides a referred client's identity", () => {
  const first = referralSummary(alpha.token); expect(first.code).toMatch(/^RTP-[A-F0-9]{10}$/);
  expect(referralSummary(alpha.token).code).toBe(first.code);
  expect(() => claimReferral(alpha.token, { code: first.code })).toThrow("Self-referrals");
  claimReferral(beta.token, { code: first.code.toLowerCase() });
  claimReferral(beta.token, { code: first.code });
  const snapshot = referralSummary(alpha.token); expect(snapshot.claims).toHaveLength(1); expect(snapshot.points).toBe(0); expect(snapshot.rewards).toEqual([]);
  expect(JSON.stringify(snapshot)).not.toContain("Beta"); expect(JSON.stringify(snapshot)).not.toContain(beta.clientId);
  expect(() => claimReferral(beta.token, { code: referralSummary(beta.token).code })).toThrow("Self-referrals");
});
it("awards exactly one $20 reward and 100 points only after staff verifies paid preparation", () => {
  claimReferral(beta.token, { code: referralSummary(alpha.token).code });
  const id = staffReferralLedger().claims[0].id;
  expect(() => approveReferral({ claimId: id, referrerUsesTaxPrep: true, firstPaidPreparationComplete: false, proof: "Not paid" }, "fixture-staff")).toThrow();
  expect(referralSummary(alpha.token).points).toBe(0);
  qualify(id); qualify(id);
  const summary = referralSummary(alpha.token);
  expect(summary.points).toBe(100); expect(summary.rewards).toHaveLength(1);
  expect(summary.rewards[0]).toMatchObject({ amountCents: 2000, status: "available", method: null });
  expect(() => rejectReferral({ claimId: id, reason: "Cannot erase earned history" }, "fixture-staff")).toThrow("audited adjustment");
});
it("offers cash or credit once per reward and records fulfillment without sending a payment", () => {
  claimReferral(beta.token, { code: referralSummary(alpha.token).code }); qualify(staffReferralLedger().claims[0].id);
  const rewardId = String(referralSummary(alpha.token).rewards[0].id);
  expect(() => requestReferralReward(beta.token, { rewardId, method: "cash" })).toThrow("unavailable");
  requestReferralReward(alpha.token, { rewardId, method: "cash" }); requestReferralReward(alpha.token, { rewardId, method: "cash" });
  expect(() => requestReferralReward(alpha.token, { rewardId, method: "credit" })).toThrow("already");
  fulfillReferralReward({ rewardId, reference: "Fixture payout completed externally" }, "fixture-staff");
  fulfillReferralReward({ rewardId, reference: "Fixture payout completed externally" }, "fixture-staff");
  expect(referralSummary(alpha.token).rewards[0]).toMatchObject({ status: "fulfilled", method: "cash", amountCents: 2000 });
});
it("unlocks the 500-point extra credit exactly once, with no conversion to an extra cash payout", async () => {
  const code = referralSummary(alpha.token).code;
  for (const name of ["Beta", "Gamma", "Delta", "Epsilon", "Zeta"]) {
    const user = name === "Beta" ? beta : await account(name);
    claimReferral(user.token, { code });
    qualify(staffReferralLedger().claims.find(c => c.referredId === user.id)!.id);
  }
  const state = referralSummary(alpha.token); expect(state.points).toBe(500); expect(state.nextMilestone).toBe(1000);
  expect(state.rewards).toHaveLength(6);
  expect(state.rewards.reduce((sum,r) => sum+Number(r.amountCents),0)).toBe(12000);
  const milestone = state.rewards.find(r => r.kind === "milestone")!;
  expect(() => requestReferralReward(alpha.token, { rewardId: milestone.id, method: "cash" })).toThrow("tax-prep credit");
  requestReferralReward(alpha.token, { rewardId: milestone.id, method: "credit" });
  qualify(staffReferralLedger().claims[0].id); expect(referralSummary(alpha.token).rewards).toHaveLength(6);
});
it("prevents qualification after account revocation and rejects forged client/staff operations on native routes", async () => {
  claimReferral(beta.token, { code: referralSummary(alpha.token).code }); setCustomerEnabled(beta.id, false);
  expect(() => qualify(staffReferralLedger().claims[0].id)).toThrow("disabled");
  const url = "https://workspace.example.com/api/website/customer/driver/referrals";
  expect((await GET(new Request(url))).status).toBe(401);
  const post = (body: object, origin?: string) => POST(new Request(url, { method: "POST", headers: { Authorization: `Bearer ${alpha.token}`, "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) }));
  expect((await post({ action: "approve", claimId: randomUUID() })).status).toBe(400);
  expect((await post({ action: "claim", code: referralSummary(alpha.token).code }, "https://other.example")).status).toBe(403);
  expect((await GET(new Request(url, { headers: { Authorization: `Bearer ${alpha.token}` } }))).headers.get("cache-control")).toBe("private, no-store");
});
