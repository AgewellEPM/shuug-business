// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { importBusinessTemplate } from "../branding/templates";
import { gigTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { saveClientBook } from "../accounting/client-books";
import { bookCommand } from "../accounting/book-service";
import { createEmployeeAccount, acceptEmployeeInvitation, issueEmployeeInvitation } from "../auth/employees";
import type { WorkspaceUser } from "../auth/identity";
import { submitTaxDocument, reviewTaxDocument, staffTaxDocument } from "../customer-access/tax-documents";
import { executeTaxOfficeCommand, taxOfficeView, taxPackageManifest } from "./service";

let directory: string;
const owner: WorkspaceUser = { id: "workspace-owner", memberId: "owner", name: "Synthetic owner", email: "", role: "Owner", isOwner: true };
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-tax-workflow-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("DATABASE_URL", "");
  importBusinessTemplate(gigTaxProsTemplate);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
function create(accountantId = owner.id) {
  const client = saveBusinessRecord({ kind: "client", title: "Synthetic private taxpayer", fields: { email: "taxpayer@example.invalid" } }, owner.id);
  const { id } = executeTaxOfficeCommand({ requestId: randomUUID(), action: "engagement.create", input: { clientId: client.id, name: "Synthetic private return", taxYear: 2025, accountantId, due: "", shareWithClient: false, reviewed: true } }, owner);
  return { id, client };
}
function current(id: string) {
  const entry = taxOfficeView(owner).find(entry => entry.engagement.id === id);
  if (!entry) throw new Error("Synthetic case unavailable");
  return entry;
}
function command(id: string, action: string, input: object, user = owner) {
  return executeTaxOfficeCommand({ requestId: randomUUID(), action, input: { id, revision: current(id).workflow.revision, ...input, reviewed: true } }, user);
}
function request(id: string, name: string, purpose: string) {
  command(id, "request.create", { name, purpose, due: "", shareWithClient: false });
  return current(id).requests.find(request => request.values.name === name)!.id;
}
function document(id: string, requestId: string, text: string, reviewed = true) {
  const file = submitTaxDocument(undefined, requestId, "synthetic.pdf", Buffer.from(`%PDF-1.4\n${text}`), { user: owner, clientId: current(id).client.id });
  if (reviewed) reviewTaxDocument(file.id, "reviewed", owner.id, owner);
  return file.id;
}
function prepared(id: string) {
  const returnRequest = request(id, "Prepared return", "Prepared return"), authorizationRequest = request(id, "Client authorization", "Client authorization");
  return { returnRequest, authorizationRequest, returnId: document(id, returnRequest, "Original prepared return"), authorizationId: document(id, authorizationRequest, "Original client authorization") };
}
function approve(id: string, returnId: string, authorizationId: string) {
  command(id, "workflow.stage", { stage: "review", notes: "Synthetic accountant review" });
  return command(id, "workflow.approve", { returnDocumentId: returnId, authorizationDocumentId: authorizationId, notes: "Synthetic exact-package approval" });
}
function employee(): WorkspaceUser {
  const account = createEmployeeAccount({ memberId: "synthetic-accountant", name: "Synthetic accountant", email: "accountant@example.invalid" });
  acceptEmployeeInvitation(issueEmployeeInvitation(account.id), "Synthetic-accountant-password");
  return { id: account.id, memberId: account.memberId, name: account.name, email: account.email, role: "Manager", isOwner: false };
}
it("requires source review before approval and binds the approved documents to the exact package", () => {
  const { id } = create(), sourceRequest = request(id, "Income statement", "Client records");
  const source = document(id, sourceRequest, "Synthetic income statement", false), files = prepared(id);
  expect(() => approve(id, files.returnId, files.authorizationId)).toThrow(/Resolve missing/);
  reviewTaxDocument(source, "reviewed", owner.id, owner);
  approve(id, files.returnId, files.authorizationId);
  const manifest = taxPackageManifest(id, owner);
  for(const request of current(id).requests)for(const file of request.files)expect(Object.getPrototypeOf(file)).toBe(Object.prototype);
  expect(manifest.approval).toMatchObject({ returnDocumentId: files.returnId, authorizationDocumentId: files.authorizationId, digest: manifest.digest });
  expect(current(id).workflow.authorizationBindings).toEqual([expect.objectContaining({ authorizationDocumentId: files.authorizationId, returnDocumentId: files.returnId, digest: manifest.digest })]);
  expect(manifest.filingCapability).toContain("Not an IRS transmission");
});
it("retains authorization bindings after reopening and rejects an old authorization for a corrected return", () => {
  const { id } = create(), files = prepared(id);
  approve(id, files.returnId, files.authorizationId);
  const oldDigest = taxPackageManifest(id, owner).digest;
  const corrected = document(id, files.returnRequest, "Corrected prepared return");
  expect(current(id).approvalCurrent).toBe(false);
  expect(() => taxPackageManifest(id, owner)).toThrow(/package changed/);
  command(id, "workflow.stage", { stage: "review", notes: "Review corrected return" });
  expect(current(id).workflow.approval).toBeNull();
  expect(() => command(id, "workflow.approve", { returnDocumentId: corrected, authorizationDocumentId: files.authorizationId, notes: "Attempt old authorization reuse" })).toThrow(/authorization belongs to an earlier/);
  expect(current(id).workflow.authorizationBindings[0].digest).toBe(oldDigest);
  const freshAuthorization = document(id, files.authorizationRequest, "New authorization for corrected prepared return");
  approve(id, corrected, freshAuthorization);
  expect(taxPackageManifest(id, owner).approval.authorizationDocumentId).toBe(freshAuthorization);
  expect(current(id).workflow.authorizationBindings).toHaveLength(2);
});
it("requires new authorization after financial package changes even when the selected return file is unchanged", async () => {
  const { id, client } = create();
  const book = saveClientBook({ clientId: client.id, name: "Synthetic client book", revision: 0, grants: [], reviewed: true }, owner);
  const post = (cents: number) => bookCommand(book.id, { requestId: randomUUID(), action: "journal.post", input: { date: "2025-10-01", memo: "Synthetic receipt", lines: [{ accountNumber: 1000, debitCents: cents, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: cents }], reviewed: true } }, owner);
  await post(10000);
  const files = prepared(id); approve(id, files.returnId, files.authorizationId);
  await post(2500);
  expect(current(id).approvalCurrent).toBe(false);
  command(id, "workflow.stage", { stage: "review", notes: "Review changed client books" });
  expect(() => command(id, "workflow.approve", { returnDocumentId: files.returnId, authorizationDocumentId: files.authorizationId, notes: "Old authorization with changed books" })).toThrow(/authorization belongs to an earlier/);
});
it("rejects identical old authorization bytes uploaded under another staff identity and document ID", () => {
  const staff = employee(), { id, client } = create(staff.id), files = prepared(id);
  approve(id, files.returnId, files.authorizationId);
  const original = staffTaxDocument(files.authorizationId, owner);
  const corrected = document(id, files.returnRequest, "Corrected return requiring fresh authorization");
  const duplicate = submitTaxDocument(undefined, files.authorizationRequest, "copied-old-authorization.pdf", original.bytes, { user: staff, clientId: client.id });
  expect(duplicate.id).not.toBe(files.authorizationId);
  reviewTaxDocument(duplicate.id, "reviewed", owner.id, owner);
  command(id, "workflow.stage", { stage: "review", notes: "Review corrected package" });
  expect(() => command(id, "workflow.approve", { returnDocumentId: corrected, authorizationDocumentId: duplicate.id, notes: "Try copied authorization under new document ID" })).toThrow(/authorization belongs to an earlier/);
  expect(current(id).workflow.authorizationBindings[0].authorizationDigest).toBe(original.digest);
});
it("recovers legacy authorization bindings from retained approval audits after the current approval was cleared", () => {
  const { id } = create(), files = prepared(id); approve(id, files.returnId, files.authorizationId);
  command(id, "workflow.stage", { stage: "documents", notes: "Reopen legacy review" });
  workspaceDatabase(db => {
    const row = db.prepare("SELECT body FROM documents WHERE id=?").get(`tax-workflow:${id}`) as { body: string };
    const flow = JSON.parse(row.body); delete flow.authorizationBindings;
    db.prepare("UPDATE documents SET body=? WHERE id=?").run(JSON.stringify(flow), `tax-workflow:${id}`);
  }, true);
  const corrected = document(id, files.returnRequest, "Corrected legacy return");
  expect(current(id).workflow.authorizationBindings).toHaveLength(1);
  expect(() => approve(id, corrected, files.authorizationId)).toThrow(/authorization belongs to an earlier/);
});
it("ties terminal acknowledgments to a specific sent attempt and rejects mismatches and conflicting outcomes", () => {
  const { id } = create(), files = prepared(id); approve(id, files.returnId, files.authorizationId);
  const evidenceRequest = request(id, "External filing evidence", "Filing acknowledgment"), evidenceId = document(id, evidenceRequest, "Synthetic external receipt");
  const submission = { channel: "Synthetic provider", reference: "attempt-1", evidenceDocumentId: evidenceId, notes: "Staff reviewed synthetic external evidence" };
  command(id, "submission.record", { ...submission, outcome: "sent" });
  const attempt = current(id).workflow.submissions[0];
  expect(() => command(id, "submission.record", { ...submission, outcome: "accepted" })).toThrow(/Choose the sent submission attempt/);
  for (const changed of [{ channel: "Other provider" }, { reference: "unrelated-reference" }, { attemptId: randomUUID() }]) {
    expect(() => command(id, "submission.record", { ...submission, attemptId: attempt.id, ...changed, outcome: "accepted" })).toThrow(/exact package, channel and reference/);
  }
  command(id, "submission.record", { ...submission, attemptId: attempt.id, outcome: "accepted" });
  expect(current(id).workflow.submissions[1]).toMatchObject({ attemptId: attempt.id, digest: attempt.digest, channel: attempt.channel, reference: attempt.reference, outcome: "accepted" });
  expect(() => command(id, "submission.record", { ...submission, attemptId: attempt.id, outcome: "rejected" })).toThrow(/already has an acceptance or rejection/);
  expect(() => command(id, "submission.record", { ...submission, outcome: "sent" })).toThrow(/already recorded/);
});
it("rejects a prior-package submission attempt after approving a corrected package", () => {
  const { id } = create(), files = prepared(id); approve(id, files.returnId, files.authorizationId);
  const evidenceRequest = request(id, "Filing receipt", "Filing acknowledgment"), evidenceId = document(id, evidenceRequest, "Synthetic sent receipt");
  const submission = { channel: "Synthetic provider", reference: "original-attempt", evidenceDocumentId: evidenceId, notes: "Synthetic external evidence" };
  command(id, "submission.record", { ...submission, outcome: "sent" });
  const attempt = current(id).workflow.submissions[0];
  const corrected = document(id, files.returnRequest, "Corrected after rejection"), authorization = document(id, files.authorizationRequest, "Fresh corrected authorization");
  approve(id, corrected, authorization);
  expect(() => command(id, "submission.record", { ...submission, attemptId: attempt.id, outcome: "accepted" })).toThrow(/exact package, channel and reference/);
});
it("allows owner reassignment, immediately revokes an assignment and preserves history and retry boundaries", () => {
  const staff = employee(), { id } = create(staff.id), files = prepared(id); approve(id, files.returnId, files.authorizationId);
  expect(taxOfficeView(staff).map(entry => entry.engagement.id)).toContain(id);
  const revision = current(id).workflow.revision;
  expect(() => command(id, "engagement.assign", { accountantId: owner.id, notes: "Unauthorized assignment attempt" }, staff)).toThrow(/Only the owner/);
  const request = { requestId: randomUUID(), action: "engagement.assign", input: { id, revision, accountantId: owner.id, notes: "Owner revokes previous accountant assignment", reviewed: true } };
  executeTaxOfficeCommand(request, owner);
  expect(executeTaxOfficeCommand(request, owner)).toEqual({ id });
  expect(current(id).workflow).toMatchObject({ assignedAccountId: owner.id, approval: null, stage: "documents", revision: revision + 1 });
  expect(current(id).workflow.authorizationBindings).toHaveLength(1);
  expect(current(id).workflow.history.at(-1)).toMatchObject({ action: "engagement.assign", actor: owner.id, notes: request.input.notes });
  expect(taxOfficeView(staff)).toEqual([]);
  expect(() => staffTaxDocument(files.returnId, staff)).toThrow(/not assigned/);
  expect(() => executeTaxOfficeCommand({ ...request, requestId: randomUUID() }, owner)).toThrow(/Tax work changed/);
  expect(() => executeTaxOfficeCommand({ ...request, input: { ...request.input, accountantId: staff.id } }, owner)).toThrow(/another tax-office action/);
});
it("redacts legacy case details and history when the client has enrolled in offhost encryption", () => {
  const { id, client } = create(), files = prepared(id); approve(id, files.returnId, files.authorizationId);
  workspaceDatabase(db => {
    db.exec("CREATE TABLE secure_tax_enrollments(accountId TEXT,clientId TEXT,status TEXT)");
    db.prepare("INSERT INTO secure_tax_enrollments VALUES(?,?,'active')").run(randomUUID(), client.id);
  }, true);
  const cases = taxOfficeView(owner), serialized = JSON.stringify(cases);
  expect(cases).toHaveLength(1); expect(cases[0].engagement.id).toBe(id);
  for (const protectedText of [client.title, client.id, "Synthetic private return", "Synthetic exact-package approval", files.returnId, files.authorizationId]) expect(serialized).not.toContain(protectedText);
  expect(cases[0].workflow.history).toEqual([]);
  expect(() => taxPackageManifest(id, owner)).toThrow(/offhost encrypted/);
  expect(() => command(id, "workflow.stage", { stage: "review", notes: "Attempt legacy access" })).toThrow(/offhost encrypted/);
});
