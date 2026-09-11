/**
 * THE SHUUG BUSINESS STATE LAYER — canonical primitives.
 *
 * Every vertical (restaurant, mechanic, swim school, wholesale, daycare…) uses
 * different nouns, but underneath there are the SAME recurring primitives:
 *
 *   Entity → Relationship → Agreement → Resource → Work → Transaction → Payment
 *          → Ledger event → Communication → State change
 *
 * The apps (CRM, bookkeeping, inventory, HR, scheduling) are VIEWS over this state.
 * AI is an actor operating against it under permissions. Ghost Bridge maps a legacy
 * system's state INTO these primitives so the old business joins the same layer.
 *
 * This file is the pure vocabulary + the vertical→primitive normalization map. No I/O.
 */

/** The ten recurring primitives every business reduces to. */
export type PrimitiveKind =
  | "entity" | "relationship" | "agreement" | "resource"
  | "work" | "transaction" | "payment" | "ledger-event"
  | "communication" | "state-change";

export const PRIMITIVES: { kind: PrimitiveKind; label: string; definition: string }[] = [
  { kind: "entity", label: "Entity", definition: "A thing the business tracks: a person, org, or asset." },
  { kind: "relationship", label: "Relationship", definition: "A link between entities (guardian↔child, account↔rep)." },
  { kind: "agreement", label: "Agreement", definition: "Agreed terms: pricing, contract, enrollment, membership." },
  { kind: "resource", label: "Resource", definition: "Something consumed or scheduled: inventory, a table, a room, a slot." },
  { kind: "work", label: "Work", definition: "A unit of work to do: a job, ticket, appointment, order to fulfill." },
  { kind: "transaction", label: "Transaction", definition: "An economic event: an order, invoice, purchase, bill." },
  { kind: "payment", label: "Payment", definition: "Money moving: a charge, deposit, refund, payout." },
  { kind: "ledger-event", label: "Ledger event", definition: "A double-entry posting derived from a transaction/payment." },
  { kind: "communication", label: "Communication", definition: "A message to/from an entity: email, SMS, call, note." },
  { kind: "state-change", label: "State change", definition: "A transition: status advanced, stage moved, item completed." },
];

/** The roles an Entity can play (a person can be several at once). */
export type EntityRole = "customer" | "employee" | "supplier" | "contact" | "participant" | "asset";

export interface CanonicalEntity {
  id: string;
  role: EntityRole;
  name: string;
  /** which vertical/app it came from, for provenance. */
  source: string;
  /** free-form normalized attributes (email, phone, dob, sku…). */
  attributes: Record<string, string | number | boolean | null>;
}

/** How a vertical's specific nouns map onto the shared primitives. */
export interface VerticalMapping {
  vertical: string;
  label: string;
  nouns: { noun: string; primitive: PrimitiveKind; role?: EntityRole }[];
}

/**
 * The proof the thesis is real: the same primitives, different nouns. This is what
 * lets one AI capability layer (and Ghost Bridge) serve every vertical.
 */
export const VERTICAL_MAP: VerticalMapping[] = [
  { vertical: "restaurant", label: "Restaurant", nouns: [
    { noun: "guest", primitive: "entity", role: "customer" }, { noun: "staff", primitive: "entity", role: "employee" },
    { noun: "supplier", primitive: "entity", role: "supplier" }, { noun: "ingredient", primitive: "resource" },
    { noun: "table", primitive: "resource" }, { noun: "reservation", primitive: "work" }, { noun: "kitchen ticket", primitive: "work" },
    { noun: "purchase", primitive: "transaction" }, { noun: "check", primitive: "transaction" }, { noun: "payment", primitive: "payment" }, { noun: "shift", primitive: "work" },
  ] },
  { vertical: "auto-repair", label: "Auto repair", nouns: [
    { noun: "customer", primitive: "entity", role: "customer" }, { noun: "technician", primitive: "entity", role: "employee" },
    { noun: "vehicle", primitive: "entity", role: "asset" }, { noun: "part", primitive: "resource" },
    { noun: "job", primitive: "work" }, { noun: "estimate", primitive: "agreement" }, { noun: "invoice", primitive: "transaction" }, { noun: "payment", primitive: "payment" },
  ] },
  { vertical: "swim-school", label: "Swim / classes", nouns: [
    { noun: "parent", primitive: "entity", role: "customer" }, { noun: "child", primitive: "entity", role: "participant" },
    { noun: "instructor", primitive: "entity", role: "employee" }, { noun: "class", primitive: "resource" },
    { noun: "enrollment", primitive: "agreement" }, { noun: "booking", primitive: "work" }, { noun: "tuition invoice", primitive: "transaction" }, { noun: "payment", primitive: "payment" },
  ] },
  { vertical: "wholesale", label: "Wholesale", nouns: [
    { noun: "account", primitive: "entity", role: "customer" }, { noun: "rep", primitive: "entity", role: "employee" },
    { noun: "supplier", primitive: "entity", role: "supplier" }, { noun: "SKU", primitive: "resource" },
    { noun: "pricing agreement", primitive: "agreement" }, { noun: "order", primitive: "transaction" }, { noun: "invoice", primitive: "transaction" }, { noun: "payment", primitive: "payment" },
  ] },
];

export function verticalMapping(vertical: string): VerticalMapping | null {
  return VERTICAL_MAP.find((v) => v.vertical === vertical) ?? null;
}

/** Which primitives a vertical actually exercises (dedup of its noun mappings). */
export function primitivesUsed(vertical: string): PrimitiveKind[] {
  const m = verticalMapping(vertical);
  if (!m) return [];
  return [...new Set(m.nouns.map((n) => n.primitive))];
}
