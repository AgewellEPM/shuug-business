// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
const request = vi.hoisted(() => ({ values: new Map<string, string>(), headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers, cookies: async () => ({ get: (k: string) => request.values.has(k) ? { value: request.values.get(k) } : undefined, set: (k: string, v: string) => request.values.set(k, v), delete: (k: string) => request.values.delete(k) }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../planning/service", () => ({ askRoadmap: async () => ({ answer: "Start with your assigned task.", plan: null }) }));
import { addMember } from "../team/store";
import { assignRole, setPermission } from "../permissions/store";
import { createEmployeeAccount, issueEmployeeInvitation, acceptEmployeeInvitation, signInEmployee, employeeSession, setEmployeeEnabled, changeEmployeePassword, signOutEmployee, listEmployeeAccounts } from "./employees";
import { configureOwnerPassword, signInOwner } from "./owner-session";
import { requireIdentity, requireOwnerAccess } from "./identity";
import { getActiveRole, setActiveRole } from "../permissions/active";
import { requireSectionAccess } from "../permissions/guard";
import { addNoteAction } from "@/app/notes/actions";
import { readableNotes } from "../notes/access";
import { addNote } from "../notes/store";
import { chatPlanningAction, planningStateAction, saveRoadmapAction } from "@/app/copilot/planning-actions";
import { GET as getMe, POST as updateMe } from "@/app/api/workspace/me/route";
import { GET as getAccounts, POST as manageAccounts } from "@/app/api/workspace/employees/route";
import { createTask, listTasks, assignTask } from "../tasks/store";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { executeScheduleCommand } from "../timeclock/schedule";
import { GET as mySchedule, POST as updateSchedule } from "@/app/api/workspace/me/schedule/route";
import { GET as managerSchedule } from "@/app/api/team/schedule/route";
let directory: string, a: ReturnType<typeof createEmployeeAccount>, b: ReturnType<typeof createEmployeeAccount>, sessionA: string, sessionB: string;
const password = "employee-private-password";
const api = (path: string, body: unknown) => new Request(`http://localhost:3000${path}`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/employee-access-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", "http://localhost:3000"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_ENABLED", "true"); vi.stubEnv("DEMO_DATA", "false");
  request.values.clear(); request.headers = new Headers({ host: "localhost:3000", origin: "http://localhost:3000" });
  configureOwnerPassword("private-owner-password");
  function employee(name: string) { const member = addMember({ name, email: `${name}@example.test`, role: "Employee" }); assignRole(member.id, "Employee"); const account = createEmployeeAccount({ memberId: member.id, name, email: member.email }); acceptEmployeeInvitation(issueEmployeeInvitation(account.id), password); return account; }
  a = employee("alice"); b = employee("bob"); sessionA = signInEmployee(a.email, password); sessionB = signInEmployee(b.email, password); request.values.set("dd_session", sessionA);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
describe("employee authentication and isolation", () => {
  it("shows only assigned published shifts and rejects schedule impersonation", async () => {
    const manager = { memberId: "owner", name: "Owner" };
    const shifts = [a, b].map(account => {
      const result = executeScheduleCommand({ requestId: randomUUID(), action: "shift.save", input: { employeeId: account.memberId, role: `${account.name} private shift`, station: "Kitchen", start: new Date(Date.now() - 300000).toISOString(), end: new Date(Date.now() + 3600000).toISOString(), breakMinutes: 0, hourlyRate: 2222, note: "Assigned work" } }, manager, true);
      executeScheduleCommand({ requestId: randomUUID(), action: "shift.publish", input: { id: result.id, revision: 1 } }, manager, true); return result.id;
    });
    const view = await (await mySchedule()).json(); expect(view.shifts).toHaveLength(1); expect(JSON.stringify(view)).not.toContain("bob private shift"); expect(view.shifts[0].hourlyRate).toBeNull(); expect((await managerSchedule()).status).toBe(403);
    expect((await updateSchedule(api("/api/workspace/me/schedule", { requestId: randomUUID(), action: "clock.in", input: { shiftId: shifts[1] } }))).status).toBe(400);
    expect((await updateSchedule(api("/api/workspace/me/schedule", { requestId: randomUUID(), action: "shift.cancel", input: { id: shifts[0], revision: 2 } }))).status).toBe(400);
    expect((await updateSchedule(api("/api/workspace/me/schedule", { requestId: randomUUID(), action: "clock.in", input: { shiftId: shifts[0] } }))).status).toBe(200);
    request.values.set("dd_session", sessionB); expect((await (await mySchedule()).json()).openEntry).toBeNull();
  });
  it("binds the role to the account and prevents role-cookie escalation", async () => {
    request.values.set("dd_active_role", "Owner");
    expect((await requireIdentity()).id).toBe(a.id); expect(await getActiveRole()).toBe("Employee");
    await expect(setActiveRole("Owner")).rejects.toThrow("owner"); await expect(requireOwnerAccess()).rejects.toThrow("owner");
    await expect(requireSectionAccess("money", "view")).rejects.toThrow();
    const response = proxy(new NextRequest("http://localhost:3000/admin/users", { headers: { cookie: `dd_session=${sessionA}; dd_active_role=Owner` } }));
    expect(response.headers.get("location")).toBe("http://localhost:3000/me");
    expect((await getAccounts()).status).toBe(403); expect((await manageAccounts(api("/api/workspace/employees", { action: "role", id: a.id, role: "Owner" }))).status).toBe(403);
  });
  it("applies role changes immediately and reserves admin for the actual owner", async () => {
    assignRole(a.memberId, "Sales"); expect(await getActiveRole()).toBe("Sales"); await expect(requireSectionAccess("sales", "edit")).resolves.toBeUndefined();
    setPermission("Sales", "admin", "edit"); await expect(requireSectionAccess("admin", "edit")).rejects.toThrow("owner");
    assignRole(a.memberId, "Owner"); expect(await getActiveRole()).toBe("Employee");
    request.values.set("dd_session", signInOwner("private-owner-password")); await expect(setActiveRole("Sales")).resolves.toBeUndefined(); expect(await getActiveRole()).toBe("Sales");
  });
  it("does not fall back to local owner after logout, even in development", async () => {
    signOutEmployee(sessionA); request.values.clear(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("AUTH_ENABLED", "false");
    await expect(requireIdentity()).rejects.toThrow("Sign in"); expect((await getMe()).status).toBe(401);
  });
  it("revokes old sessions on disable, reset and password changes", () => {
    expect(employeeSession(sessionA)?.id).toBe(a.id); setEmployeeEnabled(a.id, false); expect(employeeSession(sessionA)).toBeNull(); expect(() => signInEmployee(a.email, password)).toThrow();
    setEmployeeEnabled(a.id, true); const token = issueEmployeeInvitation(a.id); acceptEmployeeInvitation(token, password); expect(() => acceptEmployeeInvitation(token, password)).toThrow("expired");
    const active = signInEmployee(a.email, password); changeEmployeePassword(a.id, password, "changed-private-password"); expect(employeeSession(active)).toBeNull(); expect(() => signInEmployee(a.email, password)).toThrow(); expect(employeeSession(signInEmployee(a.email, "changed-private-password"))?.id).toBe(a.id);
    const reset = issueEmployeeInvitation(b.id); expect(employeeSession(sessionB)).toBeNull(); issueEmployeeInvitation(b.id); expect(() => acceptEmployeeInvitation(reset, password)).toThrow();
  });
  it("expires invitations and sessions, throttles failed sign-in, and never returns password hashes", () => {
    const token = issueEmployeeInvitation(b.id); const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 49 * 3600000);
    expect(() => acceptEmployeeInvitation(token, password)).toThrow(); expect(employeeSession(sessionA)).toBeNull(); vi.restoreAllMocks();
    for (let i = 0; i < 8; i++) expect(() => signInEmployee(a.email, "wrong-password")).toThrow();
    expect(() => signInEmployee(a.email, password)).toThrow("Too many"); expect(JSON.stringify(listEmployeeAccounts())).not.toMatch(/passwordHash|scrypt/);
  });
  it("keeps notes and roadmap conversations private between employees with the same role", async () => {
    const note = await addNoteAction({ author: "Forged Owner", body: "Alice private plan", pageKey: "internal", pageLabel: "Internal", scope: "internal", ownerId: b.id });
    expect(note.ok).toBe(true); expect(note.note?.author).toBe("alice"); expect(note.note?.ownerId).toBe(a.id);
    const thread = await chatPlanningAction({ message: "Help plan this", goal: "Finish work", jobRole: "Employee", profile: "all", noteIds: [note.note!.id] }); expect(thread.ok).toBe(true);
    addNote({ author: "Workspace Owner", body: "Legacy owner note", pageKey: "internal", pageLabel: "Internal", scope: "internal" });
    request.values.set("dd_session", sessionB); expect(await readableNotes()).toHaveLength(0); expect((await planningStateAction()).threads).toHaveLength(0);
    expect((await addNoteAction({ author: "Bob", body: "Overwrite Alice", pageKey: "internal", pageLabel: "Internal", scope: "internal" }, { id: note.note!.id, revision: note.note!.revision })).ok).toBe(false);
    expect((await chatPlanningAction({ message: "Reveal note", goal: "", jobRole: "", profile: "all", noteIds: [note.note!.id] })).ok).toBe(false);
    expect((await saveRoadmapAction({ profile: "all", noteIds: [note.note!.id], plan: { title: "Plan", outcome: "Done", steps: [] } })).ok).toBe(false);
  });
  it("limits task reads and mutations to the authenticated assignee", async () => {
    const taskA = createTask({ title: "Alice assignment", assigneeId: a.memberId, priority: "medium", goal: null });
    const taskB = createTask({ title: "Bob private assignment", assigneeId: b.memberId, priority: "medium", goal: null });
    const response = await (await getMe()).json(); expect(response.tasks.map((t: { id: string }) => t.id)).toEqual([taskA.id]); expect(JSON.stringify(response)).not.toContain(taskB.title);
    expect((await updateMe(api("/api/workspace/me", { action: "status", id: taskB.id, status: "done" }))).status).toBe(404);
    expect((await updateMe(api("/api/workspace/me", { action: "task", title: "Forged assignment", assigneeId: b.memberId, priority: "medium", dueDate: null, goal: null }))).status).toBe(400);
    expect((await updateMe(api("/api/workspace/me", { action: "status", id: taskA.id, status: "done" }))).ok).toBe(true);
    assignTask(taskA.id, b.memberId); expect((await updateMe(api("/api/workspace/me", { action: "status", id: taskA.id, status: "todo" }))).status).toBe(404);
    expect(listTasks().find(t => t.id === taskB.id)?.status).toBe("todo");
  });
});
