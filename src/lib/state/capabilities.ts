/**
 * The normalized business capability surface — the API an actor (a person, an AI
 * Handler, or a website plugin) uses to operate against business state, instead of
 * 40 unrelated SaaS APIs. A mechanic's appointment handler and a swim school's
 * appointment handler call the SAME `appointment.available()` — the vertical differs,
 * the machinery doesn't.
 *
 * This file is the pure CONTRACT (descriptors + permission gates + status). The live
 * implementations live in ./facade over the stores that already exist; anything not
 * yet backed is declared "planned" honestly, never faked.
 */
import type { SectionKey } from "../permissions/model";
import type { PrimitiveKind } from "./primitives";

export type CapabilityStatus = "live" | "planned";

export interface CapabilityDescriptor {
  /** dotted id: "<entity>.<verb>" — the call an actor makes. */
  id: string;
  entity: string;
  verb: string;
  summary: string;
  /** the primitive it reads or writes. */
  primitive: PrimitiveKind;
  /** does it change state (vs read)? writes are approval-gatable for AI. */
  mutates: boolean;
  /** the RBAC section an actor must hold to call it. */
  section: SectionKey;
  status: CapabilityStatus;
  /** which store/module implements it, or null when planned. */
  backedBy: string | null;
}

export const CAPABILITIES: CapabilityDescriptor[] = [
  // Entities
  { id: "customer.lookup", entity: "customer", verb: "lookup", summary: "Find a customer/account by name or id.", primitive: "entity", mutates: false, section: "sales", status: "live", backedBy: "data/store" },
  { id: "customer.list", entity: "customer", verb: "list", summary: "List customers.", primitive: "entity", mutates: false, section: "sales", status: "live", backedBy: "data/store" },
  { id: "employee.list", entity: "employee", verb: "list", summary: "List employees.", primitive: "entity", mutates: false, section: "team", status: "live", backedBy: "team/store" },
  { id: "employee.assign", entity: "employee", verb: "assign", summary: "Assign an employee to a job/task.", primitive: "state-change", mutates: true, section: "team", status: "planned", backedBy: null },
  { id: "supplier.list", entity: "supplier", verb: "list", summary: "List suppliers.", primitive: "entity", mutates: false, section: "money", status: "live", backedBy: "expenses/store" },
  { id: "supplier.order", entity: "supplier", verb: "order", summary: "Prepare a purchase order to a supplier.", primitive: "transaction", mutates: true, section: "operations", status: "planned", backedBy: null },

  // Resources
  { id: "inventory.levels", entity: "inventory", verb: "levels", summary: "Read current stock levels.", primitive: "resource", mutates: false, section: "operations", status: "live", backedBy: "ops/store" },
  { id: "inventory.reserve", entity: "inventory", verb: "reserve", summary: "Check availability / reserve stock for an order.", primitive: "resource", mutates: false, section: "operations", status: "live", backedBy: "ops/inventory" },
  { id: "appointment.available", entity: "appointment", verb: "available", summary: "Find open slots/tables for a time.", primitive: "resource", mutates: false, section: "operations", status: "live", backedBy: "restaurant+education" },

  // Work
  { id: "work.list", entity: "work", verb: "list", summary: "List open work (jobs, tickets, orders to fulfill).", primitive: "work", mutates: false, section: "operations", status: "planned", backedBy: null },

  // Transactions + payments + ledger
  { id: "invoice.list", entity: "invoice", verb: "list", summary: "List invoices and their status.", primitive: "transaction", mutates: false, section: "money", status: "live", backedBy: "payments/load" },
  { id: "invoice.create", entity: "invoice", verb: "create", summary: "Create an invoice/order.", primitive: "transaction", mutates: true, section: "sales", status: "planned", backedBy: null },
  { id: "payment.status", entity: "payment", verb: "status", summary: "Get the payment/receivable status of an invoice.", primitive: "payment", mutates: false, section: "money", status: "live", backedBy: "payments/load" },
  { id: "ledger.post", entity: "ledger", verb: "post", summary: "Post a balanced double-entry journal entry.", primitive: "ledger-event", mutates: true, section: "money", status: "live", backedBy: "accounting/journal-store" },
  { id: "ledger.trialBalance", entity: "ledger", verb: "trialBalance", summary: "Read the trial balance / ledger-derived statements.", primitive: "ledger-event", mutates: false, section: "money", status: "live", backedBy: "accounting/ledger-load" },

  // Communication
  { id: "message.send", entity: "message", verb: "send", summary: "Send a message to an entity (email/SMS) via a connected channel.", primitive: "communication", mutates: true, section: "sales", status: "planned", backedBy: null },
];

const byId = new Map(CAPABILITIES.map((c) => [c.id, c]));
export function capabilityById(id: string): CapabilityDescriptor | null { return byId.get(id) ?? null; }

export function liveCapabilities(): CapabilityDescriptor[] { return CAPABILITIES.filter((c) => c.status === "live"); }

export interface CapabilitySurface {
  total: number;
  live: number;
  planned: number;
  byEntity: { entity: string; capabilities: CapabilityDescriptor[] }[];
}

/** The machine-readable surface — what AI Handlers and plugins get instead of raw SaaS APIs. */
export function capabilitySurface(): CapabilitySurface {
  const entities = [...new Set(CAPABILITIES.map((c) => c.entity))];
  return {
    total: CAPABILITIES.length,
    live: CAPABILITIES.filter((c) => c.status === "live").length,
    planned: CAPABILITIES.filter((c) => c.status === "planned").length,
    byEntity: entities.map((entity) => ({ entity, capabilities: CAPABILITIES.filter((c) => c.entity === entity) })),
  };
}
