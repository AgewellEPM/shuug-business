import { requireJobInspectionsReviewed } from "../auto-repair/inspection-state";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "./database";
import { definitionFor } from "./catalog";
import { portalClient } from "./portal";
import { customerFromDatabase } from "../customer-access/accounts";
import { assertNoInvoiceCheckout, type WebsitePayment } from "../website-payments/state";
import { saveRecordSchema, validateFields, numberField as n, textField as s, paymentTotal, isPosted, type BusinessRecord } from "./model";

function rows(db: DatabaseSync): BusinessRecord[] {
  return (db.prepare("SELECT body FROM records ORDER BY updated_at DESC, id").all() as { body: string }[]).map(row => JSON.parse(row.body));
}
export function listBusinessRecords(kinds?: string[]): BusinessRecord[] {
  return workspaceDatabase(db => kinds ? rows(db).filter(r => kinds.includes(r.kind)) : rows(db));
}
export function recordHistory(id: string) {
  return workspaceDatabase(db => db.prepare("SELECT sequence, actor, action, at, snapshot FROM audit WHERE record_id=? ORDER BY sequence DESC").all(z.uuid().parse(id)) as { sequence: number; actor: string; action: string; at: string; snapshot: string }[]);
}
function put(db: DatabaseSync, record: BusinessRecord, actor: string, action: string) {
  const body = JSON.stringify(record);
  db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body,updated_at=excluded.updated_at")
    .run(record.id, record.kind, record.revision, body, record.createdAt, record.updatedAt);
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(record.id, actor, action, record.updatedAt, body);
  return record;
}

/** Create reviewed-later business intake in the SAME transaction as the public
 * submission. Self-reported email never grants access to an existing account. */
