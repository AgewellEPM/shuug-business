import type { DatabaseSync } from "node:sqlite";
import type { Inspection, InspectionTemplate } from "./inspection-model";
export function inspectionRows(db: DatabaseSync): Inspection[] { return (db.prepare("SELECT body FROM documents WHERE kind='repair-inspection' ORDER BY rowid DESC").all() as { body: string }[]).map(r => JSON.parse(r.body)); }
export function inspectionTemplates(db: DatabaseSync): InspectionTemplate[] { return (db.prepare("SELECT body FROM documents WHERE kind='repair-inspection-template' ORDER BY rowid DESC").all() as { body: string }[]).map(r => JSON.parse(r.body)); }
export function putInspectionDocument(db: DatabaseSync, value: Inspection | InspectionTemplate, actor: string, action: string) {
  const kind = "jobId" in value ? "repair-inspection" : "repair-inspection-template";
  db.prepare("INSERT INTO documents VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(value.id, kind, JSON.stringify(value));
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(value.id, actor, action, new Date().toISOString(), JSON.stringify(value));
}
export function requireJobInspectionsReviewed(db: DatabaseSync, jobId: string) {
  if (inspectionRows(db).some(i => i.jobId === jobId && !["reviewed", "cancelled"].includes(i.status))) throw new Error("Submit and review the assigned vehicle inspections before completing this job.");
}
export function inspectionWorkMilliseconds(i: Inspection, now = Date.now()) { return (i.timeAdjustmentMilliseconds ?? 0) + i.sessions.reduce((sum, s) => sum + Date.parse(s.end) - Date.parse(s.start), 0) + (i.activeSince ? now - Date.parse(i.activeSince) : 0); }
export function customerInspection(i: Inspection) { return { id: i.id, title: i.title, vehicle: i.vehicle.label, vin: i.vehicle.vin, odometer: i.odometer, odometerUnit: i.odometerUnit, reviewedAt: i.reviewedAt, summary: i.customerSummary, points: i.template.definition.points.map(p => ({ key: p.key, group: p.group, label: p.label, unit: p.unit, finding: i.findings.find(f => f.key === p.key)!, disposition: i.dispositions.find(d => d.key === p.key)?.disposition ?? null, photos: i.photos.filter(photo => photo.key === p.key).map(photo => ({ id: photo.id, name: photo.name })) })) }; }

export function sharedInspectionsForClient(db: DatabaseSync, clientId: string) { return inspectionRows(db).filter(i => i.clientId === clientId && i.status === "reviewed" && i.shared).map(customerInspection); }
