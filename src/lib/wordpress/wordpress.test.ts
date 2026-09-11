// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../planning/service", () => ({ askRoadmap: async () => ({ answer: "Plan your next task.", plan: null }) }));
import { POST } from "@/app/api/wordpress/route";
import { createEmployeeAccount, issueEmployeeInvitation, acceptEmployeeInvitation, signInEmployee, setEmployeeEnabled } from "../auth/employees";
import { configureOwnerPassword, signInOwner } from "../auth/owner-session";
import { addMember } from "../team/store";
import { assignRole } from "../permissions/store";
import { createTask } from "../tasks/store";
import { saveBranding } from "../branding/store";
import { sessionIdentity, requireIdentity } from "../auth/identity";
import { withRequestIdentity, requestIdentity } from "../auth/request-context";
import { createLaunchTicket, consumeLaunchTicket } from "./launch";
import { workspaceDatabase } from "../workspace/database";
let dir: string, tokenA: string, tokenB: string, owner: string, accountA: ReturnType<typeof createEmployeeAccount>, accountB: ReturnType<typeof createEmployeeAccount>;
const password = "wordpress-test-password";
async function command(operation: string, input: Record<string, unknown> = {}, token = tokenA) {
  const response = await POST(new Request("http://localhost:3000/api/wordpress", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ operation, input }) }));
  return { status: response.status, body: await response.json() };
}
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/wordpress-access-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  configureOwnerPassword(password); owner = signInOwner(password); saveBranding({ organizationTypes: ["product", "service", "nonprofit"] });
  function create(name: string) { const member = addMember({ name, email: `${name}@example.test`, role: "Employee" }); assignRole(member.id, "Employee"); const account = createEmployeeAccount({ memberId: member.id, name, email: member.email }); acceptEmployeeInvitation(issueEmployeeInvitation(account.id), password); return account; }
  accountA = create("wp-alice"); accountB = create("wp-bob"); tokenA = signInEmployee(accountA.email, password); tokenB = signInEmployee(accountB.email, password);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("requires a real backend session and ignores supplied identities", async () => {
  expect((await command("me", {}, "")).status).toBe(401);
  expect((await command("me", { role: "Owner", userId: accountB.id })).body.data.user.id).toBe(accountA.id);
  expect((await command("employees")).body.error).toContain("Owner");
  expect((await command("business.read", { resource: "cockpit" })).body.error).toContain("owner");
  expect((await command("session.login", { email: accountA.email, password }, "")).body.data.user.id).toBe(accountA.id);
});
it("isolates personal assignments, private notes and AI threads", async () => {
  createTask({ title: "Alice assigned task", assigneeId: accountA.memberId, priority: "high", goal: null });
  const other = createTask({ title: "Bob private task", assigneeId: accountB.memberId, priority: "low", goal: null });
  const me = await command("me"); expect(me.body.data.tasks).toHaveLength(1); expect(JSON.stringify(me)).not.toContain(other.title);
  expect((await command("task.status", { id: other.id, status: "done" })).status).toBe(400);
  const note = await command("note.save", { note: { author: "Forged", title: "Private note", body: "Alice only", scope: "internal", pageKey: "internal", pageLabel: "Internal", profile: "all" } });
  expect(note.body.data.note.ownerId).toBe(accountA.id);
  expect((await command("notes", {}, tokenB)).body.data).toEqual([]);
  expect((await command("planning.chat", { message: "Plan this", goal: "Finish work", jobRole: "Employee", profile: "all", noteIds: [note.body.data.note.id] })).status).toBe(200);
  expect((await command("planning", {}, tokenB)).body.data.threads).toHaveLength(0);
});
it("shares validated workflow records with the main application and follows role changes", async () => {
  const record = await command("record.save", { kind: "client", title: "WP client", fields: { email: "client@example.test" } }, owner);
  expect(record.status).toBe(200); expect((await command("records")).body.data.records).toHaveLength(0);
  assignRole(accountA.memberId, "Manager");
  const readable = await command("records", { module: "service-clients" }); expect(readable.body.data.records[0].id).toBe(record.body.data.record.id);
  const changed = await command("record.save", { id: record.body.data.record.id, revision: record.body.data.record.revision, kind: "client", title: "Updated from WordPress", fields: { email: "client@example.test" } }); expect(changed.status).toBe(200);
  expect((await command("record.save", { id: record.body.data.record.id, revision: record.body.data.record.revision, kind: "client", title: "Stale edit", fields: { email: "client@example.test" } })).status).toBe(400);
});
it("revokes connected WordPress sessions when accounts are disabled", async () => {
  expect((await command("me")).status).toBe(200); setEmployeeEnabled(accountA.id, false); expect((await command("me")).status).toBe(401);
});
it("keeps concurrent server identity contexts separate", async () => {
  const [a, b] = await Promise.all([
    withRequestIdentity(sessionIdentity(tokenA)!, async () => { await new Promise(r => setTimeout(r, 15)); return (await requireIdentity()).id; }),
    withRequestIdentity(sessionIdentity(tokenB)!, async () => { await new Promise(r => setTimeout(r, 5)); return (await requireIdentity()).id; }),
  ]);
  expect(a).toBe(accountA.id); expect(b).toBe(accountB.id); expect(requestIdentity()).toBeUndefined();
});
it("uses one-time expiring launch tickets and encrypts their stored credentials", () => {
  const ticket = createLaunchTicket(tokenA);
  const row = workspaceDatabase(db => db.prepare("SELECT * FROM wordpress_launch").get());
  expect(JSON.stringify(row)).not.toContain(tokenA); expect(JSON.stringify(row)).not.toContain(ticket);
  expect(consumeLaunchTicket(ticket).user.id).toBe(accountA.id); expect(() => consumeLaunchTicket(ticket)).toThrow("already used");
  const another = createLaunchTicket(tokenA); setEmployeeEnabled(accountA.id, false); expect(() => consumeLaunchTicket(another)).toThrow("no longer");
});
