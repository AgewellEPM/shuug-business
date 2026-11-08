import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";

type Document = { id: string; name: string; status: string };
type Request = { id: string; values: { name: string; purpose: string }; files: Document[] };
type Engagement = {
  engagement: { id: string; values: { client_id: string } };
  requests: Request[];
  readiness: { id: string; ready: boolean }[];
  approvalCurrent: boolean;
  workflow: {
    revision: number; stage: string;
    approval: null | { digest: string; returnDocumentId: string; authorizationDocumentId: string };
    submissions: { id: string; attemptId?: string; digest: string; outcome: string; reference: string; verification: string }[];
  };
};
type Book = { id: string; revision: number; clientId: string; name: string; grants: { accountId: string; level: "view" | "edit" }[] };
type Manifest = { format: string; digest: string; approval: { digest: string; returnDocumentId: string }; filingCapability: string };

/** Compiled HTTP journey inside mfa-http-check's disposable workspace.
 * Every PDF below is labeled synthetic; no return is transmitted to a provider.
 * The caller owns server startup, workspace isolation and guaranteed cleanup. */
export async function officeWorkflowHttpCheck(base: string, ownerCookie: string, staffCookie: string, staffId: string, clientId: string) {
  assert.equal(new URL(base).hostname, "127.0.0.1", "Run only against the caller's local disposable server.");
  assert(process.env.DEALDESK_DATA_DIR?.startsWith(`${tmpdir()}/shuug-mfa-http-`), "Run only inside mfa-http-check's private temporary workspace.");
  let checks = 0;
  const request = (route: string, init: RequestInit = {}, cookie = ownerCookie) => fetch(base + route, {
    ...init, redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Cookie: cookie, ...init.headers },
  });
  async function json<T = Record<string, unknown>>(route: string, input: unknown, cookie = ownerCookie, expected = 200): Promise<T> {
    const response = await request(route, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(input) }, cookie);
    const body = await response.json();
    assert.equal(response.status, expected, typeof body.error === "string" ? body.error : route); checks++;
    return body as T;
  }
  async function cases(cookie = ownerCookie) {
    const response = await request("/api/tax-office", {}, cookie);
    assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return (await response.json()).engagements as Engagement[];
  }
  async function engagement(id: string, cookie = ownerCookie) {
    const found = (await cases(cookie)).find(row => row.engagement.id === id);
    assert(found, "Synthetic engagement should be visible to the authorized account."); return found;
  }
  async function genericRecords(cookie: string) {
    const response = await request("/api/v1/m/tax-engagements", {}, cookie);
    assert.equal(response.status, 200);
    const body = await response.json(); return body.data.records as { id: string; values: { name: string } }[];
  }
  const command = (action: string, input: unknown, cookie = ownerCookie, expected = 200, requestId = randomUUID()) =>
    json<{ result: { id: string }; error?: string }>("/api/tax-office", { requestId, action, input }, cookie, expected);
  async function mutate(id: string, action: string, input: Record<string, unknown>, cookie = ownerCookie, expected = 200) {
    const view = await engagement(id);
    return command(action, { id, revision: view.workflow.revision, ...input, reviewed: true }, cookie, expected);
  }
  async function addRequest(id: string, name: string, purpose: string) {
    await mutate(id, "request.create", { name, purpose, due: "", shareWithClient: false });
    const created = (await engagement(id)).requests.find(row => row.values.name === name); assert(created); return created.id;
  }
  function pdf(label: string) { return Buffer.from(`%PDF-1.7\nSynthetic office acceptance fixture: ${label}. Not valid for filing.\n%%EOF\n`); }
  async function upload(id: string, requestId: string, label: string, cookie = ownerCookie, expected = 201) {
    const form = new FormData(); form.set("requestId", requestId);
    form.set("file", new File([pdf(label)], `${label.replaceAll(" ", "-")}.pdf`, { type: "application/pdf" }));
    const response = await request(`/api/tax-office/${id}/documents`, { method: "POST", headers: { Origin: base }, body: form }, cookie);
    const body = await response.json(); assert.equal(response.status, expected, body.error); checks++;
    return body.document as Document | undefined;
  }
  async function reviewed(id: string, cookie = ownerCookie) { await json(`/api/tax-documents/${id}`, { status: "reviewed" }, cookie); }
  async function reviewedUpload(id: string, requestId: string, label: string) {
    const document = await upload(id, requestId, label); assert(document); await reviewed(document.id); return document.id;
  }
  async function approvedPackage(id: string) {
    const response = await request(`/api/tax-office/${id}/package`);
    assert.equal(response.status, 200); assert.equal(response.headers.get("Content-Type"), "application/zip");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const bytes = Buffer.from(await response.arrayBuffer()), files = new Map<string, Buffer>();
    let offset = 0;
    // Independently inspect the exported stored ZIP members, including exact document bytes.
    while (bytes.readUInt32LE(offset) === 0x04034b50) {
      assert.equal(bytes.readUInt16LE(offset + 8), 0, "Fixture handoff members should use stored ZIP encoding.");
      const length = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
      const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"), start = offset + 30 + nameLength + extraLength;
      assert(!files.has(name)); assert(!name.split("/").includes(".."));
      files.set(name, bytes.subarray(start, start + length)); offset = start + length;
    }
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50); assert(files.has("manifest.json"));
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8")) as Manifest;
    assert.equal(manifest.format, "shuug-reviewed-tax-package-v1"); assert.equal(manifest.digest, manifest.approval.digest);
    assert.match(manifest.filingCapability, /handoff package only/i); assert.match(manifest.filingCapability, /not an IRS transmission/i); checks++;
    return { manifest, files };
  }

  assert.equal((await request("/api/tax-office", {}, "")).status, 403); checks++;
  const foreign = await request("/api/tax-office", { method: "POST", headers: { Origin: "https://foreign.example.invalid", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(foreign.status, 403); checks++;
  await json("/api/workspace/employees", { action: "role", id: staffId, role: "Manager" });
  const bookResponse = await request("/api/accounting/books"); assert.equal(bookResponse.status, 200);
  let book = ((await bookResponse.json()).books as Book[]).find(row => row.clientId === clientId);
  if (!book) book = (await json<{ book: Book }>("/api/accounting/books", { clientId, name: "Synthetic office client books", revision: 0, grants: [], reviewed: true })).book;
  const originalGrants = book.grants;
  async function grant(level?: "view" | "edit") {
    const response = await request("/api/accounting/books"), current = ((await response.json()).books as Book[]).find(row => row.id === book!.id); assert(current);
    book = (await json<{ book: Book }>("/api/accounting/books", { id: current.id, clientId, name: current.name, revision: current.revision,
      grants: [...originalGrants.filter(row => row.accountId !== staffId), ...(level ? [{ accountId: staffId, level }] : originalGrants.filter(row => row.accountId === staffId))], reviewed: true })).book;
  }
  await grant();
  const createInput = { clientId, name: "Synthetic individual return 2026", taxYear: 2026, accountantId: "workspace-owner", due: "", shareWithClient: false, reviewed: true };
  const createId = randomUUID(), created = await command("engagement.create", createInput, ownerCookie, 200, createId), id = created.result.id;
  const retried = await command("engagement.create", createInput, ownerCookie, 200, createId); assert.equal(retried.result.id, id); checks++;
  await command("engagement.create", { ...createInput, name: "Changed request retry" }, ownerCookie, 400, createId);
  assert(!(await cases(staffCookie)).some(row => row.engagement.id === id)); checks++;
  assert(!(await genericRecords(staffCookie)).some(row => row.id === id)); checks++;
  const sourceId = await addRequest(id, "Synthetic income records", "Client records"), waiverId = await addRequest(id, "Synthetic mileage not applicable", "Client records");
  const returnRequestId = await addRequest(id, "Synthetic prepared return", "Prepared return"), authorizationRequestId = await addRequest(id, "Synthetic authorization evidence", "Client authorization");
  const acknowledgmentRequestId = await addRequest(id, "Synthetic external filing evidence", "Filing acknowledgment");
  await mutate(id, "workflow.stage", { stage: "review", notes: "Expected unresolved-source denial" }, ownerCookie, 400);
  await mutate(id, "request.waive", { requestId: waiverId, reason: "Synthetic individual has no business mileage." });

  const secondClient = await json<{ record: { id: string } }>("/api/workspace/records", { command: "save", input: { kind: "client", title: "Synthetic second household", fields: { email: "second-household@example.invalid" } } });
  const other = await command("engagement.create", { ...createInput, clientId: secondClient.record.id, name: "Synthetic other household return" });
  const wrongRequest = await addRequest(other.result.id, "Synthetic other household source", "Client records");
  await upload(id, wrongRequest, "Wrong household upload", ownerCookie, 400);
  await grant("view");
  assert.equal((await engagement(id, staffCookie)).engagement.id, id); checks++;
  await upload(id, sourceId, "Read-only grant cannot upload", staffCookie, 400);
  await mutate(id, "workflow.stage", { stage: "preparation", notes: "Read-only grant cannot edit tax work" }, staffCookie, 400);
  await grant("edit");
  const source = await upload(id, sourceId, "Synthetic income source", staffCookie); assert(source);
  const duplicate = await upload(id, sourceId, "Synthetic income source", staffCookie); assert.equal(duplicate!.id, source.id); checks++;
  const download = await request(`/api/tax-documents/${source.id}`, {}, staffCookie); assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf("Synthetic income source")); checks++;
  assert.equal((await engagement(id)).readiness.find(row => row.id === sourceId)?.ready, false); checks++;
  await reviewed(source.id, staffCookie);
  assert((await engagement(id)).readiness.every(row => row.ready)); checks++;
  await mutate(id, "workflow.stage", { stage: "preparation", notes: "Synthetic preparer has all reviewed source records" }, staffCookie);
  const staleRevision = (await engagement(id)).workflow.revision;
  await mutate(id, "workflow.stage", { stage: "review", notes: "Synthetic independent accountant review" });
  await command("workflow.stage", { id, revision: staleRevision, stage: "preparation", notes: "Expected stale revision denial", reviewed: true }, ownerCookie, 400);
  await mutate(id, "workflow.approve", { returnDocumentId: source.id, authorizationDocumentId: source.id, notes: "Wrong document-purpose denial" }, ownerCookie, 400);
  const returnId = await reviewedUpload(id, returnRequestId, "Synthetic prepared return version one");
  const authorizationId = await reviewedUpload(id, authorizationRequestId, "Synthetic authorization for return version one");
  await mutate(id, "workflow.approve", { returnDocumentId: returnId, authorizationDocumentId: authorizationId, notes: "Synthetic accountant reviewed source, books, return and authorization." });
  const approved = await engagement(id); assert.equal(approved.approvalCurrent, true); checks++;
  const exported = await approvedPackage(id);
  assert.equal(exported.manifest.approval.returnDocumentId, returnId);
  assert.deepEqual(exported.files.get(`documents/${source.id}.pdf`), pdf("Synthetic income source"));
  assert.equal(exported.files.size, 4, "Handoff contains manifest, one source, selected return and authorization."); checks++;
  const firstDigest = exported.manifest.digest;
  const sentEvidenceId = await reviewedUpload(id, acknowledgmentRequestId, "Synthetic external submission receipt one");
  await mutate(id, "submission.record", { channel: "Synthetic external preparer", reference: "synthetic-provider-one", evidenceDocumentId: sentEvidenceId, outcome: "accepted", notes: "Expected denial before an external sent record." }, ownerCookie, 400);
  await mutate(id, "submission.record", { channel: "Synthetic external preparer", reference: "synthetic-provider-one", evidenceDocumentId: sentEvidenceId, outcome: "sent", notes: "Staff recorded synthetic external receipt; Shuug did not transmit." });
  const sentAttemptId = (await engagement(id)).workflow.submissions.find(row => row.outcome === "sent" && row.reference === "synthetic-provider-one")!.id;
  const rejectedEvidenceId = await reviewedUpload(id, acknowledgmentRequestId, "Synthetic external rejection acknowledgment one");
  await mutate(id, "submission.record", { attemptId: sentAttemptId, channel: "Mismatched synthetic provider", reference: "synthetic-provider-one", evidenceDocumentId: rejectedEvidenceId, outcome: "rejected", notes: "Expected provider identity mismatch denial." }, ownerCookie, 400);
  await mutate(id, "submission.record", { attemptId: sentAttemptId, channel: "Synthetic external preparer", reference: "synthetic-provider-one", evidenceDocumentId: rejectedEvidenceId, outcome: "rejected", notes: "Staff recorded synthetic rejection evidence for the first package." });
  await mutate(id, "submission.record", { attemptId: sentAttemptId, channel: "Synthetic external preparer", reference: "synthetic-provider-one", evidenceDocumentId: rejectedEvidenceId, outcome: "rejected", notes: "Expected duplicate acknowledgment denial." }, ownerCookie, 400);
  await mutate(id, "submission.record", { attemptId: sentAttemptId, channel: "Synthetic external preparer", reference: "synthetic-provider-one", evidenceDocumentId: rejectedEvidenceId, outcome: "accepted", notes: "Expected conflicting terminal acknowledgment denial." }, ownerCookie, 400);

  const revisedReturnId = await reviewedUpload(id, returnRequestId, "Synthetic corrected prepared return version two");
  assert.equal((await engagement(id)).approvalCurrent, false); checks++;
  assert.equal((await request(`/api/tax-office/${id}/package`)).status, 400); checks++;
  await mutate(id, "submission.record", { channel: "Synthetic external preparer", reference: "stale-package-reference", evidenceDocumentId: sentEvidenceId, outcome: "sent", notes: "Expected stale package denial after correction." }, ownerCookie, 400);
  await mutate(id, "workflow.stage", { stage: "review", notes: "Review corrected return and obtain updated client authorization." });
  await mutate(id, "workflow.approve", { returnDocumentId: revisedReturnId, authorizationDocumentId: authorizationId, notes: "Expected denial for authorization covering the previous return." }, ownerCookie, 400);
  const revisedAuthorizationId = await reviewedUpload(id, authorizationRequestId, "Synthetic authorization for corrected return version two");
  await mutate(id, "workflow.approve", { returnDocumentId: revisedReturnId, authorizationDocumentId: revisedAuthorizationId, notes: "Synthetic reviewer checked the corrected return and fresh authorization evidence." });
  const corrected = await approvedPackage(id); assert.notEqual(corrected.manifest.digest, firstDigest); checks++;
  const correctedSentEvidenceId = await reviewedUpload(id, acknowledgmentRequestId, "Synthetic external corrected submission receipt two");
  await mutate(id, "submission.record", { channel: "Synthetic external preparer", reference: "synthetic-provider-two", evidenceDocumentId: correctedSentEvidenceId, outcome: "sent", notes: "Staff recorded separate external receipt for the corrected package." });
  const correctedAttemptId = (await engagement(id)).workflow.submissions.find(row => row.outcome === "sent" && row.reference === "synthetic-provider-two")!.id;
  const acceptedEvidenceId = await reviewedUpload(id, acknowledgmentRequestId, "Synthetic external acceptance acknowledgment two");
  await mutate(id, "submission.record", { attemptId: sentAttemptId, channel: "Synthetic external preparer", reference: "synthetic-provider-two", evidenceDocumentId: acceptedEvidenceId, outcome: "accepted", notes: "Expected denial for acknowledgment using the old package attempt." }, ownerCookie, 400);
  await mutate(id, "submission.record", { attemptId: correctedAttemptId, channel: "Synthetic external preparer", reference: "synthetic-provider-two", evidenceDocumentId: acceptedEvidenceId, outcome: "accepted", notes: "Staff recorded synthetic external acceptance evidence; no government call was made." });
  const finalView = await engagement(id);
  assert.deepEqual(finalView.workflow.submissions.map(row => row.outcome), ["sent", "rejected", "sent", "accepted"]);
  assert(finalView.workflow.submissions.every(row => row.verification === "staff_recorded_external_evidence"));
  assert.equal(finalView.workflow.submissions[0].digest, firstDigest); assert.equal(finalView.workflow.submissions[3].digest, corrected.manifest.digest); checks++;
  const page = await request("/tax-office"); assert.equal(page.status, 200); assert.match(await page.text(), /Tax work/); checks++;

  await json(`/api/accounting/books/${book!.id}`, { requestId: randomUUID(), action: "journal.post", input: { date: "2026-11-01", memo: "Synthetic post-approval accounting correction", reviewed: true,
    lines: [{ accountNumber: 1000, debitCents: 100, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 100 }] } });
  assert.equal((await engagement(id)).approvalCurrent, false); checks++;
  assert.equal((await request(`/api/tax-office/${id}/package`)).status, 400); checks++;
  await grant();
  assert(!(await cases(staffCookie)).some(row => row.engagement.id === id)); checks++;
  assert(!(await genericRecords(staffCookie)).some(row => row.id === id)); checks++;
  assert.equal((await request(`/api/tax-documents/${source.id}`, {}, staffCookie)).status, 404); checks++;
  await json(`/api/tax-documents/${source.id}`, { status: "reviewed" }, staffCookie, 400);
  assert.equal((await request(`/api/tax-office/${id}/package`, {}, staffCookie)).status, 400); checks++;
  await mutate(id, "engagement.assign", { accountantId: staffId, notes: "Owner assigns synthetic preparer for controlled access." });
  assert.equal((await engagement(id, staffCookie)).engagement.id, id); checks++;
  assert((await genericRecords(staffCookie)).some(row => row.id === id)); checks++;
  await mutate(id, "engagement.assign", { accountantId: "workspace-owner", notes: "Staff must not assign or revoke another accountant." }, staffCookie, 400);
  await mutate(id, "engagement.assign", { accountantId: "workspace-owner", notes: "Owner revokes the synthetic preparer's last assignment." });
  assert(!(await cases(staffCookie)).some(row => row.engagement.id === id)); checks++;
  assert(!(await genericRecords(staffCookie)).some(row => row.id === id)); checks++;
  assert.equal((await request(`/api/tax-documents/${source.id}`, {}, staffCookie)).status, 404); checks++;
  const deniedTracker = await request("/m/tax-engagements", {}, staffCookie); assert.equal(deniedTracker.status, 200);
  assert(!(await deniedTracker.text()).includes(createInput.name), "Generic tracker must not reveal a revoked client's engagement."); checks++;

  return {
    checks, efileTransmitted: false, acknowledgmentAttribution: "staff_recorded_external_evidence",
    coverage: ["compiled tax-office screen", "client intake and request waivers", "staff upload/download/review", "wrong-client and read-only denial", "reviewed ZIP handoff",
      "return-version authorization invalidation", "staff-recorded external sent/rejected/corrected/accepted history", "document/book changes invalidate approval", "immediate client grant and assignment revocation", "generic tracker/API assignment filtering"],
  };
}
