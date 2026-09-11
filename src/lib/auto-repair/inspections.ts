import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { listRecords } from "../sdk/records";
import type { ModuleRecord } from "../sdk/types";
import type { BusinessRecord } from "../workspace/model";
import { listEmployeeAccounts } from "../auth/employees";
import { getMember } from "../team/store";
import { startInspectionJob, recordInspectionTime } from "../workspace/store";
import { customerFromDatabase } from "../customer-access/accounts";
import { portalClient } from "../workspace/portal";
import { must, pricingHash, commandReceipt, recordCommand } from "./library";
import { inspectionActions, inspectionCommandInput, technicianActions, type Inspection } from "./inspection-model";
import { inspectionRows, inspectionTemplates, putInspectionDocument, inspectionWorkMilliseconds } from "./inspection-state";
import { updateInspectionTemplate } from "./inspection-templates";
export interface InspectionActor { id: string; memberId: string; name: string }
function prepare() { listRecords("vehicles"); listEmployeeAccounts(); }
function assertActor(db: DatabaseSync, actor: InspectionActor) { must(getMember(actor.memberId), "Your team member record is unavailable."); if (actor.memberId !== "owner") must(db.prepare("SELECT id FROM employee_accounts WHERE id=? AND memberId=? AND status='active'").get(actor.id, actor.memberId), "Your employee account is no longer active."); }
function technician(db: DatabaseSync, memberId: string) { const member = getMember(memberId); must(member && (memberId === "owner" || db.prepare("SELECT id FROM employee_accounts WHERE memberId=? AND status='active'").get(memberId)), "Assign an active employee login or the owner."); return { memberId, name: member.name }; }
function records(db: DatabaseSync): BusinessRecord[] { return (db.prepare("SELECT body FROM records WHERE kind IN ('job','client','booking','agreement','proposal','time_entry')").all() as { body: string }[]).map(r => JSON.parse(r.body)); }
function vehicles(db: DatabaseSync): ModuleRecord[] { const state = db.prepare("SELECT body FROM documents WHERE id='state:module-records'").get() as { body: string } | undefined; return state ? JSON.parse(state.body).vehicles ?? [] : []; }
const vehicleLabel = (v: ModuleRecord) => [v.values.year, v.values.make, v.values.model].filter(Boolean).join(" ");
function liveJob(db: DatabaseSync, i: Inspection) { const job = records(db).find(r => r.id === i.jobId && r.kind === "job" && r.fields.client === i.clientId); must(job && ["scheduled", "in_progress"].includes(job.status), "This inspection's job is no longer available for work."); return job; }
function unchangedVehicle(db: DatabaseSync, i: Inspection) { const v = vehicles(db).find(v => v.id === i.vehicle.id && !v.archived); must(v && v.values.customer_id === i.clientId && v.values.vin === i.vehicle.vin && vehicleLabel(v) === i.vehicle.label, "The vehicle identity or client changed. Cancel and reassign a new inspection after reviewing the vehicle."); }
function stop(i: Inspection, at: string) { if (!i.activeSince) return; must(Date.parse(at) >= Date.parse(i.activeSince), "The clock moved backward. Retry after the recorded start time."); i.sessions.push({ start: i.activeSince, end: at, memberId: i.technician.memberId }); i.activeSince = null; }
function completeFindings(i: Inspection) {
  must(i.odometer !== null, "Record the vehicle odometer and its unit.");
  for (const p of i.template.definition.points) {
    const f = i.findings.find(f => f.key === p.key); must(f && f.outcome !== "not_checked", `Complete the ${p.label} check.`);
    if (p.measurementRequired && f.outcome !== "not_applicable") must(f.measurement, `Record a measurement for ${p.label}.`);
    if (f.outcome !== "pass") must(f.observation.length >= 3, `Explain the ${p.label} finding or why it is not applicable.`);
    if (["attention", "unsafe"].includes(f.outcome)) must(f.recommendation.length >= 3, `Record a recommendation for ${p.label}.`);
  }
}
export function executeInspectionCommand(raw: unknown, actor: InspectionActor, manager: boolean) {
  const command = inspectionCommandInput.parse(raw); must(manager || technicianActions.has(command.action), "Inspection management access required."); prepare();
  const request = pricingHash({ command, actor: { id: actor.id, memberId: actor.memberId }, manager }), actorName = `${actor.name} (${actor.id})`;
  return workspaceDatabase(db => {
    assertActor(db, actor); const prior = commandReceipt(db, command.requestId, request); if (prior) return prior;
    let id: string; const at = new Date().toISOString();
    if (command.action.startsWith("template.")) id = updateInspectionTemplate(db, command.action, command.input, actorName);
    else if (command.action === "inspection.assign") {
      const v = inspectionActions[command.action].parse(command.input), all = records(db), job = all.find(r => r.id === v.jobId && r.kind === "job"), vehicle = vehicles(db).find(r => r.id === v.vehicleId && !r.archived), template = inspectionTemplates(db).find(t => t.id === v.templateId && t.status === "published");
      must(job && ["scheduled", "in_progress"].includes(job.status) && all.some(r => r.kind === "booking" && r.fields.job === job.id && r.status === "scheduled"), "Choose a scheduled job with a confirmed resource booking."); must(vehicle && vehicle.values.customer_id === job.fields.client, "The vehicle must belong to this job's service client."); must(template, "Choose a published inspection checklist.");
      const tech = technician(db, v.technicianId), existing = inspectionRows(db); must(existing.length < 10000, "The inspection archive has reached 10,000 records."); must(!existing.some(i => i.jobId === job.id && i.vehicle.id === vehicle.id && i.template.id === template.id && i.status !== "cancelled"), "This checklist is already assigned to that vehicle and job.");
      const i: Inspection = { id: randomUUID(), revision: 1, title: v.title, status: "assigned", jobId: job.id, clientId: String(job.fields.client), vehicle: { id: vehicle.id, vin: String(vehicle.values.vin), label: vehicleLabel(vehicle) }, template: { id: template.id, definition: structuredClone(template.definition) }, technician: tech, instructions: v.instructions,
        findings: template.definition.points.map(p => ({ key: p.key, outcome: "not_checked", measurement: "", observation: "", recommendation: "" })), odometer: null, odometerUnit: "miles", activeSince: null, timeAdjustmentMilliseconds: 0, sessions: [], photos: [], staffNotes: "", customerSummary: "", dispositions: [], shared: false, review: "", reviewedBy: null, reviewedAt: null, timeEntryId: null, createdAt: at, updatedAt: at };
      putInspectionDocument(db, i, actorName, command.action); id = i.id;
    } else {
      const schema = inspectionActions[command.action], input = schema.parse(command.input) as { id: string; revision: number }, i = inspectionRows(db).find(i => i.id === input.id); must(i && i.revision === input.revision, "This inspection changed. Refresh before continuing.");
      if (technicianActions.has(command.action)) { must(i.technician.memberId === actor.memberId, "Only the assigned technician can record this inspection."); technician(db, actor.memberId); if (command.action !== "inspection.pause") { liveJob(db, i); unchangedVehicle(db, i); } }
      if (command.action === "inspection.start") {
        must(["assigned", "changes_requested", "in_progress"].includes(i.status) && !i.activeSince, "This inspection cannot start another work timer."); must(i.sessions.length < 100, "This inspection has reached 100 work sessions. Submit it for review or assign a new inspection."); must(!inspectionRows(db).some(other => other.activeSince && other.technician.memberId === actor.memberId), "Pause your current inspection before starting another.");
        startInspectionJob(db, i.jobId, actorName); i.status = "in_progress"; i.activeSince = at;
      } else if (command.action === "inspection.pause") { must(i.status === "in_progress" && i.activeSince, "This inspection has no running timer."); stop(i, at); }
      else if (command.action === "inspection.save") {
        must(i.status === "in_progress", "Start the inspection before recording findings."); const v = inspectionActions[command.action].parse(command.input), keys = new Set(i.template.definition.points.map(p => p.key)); must(v.findings.length === keys.size && new Set(v.findings.map(f => f.key)).size === keys.size && v.findings.every(f => keys.has(f.key)), "Save one finding for every point in the assigned checklist.");
        i.findings = v.findings; i.odometer = v.odometer; i.odometerUnit = v.odometerUnit; i.staffNotes = v.staffNotes; i.customerSummary = v.customerSummary;
      } else if (command.action === "inspection.photo") {
        must(i.status === "in_progress", "Photos can be added while the inspection is in progress."); const v = inspectionActions[command.action].parse(command.input); must(i.template.definition.points.some(p => p.key === v.key), "Choose a point from this inspection."); must(i.photos.length < 12, "Keep at most 12 evidence photos per inspection.");
        const bytes = Buffer.from(v.data, "base64"); must(bytes.length > 8 && bytes.length <= 512000 && bytes.toString("base64") === v.data, "Use a photo of at most 500 KB encoded as standard base64.");
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255, webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
        must(v.mime === "image/png" && png || v.mime === "image/jpeg" && jpeg || v.mime === "image/webp" && webp, "The photo content does not match its image type.");
        const sha256 = createHash("sha256").update(bytes).digest("hex"); must(!i.photos.some(p => p.key === v.key && p.sha256 === sha256), "This photo is already attached to that inspection point."); const photoId = randomUUID();
        db.prepare("INSERT INTO documents VALUES(?,'repair-inspection-photo',?)").run(photoId, JSON.stringify({ inspectionId: i.id, mime: v.mime, data: v.data })); i.photos.push({ id: photoId, key: v.key, name: v.name, mime: v.mime, sha256, by: actorName, at });
      } else if (command.action === "inspection.submit") { must(i.status === "in_progress", "Only in-progress inspections can be submitted."); completeFindings(i); stop(i, at); must(inspectionWorkMilliseconds(i) > 0, "Record inspection work time before submitting."); i.status = "submitted"; }
      else if (command.action === "inspection.return") { must(i.status === "submitted", "Return a submitted inspection for changes."); i.status = "changes_requested"; i.review = inspectionActions[command.action].parse(command.input).reason; }
      else if (command.action === "inspection.reassign") {
        const v = inspectionActions[command.action].parse(command.input); must(["assigned", "in_progress", "changes_requested"].includes(i.status) && !i.activeSince, "Pause unfinished inspection work before reassigning it."); must(!i.sessions.length, "An attended inspection retains its technician. Cancel it and assign a new inspection to another technician."); i.technician = technician(db, v.technicianId); i.review = v.reason;
      } else if (command.action === "inspection.time.correct") {
        const v = inspectionActions[command.action].parse(command.input); must(!i.activeSince && !["reviewed", "cancelled"].includes(i.status), "Pause unreviewed work before correcting time."); const recorded = i.sessions.reduce((n, s) => n + Date.parse(s.end) - Date.parse(s.start), 0); i.timeAdjustmentMilliseconds = v.minutes * 60000 - recorded; i.review = `Time corrected to ${v.minutes} minutes: ${v.reason}`;
      } else if (command.action === "inspection.review") {
        const v = inspectionActions[command.action].parse(command.input); must(i.status === "submitted", "Only submitted inspections can be reviewed."); liveJob(db, i); unchangedVehicle(db, i); completeFindings(i);
        const concerns = i.findings.filter(f => ["attention", "unsafe"].includes(f.outcome)); must(v.dispositions.length === concerns.length && new Set(v.dispositions.map(d => d.key)).size === concerns.length && concerns.every(f => v.dispositions.some(d => d.key === f.key)), "Record the outcome and evidence for every attention or unsafe finding before review.");
        i.dispositions = v.dispositions; i.review = v.review; i.reviewedBy = actorName; i.reviewedAt = at; i.shared = v.shareWithCustomer; i.status = "reviewed";
        const time = recordInspectionTime(db, { inspectionId: i.id, jobId: i.jobId, technician: i.technician.name, milliseconds: inspectionWorkMilliseconds(i), hourlyCost: v.hourlyCost, reviewer: actorName, evidence: `Vehicle inspection ${i.id}: ${v.review}` }, actorName); i.timeEntryId = time.id;
      } else if (command.action === "inspection.cancel") { must(!["reviewed", "cancelled"].includes(i.status), "A reviewed inspection remains in the history."); stop(i, at); i.status = "cancelled"; i.review = inspectionActions[command.action].parse(command.input).reason; }
      else if (command.action === "inspection.share") { must(i.status === "reviewed", "Only reviewed reports can be shared with the customer."); i.shared = inspectionActions[command.action].parse(command.input).shareWithCustomer; }
      i.revision++; i.updatedAt = at; putInspectionDocument(db, i, actorName, command.action); id = i.id;
    }
    const result = { id }; recordCommand(db, command.requestId, request, result); return result;
  }, true);
}
export function inspectionWorkspace(actor: InspectionActor, manager: boolean) {
  prepare(); return workspaceDatabase(db => { assertActor(db, actor); const all = records(db), jobs = all.filter(r => r.kind === "job"), inspections = inspectionRows(db).filter(i => manager || i.technician.memberId === actor.memberId);
    return { manager, memberId: actor.memberId, inspections, templates: manager ? inspectionTemplates(db) : [],
      jobs: jobs.filter(j => manager ? ["scheduled", "in_progress"].includes(j.status) : inspections.some(i => i.jobId === j.id)).map(j => ({ id: j.id, title: j.title, currency: j.currency, clientId: String(j.fields.client), instructions: String(j.fields.instructions), requiredChecks: String(j.fields.requiredChecks), status: j.status, due: String(j.fields.due ?? "") })),
      vehicles: manager ? vehicles(db).filter(v => !v.archived).map(v => ({ id: v.id, label: vehicleLabel(v), vin: String(v.values.vin), clientId: String(v.values.customer_id) })) : [],
      technicians: manager ? [{ memberId: "owner", name: getMember("owner")!.name }, ...(db.prepare("SELECT memberId,name FROM employee_accounts WHERE status='active'").all() as { memberId: string; name: string }[]).filter(t => getMember(t.memberId)).map(t => ({ memberId: t.memberId, name: t.name }))] : [],
      timeCosts: manager ? all.filter(r => r.kind === "time_entry" && inspections.some(i => i.timeEntryId === r.id)).map(r => ({ id: r.id, minutes: Number(r.fields.minutes), cost: Number(r.fields.cost), currency: r.currency })) : [],
    };
  });
}
export function inspectionPhoto(photoId: string, access: { actor: InspectionActor; manager: boolean } | { customerToken: string } | { portalToken: string }) {
  z.uuid().parse(photoId); return workspaceDatabase(db => {
    const stored = db.prepare("SELECT body FROM documents WHERE id=? AND kind='repair-inspection-photo'").get(photoId) as { body: string } | undefined; must(stored, "Inspection photo unavailable."); const photo = JSON.parse(stored.body) as { inspectionId: string; mime: string; data: string }, i = inspectionRows(db).find(i => i.id === photo.inspectionId); must(i && i.photos.some(p => p.id === photoId), "Inspection photo unavailable.");
    if ("actor" in access) { assertActor(db, access.actor); must(access.manager || i.technician.memberId === access.actor.memberId, "Inspection photo unavailable."); }
    else { const clientId = "customerToken" in access ? customerFromDatabase(db, access.customerToken)?.clientId : portalClient(db, access.portalToken); must(i.status === "reviewed" && i.shared && i.clientId === clientId, "Inspection photo unavailable."); }
    return { mime: photo.mime, bytes: Buffer.from(photo.data, "base64") };
  });
}