export function websiteIntakeRecords(db: DatabaseSync, input: { id: string; kind: string; name: string; email: string; message: string; createdAt: string }) {
  const created: { id: string; kind: string }[] = [];
  function create(kind: string, title: string, fields: Record<string, string | boolean>) {
    const record: BusinessRecord = { id: randomUUID(), kind, title: title.slice(0, 140), status: definitionFor(kind).states[0], currency: "USD", fields: validateFields(kind, fields), revision: 1, createdAt: input.createdAt, updatedAt: input.createdAt };
    validateReferences(record, rows(db)); put(db, record, "Website intake", `Consented website request ${input.id}`); created.push({ id: record.id, kind }); return record;
  }
  const evidence = `Website submission ${input.id}. Consent recorded ${input.createdAt}. Contact details are self-reported and need staff review.`;
  if (input.kind === "quote") {
    const client = create("client", input.name, { email: input.email, notes: evidence });
    create("inquiry", `Website quote: ${input.name}`, { client: client.id, scope: input.message, source: "website", evidence });
  }
  if (input.kind === "volunteer") create("volunteer", input.name, { email: input.email, skills: input.message, onboardingComplete: false, evidence });
  return created;
}
function must(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function related(records: BusinessRecord[], r: BusinessRecord, key: string, kind?: string): BusinessRecord {
  const match = records.find(x => x.id === r.fields[key] && (!kind || x.kind === kind));
  must(match, `Select a valid ${key} record.`); return match;
}
function validateReferences(r: BusinessRecord, all: BusinessRecord[]) {
  for (const field of definitionFor(r.kind).fields.filter(f => f.type === "ref")) {
    if (!r.fields[field.key]) continue;
    const linked = all.find(x => x.id === r.fields[field.key] && field.kinds?.includes(x.kind));
    must(linked && linked.id !== r.id, `Select a valid ${field.label}.`);
    if (definitionFor(linked.kind).fields.some(f => f.type === "money")) must(linked.currency === r.currency, "Linked financial records must use the same currency.");
  }
  if (r.fields.start && r.fields.end) must(s(r, "start") < s(r, "end"), "End must be after start.");
  if (r.fields.periodStart && r.fields.periodEnd) must(s(r, "periodStart") <= s(r, "periodEnd"), "Report end must be on or after its start.");
  if (r.fields.client && r.fields.job) must(related(all, r, "job").fields.client === r.fields.client, "The work order belongs to a different client.");
  if (r.kind === "donation" && r.fields.pledge) must(related(all, r, "pledge").fields.donor === r.fields.donor, "The pledge belongs to a different donor.");
  if (r.kind === "agreement") must(related(all, r, "proposal").fields.client === r.fields.client, "The proposal belongs to a different client.");
  if (r.kind === "job") must(related(all, r, "agreement").fields.client === r.fields.client, "The agreement belongs to a different client.");
  if (r.kind === "proposal" && r.fields.inquiry) must(related(all, r, "inquiry").fields.client === r.fields.client, "The inquiry belongs to a different client.");
  if (r.kind === "booking" && r.fields.location) must(related(all, r, "location").fields.client === related(all, r, "job").fields.client, "The location belongs to a different client.");
  if (r.kind === "milestone" && r.fields.dependsOn) {
    let parent: BusinessRecord | undefined = related(all, r, "dependsOn"); const visited = new Set([r.id]);
    while (parent) { must(parent.fields.job === r.fields.job && !visited.has(parent.id), "Milestone dependencies must be in this job and cannot form a cycle."); visited.add(parent.id); parent = all.find(x => x.id === parent!.fields.dependsOn); }
  }
}

const editableAfterDraft = new Set(["notes", "owner", "due", "evidence", "acceptedBy", "completedChecks", "deliveryReference", "submissionReference", "rejectionReason", "hours", "verifier", "reviewer", "resolution", "outcome", "signoff", "attended", "approver"]);
const lockedStates = new Set(["confirmed", "reconciled", "delivered", "submitted_report", "paid", "verified", "issued", "void", "accepted", "cancelled", "closed", "approved", "reviewed"]);
export function saveBusinessRecord(input: unknown, actor: string): BusinessRecord {
  const parsed = saveRecordSchema.parse(input), definition = definitionFor(parsed.kind);
  const fields = validateFields(parsed.kind, parsed.fields);
  return workspaceDatabase(db => {
    must(!(parsed.id && parsed.requestId), "Use a creation request ID or an existing record ID, not both.");
    const request = JSON.stringify({ command: "create", kind: parsed.kind, title: parsed.title, currency: parsed.currency, fields, actor });
    if (parsed.requestId) {
      const receipt = db.prepare("SELECT request,result FROM commands WHERE id=?").get(parsed.requestId) as { request: string; result: string } | undefined;
      if (receipt) { must(receipt.request === request, "This creation request ID was already used for different data."); return JSON.parse(receipt.result); }
    }
    const all = rows(db), old = parsed.id ? all.find(r => r.id === parsed.id) : undefined;
    if (parsed.id) must(old && old.kind === parsed.kind, "Record not found.");
    if (old) {
      must(parsed.revision === old.revision, "This record changed. Reload before saving.");
      if (old.computed?.repairEstimate) must(parsed.title === old.title && parsed.currency === old.currency && [...new Set([...Object.keys(fields), ...Object.keys(old.fields)])].every(key => ["acceptedBy", "evidence"].includes(key) || fields[key] === old.fields[key]), "Reviewed repair pricing and scope are preserved. Create a new estimate review to revise this proposal.");
      if (lockedStates.has(old.status) || (old.kind === "report" && old.status === "submitted")) {
        const allowed = old.kind === "acknowledgment" && old.status === "reviewed" ? ["deliveryReference"] : old.kind === "report" && old.status === "reviewed" ? ["submissionReference"] : [];
        must(allowed.length && parsed.title === old.title && parsed.currency === old.currency && [...new Set([...Object.keys(fields), ...Object.keys(old.fields)])].every(key => allowed.includes(key) || fields[key] === old.fields[key]), "This record is locked. Record a correction or use its next workflow action.");
      }
      if (old.status !== "draft") {
        must(parsed.currency === old.currency && parsed.title === old.title, "Title and currency are fixed after leaving draft.");
        for (const key of new Set([...Object.keys(old.fields), ...Object.keys(fields)])) must(editableAfterDraft.has(key) || old.fields[key] === fields[key], `${key} is fixed after leaving draft. Preserve the original and create a new revision or correction record.`);
      }
    }
    const now = new Date().toISOString();
    const record: BusinessRecord = { id: old?.id ?? randomUUID(), kind: parsed.kind, title: parsed.title, currency: parsed.currency,
      status: old?.status ?? definition.states[0], fields, revision: (old?.revision ?? 0) + 1,
      createdAt: old?.createdAt ?? now, updatedAt: now, ...(old?.computed ? { computed: old.computed } : {}) };
    validateReferences(record, all);
    put(db, record, actor, old ? "edited" : "created");
    if (parsed.requestId) db.prepare("INSERT INTO commands VALUES(?,?,?)").run(parsed.requestId, request, JSON.stringify(record));
    return record;
  }, true);
}

/** The repair engine calls this inside the SAME transaction as its review
 * receipt, after validating current pricing, vehicle, client and actor proof. */
export function createRepairProposalInTransaction(db: DatabaseSync, quote: import("../auto-repair/model").RepairQuote, actor: string) {
  const now = new Date().toISOString();
  const record: BusinessRecord = { id: randomUUID(), kind: "proposal", title: quote.input.title, currency: quote.currency, status: "draft", revision: 1, createdAt: now, updatedAt: now,
    fields: validateFields("proposal", { client: quote.client.id, scope: quote.customerScope, exclusions: quote.input.exclusions, amount: quote.total, expires: quote.input.expires, evidence: `Reviewed repair estimate using ${quote.book.name} v${quote.book.version} on ${quote.pricedOn}.` }),
    computed: { repairEstimate: structuredClone(quote) } };
  validateReferences(record, rows(db)); return put(db, record, actor, "Created reviewed repair proposal");
}

function positiveMoney(r: BusinessRecord, key = "amount") { must(n(r, key) > 0, "Enter an amount greater than zero."); }
function evidence(r: BusinessRecord) { must(s(r, "evidence").trim(), "Attach or reference supporting evidence before approval."); }
function overlap(a: BusinessRecord, b: BusinessRecord, buffer = 0) {
  const padding = buffer * 60000;
  return Date.parse(s(a, "start")) - padding < Date.parse(s(b, "end")) && Date.parse(s(a, "end")) + padding > Date.parse(s(b, "start"));
}
function reportSnapshot(r: BusinessRecord, all: BusinessRecord[]) {
  const inPeriod = (value: string) => value.slice(0, 10) >= s(r, "periodStart") && value.slice(0, 10) <= s(r, "periodEnd");
  const entries = all.filter(x => x.fields.program === r.fields.program && inPeriod(s(x, "measuredOn") || s(x, "servedOn") || s(x, "start") || x.updatedAt));
  const costs = entries.filter(x => x.kind === "program_cost"), outcomes = entries.filter(x => x.kind === "outcome"), sessions = entries.filter(x => x.kind === "session" && x.status === "completed");
  must(costs.every(x => ["approved", "paid"].includes(x.status)), "Review every program cost in this reporting period first.");
  must(outcomes.every(x => x.status === "reviewed"), "Review every outcome in this reporting period first.");
  const attendance = all.filter(x => x.kind === "attendance" && sessions.some(y => x.fields.session === y.id));
  must(attendance.every(x => x.status !== "draft"), "Complete attendance before reviewing the report.");
  return { generatedAt: new Date().toISOString(), periodStart: r.fields.periodStart, periodEnd: r.fields.periodEnd,
    reviewedCosts: costs.reduce((total, x) => total + n(x, "amount"), 0), sessionsDelivered: sessions.length,
    attended: attendance.filter(x => x.status === "present").length, reviewedOutcomes: outcomes.length,
    sources: [...costs, ...outcomes, ...sessions, ...attendance, ...entries.filter(x => x.kind === "service_record" && x.status === "reviewed")].map(x => ({ id: x.id, revision: x.revision, kind: x.kind, title: x.title, fields: x.fields })) };
}

function invoiceCalculation(r: BusinessRecord, all: BusinessRecord[]) {
  const work = related(all, r, "job"), agreement = related(all, work, "agreement"), proposal = related(all, agreement, "proposal");
  const issued = all.filter(x => x.kind === "invoice" && x.id !== r.id && x.fields.job === work.id && x.status === "issued");
  const charged = new Set(issued.flatMap(x => Array.isArray(x.computed?.sources) ? x.computed.sources as string[] : []));
  const method = s(r, "method"); let amount = 0; let sources: string[] = [];
  if (method === "deposit") { amount = n(agreement, "deposit"); sources = [`deposit:${agreement.id}`]; }
  else {
    must(work.status === "accepted" || method === "milestone" || method === "recurring", "Customer acceptance is required before final billing.");
    if (method === "fixed") {
      must(!issued.some(x => ["hourly", "materials", "milestone", "recurring"].includes(s(x, "method"))), "This job already uses itemized billing. Continue with that billing method.");
      const changes = all.filter(x => x.kind === "change" && x.fields.job === work.id && x.status === "approved");
      amount = n(proposal, "amount") + changes.reduce((t, x) => t + n(x, "amount"), 0) - issued.filter(x => x.fields.method === "deposit").reduce((t, x) => t + n(x, "amount"), 0);
      sources = [`fixed:${work.id}`, ...changes.map(x => x.id)];
    } else {
      must(!charged.has(`fixed:${work.id}`), "This job has already been billed as a fixed fee.");
      const family = (value: string) => ["hourly", "materials"].includes(value) ? "itemized" : value;
      must(!issued.some(x => s(x, "method") !== "deposit" && family(s(x, "method")) !== family(method)), "This job already uses a different billing method. Keep its billing basis consistent to avoid charging for the same work twice.");
      if (method === "hourly" || method === "materials") {
        const entries = all.filter(x => x.kind === "time_entry" && x.fields.job === work.id && x.status === "approved" && !charged.has(x.id) && (method === "hourly" ? x.fields.category === "labor" : x.fields.category !== "labor"));
        amount = entries.reduce((t, x) => t + n(x, "billable"), 0); sources = entries.map(x => x.id);
      } else if (method === "milestone") {
        const milestone = related(all, r, "milestone"); must(milestone.fields.job === work.id && milestone.status === "completed", "Select a completed milestone in this work order.");
        amount = n(milestone, "amount"); sources = [milestone.id];
      } else if (method === "recurring") {
        const contract = related(all, r, "contract"); must(contract.fields.job === work.id && contract.status === "active", "Select an active recurring agreement for this job.");
        must(/^\d{4}-(0[1-9]|1[0-2])$/.test(s(r, "period")), "Use YYYY-MM for the recurring billing period.");
        const minutes = all.filter(x => x.kind === "time_entry" && x.fields.job === work.id && x.status === "approved" && s(x, "workedOn").startsWith(s(r, "period"))).reduce((t, x) => t + n(x, "minutes"), 0);
        amount = n(contract, "amount") + Math.round(Math.max(0, minutes - n(contract, "includedHours") * 60) * n(contract, "overageRate") / 60);
        sources = [`recurring:${contract.id}:${s(r, "period")}`];
      }
      // Apply a paid deposit exactly once, including across partial invoices.
      const deposits = issued.filter(x => x.fields.method === "deposit").reduce((t, x) => t + n(x, "amount"), 0);
      const applied = issued.reduce((t, x) => t + Number(x.computed?.depositApplied ?? 0), 0);
      const depositApplied = Math.min(amount, Math.max(0, deposits - applied));
      amount -= depositApplied;
      must(sources.length > 0 && !sources.some(id => charged.has(id)), "There is no unbilled work for this invoice.");
      must(amount === n(r, "amount"), `Invoice amount must be ${(amount / 100).toFixed(2)} after applying the deposit.`);
      return { amount, sources, depositApplied };
    }
  }
  must(sources.length > 0 && !sources.some(id => charged.has(id)), "This work or deposit has already been invoiced.");
  must(amount >= 0 && amount === n(r, "amount"), `Invoice amount must be ${(amount / 100).toFixed(2)} for the approved work.`);
  return { amount, sources, depositApplied: method === "fixed" ? issued.filter(x => x.fields.method === "deposit").reduce((t, x) => t + n(x, "amount"), 0) : 0 };
}
export function previewInvoice(input: BusinessRecord) { return invoiceCalculation(input, listBusinessRecords()); }

function checkTransition(r: BusinessRecord, target: string, all: BusinessRecord[]) {
  validateReferences(r, all);
  const peers = (kind = r.kind) => all.filter(x => x.kind === kind && x.id !== r.id);
  const approving = ["approved", "reviewed", "accepted", "signed", "awarded"].includes(target);
  if (approving && definitionFor(r.kind).fields.some(f => f.key === "evidence")) evidence(r);
  if (r.kind === "donation" && target === "recorded") { if (r.fields.giftType === "cash") positiveMoney(r); else must(s(r, "goodsDescription"), "Describe the noncash contribution."); }
  if (r.kind === "gift_schedule" && target === "active") must(s(r, "providerReference"), "Connect and record a real provider subscription before activating the schedule.");
  if (["gift_payment", "service_payment", "grant_payment"].includes(r.kind) && target === "confirmed") {
    positiveMoney(r); evidence(r);
    must(!all.some(x => ["gift_payment", "service_payment", "grant_payment"].includes(x.kind) && x.id !== r.id && isPosted(x) && x.fields.reference === r.fields.reference), "This transaction reference was already recorded.");
    const key = r.kind === "gift_payment" ? "donation" : r.kind === "service_payment" ? "invoice" : "grant";
    const parent = related(all, r, key);
    must(parent.status === (key === "donation" ? "recorded" : key === "invoice" ? "issued" : "awarded"), `The ${key} is not ready to receive a payment.`);
    if (key === "donation") must(parent.fields.giftType === "cash", "Noncash gifts do not create cash receipts.");
    const previous = paymentTotal(all, r.kind, key, parent.id);
    if (r.fields.direction === "refund") must(n(r, "amount") <= paymentTotal(all, r.kind, key, parent.id, true), "Refund exceeds received cash.");
    else must(previous + n(r, "amount") <= n(parent, key === "grant" ? "award" : "amount"), "Payment exceeds the remaining balance.");
    r.computed = { confirmation: "Recorded external transaction; no payment was initiated by this action." };
  }
  if (["gift_payment", "service_payment", "grant_payment"].includes(r.kind) && target === "reconciled") evidence(r);
  if (r.kind === "acknowledgment" && target === "reviewed") {
    const gift = related(all, r, "donation");
    must(gift.status === "recorded" && (gift.fields.giftType === "noncash" || paymentTotal(all, "gift_payment", "donation", gift.id) > 0), "Record the gift and confirm its payment before acknowledgment.");
    r.computed = { donation: { id: gift.id, revision: gift.revision, donor: gift.fields.donor, giftType: gift.fields.giftType, goodsDescription: gift.fields.goodsDescription ?? "", benefitValue: gift.fields.benefitValue ?? 0, cashReceived: paymentTotal(all, "gift_payment", "donation", gift.id), currency: gift.currency }, text: s(r, "template"), reviewedBy: s(r, "reviewer") };
  }
  if (r.kind === "acknowledgment" && target === "delivered") must(s(r, "deliveryReference"), "Record evidence of actual delivery first.");
  if (r.kind === "allocation" && target === "approved") {
    const fund = related(all, r, "fund"); must(fund.status === "active", "Activate the reviewed fund first.");
    const today = new Date().toISOString().slice(0, 10);
    must((!fund.fields.startsOn || s(fund, "startsOn") <= today) && (!fund.fields.endsOn || s(fund, "endsOn") >= today), "The fund is outside its permitted dates.");
    const gifts = all.filter(x => x.kind === "donation" && x.fields.fund === fund.id);
    const grants = all.filter(x => x.kind === "grant" && x.fields.fund === fund.id);
    const received = gifts.reduce((t, x) => t + paymentTotal(all, "gift_payment", "donation", x.id), 0) + grants.reduce((t, x) => t + paymentTotal(all, "grant_payment", "grant", x.id), 0);
    const allocated = peers().filter(x => x.fields.fund === fund.id && x.status === "approved").reduce((t, x) => t + n(x, "amount"), 0);
    positiveMoney(r); must(n(r, "amount") <= received - allocated, "Allocation exceeds the fund's received, unallocated cash.");
  }
  if (r.kind === "grant" && target === "awarded") { positiveMoney(r, "award"); must(s(r, "agreement"), "Record the award agreement and conditions."); }
  if (r.kind === "claim" && target === "submitted") {
    const cost = related(all, r, "cost"), grant = related(all, r, "grant"); evidence(r);
    must(grant.status === "awarded" && ["approved", "paid"].includes(cost.status), "An awarded grant and reviewed program cost are required.");
    const already = peers().filter(x => x.fields.cost === cost.id && ["submitted", "approved", "paid"].includes(x.status)).reduce((t, x) => t + n(x, "amount"), 0);
    positiveMoney(r); must(already + n(r, "amount") <= n(cost, "amount"), "This cost has already been claimed or the claim exceeds it.");
  }
  if (r.kind === "claim" && target === "paid") evidence(r);
  if (r.kind === "volunteer" && target === "approved") must(r.fields.onboardingComplete === true, "Review required training and onboarding documents first.");
  if (r.kind === "shift" && target === "assigned") {
    const volunteer = related(all, r, "volunteer"); must(volunteer.status === "approved", "The volunteer must complete onboarding first.");
    must(!peers().some(x => x.fields.volunteer === volunteer.id && ["assigned", "checked_in"].includes(x.status) && overlap(r, x)), "This volunteer already has an overlapping shift.");
  }
  if (r.kind === "shift" && target === "verified") must(n(r, "hours") > 0 && n(r, "hours") <= (Date.parse(s(r, "end")) - Date.parse(s(r, "start"))) / 3600000 && s(r, "verifier"), "Enter verified hours within the shift duration and the verifier's name.");
  if (r.kind === "enrollment" && target === "enrolled") {
    const p = related(all, r, "program"); must(p.status === "active", "Activate the program first.");
    const enrolled = peers().filter(x => x.fields.program === p.id && x.status === "enrolled");
    must(!enrolled.some(x => x.fields.participant === r.fields.participant), "This participant is already enrolled.");
    must(enrolled.length < n(p, "capacity"), "The program is full. Use the waitlist.");
  }
  if (r.kind === "session" && target === "scheduled") {
    must(related(all, r, "program").status === "active" && n(r, "capacity") > 0, "An active program and positive capacity are required.");
    must(!peers().some(x => x.status === "scheduled" && (x.fields.location === r.fields.location || (r.fields.owner && x.fields.owner === r.fields.owner)) && overlap(r, x)), "Room or staff conflicts with another session.");
  }
  if (r.kind === "attendance" && ["present", "absent"].includes(target)) {
    const session = related(all, r, "session"); must(["scheduled", "completed"].includes(session.status), "The session must be scheduled.");
    must(all.some(x => x.kind === "enrollment" && x.fields.program === session.fields.program && x.fields.participant === r.fields.participant && ["enrolled", "completed"].includes(x.status)), "Enroll this participant in the program first.");
    must(!peers().some(x => x.fields.session === session.id && x.fields.participant === r.fields.participant && x.status !== "draft"), "Attendance is already recorded for this participant.");
    if (target === "present") must(peers().filter(x => x.fields.session === session.id && x.status === "present").length < n(session, "capacity"), "Session capacity has been reached.");
  }
  if (r.kind === "report" && target === "reviewed") r.computed = reportSnapshot(r, all);
  if (r.kind === "report" && target === "submitted") must(s(r, "submissionReference"), "Record actual submission evidence first.");
  if (r.kind === "registration" && target === "confirmed") {
    const event = related(all, r, "event"); must(event.status === "active", "Activate the event first.");
    must(peers().filter(x => x.fields.event === event.id && x.status === "confirmed").length < n(event, "capacity"), "Event capacity has been reached.");
    must(n(r, "amount") === 0 || s(r, "paymentReference"), "Record payment evidence before confirming a paid registration.");
  }
  if (r.kind === "membership" && target === "active") must(n(r, "dues") === 0 || s(r, "paymentReference"), "Record the dues payment reference first.");
  if (r.kind === "governance" && target === "approved") must(s(r, "approver"), "Record who approved this item.");
  if (r.kind === "proposal" && target === "accepted") must(s(r, "acceptedBy") && s(r, "expires") >= new Date().toISOString().slice(0, 10), "Record customer acceptance before the offer expires.");
  if (r.kind === "agreement" && target === "signed") must(related(all, r, "proposal").status === "accepted", "The customer must accept the proposal first.");
  if (r.kind === "booking" && target === "scheduled") {
    const resource = related(all, r, "resource"); must(resource.status === "active", "Activate the resource first.");
    must(!peers().some(x => x.fields.resource === resource.id && x.status === "scheduled" && overlap(r, x, n(r, "buffer") + n(x, "buffer"))), "Resource is already booked during this appointment or its travel buffer.");
  }
  if (r.kind === "job" && ["scheduled", "in_progress"].includes(target)) {
    const agreement = related(all, r, "agreement"); must(agreement.status === "signed", "Sign the agreement before scheduling work.");
    const received = all.filter(x => x.kind === "invoice" && x.fields.job === r.id && x.fields.method === "deposit" && x.status === "issued").reduce((t, x) => t + paymentTotal(all, "service_payment", "invoice", x.id, true), 0);
    must(received >= n(agreement, "deposit"), "Confirm the required deposit before starting or scheduling work.");
    if (target === "scheduled") must(all.some(x => x.kind === "booking" && x.fields.job === r.id && x.status === "scheduled"), "Create a confirmed booking for this work order first.");
  }
  if (r.kind === "job" && target === "completed") {
    const completed = new Set(s(r, "completedChecks").split("\n").map(x => x.trim()).filter(Boolean));
    must(s(r, "requiredChecks").split("\n").map(x => x.trim()).filter(Boolean).every(x => completed.has(x)), "Finish all required checks before completing work.");
    must(!all.some(x => (x.kind === "issue" || x.kind === "milestone") && x.fields.job === r.id && !["resolved", "closed", "completed"].includes(x.status)), "Resolve open issues and finish milestones first."); evidence(r);
  }
  if (r.kind === "job" && target === "accepted") must(s(r, "acceptedBy"), "Record customer completion acceptance.");
  if (r.kind === "milestone" && target === "completed" && r.fields.dependsOn) must(related(all, r, "dependsOn").status === "completed", "Complete the prerequisite milestone first.");
  if (r.kind === "time_entry" && target === "approved") must(s(r, "reviewer"), "Record the time or expense approver.");
  if (r.kind === "change" && target === "approved") {
    must(s(r, "acceptedBy"), "Record the customer's change approval.");
    must(!all.some(x => x.kind === "invoice" && x.fields.job === r.fields.job && x.fields.method === "fixed" && x.status === "issued"), "The job is already billed. Create a follow-on work order for new scope.");
  }
  if (r.kind === "invoice" && target === "issued") r.computed = invoiceCalculation(r, all);
  if (r.kind === "invoice" && target === "void") {
    must(!all.some(x => x.kind === "service_payment" && x.fields.invoice === r.id && isPosted(x)), "An invoice with posted entries cannot be voided. Record a credit or refund.");
    must(!all.some(x => x.kind === "invoice" && x.fields.job === r.fields.job && x.id !== r.id && x.status === "issued" && Number(x.computed?.depositApplied) > 0 && r.fields.method === "deposit"), "This deposit has already been applied to another invoice.");
  }
  if (r.kind === "issue" && target === "resolved") must(s(r, "resolution"), "Describe the corrective work and resolution.");
  if (r.kind === "followup" && target === "completed") must(s(r, "outcome"), "Record the follow-up outcome.");
}

/** Inspection execution already checks the assigned employee in this same transaction. */
export function startInspectionJob(db: DatabaseSync, jobId: string, actor: string) {
  const all = rows(db), job = all.find(r => r.id === jobId && r.kind === "job"); must(job && ["scheduled", "in_progress"].includes(job.status), "Schedule the agreed job before starting its inspection.");
  checkTransition(job, "in_progress", all);
  if (job.status === "scheduled") { job.status = "in_progress"; job.revision++; job.updatedAt = new Date().toISOString(); put(db, job, actor, "Assigned technician started vehicle inspection"); }
}
export function recordInspectionTime(db: DatabaseSync, input: { inspectionId: string; jobId: string; technician: string; milliseconds: number; hourlyCost: number; reviewer: string; evidence: string }, actor: string) {
  must(Number.isSafeInteger(input.milliseconds) && input.milliseconds > 0 && input.milliseconds <= 7200 * 60000, "Review the recorded inspection time before approving it.");
  const now = new Date().toISOString(), all = rows(db), job = all.find(r => r.id === input.jobId && r.kind === "job"); must(job && job.status === "in_progress", "Review the inspection while the job is in progress.");
  const cost = Number((BigInt(input.hourlyCost) * BigInt(input.milliseconds) + BigInt(1800000)) / BigInt(3600000));
  const record: BusinessRecord = { id: randomUUID(), kind: "time_entry", title: `Inspection time: ${job.title}`.slice(0, 200), currency: job.currency, status: "approved", revision: 1, createdAt: now, updatedAt: now,
    fields: validateFields("time_entry", { job: job.id, category: "labor", minutes: Math.ceil(input.milliseconds / 60000), cost, billable: 0, workedOn: now.slice(0, 10), owner: input.technician, reviewer: input.reviewer, evidence: input.evidence }),
    computed: { inspectionId: input.inspectionId, recordedMilliseconds: input.milliseconds, reviewedHourlyCost: input.hourlyCost, billing: "Inspection time is costed here; additional customer charges require an agreed proposal or change." } };
  checkTransition(record, "approved", all); return put(db, record, actor, "Reviewed inspection time and labor cost");
}

export const transitionSchema = z.object({ id: z.uuid(), revision: z.number().int().positive(), target: z.string().max(30), commandId: z.uuid() }).strict();
export function transitionBusinessRecord(input: unknown, actor: string): BusinessRecord {
  const command = transitionSchema.parse(input), request = JSON.stringify({ ...command, actor });
  return workspaceDatabase(db => {
    const receipt = db.prepare("SELECT request,result FROM commands WHERE id=?").get(command.commandId) as { request: string; result: string } | undefined;
    if (receipt) { must(receipt.request === request, "Command ID was already used for a different request."); return JSON.parse(receipt.result); }
    const all = rows(db), old = all.find(r => r.id === command.id); must(old, "Record not found.");
    must(old.revision === command.revision, "This record changed. Reload before continuing.");
    must(definitionFor(old.kind).transitions[old.status]?.includes(command.target), "That workflow transition is not allowed.");
    if (old.kind === "invoice" && command.target === "void") assertNoInvoiceCheckout(db, old.id);
    if (old.kind === "service_payment" && command.target === "confirmed") assertNoInvoiceCheckout(db, s(old, "invoice"));
    const record = structuredClone(old); if (record.kind === "job" && command.target === "completed") requireJobInspectionsReviewed(db, record.id); checkTransition(record, command.target, all);
    record.status = command.target; record.revision++; record.updatedAt = new Date().toISOString();
    put(db, record, actor, `${old.status} → ${record.status}`);
    db.prepare("INSERT INTO commands VALUES(?,?,?)").run(command.commandId, request, JSON.stringify(record)); return record;
  }, true);
}

/** Called only after server-to-server Stripe verification, in the payment's
 * transaction. Uses the same reference, balance, evidence and currency rules as
 * staff-entered payments. A provider receipt is not bank reconciliation. */
export function settleWebsitePayment(db: DatabaseSync, p: WebsitePayment, intent: string) {
  const now = new Date().toISOString(), evidence = `Stripe Checkout ${p.sessionId}; verified payment ${intent}; website request ${p.id}.`;
  function create(kind: string, title: string, fields: BusinessRecord["fields"], target?: string) {
    const record: BusinessRecord = { id: randomUUID(), kind, title: title.slice(0, 200), currency: p.currency, status: definitionFor(kind).states[0], fields: validateFields(kind, fields), revision: 1, createdAt: now, updatedAt: now };
    validateReferences(record, rows(db));
    if (target) { checkTransition(record, target, rows(db)); record.status = target; }
    return put(db, record, "Stripe website payments", evidence);
  }
  let parent = p.invoiceId;
  if (p.kind === "donation") {
    must(p.donor, "Donor details are missing.");
    // Website-origin donor grouping grants no login or confidential access.
    const mapping = `website-donor:${p.donor.email.toLowerCase()}`;
    const saved = db.prepare("SELECT body FROM documents WHERE id=? AND kind='website-donor'").get(mapping) as { body: string } | undefined;
    let donorId = saved ? JSON.parse(saved.body).id as string : null;
    if (!donorId || !rows(db).some(r => r.id === donorId && r.kind === "donor")) {
      donorId = create("donor", p.donor.name, { category: "individual", email: p.donor.email, contactPreference: "do_not_contact", notes: `Self-reported website donor. Consent to processing this donation: ${p.donor.consentAt}. No marketing consent or authenticated identity is implied.` }).id;
      db.prepare("INSERT INTO documents VALUES(?,'website-donor',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(mapping, JSON.stringify({ id: donorId }));
    }
    parent = create("donation", p.title, { donor: donorId, amount: p.amount, giftType: "cash", benefitValue: 0, evidence, notes: p.donor.purpose, ...(p.donor.fund ? { fund: p.donor.fund } : {}), ...(p.donor.campaign ? { campaign: p.donor.campaign } : {}) }, "recorded").id;
  }
  must(parent, "Payment has no business record.");
  const receipt = create(p.kind === "invoice" ? "service_payment" : "gift_payment", `Website payment: ${p.title}`, { [p.kind === "invoice" ? "invoice" : "donation"]: parent, amount: p.amount, direction: "receipt", reference: intent, paidOn: now.slice(0, 10), evidence }, "confirmed");
  receipt.computed = { provider: "stripe", sessionId: p.sessionId, intentId: intent, websitePaymentId: p.id, live: p.live, confirmation: "Payment verified with Stripe. Awaiting bank reconciliation." };
  // Replace the snapshot to include provider evidence without a second receipt.
  db.prepare("UPDATE records SET body=? WHERE id=?").run(JSON.stringify(receipt), receipt.id);
  db.prepare("UPDATE audit SET snapshot=? WHERE sequence=(SELECT MAX(sequence) FROM audit WHERE record_id=?)").run(JSON.stringify(receipt), receipt.id);
  return { recordId: parent, paymentId: receipt.id };
}

export function reconcileWebsiteReceipt(id: string, bankEvidence: string, actor: string) {
  z.uuid().parse(id); const evidence = z.string().trim().min(5).max(6000).parse(bankEvidence);
  return workspaceDatabase(db => {
    const record = rows(db).find(r => r.id === id && ["service_payment", "gift_payment"].includes(r.kind));
    must(record?.computed?.websitePaymentId && record.status === "confirmed", "Choose a confirmed website payment awaiting reconciliation.");
    record.fields.evidence = `${s(record, "evidence")}\nBank reconciliation: ${evidence}`.slice(0, 12000);
    checkTransition(record, "reconciled", rows(db)); record.status = "reconciled"; record.revision++; record.updatedAt = new Date().toISOString();
    return put(db, record, actor, "Website payment reconciled against supplied bank evidence");
  }, true);
}

export function acceptPortalRecord(token: string, input: unknown) {
  const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive(), name: z.string().trim().min(2).max(100), accepted: z.literal(true) }).strict().parse(input);
  return workspaceDatabase(db => {
    const clientId = portalClient(db, token), all = rows(db), old = all.find(r => r.id === parsed.id && r.fields.client === clientId && ["proposal", "job"].includes(r.kind));
    must(old && old.revision === parsed.revision, "This item changed. Reload the portal before accepting.");
    must(old.status === (old.kind === "proposal" ? "sent" : "completed"), "This item is not awaiting customer acceptance.");
    const record = structuredClone(old);
    record.fields.acceptedBy = parsed.name;
    record.fields.evidence = `${s(old, "evidence")}\nAcceptance recorded through an authorized client portal link by ${parsed.name} on ${new Date().toISOString()}`.trim().slice(-12000);
    checkTransition(record, "accepted", all); record.status = "accepted"; record.revision++; record.updatedAt = new Date().toISOString();
    put(db, record, `Client portal: ${parsed.name}`, "Customer accepted"); return { id: record.id, status: record.status };
  }, true);
}

