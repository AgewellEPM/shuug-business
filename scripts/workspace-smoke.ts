import { expenseAccountingHttpCheck } from "./expense-accounting-http-check";
import { receivableHttpCheck } from "./receivable-http-check";
import { journalHttpCheck } from "./journal-http-check";
import { inspectionHttpCheck } from "./inspection-http-check";
import { repairPricingHttpCheck } from "./repair-pricing-http-check";
/** Exercise the installed production HTTP server in a disposable workspace.
 * No browser, user data, provider credentials or outbound messages are used. */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createTask } from "../src/lib/tasks/store";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { saveBranding } from "../src/lib/branding/store";
import { createPortalGrant } from "../src/lib/workspace/portal";
import type { BusinessRecord, FieldValue } from "../src/lib/workspace/model";
import { customerHttpCheck } from "./customer-http-check";
import { vehicleVinHttpCheck } from "./vehicle-vin-http-check";
import { restaurantBusinessHttpCheck } from "./restaurant-business-http-check";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function freePort() { const server = createServer(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const port = (server.address() as { port: number }).port; await new Promise<void>(resolve => server.close(() => resolve())); return port; }
async function main() {
  assert(existsSync(".next/BUILD_ID"), "Run npm run build before the production HTTP check.");
  const directory = mkdtempSync(`${tmpdir()}/shuug-http-check-`), previous = process.env.DEALDESK_DATA_DIR;
  const port = await freePort(), base = `http://127.0.0.1:${port}`, password = `Synthetic-owner-${randomUUID()}`;
  process.env.DEALDESK_DATA_DIR = directory;
  configureOwnerPassword(password); saveBranding({ businessName: "Acceptance Test", organizationTypes: ["service", "nonprofit"] });
  const backendToken = `Synthetic-backend-${randomUUID()}`;
  const env = { ...process.env };
  for (const filename of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (existsSync(filename)) for (const line of readFileSync(filename, "utf8").split("\n")) { const key = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1]; if (key) env[key] = ""; }
  }
  Object.assign(env, { NODE_ENV: "production", BACKEND_ACCESS_TOKEN: backendToken, APP_BASE_URL: base, DEALDESK_DATA_DIR: directory, DEMO_DATA: "false", DATABASE_URL: "", AUTH_ENABLED: "true", SHOPIFY_BACKEND_ENABLED: "false", WORKSPACE_ACCESS_TOKEN: "", PPC_WORKSPACE_ACCESS_TOKEN: "" });
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; child.stdout.on("data", data => { log = (log + data.toString()).slice(-4000); }); child.stderr.on("data", data => { log = (log + data.toString()).slice(-4000); });
  let cookie = "";
  const request = (route: string, init: RequestInit = {}) => fetch(base + route, { ...init, redirect: "manual", signal: AbortSignal.timeout(20000), headers: { ...(cookie ? { cookie } : {}), ...init.headers } });
  async function command(command: string, input: unknown): Promise<BusinessRecord> {
    const response = await request("/api/workspace/records", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ command, input }) });
    const result = await response.json(); assert(response.ok && result.ok, result.error || `HTTP command failed: ${response.status}`); return result.record;
  }
  const create = (kind: string, fields: Record<string, FieldValue>) => command("save", { kind, title: `HTTP test ${kind}`, currency: "USD", fields });
  const go = (record: BusinessRecord, target: string) => command("transition", { id: record.id, revision: record.revision, target, commandId: randomUUID() });
  const stop = () => { if (child.exitCode === null) child.kill("SIGTERM"); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) { try { await request("/api/auth/login"); ready = true; break; } catch { if (child.exitCode !== null) throw new Error(`Production server exited: ${log}`); await new Promise(r => setTimeout(r, 200)); } }
    assert(ready, "Production server did not become ready.");
    const anonymous = await request("/");
    assert(anonymous.headers.get("location")?.includes("/api/auth/login"), `Anonymous page access was not redirected to sign-in (HTTP ${anonymous.status}, destination ${anonymous.headers.get("location") ?? "none"}).`);
    assert((await request("/api/workspace/records")).status === 403, "Anonymous business records were exposed.");
    const login = await request("/api/auth/login"), html = await login.text();
    const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)?.[1]; assert(csrf, "Sign-in form did not include CSRF protection.");
    cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const signedIn = await request("/api/auth/login", { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf, password }) });
    assert(signedIn.status === 303, "Owner sign-in failed.");
    cookie = signedIn.headers.getSetCookie().find(c => c.startsWith("dd_session="))?.split(";")[0] ?? ""; assert(cookie, "Sign-in did not create an owner session.");
    for (const [route, label] of [["/modules/nonprofit-donations", "Donations"], ["/modules/service-intake", "Inquiries"], ["/notes", "New note"], ["/copilot?tab=roadmap", "My roadmap"]]) {
      const response = await request(route), page = await response.text(); assert(response.ok && page.includes(label), `Installed route failed: ${route}`);
    }
    const ownerCookie = cookie;
    async function employeeCommand(input: unknown) {
      const response = await request("/api/workspace/employees", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json(); assert(response.ok, result.error ?? "Employee account management failed."); return result;
    }
    async function activate(url: string) {
      const page = await request(url.replace(base, "")), content = await page.text();
      const csrf = content.match(/name="csrf" value="([a-f0-9]+)"/)?.[1]; assert(csrf, "Employee activation form missing.");
      const token = new URL(url).searchParams.get("token")!;
      const response = await request("/api/auth/activate", { method: "POST", headers: { Origin: base, cookie: page.headers.getSetCookie().map(c => c.split(";")[0]).join("; "), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf, token, password, confirm: password }) });
      assert(response.ok && (await response.text()).includes("Account ready"), "Employee activation failed.");
    }
    const first = await employeeCommand({ action: "create", name: "Synthetic Alice", email: "alice@example.test", role: "Employee" });
    const accountA = first.accounts.find((a: { email: string }) => a.email === "alice@example.test"); await activate(first.inviteUrl);
    const second = await employeeCommand({ action: "create", name: "Synthetic Bob", email: "bob@example.test", role: "Employee" });
    const accountB = second.accounts.find((a: { email: string }) => a.email === "bob@example.test"); await activate(second.inviteUrl);
    async function schedule(route: string, action: string, input: unknown, requestId: string = randomUUID()) {
      const response = await request(route, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action, input }) }); const result = await response.json(); assert(response.ok, result.error ?? `Schedule action failed: ${action}`); return result;
    }
    const staffShifts = [];
    for (const account of [accountA, accountB]) {
      const created = await schedule("/api/team/schedule", "shift.save", { employeeId: account.memberId, role: account === accountA ? "Alice kitchen shift" : "Bob private shift", station: "HTTP kitchen", start: new Date(Date.now() - 300000).toISOString(), end: new Date(Date.now() + 3600000).toISOString(), breakMinutes: 0, hourlyRate: 2500, note: "Synthetic service" });
      await schedule("/api/team/schedule", "shift.publish", { id: created.result.id, revision: 1 }); staffShifts.push(created.result.id);
    }
    const schedulePage = await request("/team/schedule"); assert(schedulePage.ok && (await schedulePage.text()).includes("Alice kitchen shift"), "Installed staff schedule did not render published shifts.");
    const assigned = createTask({ title: "Alice assigned work", assigneeId: accountA.memberId, priority: "high", goal: "Acceptance test" });
    const other = createTask({ title: "Bob confidential task", assigneeId: accountB.memberId, priority: "low", goal: null });
    const employeeLogin = await request("/api/auth/login"), employeeForm = await employeeLogin.text();
    const employeeCsrf = employeeForm.match(/name="csrf" value="([a-f0-9]+)"/)?.[1]; assert(employeeCsrf, "Employee sign-in form missing CSRF.");
    const employeeSession = await request("/api/auth/login", { method: "POST", headers: { Origin: base, cookie: employeeLogin.headers.getSetCookie().map(c => c.split(";")[0]).join("; "), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: employeeCsrf, email: "alice@example.test", password }) });
    assert(employeeSession.status === 303 && employeeSession.headers.get("location")?.endsWith("/me"), "Employee was not signed into My work.");
    cookie = employeeSession.headers.getSetCookie().find(c => c.startsWith("dd_session="))?.split(";")[0] ?? ""; assert(cookie, "Missing employee session.");
    cookie += "; dd_active_role=Owner";
    const me = await request("/me"), myPage = await me.text(); assert(me.ok && myPage.includes(assigned.title) && !myPage.includes(other.title), "Employee dashboard leaked another person's tasks.");
    assert(myPage.includes("Alice kitchen shift") && !myPage.includes("Bob private shift"), "Employee dashboard omitted their shift or exposed another person's shift.");
    const ownSchedule = await (await request("/api/workspace/me/schedule")).json(); assert(ownSchedule.shifts.length === 1 && ownSchedule.shifts[0].hourlyRate === null && ownSchedule.audit.length === 0, "Employee schedule projection leaked staff data.");
    assert((await request("/api/team/schedule")).status === 403, "Employee opened the manager schedule.");
    await schedule("/api/workspace/me/schedule", "shift.acknowledge", { id: staffShifts[0], revision: 2 });
    const punchId = randomUUID(); await schedule("/api/workspace/me/schedule", "clock.in", { shiftId: staffShifts[0] }, punchId); await schedule("/api/workspace/me/schedule", "clock.in", { shiftId: staffShifts[0] }, punchId);
    const recorded = await schedule("/api/workspace/me/schedule", "clock.out", { breakMinutes: 0 }); assert(recorded.data.entries.length === 1 && recorded.data.openEntry === null, "Clock retries created duplicate attendance.");
    for (const route of ["/notes", "/copilot?tab=roadmap"]) assert((await request(route)).ok, `Employee personal page failed: ${route}`);
    assert((await request("/admin/users")).headers.get("location")?.endsWith("/me"), "Forged owner cookie bypassed the page guard.");
    for (const route of ["/api/workspace/employees", "/api/v1/cockpit", "/api/v1/financials/pnl", "/api/traceability/export"]) assert((await request(route)).status === 403, `Employee opened restricted API: ${route}`);
    const personal = await (await request("/api/workspace/me")).json(); assert(personal.user.id === accountA.id && personal.tasks.length === 1, "Personal API returned incorrect identity or tasks.");
    const taskRequest = (id: string) => request("/api/workspace/me", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", id, status: "done" }) });
    assert((await taskRequest(other.id)).status === 404, "Employee changed another employee's task."); assert((await taskRequest(assigned.id)).ok, "Employee could not complete their assignment.");
    const setupStaffCookie = cookie; cookie = ownerCookie;
    const setupPage = await request("/setup"); assert(setupPage.ok && (await setupPage.text()).includes("Connect your tools. Run your work."), "Guided setup page did not render.");
    async function setup(action: string, input: unknown) { const response = await request("/api/setup", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ action, input }) }); const result = await response.json(); assert(response.ok, result.error ?? "Setup command failed"); return result; }
    const form = (await setup("form.save", { title: "Synthetic website quote", kind: "quote", origins: ["https://www.example.org"], enabled: true })).form;
    const workflow = { name: "Synthetic website follow-up", formId: form.id, taskTitle: "Reply to website visitor", assigneeId: accountA.memberId, priority: "high", channels: [] };
    const tested = await setup("workflow.test", workflow); await setup("workflow.enable", { workflow, testId: tested.testId });
    const plugin = await request("/api/setup/wordpress"), pluginBytes = Buffer.from(await plugin.arrayBuffer()); assert(plugin.ok && pluginBytes.readUInt32LE(0) === 0x04034b50 && pluginBytes.includes(Buffer.from("shuug-business/shuug-business.php")), "WordPress download was not an installable ZIP.");
    const publicForm = await fetch(`${base}/api/website/forms/${form.id}`), publicHtml = await publicForm.text();
    assert(publicForm.ok && publicForm.headers.get("content-security-policy")?.includes("frame-ancestors 'self' https://www.example.org"), "Public form did not have its restricted framing policy.");
    const proof = publicHtml.match(/name="proof" value="([^"]+)"/)?.[1]; assert(proof, "Public form proof missing.");
    const postForm = () => fetch(`${base}/api/website/forms/${form.id}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ proof, name: "Website visitor", email: "visitor@example.test", message: "Please send a cleaning quote.", consent: "yes", website: "" }) });
    const submitted = await postForm(); assert(submitted.status === 201 && (await submitted.text()).includes("Request received"), "Anonymous website submission failed."); assert((await postForm()).status === 200, "Duplicate website submission was not idempotent.");
    const setupState = await (await request("/api/setup")).json(); assert(setupState.submissions.length === 1 && setupState.runs.length === 1 && setupState.runs[0].status === "completed", "Website workflow did not complete exactly once.");
    assert(setupState.submissions[0].records?.some((r: { kind: string }) => r.kind === "inquiry"), "Quote request did not create a service inquiry.");
    const volunteerForm = (await setup("form.save", { title: "Synthetic volunteer signup", kind: "volunteer", origins: [], enabled: true })).form;
    const volunteerPage = await fetch(`${base}/api/website/forms/${volunteerForm.id}`), volunteerHtml = await volunteerPage.text();
    const volunteerProof = volunteerHtml.match(/name="proof" value="([^"]+)"/)?.[1]; assert(volunteerProof, "Volunteer signup form did not load.");
    const volunteerResponse = await fetch(`${base}/api/website/forms/${volunteerForm.id}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ proof: volunteerProof, name: "Synthetic volunteer", email: "volunteer@example.test", message: "I can help with weekend events.", consent: "yes" }) });
    assert(volunteerResponse.status === 201, "Volunteer signup failed.");
    const volunteerState = await (await request("/api/setup")).json(); assert(volunteerState.submissions.some((s: { kind: string; records?: { kind: string }[] }) => s.kind === "volunteer" && s.records?.some(r => r.kind === "volunteer")), "Volunteer signup did not create its onboarding record.");
    cookie = setupStaffCookie;
    assert((await request("/api/setup")).status === 403 && (await request("/api/setup/wordpress")).status === 403, "Employee accessed owner setup or plugin administration.");
    const requestDetails = await request(`/api/website/requests/${setupState.submissions[0].id}`); assert(requestDetails.ok && (await requestDetails.text()).includes("Please send a cleaning quote."), "Assigned employee could not open the website request.");
    const updatedWork = await request("/me"), updatedHtml = await updatedWork.text(); assert(updatedWork.ok && updatedHtml.includes("Open assigned request"), "Employee work area did not link the assigned request.");
    const staffCookie = cookie; cookie = ownerCookie; await employeeCommand({ action: "disable", id: accountA.id }); cookie = staffCookie;
    assert((await request("/api/workspace/me")).status === 401, "Disabled employee retained access."); cookie = ownerCookie;
    const donor = await create("donor", { category: "individual", contactPreference: "email", email: "synthetic@example.test" });
    const gift = await go(await create("donation", { donor: donor.id, giftType: "cash", amount: 10000 }), "recorded");
    await go(await go(await create("gift_payment", { donation: gift.id, amount: 10000, direction: "receipt", reference: "http-bank-1", paidOn: "2026-09-10", evidence: "Synthetic bank statement" }), "confirmed"), "reconciled");
    await go(await create("acknowledgment", { donation: gift.id, template: "Reviewed synthetic acknowledgment", reviewer: "Test reviewer", evidence: "Synthetic reviewed template" }), "reviewed");
    const program = await go(await create("program", { budget: 100000, capacity: 5 }), "active"), participant = await create("participant", {});
    await go(await go(await create("enrollment", { participant: participant.id, program: program.id, eligibility: "Synthetic eligibility review", reviewer: "Test reviewer", evidence: "Synthetic enrollment documents" }), "reviewed"), "enrolled");
    let session = await go(await create("session", { program: program.id, start: "2026-09-10T14:00:00Z", end: "2026-09-10T15:00:00Z", location: "Test room", capacity: 5 }), "scheduled");
    await go(await create("attendance", { session: session.id, participant: participant.id }), "present"); session = await go(session, "completed");
    await go(await create("program_cost", { program: program.id, amount: 2000, costType: "direct", allocationMethod: "Direct session allocation", reviewer: "Test reviewer", evidence: "Synthetic receipt" }), "approved");
    const report = await go(await create("report", { program: program.id, periodStart: "2020-01-01", periodEnd: "2099-12-31", narrative: "Synthetic report", reviewer: "Test reviewer" }), "reviewed");
    assert(report.computed?.attended === 1 && report.computed?.reviewedCosts === 2000, "The report did not reflect attendance and reviewed costs.");
    const client = await create("client", { email: "client@example.test" });
    const proposal = await go(await create("proposal", { client: client.id, scope: "Synthetic work", exclusions: "Synthetic exclusions", amount: 50000, expires: "2099-01-01" }), "sent");
    const grant = createPortalGrant(client.id), portal = await request(`/api/portal/${grant.token}`); assert(portal.ok, "The scoped client portal did not load.");
    const accepted = await request(`/api/portal/${grant.token}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ id: proposal.id, revision: String(proposal.revision), name: "Synthetic client", accepted: "yes" }) });
    assert(accepted.status === 303, "Customer proposal acceptance failed.");
    const agreement = await go(await create("agreement", { client: client.id, proposal: proposal.id, terms: "Payment on completion", deposit: 0, signedBy: "Synthetic client", evidence: "Synthetic signed agreement" }), "signed");
    let job = await create("job", { client: client.id, agreement: agreement.id, instructions: "Complete synthetic work", requiredChecks: "Review", completedChecks: "Review", budget: 20000, acceptedBy: "Synthetic client", evidence: "Synthetic acceptance" });
    const resource = await go(await create("resource", { category: "staff", weeklyHours: 40 }), "active");
    await go(await create("booking", { job: job.id, resource: resource.id, start: "2026-09-11T14:00:00Z", end: "2026-09-11T15:00:00Z" }), "scheduled");
    job = await go(await go(await go(await go(job, "scheduled"), "in_progress"), "completed"), "accepted");
    const invoice = await go(await create("invoice", { job: job.id, method: "fixed", amount: 50000, description: "Synthetic accepted work" }), "issued");
    await go(await go(await create("service_payment", { invoice: invoice.id, amount: 50000, direction: "receipt", reference: "http-bank-2", paidOn: "2026-09-10", evidence: "Synthetic payment" }), "confirmed"), "reconciled");
    await customerHttpCheck(base, ownerCookie, setupStaffCookie);
    if (process.env.SHUUG_VERIFY_PUBLIC_VIN === "1") await vehicleVinHttpCheck(base, ownerCookie, setupStaffCookie);
    await repairPricingHttpCheck(base, ownerCookie, setupStaffCookie);
    await inspectionHttpCheck(base, ownerCookie);
    await restaurantBusinessHttpCheck(base, ownerCookie, setupStaffCookie, backendToken);
    await journalHttpCheck(base, ownerCookie, setupStaffCookie);
    await receivableHttpCheck(base, ownerCookie, setupStaffCookie, backendToken);
    await expenseAccountingHttpCheck(base, ownerCookie, setupStaffCookie, backendToken);
    const mcp = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/backend-smoke.ts"], { env: { ...env, SHUUG_BACKEND_URL: base, SHUUG_BACKEND_TOKEN: backendToken }, timeout: 60000 }); process.stdout.write(mcp.stdout);
    console.log(JSON.stringify({ ok: true, checks: ["guided setup and WordPress download", "website form → assigned task → employee request details", "duplicate submission prevention", "production sign-in", "employee creation/activation/login", "personal assignments and task updates", "published shifts → employee acknowledgment → clock-in/out → private attendance", "forged role and restricted APIs denied", "immediate account revocation", "anonymous access denied", "installed module/notes/roadmap routes", "donation and acknowledgment", "enrollment and report", "client portal acceptance", "service invoice and reconciliation"], syntheticWorkspace: true }));
  } catch (error) {
    console.error(`Disposable production server diagnostics:\n${log}`); throw error;
  } finally {
    stop(); if (child.exitCode === null) await new Promise<void>(resolve => { const timeout = setTimeout(() => { child.kill("SIGKILL"); }, 5000); child.once("exit", () => { clearTimeout(timeout); resolve(); }); });
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
    if (previous === undefined) delete process.env.DEALDESK_DATA_DIR; else process.env.DEALDESK_DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
    console.log(JSON.stringify({ cleanup: "complete", processId: child.pid }));
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "HTTP acceptance failed"); process.exitCode = 1; });
