import { defineModule } from "@/lib/sdk/module";
import type { Field } from "@/lib/features/model";
import type { AppModuleManifest, ModuleRecord } from "@/lib/sdk/types";

const field = (id: string, label: string, type: Field["type"] = "text", required = false, options: string[] = []): Field => ({ id, label, type, required, options });
const text = (id: string, label: string, required = false) => field(id, label, "text", required);
const date = (id: string, label: string, required = false) => field(id, label, "date", required);
const choice = (id: string, label: string, options: string[]) => field(id, label, "select", true, options);
const client = text("client_id", "Service client ID", true);
const year = field("tax_year", "Tax year", "number", true);
const notes = field("notes", "Internal notes (no taxpayer IDs)", "notes");
const active = (rows: ModuleRecord[]) => rows.filter(row => !row.archived);
const count = (rows: ModuleRecord[], key: string, values: string[]) => String(active(rows).filter(row => values.includes(String(row.values[key]))).length);
function module(id: string, label: string, capabilityPacks: string[], fields: Field[], description: string, panels?: AppModuleManifest["panels"]) {
  return defineModule({ id, label, capabilityPacks, fields, description, panels, group: "Services", section: "services", organizations: ["service"], version: "1.0.0", author: "Shuug" });
}

/** Operational records, not a return calculation, electronic signature or e-file engine. */
export const taxFirmModules = [
  module("tax-engagements", "Tax engagements", ["tax_firm"], [
    text("name", "Engagement name", true), client, year,
    choice("stage", "Workflow stage", ["Intake", "Awaiting documents", "Preparation", "Accountant review", "Client review", "External filing", "Closed", "On hold"]),
    text("accountant", "Assigned accountant"), date("due", "Staff deadline"),
    text("agreement_id", "Service agreement ID"), text("job_id", "Service work order ID"), text("invoice_id", "Service invoice ID"), notes,
  ], "Track client intake, assigned accountants, review stages and links to Shuug agreements, work orders and billing. Stage labels record staff progress; they do not prepare or file returns.", [{
    id: "pipeline", label: "Tax work queue", compute: rows => [
      { label: "Active engagements", value: String(active(rows).filter(row => row.values.stage !== "Closed").length) },
      { label: "Awaiting documents", value: count(rows, "stage", ["Awaiting documents"]), tone: "warn" },
      { label: "Accountant review", value: count(rows, "stage", ["Accountant review"]) },
    ],
  }]),
  module("tax-document-requests", "Tax document requests", ["tax_firm"], [
    text("name", "Requested document", true), text("engagement_id", "Tax engagement record ID", true), client,
    choice("status", "Request status", ["Requested", "Received externally", "Staff reviewed", "Needs replacement", "Not applicable"]),
    date("due", "Requested by"), text("reviewer", "Reviewed by"), text("secure_reference", "Private document vault reference"), notes,
  ], "Track requests and human review of documents held in your approved private vault. This record stores references, not uploaded tax documents or extracted taxpayer data."),
  module("tax-filing-handoffs", "External filing handoffs", ["tax_firm"], [
    text("name", "Handoff name", true), text("engagement_id", "Tax engagement record ID", true), client, year,
    choice("engine", "External filing engine", ["Drake", "Other external preparer"]),
    choice("status", "Recorded handoff status", ["Not sent", "Sent externally", "Acknowledgment pending", "Acceptance recorded", "Rejection recorded"]),
    text("external_reference", "External provider reference"), text("evidence_reference", "Acknowledgment evidence reference"),
    date("recorded_on", "Recorded on"), text("recorded_by", "Recorded by"), notes,
  ], "Record staff-supplied handoff and acknowledgment references from Drake or another external filing engine. Saving a status never submits a return or independently verifies acceptance."),
  module("rideshare-tax-records", "Rideshare tax records", ["tax_firm", "rideshare_tax"], [
    text("name", "Records checklist name", true), text("engagement_id", "Tax engagement record ID", true), client, year,
    choice("platform", "Driving platform", ["Uber", "Lyft", "Multiple platforms", "Other gig work"]),
    choice("income_records", "Income statements", ["Not requested", "Requested", "Received externally", "Staff reviewed"]),
    choice("mileage_records", "Mileage records", ["Not requested", "Requested", "Received externally", "Staff reviewed", "Not applicable"]),
    choice("expense_records", "Expense records", ["Not requested", "Requested", "Received externally", "Staff reviewed"]),
    text("accountant", "Reviewing accountant"), notes,
  ], "Coordinate rideshare income, mileage and expense records for professional review. Shuug does not calculate deductible mileage, eligibility, a refund or a tax liability."),
  module("tax-quarterly-reviews", "Quarterly tax reviews", ["tax_firm", "quarterly_tax"], [
    text("name", "Review name", true), client, year,
    choice("quarter", "Review period", ["Q1", "Q2", "Q3", "Q4"]), date("due", "Staff review date", true),
    choice("status", "Review status", ["Scheduled", "Waiting for records", "Accountant review", "Advice delivered", "Closed"]),
    text("accountant", "Assigned accountant"), text("advice_reference", "Reviewed advice reference"), notes,
  ], "Schedule staff reviews and record the reference to accountant-reviewed advice. Dates are staff-entered; no statutory deadline, estimated tax calculation or payment is generated."),
];
