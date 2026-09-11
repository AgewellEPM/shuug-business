/**
 * State-layer facade — the LIVE implementations of the capability surface, over the
 * stores that already exist. This is the proof the layer isn't a diagram: it reads and
 * writes real business state through one normalized door, permission-gated. Every
 * source is guarded so a missing vertical degrades to "unavailable", never a crash.
 */
import { can, type PermissionMatrix, type SectionKey } from "../permissions/model";
import { CAPABILITIES, capabilityById, type CapabilityDescriptor } from "./capabilities";
import type { CanonicalEntity } from "./primitives";

/** Can this role invoke this capability right now (permission + it must be live)? */
export function canCall(descriptor: CapabilityDescriptor, role: string, matrix: PermissionMatrix): boolean {
  return descriptor.status === "live" && can(matrix, role, descriptor.section as SectionKey, descriptor.mutates ? "edit" : "view");
}

/** Which capabilities a given role can actually call now — the actor's usable surface. */
export function usableCapabilities(role: string, matrix: PermissionMatrix): string[] {
  return CAPABILITIES.filter((c) => canCall(c, role, matrix)).map((c) => c.id);
}

export interface StateSnapshot {
  customers: number;
  employees: number;
  suppliers: number;
  inventoryItems: number;
  lowStock: number;
  openInvoices: number;
  outstandingCents: number;
  ledgerBalanced: boolean | null;
}

/** Read a normalized snapshot across the live read-capabilities. Guarded per source. */
export async function snapshotState(): Promise<StateSnapshot> {
  const snap: StateSnapshot = { customers: 0, employees: 0, suppliers: 0, inventoryItems: 0, lowStock: 0, openInvoices: 0, outstandingCents: 0, ledgerBalanced: null };

  try {
    const { getDealStore } = await import("../data/store");
    const { loadAnalytics } = await import("../analytics/load");
    const { customers } = await loadAnalytics(await getDealStore());
    snap.customers = customers.length;
  } catch { /* customers unavailable */ }

  try { const { listTeam } = await import("../team/store"); snap.employees = listTeam().length; } catch { /* */ }

  try {
    const { listExpenses } = await import("../expenses/store");
    snap.suppliers = new Set(listExpenses().map((e) => e.fields.merchant).filter(Boolean)).size;
  } catch { /* */ }

  try {
    const { getInventory } = await import("../ops/store");
    const inv = getInventory();
    snap.inventoryItems = inv.length;
    snap.lowStock = inv.filter((i) => typeof i.onHandCases === "number" && typeof i.reorderPointCases === "number" && i.onHandCases <= i.reorderPointCases).length;
  } catch { /* */ }

  try {
    const { loadCollections } = await import("../payments/load");
    const { statuses, outstandingCents } = await loadCollections();
    snap.openInvoices = statuses.filter((s) => s.status !== "paid" && s.status !== "void").length;
    snap.outstandingCents = outstandingCents;
  } catch { /* */ }

  try { const { loadLedger } = await import("../accounting/ledger-load"); snap.ledgerBalanced = (await loadLedger()).trialBalance.balanced; } catch { /* */ }

  return snap;
}

// ---- A couple of real capability invocations (normalized entities) ----

/** customer.lookup / customer.list → canonical entities. */
export async function lookupCustomers(query = ""): Promise<CanonicalEntity[]> {
  try {
    const { getDealStore } = await import("../data/store");
    const { loadAnalytics } = await import("../analytics/load");
    const { customers } = await loadAnalytics(await getDealStore());
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => !q || c.company.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 50)
      .map((c) => ({ id: c.id, role: "customer" as const, name: c.company, source: "data/store", attributes: { channel: c.channel ?? null, region: c.region ?? null, owner: c.accountOwner ?? null } }));
  } catch { return []; }
}

/** employee.list → canonical entities. */
export async function listEmployees(): Promise<CanonicalEntity[]> {
  try {
    const { listTeam } = await import("../team/store");
    return listTeam().map((m) => ({ id: m.id, role: "employee" as const, name: m.name, source: "team/store", attributes: { position: m.role } }));
  } catch { return []; }
}

/** ledger.post → post a balanced journal entry (the one write example; money-edit gated upstream). */
export async function postLedger(date: string, memo: string, lines: { accountNumber: number; debitCents: number; creditCents: number }[]): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { addManualEntry } = await import("../accounting/journal-store");
    const entry = addManualEntry({ date, memo, lines });
    return { ok: true, id: entry.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Post failed" }; }
}

export { capabilityById };
