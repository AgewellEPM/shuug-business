import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MyWork } from "./MyWork";
const user = { id: "account-alice", memberId: "alice", name: "Alice", email: "alice@example.test", role: "Employee", isOwner: false };
const task = { id: "task-1", title: "Prepare session materials", assigneeId: "alice", status: "todo" as const, priority: "high" as const, storyPoints: 3, dueDate: "2026-09-15", xp: 30, goal: "Run workshop", createdAt: "2026-09-10", completedAt: null };
afterEach(() => vi.unstubAllGlobals());
it("saves an assignment status through the personal API and displays server results", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ user, tasks: [{ ...task, status: "done" }] }) })); vi.stubGlobal("fetch", fetcher);
  render(<MyWork user={user} initialTasks={[task]}/>);
  fireEvent.change(screen.getByRole("combobox", { name: "Status for Prepare session materials" }), { target: { value: "done" } });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
  expect(fetcher).toHaveBeenCalledWith("/api/workspace/me", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "status", id: "task-1", status: "done" }) }));
  expect(screen.getByRole("combobox", { name: "Status for Prepare session materials" })).toHaveValue("done");
  expect(screen.getByRole("link", { name: /My notes/ })).toHaveAttribute("href", "/notes");
});
it("shows failed saves without losing the employee's task draft", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Sign in to update your work." }) })));
  render(<MyWork user={user} initialTasks={[]}/>);
  fireEvent.change(screen.getByRole("textbox", { name: "Task" }), { target: { value: "Follow up after workshop" } });
  fireEvent.click(screen.getByRole("button", { name: "Add my task" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sign in to update your work."));
  expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("Follow up after workshop");
});
