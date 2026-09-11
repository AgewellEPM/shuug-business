import { describe, it, expect } from "vitest";
import { computeWorkStatus, type WorkTask } from "./engine";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const daysAgo = (d: number) => NOW - d * 86_400_000;
const task = (assigneeId: string, status: string, storyPoints: number, createdAtMs: number, completedAtMs: number | null, dueDate: string | null): WorkTask =>
  ({ assigneeId, status, storyPoints, createdAtMs, completedAtMs, dueDate });

const members = [
  { id: "on", name: "On Track", role: "Sales" },
  { id: "idle", name: "Idle Ivan", role: "Sales" },
  { id: "stall", name: "Stalled Sue", role: "Fulfillment" },
];

describe("computeWorkStatus", () => {
  const tasks: WorkTask[] = [
    // on-track: 12 pts done in last 7 days (target = 40/4 = 10), reasonable cycle
    task("on", "done", 6, daysAgo(3), daysAgo(2), null),
    task("on", "done", 6, daysAgo(2), daysAgo(1), null),
    task("on", "in_progress", 3, daysAgo(1), null, null),
    // idle: nothing active, nothing done recently
    task("idle", "done", 5, daysAgo(60), daysAgo(59), null),
    // stalled: in-progress + past due
    task("stall", "in_progress", 5, daysAgo(10), null, "2026-09-01"),
  ];
  const out = computeWorkStatus({ members, tasks, nowMs: NOW });
  const on = out.find((s) => s.id === "on")!;
  const idle = out.find((s) => s.id === "idle")!;
  const stall = out.find((s) => s.id === "stall")!;

  it("weekly target derives from hours/point (40/4 = 10)", () => {
    expect(on.weeklyTargetPoints).toBe(10);
  });

  it("on-track when the weekly goal is met", () => {
    expect(on.pointsLast7).toBe(12);
    expect(on.goalAttainmentPct).toBe(120);
    expect(on.state).toBe("on-track");
    expect(on.reasons.join(" ")).toMatch(/weekly goal/i);
  });

  it("idle when there's no active or recent work", () => {
    expect(idle.state).toBe("idle");
    expect(idle.help.join(" ")).toMatch(/blocked|assigned|check in/i);
  });

  it("stalled when active work is past due, with a why + help", () => {
    expect(stall.stalledTasks).toBe(1);
    expect(stall.state).toBe("stalled");
    expect(stall.reasons.join(" ")).toMatch(/past due/i);
    expect(stall.help.length).toBeGreaterThan(0);
  });

  it("flags slow jobs vs estimate (efficiency < 0.7)", () => {
    // 4 pts should take ~16h; took ~72h → efficiency ~0.22
    const slow = computeWorkStatus({ members: [{ id: "s", name: "S", role: "Sales" }], tasks: [task("s", "done", 4, daysAgo(4), daysAgo(1), null)], nowMs: NOW });
    expect(slow[0].efficiency! ).toBeLessThan(0.7);
    expect(slow[0].reasons.join(" ")).toMatch(/longer than estimated/i);
  });
});
