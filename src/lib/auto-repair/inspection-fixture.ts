/** Synthetic inspection acceptance fixtures; never seed the live workspace. */
import { randomUUID } from "node:crypto";
import { saveBusinessRecord, transitionBusinessRecord } from "../workspace/store";
import type { BusinessRecord, FieldValue } from "../workspace/model";
import { addMember } from "../team/store";
import { createEmployeeAccount, issueEmployeeInvitation, acceptEmployeeInvitation } from "../auth/employees";
import { addRecord } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { executeInspectionCommand, type InspectionActor } from "./inspections";
import type { InspectionDefinition } from "./inspection-model";
export const inspectionOwner: InspectionActor = { id: "workspace-owner", memberId: "owner", name: "Fixture owner" };
export const inspectionFixtureDefinition = (): InspectionDefinition => ({ name: "Fixture inspection", version: 1, description: "Synthetic checklist for acceptance only", points: [{ key: "brakes", group: "Brakes", label: "Brake pads", instructions: "Record observed thickness and compare with reviewed vehicle specifications", unit: "mm", measurementRequired: true }, { key: "lights", group: "Exterior", label: "Lights", instructions: "Record the functional check", unit: "", measurementRequired: false }] });
export const tinyInspectionPhoto = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
export const inspectionCreateRecord = (kind: string, fields: Record<string, FieldValue>) => saveBusinessRecord({ kind, title: `Fixture inspection ${kind}`, currency: "USD", fields }, inspectionOwner.name);
export const inspectionGo = (r: BusinessRecord, target: string) => transitionBusinessRecord({ id: r.id, revision: r.revision, target, commandId: randomUUID() }, inspectionOwner.name);
export function fixtureTechnician(name = "Fixture technician") {
  const member = addMember({ name, email: `${randomUUID()}@example.test`, role: "Employee" }), account = createEmployeeAccount({ memberId: member.id, name: member.name, email: member.email }); acceptEmployeeInvitation(issueEmployeeInvitation(account.id), "Synthetic-fixture-password-123"); return { id: account.id, memberId: member.id, name: member.name };
}
export function inspectionFixture(assigned?: InspectionActor) {
  const tech = assigned ?? fixtureTechnician(), client = inspectionCreateRecord("client", { email: `${randomUUID()}@example.test`, notes: "PRIVATE inspection client note" });
  const vehicle = addRecord("vehicles", moduleById("vehicles")!.fields, { customer_id: client.id, vin: "1HGCM82633A004352", make: "Honda", model: "Accord", year: 2003, notes: "PRIVATE vehicle note" });
  const proposal = inspectionGo(inspectionGo(inspectionCreateRecord("proposal", { client: client.id, scope: "Inspect vehicle", exclusions: "Repairs require agreed scope", amount: 10000, expires: "2099-01-01", acceptedBy: "Fixture customer", evidence: "Fixture acceptance" }), "sent"), "accepted");
  const agreement = inspectionGo(inspectionCreateRecord("agreement", { client: client.id, proposal: proposal.id, terms: "Diagnostic visit", deposit: 0, signedBy: "Fixture customer", evidence: "Fixture terms" }), "signed");
  let job = inspectionCreateRecord("job", { client: client.id, agreement: agreement.id, instructions: "Inspect the vehicle", requiredChecks: "Workshop check", completedChecks: "Workshop check", evidence: "Fixture completion evidence", acceptedBy: "Fixture customer", budget: 5000 });
  const resource = inspectionGo(inspectionCreateRecord("resource", { category: "staff", weeklyHours: 40 }), "active"); inspectionGo(inspectionCreateRecord("booking", { job: job.id, resource: resource.id, start: "2026-09-21T10:00:00Z", end: "2026-09-21T12:00:00Z" }), "scheduled"); job = inspectionGo(job, "scheduled");
  const templateId = executeInspectionCommand({ requestId: randomUUID(), action: "template.save", input: { definition: inspectionFixtureDefinition(), shareInTemplates: false } }, inspectionOwner, true).id;
  executeInspectionCommand({ requestId: randomUUID(), action: "template.publish", input: { id: templateId, revision: 1, reviewed: true, review: "Fixture checklist review" } }, inspectionOwner, true);
  const id = executeInspectionCommand({ requestId: randomUUID(), action: "inspection.assign", input: { title: "Fixture vehicle inspection", vehicleId: vehicle.id, jobId: job.id, templateId, technicianId: tech.memberId, instructions: "Check both inspection points" } }, inspectionOwner, true).id;
  return { id, tech, client, vehicle, proposal, agreement, job, resource, templateId };
}
