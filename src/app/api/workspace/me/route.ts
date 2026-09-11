import { z } from "zod";
import { cookies } from "next/headers";
import { requireIdentity } from "@/lib/auth/identity";
import { changeEmployeePassword } from "@/lib/auth/employees";
import { configureOwnerPassword } from "@/lib/auth/owner-session";
import { verifyPassword } from "@/lib/auth/passwords";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { appBaseUrl, setting } from "@/lib/connections/vault";
import { listTasks, createTask, moveTask } from "@/lib/tasks/store";
import { boundedJson } from "@/lib/social/http";
import { rateLimit } from "@/lib/security/rate-limit";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("task"), title: z.string().trim().min(1).max(140), priority: z.enum(["low", "medium", "high"]), dueDate: z.iso.date().nullable(), goal: z.string().trim().max(120).nullable() }).strict(),
  z.object({ action: z.literal("status"), id: z.string().min(1).max(100), status: z.enum(["todo", "in_progress", "review", "done"]) }).strict(),
  z.object({ action: z.literal("password"), currentPassword: z.string().min(1).max(200), password: z.string().min(14).max(200) }).strict(),
]);
export async function GET() {
  try { const user = await requireIdentity(); return json({ user, tasks: listTasks().filter(t => t.assigneeId === user.memberId) }); }
  catch { return json({ error: "Sign in to view your work." }, 401); }
}
export async function POST(request: Request) {
  let user; try { user = await requireIdentity(); } catch { return json({ error: "Sign in to update your work." }, 401); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const input = schema.parse(await boundedJson(new Response(request.body), 8000));
    if (input.action === "task") createTask({ title: input.title, assigneeId: user.memberId, priority: input.priority, goal: input.goal, dueDate: input.dueDate });
    else if (input.action === "status") {
      if (!moveTask(input.id, input.status, user.memberId)) return json({ error: "Task unavailable or assigned to someone else." }, 404);
    } else {
      if (!rateLimit(`password:${user.id}`, 5, 900000).allowed) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      if (user.isOwner) {
        if (!verifyPassword(input.currentPassword, setting("WORKSPACE_OWNER_PASSWORD_HASH") ?? "")) throw new Error("Current password is incorrect.");
        configureOwnerPassword(input.password, true);
      } else changeEmployeePassword(user.id, input.currentPassword, input.password);
      (await cookies()).delete(SESSION_COOKIE);
      return json({ signInRequired: true });
    }
    return json({ user, tasks: listTasks().filter(t => t.assigneeId === user.memberId) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not update your work." }, 400); }
}
