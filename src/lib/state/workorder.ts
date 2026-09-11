/**
 * Work orders — the reference guarded workflow, proving the engine is real. A repair
 * order moves Requested → Estimated → Approved → Scheduled → In progress → Completed →
 * Invoiced, and each transition has requirements (approval needs recorded evidence;
 * scheduling needs a free bay + technician; invoicing needs billable work). EVERY actor
 * — person, website, AI — goes through `executeTransition`, which:
 *   1. is idempotent (a retried request with the same key never double-applies),
 *   2. evaluates the guards (pure engine),
 *   3. commits the state change + history + audit together (one write = all-or-nothing),
 *   4. records who requested it, what was checked, and what changed.
 * You cannot advance a status by poking a field. That's what makes it an engine.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { evaluateTransition, availableTransitions, type Workflow, type TransitionDecision, type CheckOutcome } from "./engine";

export type WorkOrderState = "requested" | "estimated" | "approved" | "scheduled" | "in-progress" | "completed" | "invoiced";

export interface WorkOrder {
  id: string;
  customerId: string;
  customerName: string;
  service: string;
  state: WorkOrderState;
  estimateCents: number;
  approvedBy: string;     // evidence of the customer's approval
  scheduledFor: string;   // ISO or ""
  technicianId: string;
  invoiceRef: string;
  history: { at: string; actor: string; from: string; to: string; transition: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Resources { baysAvailable: number; techniciansAvailable: number }
interface Ctx { order: WorkOrder; resources: Resources }

const has = (v: string) => v.trim().length > 0;

/** The repair-order workflow with the exact requirements Luke specified. */
export const REPAIR_ORDER: Workflow<Ctx> = {
  entity: "work-order",
  states: ["requested", "estimated", "approved", "scheduled", "in-progress", "completed", "invoiced"],
  initial: "requested",
  transitions: [
    { id: "estimate", label: "Estimate", from: "requested", to: "estimated", requires: [
      { id: "has-estimate", label: "Estimate amount entered", check: (c) => c.order.estimateCents > 0 || "Add an estimate amount first." },
    ] },
    { id: "approve", label: "Approve", from: "estimated", to: "approved", requires: [
      { id: "has-estimate", label: "There is an estimate to approve", check: (c) => c.order.estimateCents > 0 || "There is no estimate to approve." },
      { id: "approval-evidence", label: "Customer approval recorded", check: (c) => has(c.order.approvedBy) || "Record who approved it — approval evidence is required." },
    ] },
    { id: "schedule", label: "Schedule", from: "approved", to: "scheduled", requires: [
      { id: "has-time", label: "A time is chosen", check: (c) => has(c.order.scheduledFor) || "Pick a date and time." },
      { id: "bay-free", label: "A bay is available", check: (c) => c.resources.baysAvailable > 0 || "No bay is available at that time." },
      { id: "tech-free", label: "A technician is available", check: (c) => c.resources.techniciansAvailable > 0 || "No technician is available." },
    ] },
    { id: "start", label: "Start work", from: "scheduled", to: "in-progress", requires: [
      { id: "tech-assigned", label: "A technician is assigned", check: (c) => has(c.order.technicianId) || "Assign a technician." },
    ] },
    { id: "complete", label: "Complete", from: "in-progress", to: "completed", requires: [] },
    { id: "invoice", label: "Invoice", from: "completed", to: "invoiced", requires: [
      { id: "billable", label: "There is billable work", check: (c) => c.order.estimateCents > 0 || "Nothing billable to invoice." },
    ] },
  ],
};

export interface AuditRecord {
  id: string;
  at: string;
  actor: string;
  entity: string;
  entityId: string;
  operation: string;
  from: string;
  to: string;
  allowed: boolean;
  checks: CheckOutcome[];
  idempotencyKey: string | null;
}

interface State { orders: WorkOrder[]; audit: AuditRecord[]; idempotency: Record<string, string> }
const holder = globalThis as unknown as { __workorders?: State };
const file = () => path.join(dataDirectory(), "workorders.json");

