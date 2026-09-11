/**
 * Gather real data → scorecards. Revenue is attributed via each customer's
 * account owner; task throughput from the task board. Shared by the page and the
 * API so both see identical numbers.
 */
import { loadWorkspace } from "../data/workspace";
import { listTeam } from "../team/store";
import { listTasks } from "../tasks/store";
import { computeScorecards, type Scorecard } from "./scorecard";

export interface OrgPerformance {
  scorecards: Scorecard[];
  totalSalaryCents: number;
  totalRevenueAttributedCents: number;
  assets: number;      // people clearly worth their cost
  underwater: number;  // revenue roles below their cost
  needsSalary: number;
}

export async function loadScorecards(): Promise<OrgPerformance> {
  const { deals, orders } = await loadWorkspace();
  const members = listTeam().map((m) => ({ id: m.id, name: m.name, role: m.role, salaryCents: m.salaryCents ?? null }));
  const accounts = deals.map((d) => ({ customerId: d.customer.id, accountOwner: d.customer.accountOwner || "" }));
  const ord = orders.map((o) => ({ customerId: o.customerId, subtotalCents: o.subtotalCents, cancelled: o.status === "cancelled" }));
  const tasks = listTasks().map((t) => ({ assigneeId: t.assigneeId, done: t.status === "done", storyPoints: t.storyPoints, xp: t.xp }));

  const scorecards = computeScorecards({ members, accounts, orders: ord, tasks });
  return {
    scorecards,
    totalSalaryCents: scorecards.reduce((n, s) => n + (s.salaryCents ?? 0), 0),
    totalRevenueAttributedCents: scorecards.reduce((n, s) => n + s.revenueAttributedCents, 0),
    assets: scorecards.filter((s) => s.verdict.tier === "star" || s.verdict.tier === "strong").length,
    underwater: scorecards.filter((s) => s.verdict.tier === "underwater").length,
    needsSalary: scorecards.filter((s) => s.verdict.tier === "set-salary").length,
  };
}
