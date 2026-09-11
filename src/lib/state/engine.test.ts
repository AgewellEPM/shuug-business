import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { evaluateTransition, availableTransitions, isTerminal } from "./engine";
import { REPAIR_ORDER, createWorkOrder, executeTransition, getWorkOrder, listAudit, nextActions } from "./workorder";

// Pure engine tests against the repair-order workflow.
const ctx = (over: Partial<{ estimateCents: number; approvedBy: string; scheduledFor: string; technicianId: string; bays: number; techs: number }> = {}) => ({
  order: { id: "o", customerId: "c", customerName: "Alex", service: "brakes", state: "requested" as const, estimateCents: over.estimateCents ?? 0, approvedBy: over.approvedBy ?? "", scheduledFor: over.scheduledFor ?? "", technicianId: over.technicianId ?? "", invoiceRef: "", history: [], createdAt: "", updatedAt: "" },
  resources: { baysAvailable: over.bays ?? 1, techniciansAvailable: over.techs ?? 1 },
});

describe("guarded transitions (pure)", () => {
  it("blocks a transition taken from the wrong state", () => {
    const d = evaluateTransition(REPAIR_ORDER, "requested", "approve", ctx());
    expect(d.allowed).toBe(false);
    expect(d.blockedReason).toMatch(/from "requested"/);
  });

  it("estimate needs an amount; approve needs the amount AND recorded approval evidence", () => {
    expect(evaluateTransition(REPAIR_ORDER, "requested", "estimate", ctx({ estimateCents: 0 })).allowed).toBe(false);
    expect(evaluateTransition(REPAIR_ORDER, "requested", "estimate", ctx({ estimateCents: 5000 })).allowed).toBe(true);

    const noEvidence = evaluateTransition(REPAIR_ORDER, "estimated", "approve", ctx({ estimateCents: 5000 }));
    expect(noEvidence.allowed).toBe(false);
    expect(noEvidence.checks.find((c) => c.guardId === "approval-evidence")?.passed).toBe(false);
    expect(evaluateTransition(REPAIR_ORDER, "estimated", "approve", ctx({ estimateCents: 5000, approvedBy: "Alex" })).allowed).toBe(true);
  });

  it("scheduling needs a time AND a free bay AND a free technician", () => {
    expect(evaluateTransition(REPAIR_ORDER, "approved", "schedule", ctx({ scheduledFor: "2026-09-11T10:00", bays: 0 })).allowed).toBe(false);
    expect(evaluateTransition(REPAIR_ORDER, "approved", "schedule", ctx({ scheduledFor: "2026-09-11T10:00", techs: 0 })).allowed).toBe(false);
    expect(evaluateTransition(REPAIR_ORDER, "approved", "schedule", ctx({ scheduledFor: "2026-09-11T10:00" })).allowed).toBe(true);
  });

  it("availableTransitions lists only moves from the current state; invoiced is terminal", () => {
    expect(availableTransitions(REPAIR_ORDER, "requested", ctx()).map((d) => d.transitionId)).toEqual(["estimate"]);
    expect(isTerminal(REPAIR_ORDER, "invoiced")).toBe(true);
  });
});

// Executor tests — real store, isolated temp dir.
describe("executeTransition — idempotent, atomic, audited", () => {
  let dir = "";
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "wo-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); (globalThis as unknown as { __workorders?: unknown }).__workorders = undefined; });
  afterEach(() => { vi.unstubAllEnvs(); (globalThis as unknown as { __workorders?: unknown }).__workorders = undefined; rmSync(dir, { recursive: true, force: true }); });

  it("advances state only when guards pass, and records an audit entry either way", () => {
    const o = createWorkOrder("alex", "Alex", "Brake job");
    const blocked = executeTransition(o.id, "approve", "Jordan"); // wrong state
    expect(blocked.ok).toBe(false);
    expect(getWorkOrder(o.id)!.state).toBe("requested"); // unchanged

    const est = executeTransition(o.id, "estimate", "Jordan", { estimateCents: 45000 });
    expect(est.ok).toBe(true);
    expect(getWorkOrder(o.id)!.state).toBe("estimated");
    expect(getWorkOrder(o.id)!.estimateCents).toBe(45000);

    const audit = listAudit(o.id);
    expect(audit.some((a) => a.operation === "approve" && !a.allowed)).toBe(true);
    expect(audit.some((a) => a.operation === "estimate" && a.allowed)).toBe(true);
    // the audit says WHAT was checked
    expect(audit.find((a) => a.operation === "estimate")!.checks[0]).toMatchObject({ guardId: "has-estimate", passed: true });
  });

  it("is idempotent: the same idempotency key never applies twice", () => {
    const o = createWorkOrder("alex", "Alex", "Brake job");
    executeTransition(o.id, "estimate", "web", { estimateCents: 45000 });
    const first = executeTransition(o.id, "approve", "web", { approvedBy: "Alex" }, undefined, "req-123");
    expect(first.ok).toBe(true);
    expect(getWorkOrder(o.id)!.state).toBe("approved");

    // retry with same key: deduped, no second application, state unchanged
    const retry = executeTransition(o.id, "approve", "web", { approvedBy: "Alex" }, undefined, "req-123");
    expect(retry.deduped).toBe(true);
    expect(getWorkOrder(o.id)!.state).toBe("approved");
    expect(getWorkOrder(o.id)!.history.filter((h) => h.transition === "approve")).toHaveLength(1);
  });

  it("nextActions reflects live guard state as the order progresses", () => {
    const o = createWorkOrder("alex", "Alex", "Brake job");
    expect(nextActions(getWorkOrder(o.id)!).map((d) => d.transitionId)).toEqual(["estimate"]);
    executeTransition(o.id, "estimate", "x", { estimateCents: 1000 });
    const approve = nextActions(getWorkOrder(o.id)!)[0];
    expect(approve.transitionId).toBe("approve");
    expect(approve.allowed).toBe(false); // needs approval evidence still
  });
});