function loadFromDisk(): State | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return v && Array.isArray(v.orders) ? { orders: v.orders, audit: v.audit ?? [], idempotency: v.idempotency ?? {} } : null; } catch { return null; }
}
function persist(s: State) {
  holder.__workorders = s;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `workorders-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
  renameSync(tmp, file());   // one atomic write = order + audit + idempotency commit together
}
function state(): State {
  if (holder.__workorders) return holder.__workorders;
  holder.__workorders = loadFromDisk() ?? { orders: [], audit: [], idempotency: {} };
  return holder.__workorders;
}

export function listWorkOrders(): WorkOrder[] { return state().orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => ({ ...o })); }
export function getWorkOrder(id: string): WorkOrder | null { const o = state().orders.find((x) => x.id === id); return o ? { ...o } : null; }
export function listAudit(entityId?: string): AuditRecord[] { return state().audit.filter((a) => !entityId || a.entityId === entityId).slice().reverse(); }

export function createWorkOrder(customerId: string, customerName: string, service: string): WorkOrder {
  const s = state();
  const now = new Date().toISOString();
  const order: WorkOrder = {
    id: randomUUID(), customerId, customerName: customerName.slice(0, 160), service: service.slice(0, 200),
    state: "requested", estimateCents: 0, approvedBy: "", scheduledFor: "", technicianId: "", invoiceRef: "",
    history: [], createdAt: now, updatedAt: now,
  };
  persist({ ...s, orders: [...s.orders, order] });
  return order;
}

export type OrderPatch = Partial<Pick<WorkOrder, "estimateCents" | "approvedBy" | "scheduledFor" | "technicianId" | "invoiceRef">>;

export interface ExecuteResult { ok: boolean; decision: TransitionDecision; order: WorkOrder | null; deduped?: boolean }

/**
 * The ONE door every actor uses to change a work order's state. Idempotent, guarded,
 * atomic, audited. `actor` is recorded (a person's name, "website", or an AI handler id).
 */
export function executeTransition(orderId: string, transitionId: string, actor: string, patch: OrderPatch = {}, resources: Resources = { baysAvailable: 1, techniciansAvailable: 1 }, idempotencyKey: string | null = null): ExecuteResult {
  const s = state();

  // 1. Idempotency — a retried request never applies twice.
  if (idempotencyKey && s.idempotency[idempotencyKey]) {
    const prior = s.audit.find((a) => a.id === s.idempotency[idempotencyKey]);
    const order = getWorkOrder(orderId);
    return { ok: !!prior?.allowed, deduped: true, order, decision: { transitionId, label: transitionId, from: prior?.from ?? order?.state ?? "", to: prior?.to ?? "", allowed: !!prior?.allowed, checks: prior?.checks ?? [], blockedReason: prior?.allowed ? undefined : "Already processed." } };
  }

  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, order: null, decision: { transitionId, label: transitionId, from: "", to: "", allowed: false, checks: [], blockedReason: "Work order not found." } };

  // 2. Evaluate guards against the candidate (order + the actor's supplied evidence).
  const candidate: WorkOrder = { ...order, ...patch };
  const decision = evaluateTransition(REPAIR_ORDER, order.state, transitionId, { order: candidate, resources });

  const now = new Date().toISOString();
  const audit: AuditRecord = {
    id: randomUUID(), at: now, actor: actor.slice(0, 120), entity: "work-order", entityId: orderId,
    operation: transitionId, from: order.state, to: decision.to, allowed: decision.allowed, checks: decision.checks, idempotencyKey,
  };

  // 3. Commit the state change + history + audit + idempotency in ONE write.
  const nextOrders = decision.allowed
    ? s.orders.map((o) => (o.id === orderId ? { ...candidate, state: decision.to as WorkOrderState, updatedAt: now, history: [...o.history, { at: now, actor: audit.actor, from: order.state, to: decision.to, transition: transitionId }] } : o))
    : s.orders;
  const nextIdem = idempotencyKey ? { ...s.idempotency, [idempotencyKey]: audit.id } : s.idempotency;
  persist({ orders: nextOrders, audit: [...s.audit, audit].slice(-5000), idempotency: nextIdem });

  return { ok: decision.allowed, decision, order: getWorkOrder(orderId) };
}

/** What an actor could do next, with live pass/fail on each guard. */
export function nextActions(order: WorkOrder, resources: Resources = { baysAvailable: 1, techniciansAvailable: 1 }): TransitionDecision[] {
  return availableTransitions(REPAIR_ORDER, order.state, { order, resources });
}
