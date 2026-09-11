import { describe, it, expect } from "vitest";
import { createTask, moveTask, assignTask, tasksByStatus, memberProgress, listTasks } from "./store";

describe("tasks store", () => {
  it("creates a task in To do with priority XP", () => {
    const t = createTask({ title: "Test task", assigneeId: "alex", priority: "high", goal: null });
    expect(t.status).toBe("todo");
    expect(t.xp).toBe(50);
    expect(listTasks().some((x) => x.id === t.id)).toBe(true);
  });

  it("awards XP to the assignee on completion and reverses on un-complete", () => {
    const t = createTask({ title: "XP task", assigneeId: "mia", priority: "medium", goal: null });
    const before = memberProgress().find((m) => m.id === "mia")!.totalXp;
    moveTask(t.id, "done");
    const after = memberProgress().find((m) => m.id === "mia")!.totalXp;
    expect(after).toBe(before + 25);
    // move back out of done -> XP reversed
    moveTask(t.id, "in_progress");
    expect(memberProgress().find((m) => m.id === "mia")!.totalXp).toBe(before);
  });

  it("groups tasks into Kanban columns", () => {
    const cols = tasksByStatus();
    expect(Object.keys(cols).sort()).toEqual(["done", "in_progress", "review", "todo"]);
    expect(cols.todo.every((t) => t.status === "todo")).toBe(true);
  });

  it("reassigns a task", () => {
    const t = createTask({ title: "Reassign me", assigneeId: "alex", priority: "low", goal: null });
    expect(assignTask(t.id, "jordan")?.assigneeId).toBe("jordan");
  });

  it("member progress carries level + task load, sorted by XP", () => {
    const progress = memberProgress();
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0].totalXp).toBeGreaterThanOrEqual(progress[progress.length - 1].totalXp);
    expect(progress[0].level.level).toBeGreaterThanOrEqual(1);
  });
});
