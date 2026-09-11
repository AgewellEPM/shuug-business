import { requireSectionAccess } from "@/lib/permissions/guard";
import { tasksByStatus, memberProgress } from "@/lib/tasks/store";
import { listTeam } from "@/lib/team/store";
import { TaskBoard } from "@/components/TaskBoard";
import { createTaskAction, moveTaskAction, assignTaskAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  await requireSectionAccess("team", "view");

  const columns = tasksByStatus();
  const progress = memberProgress().map(m => ({ ...m, salaryCents: null, email: "" }));
  const members = listTeam().map((m) => ({ id: m.id, name: m.name }));

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team tasks</h1>
        <p className="mt-1 text-sm text-slate-600">
          See what everyone&apos;s working on, assign tasks to goals, and move them across the board.
          Finishing a task earns XP and levels people up. Assignments are saved and appear in each employee’s My work area.
        </p>
      </header>
      <TaskBoard
        columns={columns}
        progress={progress}
        members={members}
        createAction={createTaskAction}
        moveAction={moveTaskAction}
        assignAction={assignTaskAction}
      />
    </div>
  );
}
