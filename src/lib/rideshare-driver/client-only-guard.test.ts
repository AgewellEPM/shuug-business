// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { importBusinessTemplate } from "../branding/templates";
import { gigTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveCustomerSettings } from "../customer-access/service";
import { createCustomerAccount, issueCustomerInvitation, acceptCustomerInvitation, signInCustomer } from "../customer-access/accounts";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { initClientOnly } from "../secure-tax/client-only/store";
import { updateReputation } from "../driver-reputation/store";
import { driverAccount } from "./policy";

let directory: string, token: string, account: { id: string; clientId: string | null };
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/gigtax-driver-profile-guard-`);
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, DEMO_DATA: "false", DATABASE_URL: "", SHUUG_REQUIRE_MFA: "false", GIGTAX_REQUIRE_CLIENT_ONLY: "false", GIGTAX_REQUIRE_PROTECTED_CLIENTS: "false" })) vi.stubEnv(key, value);
  importBusinessTemplate(gigTaxProsTemplate); saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  const client = saveBusinessRecord({ kind: "client", title: "Synthetic policy fixture", fields: { email: "synthetic-driver@example.invalid" } }, "owner");
  account = createCustomerAccount({ name: "Synthetic driver", email: "synthetic-driver@example.invalid", clientId: client.id, customerId: null });
  acceptCustomerInvitation(issueCustomerInvitation(account.id), "Synthetic driver password"); token = signInCustomer("synthetic-driver@example.invalid", "Synthetic driver password");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
const review = () => ({ action: "addReview", mutationId: randomUUID(), review: { id: randomUUID(), platformID: "synthetic", platformName: "Synthetic", recordedAt: new Date().toISOString(), text: "Synthetic private review", sentiment: "positive", topics: [], deleted: false } });
it("blocks in-process legacy driver writes on the dedicated cloud before reputation persistence", () => {
  vi.stubEnv("GIGTAX_REQUIRE_CLIENT_ONLY", "true");
  expect(() => workspaceDatabase(db => driverAccount(db, token))).toThrow("client-owned");
  expect(() => updateReputation(token, review())).toThrow("client-owned");
  expect(workspaceDatabase(db => db.prepare("SELECT 1 FROM sqlite_schema WHERE name='driver_reputation'").get())).toBeUndefined();
});
it("retains ordinary generic behavior but permanently rejects anchored account and shared-client scopes without either flag", () => {
  const first = review(); updateReputation(token, first);
  // Policy framing fixture; actual cryptographic activation is tested separately.
  workspaceDatabase(db => { initClientOnly(db); db.prepare("INSERT INTO secure_tax_client_only_bindings VALUES(?,?,?,?,?,?,?)").run(randomUUID(), account.clientId, "synthetic-workspace", "client-only-v1", "synthetic-public-id", "synthetic-public-point", new Date().toISOString()); }, true);
  expect(() => workspaceDatabase(db => driverAccount(db, token))).toThrow("client-owned");
  expect(() => updateReputation(token, review())).toThrow("client-owned");
  expect(workspaceDatabase(db => (db.prepare("SELECT count(*) AS n FROM driver_reputation").get() as { n: number }).n)).toBe(1);
});
