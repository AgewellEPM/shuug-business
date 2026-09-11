/**
 * The capability surface — Shuug's standardized set of things a Handler can read or
 * do. This is the moat: a generic external AI only gets "LLM + whatever you wire up";
 * a Shuug Handler gets a known set of real business capabilities, and Shuug knows
 * which ones actually exist for THIS business (module enabled / integration connected).
 */
import type { Capability } from "./model";

export const CAPABILITIES: Capability[] = [
  // Data surfaces (core — always present)
  { id: "customers", label: "Customers", kind: "data" },
  { id: "orders", label: "Orders", kind: "data" },
  { id: "products", label: "Products & pricing", kind: "data" },
  { id: "invoices", label: "Invoices", kind: "data" },
  { id: "payments", label: "Payments", kind: "data" },
  { id: "inventory", label: "Inventory", kind: "data" },
  { id: "suppliers", label: "Suppliers", kind: "data" },
  { id: "employees", label: "Employees", kind: "data" },
  { id: "documents", label: "Documents", kind: "data" },
  { id: "accounting", label: "Accounting / ledger", kind: "data" },
  { id: "shipping", label: "Shipping & tracking", kind: "data" },
  { id: "appointments", label: "Appointments & calendar", kind: "data", requires: { feature: "calendar" } },

  // Actions (write to Shuug — real, permission-gated)
  { id: "book-appointment", label: "Book / reschedule appointments", kind: "action" },
  { id: "create-quote", label: "Prepare quotes", kind: "action" },
  { id: "create-order", label: "Create orders", kind: "action" },
  { id: "record-promise", label: "Record promises to pay", kind: "action" },
  { id: "prepare-po", label: "Prepare purchase orders", kind: "action" },
  { id: "add-note", label: "Add notes to records", kind: "action" },

  // Channels (talk to the outside — need a connected integration)
  { id: "email", label: "Send email", kind: "channel", requires: { integration: "mailgun" } },
  { id: "sms", label: "Send SMS", kind: "channel", requires: { integration: "twilio" } },
  { id: "phone", label: "Answer calls", kind: "channel", requires: { integration: "twilio" } },
  { id: "slack", label: "Notify the team", kind: "channel", requires: { integration: "slack" } },
];

const byId = new Map(CAPABILITIES.map((c) => [c.id, c]));
export function capabilityById(id: string): Capability | null { return byId.get(id) ?? null; }

/**
 * Decide whether a capability is actually usable for this business. `has` answers
 * whether a feature is enabled / an integration is connected. Data + internal
 * actions are always available; channels + gated data need their dependency.
 */
export function capabilityAvailable(cap: Capability, has: (dep: { feature?: string; integration?: string }) => boolean): boolean {
  if (!cap.requires) return true;
  return has(cap.requires);
}
