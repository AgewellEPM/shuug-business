/**
 * Remote work + goal tracking — output-based, not surveillance. We judge by
 * results: are they completing work, keeping pace with their weekly goal, and are
 * jobs taking about as long as estimated. Estimates come from story points ×
 * hours/point, so "how long should this take" is explicit and comparable to
 * actuals. When someone's behind we surface WHY and how to help. Pure + tested.
 */
export interface WorkMember { id: string; name: string; role: string }
export interface WorkTask {
  assigneeId: string | null;
  status: string; // "todo" | "in_progress" | "review" | "done"
  storyPoints: number;
  createdAtMs: number;
  completedAtMs: number | null;
  dueDate: string | null; // ISO date
}

export type WorkState = "on-track" | "behind" | "at-risk" | "stalled" | "idle";

export interface WorkStatus {
  id: string;
  name: string;
  role: string;
  activeTasks: number;        // in progress / review right now
  doneLast7: number;
  pointsLast7: number;
  weeklyTargetPoints: number;
  goalAttainmentPct: number;  // pointsLast7 / target
  overdueTasks: number;
  stalledTasks: number;       // active + past due
  avgCycleHours: number | null;
  expectedCycleHours: number | null;
  efficiency: number | null;  // expected ÷ actual (>1 = faster than estimated)
  lastCompletedAtMs: number | null;
  daysSinceActivity: number | null;
  state: WorkState;
  reasons: string[];
  help: string[];
}

const DAY = 86_400_000;
const active = (s: string) => s === "in_progress" || s === "review";

export function computeWorkStatus(input: {
  members: WorkMember[];
  tasks: WorkTask[];
  nowMs: number;
  hoursPerPoint?: number;
  weeklyHours?: number;
}): WorkStatus[] {
  const hpp = input.hoursPerPoint ?? 4;
  const weeklyTargetPoints = Math.max(1, Math.round((input.weeklyHours ?? 40) / hpp));
  const todayIso = new Date(input.nowMs).toISOString().slice(0, 10);
  const weekAgo = input.nowMs - 7 * DAY;

  return input.members.map((m) => {
    const mine = input.tasks.filter((t) => t.assigneeId === m.id);
    const done = mine.filter((t) => t.status === "done" && t.completedAtMs !== null);
    const doneRecent = done.filter((t) => (t.completedAtMs as number) >= weekAgo);
    const pointsLast7 = doneRecent.reduce((n, t) => n + t.storyPoints, 0);
    const activeTasks = mine.filter((t) => active(t.status)).length;
    const overdue = mine.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < todayIso);
    const stalled = overdue.filter((t) => active(t.status)).length;

    // Cycle time vs estimate on recent completions.
    const cycles = doneRecent.map((t) => ((t.completedAtMs as number) - t.createdAtMs) / 3_600_000);
    const avgCycleHours = cycles.length ? round1(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null;
    const expectedHoursArr = doneRecent.map((t) => Math.max(0.25, t.storyPoints) * hpp);
    const expectedCycleHours = expectedHoursArr.length ? round1(expectedHoursArr.reduce((a, b) => a + b, 0) / expectedHoursArr.length) : null;
    const efficiency = avgCycleHours && expectedCycleHours && avgCycleHours > 0 ? round2(expectedCycleHours / avgCycleHours) : null;

    const lastCompletedAtMs = done.reduce<number | null>((max, t) => (t.completedAtMs! > (max ?? 0) ? t.completedAtMs! : max), null);
    const daysSinceActivity = lastCompletedAtMs === null ? null : Math.floor((input.nowMs - lastCompletedAtMs) / DAY);
    const goalAttainmentPct = Math.round((pointsLast7 / weeklyTargetPoints) * 100);

    const state = judgeState({ activeTasks, doneLast7: doneRecent.length, goalAttainmentPct, overdue: overdue.length, stalled, daysSinceActivity });
    const { reasons, help } = diagnose({ state, goalAttainmentPct, overdue: overdue.length, stalled, efficiency, daysSinceActivity, pointsLast7, weeklyTargetPoints });

    return {
      id: m.id, name: m.name, role: m.role, activeTasks, doneLast7: doneRecent.length, pointsLast7, weeklyTargetPoints,
      goalAttainmentPct, overdueTasks: overdue.length, stalledTasks: stalled, avgCycleHours, expectedCycleHours, efficiency,
      lastCompletedAtMs, daysSinceActivity, state, reasons, help,
    };
  });
}

function judgeState(x: { activeTasks: number; doneLast7: number; goalAttainmentPct: number; overdue: number; stalled: number; daysSinceActivity: number | null }): WorkState {
  if (x.activeTasks === 0 && x.doneLast7 === 0) return "idle";
  if (x.stalled > 0) return "stalled";
  if (x.goalAttainmentPct < 50 || x.overdue > 2 || (x.daysSinceActivity ?? 0) > 5) return "at-risk";
  if (x.goalAttainmentPct < 90) return "behind";
  return "on-track";
}

function diagnose(x: { state: WorkState; goalAttainmentPct: number; overdue: number; stalled: number; efficiency: number | null; daysSinceActivity: number | null; pointsLast7: number; weeklyTargetPoints: number }) {
  const reasons: string[] = [];
  const help: string[] = [];
  if (x.state === "idle") { reasons.push("No completed work this week and nothing in progress."); help.push("Check in — are they blocked, out, or need work assigned?"); }
  if (x.stalled > 0) { reasons.push(`${x.stalled} task${x.stalled === 1 ? "" : "s"} in progress but past due.`); help.push("Ask what's blocking; break the task down or reassign."); }
  if (x.overdue > 0 && x.stalled === 0) { reasons.push(`${x.overdue} task${x.overdue === 1 ? "" : "s"} past due.`); help.push("Rebalance workload or move the deadline."); }
  if (x.efficiency !== null && x.efficiency < 0.7) { reasons.push(`Jobs taking ~${(1 / x.efficiency).toFixed(1)}× longer than estimated.`); help.push("Likely blocked or under-scoped — pair them up or clarify the task."); }
  if (x.goalAttainmentPct < 90 && x.state !== "idle") { reasons.push(`At ${x.goalAttainmentPct}% of the weekly goal (${x.pointsLast7}/${x.weeklyTargetPoints} pts).`); help.push("Clarify priorities and hand them smaller, clearer tasks."); }
  if (x.daysSinceActivity !== null && x.daysSinceActivity > 3 && x.state !== "idle") { reasons.push(`No completion in ${x.daysSinceActivity} days.`); help.push("A quick daily check-in keeps momentum."); }
  if (x.state === "on-track") { reasons.push(`Hitting the weekly goal (${x.goalAttainmentPct}%).`); help.push("Recognize the pace and keep the pipeline full."); }
  return { reasons, help };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