/** Customer-account acceptance is authorized again inside the write transaction. */
export function acceptCustomerRecord(token: string, input: unknown) {
  const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive(), accepted: z.literal(true) }).strict().parse(input);
  return workspaceDatabase(db => {
    const user = customerFromDatabase(db, token); must(user?.clientId, "Sign in to your service customer account.");
    const all = rows(db), old = all.find(r => r.id === parsed.id && r.fields.client === user.clientId && ["proposal", "job"].includes(r.kind));
    must(old && old.revision === parsed.revision, "This item changed. Reload your account before accepting.");
    must(old.status === (old.kind === "proposal" ? "sent" : "completed"), "This item is not awaiting customer acceptance.");
    const record = structuredClone(old); record.fields.acceptedBy = user.name;
    record.fields.evidence = `${s(old, "evidence")}\nAcceptance recorded by customer account ${user.id} (${user.name}) on ${new Date().toISOString()}`.trim().slice(-12000);
    checkTransition(record, "accepted", all); record.status = "accepted"; record.revision++; record.updatedAt = new Date().toISOString();
    put(db, record, `Customer:${user.id}`, "Customer accepted"); return { id: record.id, status: record.status };
  }, true);
}

export interface AppointmentOffer { id: string; jobId: string; resourceId: string; start: string; end: string; buffer: number; status: "open" | "booked" | "withdrawn"; bookingId: string | null; createdAt: string; actor: string }
const offerInput = z.object({ jobId: z.uuid(), resourceId: z.uuid(), start: z.iso.datetime(), end: z.iso.datetime(), buffer: z.number().int().min(0).max(240) }).strict();
function offersSchema(db: DatabaseSync) { db.exec("CREATE TABLE IF NOT EXISTS appointment_offers(id TEXT PRIMARY KEY, body TEXT NOT NULL)"); }
function offers(db: DatabaseSync): AppointmentOffer[] { offersSchema(db); return (db.prepare("SELECT body FROM appointment_offers ORDER BY rowid DESC").all() as { body: string }[]).map(r => JSON.parse(r.body)); }
function putOffer(db: DatabaseSync, offer: AppointmentOffer) { db.prepare("INSERT INTO appointment_offers VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(offer.id, JSON.stringify(offer)); }
function offerBooking(offer: AppointmentOffer, job: BusinessRecord): BusinessRecord {
  const now = new Date().toISOString();
  return { id: offer.bookingId ?? randomUUID(), kind: "booking", title: `${job.title} appointment`.slice(0, 140), currency: job.currency, status: "draft", revision: 1, createdAt: now, updatedAt: now,
    fields: validateFields("booking", { job: job.id, resource: offer.resourceId, start: offer.start, end: offer.end, buffer: offer.buffer }) };
}
function eligibleOffer(offer: AppointmentOffer, all: BusinessRecord[]) {
  const job = all.find(r => r.kind === "job" && r.id === offer.jobId);
  must(job && ["draft", "scheduled", "in_progress"].includes(job.status), "This work is not available for appointment booking.");
  must(Date.parse(offer.start) > Date.now(), "This appointment time is no longer available.");
  checkTransition(structuredClone(job), "in_progress", all); // Signed terms and confirmed deposit.
  must(!all.some(r => r.kind === "booking" && r.fields.job === job.id && r.status === "scheduled"), "This work already has a scheduled appointment.");
  const booking = offerBooking(offer, job); validateReferences(booking, all); checkTransition(booking, "scheduled", all); return { job, booking };
}
export function listAppointmentOffers() { return workspaceDatabase(db => offers(db)); }
export function publishAppointmentOffer(raw: unknown, actor: string) {
  const input = offerInput.parse(raw), start = Date.parse(input.start), end = Date.parse(input.end);
  must(end > start && end - start <= 86400000 && start > Date.now() && start < Date.now() + 180 * 86400000, "Choose a future appointment within 180 days, lasting at most 24 hours.");
  return workspaceDatabase(db => {
    const current = offers(db); must(current.filter(r => r.status === "open" && Date.parse(r.end) > Date.now()).length < 1000, "Withdraw old availability before publishing more times.");
    const offer: AppointmentOffer = { ...input, id: randomUUID(), status: "open", bookingId: null, actor, createdAt: new Date().toISOString() };
    eligibleOffer(offer, rows(db)); putOffer(db, offer); return offer;
  }, true);
}
export function withdrawAppointmentOffer(id: string) { workspaceDatabase(db => { const offer = offers(db).find(r => r.id === id); must(offer && offer.status === "open", "This appointment offer is no longer open."); offer.status = "withdrawn"; putOffer(db, offer); }, true); }
export function customerAppointmentOffers(token: string) {
  return workspaceDatabase(db => {
    const user = customerFromDatabase(db, token); must(user, "Sign in to your customer account."); const all = rows(db);
    return offers(db).filter(o => o.status === "open" && all.some(r => r.id === o.jobId && r.kind === "job" && r.fields.client === user.clientId)).flatMap(offer => {
      try { const { job } = eligibleOffer(offer, all); return [{ id: offer.id, title: job.title, resource: all.find(r => r.id === offer.resourceId)!.title, start: offer.start, end: offer.end }]; } catch { return []; }
    }).sort((a,b) => a.start.localeCompare(b.start));
  });
}
export function bookCustomerAppointment(token: string, id: string) {
  z.uuid().parse(id);
  return workspaceDatabase(db => {
    const user = customerFromDatabase(db, token); must(user?.clientId, "Sign in to your service customer account.");
    const all = rows(db), offer = offers(db).find(o => o.id === id && all.some(r => r.id === o.jobId && r.kind === "job" && r.fields.client === user.clientId));
    must(offer, "Appointment offer unavailable.");
    if (offer.status === "booked") { const prior = all.find(r => r.id === offer.bookingId && r.kind === "booking"); must(prior, "Booking record unavailable."); return { id: prior.id, status: prior.status, duplicate: true }; }
    must(offer.status === "open", "This appointment offer is no longer available.");
    const { booking, job } = eligibleOffer(offer, all); booking.status = "scheduled";
    put(db, booking, `Customer:${user.id}`, "Customer booked published availability");
    if (job.status === "draft") { const next = structuredClone(job); checkTransition(next, "scheduled", [...all, booking]); next.status = "scheduled"; next.revision++; next.updatedAt = booking.updatedAt; put(db, next, `Customer:${user.id}`, "Work scheduled through customer booking"); }
    offer.status = "booked"; offer.bookingId = booking.id; putOffer(db, offer);
    // Sibling choices for the same visit are withdrawn atomically.
    for (const sibling of offers(db).filter(o => o.id !== offer.id && o.jobId === job.id && o.status === "open")) { sibling.status = "withdrawn"; putOffer(db, sibling); }
    return { id: booking.id, status: booking.status, duplicate: false };
  }, true);
}
export function cancelCustomerAppointment(token: string, id: string) {
  z.uuid().parse(id);
  return workspaceDatabase(db => {
    const user = customerFromDatabase(db, token); must(user?.clientId, "Sign in to your service customer account."); const all = rows(db);
    const old = all.find(r => r.id === id && r.kind === "booking" && all.some(j => j.id === r.fields.job && j.kind === "job" && j.fields.client === user.clientId));
    must(old, "Appointment unavailable."); if (old.status === "cancelled") return { id: old.id, status: old.status };
    must(old.status === "scheduled" && Date.parse(s(old, "start")) > Date.now(), "Contact the organization to change this appointment.");
    const record = structuredClone(old); record.status = "cancelled"; record.revision++; record.updatedAt = new Date().toISOString();
    put(db, record, `Customer:${user.id}`, "Customer cancelled appointment; agreement and payments unchanged"); return { id: record.id, status: record.status };
  }, true);
}
