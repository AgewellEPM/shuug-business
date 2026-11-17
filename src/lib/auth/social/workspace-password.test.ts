// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { importBusinessTemplate } from "../../branding/templates";
import { gigTaxProsTemplate } from "../../industry/rideshare-tax-pros";
import { initClientOnly } from "../../secure-tax/client-only/store";
import { initPrivateAccounts, signInPrivateTaxAccount } from "../../secure-tax/private-accounts";
import { workspaceDatabase } from "../../workspace/database";
import { totp } from "../mfa/crypto";
import { MfaChallengeError } from "../mfa/model";
import { completeLoginFactor, loginFactorView } from "../mfa/store";
import { configureOwnerPassword, signInOwner } from "../owner-session";
import { hashPassword } from "../passwords";
import { listWorkspaceAssignments, manageWorkspaceAssignment, workspaceRoleSession } from "./workspace-access";
import { acceptWorkspacePasswordInvitation, bindWorkspaceEmail, signInWorkspacePassword } from "./workspace-password";

let directory: string, ownerToken: string;
const ownerPassword = "Synthetic owner account password";
const clientPassword = "Synthetic client account password";
const staffPassword = "Synthetic staff account password";

function verifySetup(start: () => unknown, audience: "staff" | "secure-customer") {
  try { start(); }
  catch (error) {
    if (!(error instanceof MfaChallengeError)) throw error;
    const { challengeToken } = error.challenge;
    const secret = loginFactorView(challengeToken, audience).secret!;
    return completeLoginFactor(challengeToken, totp(secret, Math.floor(Date.now() / 30000)), audience).token;
  }
  throw new Error("MFA was required");
}

beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/gigtax-workspace-password-`);
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, DATABASE_URL: "", DEMO_DATA: "false", SHUUG_REQUIRE_MFA: "true", GIGTAX_REQUIRE_CLIENT_ONLY: "true" })) vi.stubEnv(key, value);
  importBusinessTemplate(gigTaxProsTemplate);
  configureOwnerPassword(ownerPassword);
  ownerToken = verifySetup(() => signInOwner(ownerPassword), "staff");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("binds verified owner and client accounts with their current password and still requires MFA at email sign-in", () => {
  const clientId = randomUUID(), accountId = randomUUID(), clientEmail = "CLIENT@EXAMPLE.TEST";
  workspaceDatabase(db => {
    initPrivateAccounts(db); initClientOnly(db);
    db.prepare("INSERT INTO secure_tax_accounts VALUES(?,?,'active',?,?,NULL)").run(accountId, clientId, hashPassword(clientPassword), new Date().toISOString());
    db.prepare("INSERT INTO secure_tax_client_only_bindings VALUES(?,?,?,?,?,?,?)").run(accountId, clientId, "synthetic", "client-only-v1", "synthetic-public-id", "synthetic-public-key", new Date().toISOString());
  }, true);
  const clientToken = verifySetup(() => signInPrivateTaxAccount(accountId, clientPassword), "secure-customer");
  const input = { email: clientEmail, currentPassword: clientPassword };
  expect(() => bindWorkspaceEmail("a".repeat(64), input)).toThrow("verify your authenticator");
  expect(() => bindWorkspaceEmail(clientToken, { ...input, currentPassword: ownerPassword })).toThrow("current password");
  expect(bindWorkspaceEmail(clientToken, input)).toEqual({ emailConfigured: true });
  expect(() => bindWorkspaceEmail(ownerToken, { email: clientEmail, currentPassword: ownerPassword })).toThrow("already in use");
  bindWorkspaceEmail(ownerToken, { email: "owner@example.test", currentPassword: ownerPassword });
  const client = signInWorkspacePassword({ email: " client@example.test ", password: clientPassword });
  expect(client).toMatchObject({ audience: "secure-customer", mfaRequired: true, enrollmentRequired: false });
  expect(client).not.toHaveProperty("ticket"); expect(client).not.toHaveProperty("token");
  expect(signInWorkspacePassword({ email: "owner@example.test", password: ownerPassword })).toMatchObject({ audience: "owner", mfaRequired: true });
  workspaceDatabase(db => {
    const rows = db.prepare("SELECT * FROM workspace_password_credentials").all();
    expect(rows).toHaveLength(2);
    for (const row of rows) { expect(row.emailDigest).toMatch(/^[a-f0-9]{64}$/); expect(row.passwordHash).toBeNull(); }
    expect(JSON.stringify(rows)).not.toContain("@example.test");
    db.prepare("UPDATE secure_tax_accounts SET status='disabled' WHERE id=?").run(accountId);
  }, true);
  expect(() => signInWorkspacePassword({ email: clientEmail, password: clientPassword })).toThrow("Check your email and password");
});

it("sets staff and tax location passwords from one-use invitations and ends old sessions on replacement", () => {
  function invite(role: "staff" | "location", targetId: string) {
    const { assignmentId: id } = manageWorkspaceAssignment(ownerToken, { action: "save", role, targetId, label: `Synthetic ${role}`, enabled: true });
    const invitation = manageWorkspaceAssignment(ownerToken, { action: "invite", id, revision: 1 }).invitation!;
    return { id, invitation };
  }
  const staff = invite("staff", "14"), location = invite("location", "27");
  const input = { email: "staff@example.test", password: staffPassword, invitation: staff.invitation };
  const joined = acceptWorkspacePasswordInvitation(input);
  expect(joined.audience).toBe("staff");
  expect(() => acceptWorkspacePasswordInvitation(input)).toThrow("expired or was used");
  expect(() => acceptWorkspacePasswordInvitation({ ...input, invitation: location.invitation })).toThrow("already in use");
  const office = acceptWorkspacePasswordInvitation({ ...input, email: "office@example.test", invitation: location.invitation });
  expect(office.audience).toBe("location");
  expect(listWorkspaceAssignments(ownerToken).assignments.every(assignment => assignment.passwordConfigured)).toBe(true);
  const session = workspaceRoleSession({ action: "redeem", token: joined.ticket });
  expect(session).toMatchObject({ role: "staff", targetId: "14" });
  if (!("session" in session)) throw new Error("Missing role session");
  expect(signInWorkspacePassword({ email: "staff@example.test", password: staffPassword })).toMatchObject({ audience: "staff" });
  const renewal = manageWorkspaceAssignment(ownerToken, { action: "invite", id: staff.id, revision: 1 }).invitation!;
  acceptWorkspacePasswordInvitation({ ...input, password: "Replacement synthetic staff password", invitation: renewal });
  expect(() => workspaceRoleSession({ action: "read", token: session.session })).toThrow("access changed");
  expect(signInWorkspacePassword({ email: "staff@example.test", password: "Replacement synthetic staff password" })).toMatchObject({ audience: "staff" });
  for (let i = 0; i < 8; i++) expect(() => signInWorkspacePassword({ email: "staff@example.test", password: staffPassword })).toThrow("Check your email and password");
  expect(() => signInWorkspacePassword({ email: "staff@example.test", password: "Replacement synthetic staff password" })).toThrow("try again later");
  expect(workspaceRoleSession({ action: "redeem", token: office.ticket })).toMatchObject({ role: "location", targetId: "27" });
});
