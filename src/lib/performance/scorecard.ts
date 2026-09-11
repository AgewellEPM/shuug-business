/**
 * Employee performance scorecards — an honest, role-aware read of what each
 * person is worth to the business. Revenue roles are judged on money brought in
 * vs. their salary (the "5× salary" test + ROI); support roles — who don't sell
 * but keep the machine running — are judged on throughput so they're never
 * unfairly labeled an "expense". Pure aggregation, cents-only, deterministic.
 */
export type PerfTier = "star" | "strong" | "solid" | "watch" | "underwater" | "set-salary";

export interface PerfMember { id: string; name: string; role: string; salaryCents: number | null }
export interface PerfInput {
  members: PerfMember[];
  /** customer → the rep who owns the account. */
  accounts: { customerId: string; accountOwner: string }[];
  orders: { customerId: string; subtotalCents: number; cancelled: boolean }[];
  tasks: { assigneeId: string | null; done: boolean; storyPoints: number; xp: number }[];
}

export interface Scorecard {
  id: string;
  name: string;
  role: string;
  isRevenueRole: boolean;
  salaryCents: number | null;
  revenueAttributedCents: number;
  accountsOwned: number;
  ordersCount: number;
  tasksDone: number;
  tasksOpen: number;
  storyPointsDone: number;
  xp: number;
  /** revenue ÷ salary (revenue roles with a salary). */
  valueMultiple: number | null;
  /** (revenue − salary) ÷ salary × 100 — return on their cost. */
  roiPct: number | null;
  /** revenue − salary: the actual dollars they made you, net of cost. */
  profitContributionCents: number | null;
  /** 0–100 throughput score, for support roles (relative to support peers). */
  supportScore: number | null;
  verdict: { tier: PerfTier; label: string; rationale: string };
}

const REVENUE_ROLES = new Set(["Owner", "Manager", "Sales"]);
const norm = (s: string) => s.trim().toLowerCase();

export function computeScorecards(input: PerfInput): Scorecard[] {
  const ownerByCustomer = new Map(input.accounts.map((a) => [a.customerId, norm(a.accountOwner)]));

  // Pass 1: raw metrics.
  const raw = input.members.map((m) => {
    const nameKey = norm(m.name);
    const owned = new Set(input.accounts.filter((a) => norm(a.accountOwner) === nameKey).map((a) => a.customerId));
    const repOrders = input.orders.filter((o) => !o.cancelled && ownerByCustomer.get(o.customerId) === nameKey && owned.has(o.customerId));
    const revenueAttributedCents = repOrders.reduce((n, o) => n + o.subtotalCents, 0);

    const mine = input.tasks.filter((t) => t.assigneeId === m.id);
    const done = mine.filter((t) => t.done);
    const tasksDone = done.length;
    const storyPointsDone = done.reduce((n, t) => n + t.storyPoints, 0);
    const xp = done.reduce((n, t) => n + t.xp, 0);

    const isRevenueRole = REVENUE_ROLES.has(m.role) || revenueAttributedCents > 0;
    const throughput = tasksDone * 10 + storyPointsDone * 3 + Math.round(xp / 10);

    return {
      m, revenueAttributedCents, accountsOwned: owned.size, ordersCount: repOrders.length,
      tasksDone, tasksOpen: mine.length - tasksDone, storyPointsDone, xp, isRevenueRole, throughput,
    };
  });

  // Normalize support throughput to 0–100 among support peers.
  const supportMax = Math.max(1, ...raw.filter((r) => !r.isRevenueRole).map((r) => r.throughput));

  return raw.map((r) => {
    const salaryCents = r.m.salaryCents ?? null;
    const valueMultiple = r.isRevenueRole && salaryCents ? r.revenueAttributedCents / salaryCents : null;
    const roiPct = r.isRevenueRole && salaryCents ? Math.round(((r.revenueAttributedCents - salaryCents) / salaryCents) * 100) : null;
    const profitContributionCents = r.isRevenueRole && salaryCents !== null ? r.revenueAttributedCents - salaryCents : null;
    const supportScore = r.isRevenueRole ? null : Math.round((r.throughput / supportMax) * 100);
    const verdict = judge(r.isRevenueRole, valueMultiple, salaryCents, supportScore);

    return {
      id: r.m.id, name: r.m.name, role: r.m.role, isRevenueRole: r.isRevenueRole, salaryCents,
      revenueAttributedCents: r.revenueAttributedCents, accountsOwned: r.accountsOwned, ordersCount: r.ordersCount,
      tasksDone: r.tasksDone, tasksOpen: r.tasksOpen, storyPointsDone: r.storyPointsDone, xp: r.xp,
      valueMultiple, roiPct, profitContributionCents, supportScore, verdict,
    };
  });
}

function judge(isRevenue: boolean, multiple: number | null, salary: number | null, supportScore: number | null): Scorecard["verdict"] {
  if (isRevenue) {
    if (salary === null || multiple === null) return { tier: "set-salary", label: "Set a salary", rationale: "Add this person's salary to measure their ROI." };
    if (multiple >= 5) return { tier: "star", label: "Top performer", rationale: `Brings in ${multiple.toFixed(1)}× their salary — clear asset.` };
    if (multiple >= 3) return { tier: "strong", label: "Strong", rationale: `Worth ${multiple.toFixed(1)}× their cost.` };
    if (multiple >= 1) return { tier: "solid", label: "Covers cost", rationale: `Brings in ${multiple.toFixed(1)}× — pays for themselves.` };
    return { tier: "underwater", label: "Below cost", rationale: `Only ${multiple.toFixed(1)}× their salary — costs more than they bring today.` };
  }
  const s = supportScore ?? 0;
  if (s >= 75) return { tier: "star", label: "Backbone", rationale: "Top throughput of the support team — keeps everything moving." };
  if (s >= 50) return { tier: "strong", label: "Reliable", rationale: "Steady, high output enabling the revenue team." };
  if (s >= 25) return { tier: "solid", label: "Contributing", rationale: "Getting work done; room to take on more." };
  return { tier: "watch", label: "Underused", rationale: "Low recorded output — check workload or assignments." };
}
