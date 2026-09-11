// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { saveForm, testWorkflow, enableWorkflow, acceptSubmission, setupState, pauseWorkflow, submissionForUser, claimRun, finishRun } from "./store";
import { processPendingRuns } from "./runner";
import { createTask, listTasks } from "../tasks/store";
import { addMember } from "../team/store";
import { saveSecrets } from "../connections/vault";
import { publicRequest } from "../connections/public-http";
import { POST as setupCommand } from "@/app/api/setup/route";
import { GET as formPage, POST as formSubmit } from "@/app/api/website/forms/[id]/route";
import { requireOwnerAccess } from "../auth/identity";
import { draftWorkflow } from "./draft";
import { llmChat } from "../llm";
import { listBusinessRecords, saveBusinessRecord, transitionBusinessRecord } from "../workspace/store";
vi.mock("../connections/public-http", () => ({ publicRequest: vi.fn() }));
vi.mock("../llm", () => ({ llmChat: vi.fn() }));
vi.mock("../auth/identity", () => ({ requireOwnerAccess: vi.fn(async () => ({ id: "owner" })) }));
let directory: string;
beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), "shuug-setup-unit-")); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("APP_BASE_URL", "https://business.example.test"); vi.stubEnv("SLACK_WEBHOOK_URL", ""); vi.stubEnv("ZAPIER_WEBHOOK_URL", ""); vi.mocked(requireOwnerAccess).mockResolvedValue({ id: "owner" } as Awaited<ReturnType<typeof requireOwnerAccess>>); vi.mocked(publicRequest).mockReset(); vi.mocked(llmChat).mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
function fixture(channels: ("slack" | "zapier")[] = []) {
  const employee = addMember({ name: "Assigned employee", email: "employee@example.test", role: "Employee" });
  const form = saveForm({ title: "Request a quote", kind: "quote", origins: ["https://www.example.org"], enabled: true });
  const workflow = { name: "Follow up quotes", formId: form.id, taskTitle: "Prepare a reply", priority: "high" as const, assigneeId: employee.id, channels };
  return { employee, form, workflow };
}
const visitor = () => ({ requestId: randomUUID(), name: "Test Visitor", email: "visitor@example.test", message: "I need a quote for cleaning.", consent: true as const });
it("creates linked service inquiry records atomically with quote intake and preserves them on retries", () => {
  const { form } = fixture(), input = visitor(), result = acceptSubmission(form.id, input);
  expect(acceptSubmission(form.id, input)).toEqual({ id: result.id, duplicate: true });
  const clients = listBusinessRecords(["client"]), inquiries = listBusinessRecords(["inquiry"]); expect(clients).toHaveLength(1); expect(inquiries).toHaveLength(1); expect(inquiries[0].fields.client).toBe(clients[0].id); expect(inquiries[0].fields.scope).toBe(input.message);
  expect(setupState().submissions[0].records?.some(r => r.id === inquiries[0].id)).toBe(true);
  const proposal = saveBusinessRecord({ kind: "proposal", title: "Requested cleaning quote", fields: { client: clients[0].id, inquiry: inquiries[0].id, scope: input.message, exclusions: "Materials supplied by client", amount: 25000, expires: "2099-01-01" } }, "owner");
  expect(transitionBusinessRecord({ id: proposal.id, revision: proposal.revision, target: "sent", commandId: randomUUID() }, "owner").status).toBe("sent");
});
it("creates volunteer signup records with consent and requires real onboarding review before approval", () => {
  const form = saveForm({ title: "Volunteer signup", kind: "volunteer", origins: [], enabled: true }), input = visitor(); acceptSubmission(form.id, input); acceptSubmission(form.id, input);
  const rows = listBusinessRecords(["volunteer"]); expect(rows).toHaveLength(1); let row = rows[0]; expect(row.status).toBe("draft"); expect(row.fields.onboardingComplete).toBe(false); expect(row.fields.evidence).toContain("Consent recorded");
  expect(() => transitionBusinessRecord({ id: row.id, revision: row.revision, target: "approved", commandId: randomUUID() }, "owner")).toThrow();
  row = saveBusinessRecord({ id: row.id, revision: row.revision, kind: row.kind, title: row.title, currency: row.currency, fields: { ...row.fields, onboardingComplete: true, training: "Orientation completed", evidence: `${row.fields.evidence}\nStaff reviewed required checks.` } }, "owner");
  expect(transitionBusinessRecord({ id: row.id, revision: row.revision, target: "approved", commandId: randomUUID() }, "owner").status).toBe("approved");
});
it("tests without side effects and requires the exact tested workflow before enabling", () => {
  const { workflow } = fixture(); const test = testWorkflow(workflow);
  expect(listTasks()).toHaveLength(0); expect(publicRequest).not.toHaveBeenCalled();
  expect(() => enableWorkflow({ ...workflow, priority: "low" }, test.testId, "owner")).toThrow("exact workflow");
  expect(enableWorkflow(workflow, test.testId, "owner").enabled).toBe(true);
  expect(() => enableWorkflow(workflow, test.testId, "owner")).toThrow("exact workflow");
});
it("persists a request and creates one assigned task across duplicate submissions and interrupted execution", async () => {
  const { workflow, form, employee } = fixture(), test = testWorkflow(workflow); enableWorkflow(workflow, test.testId, "owner");
  const input = visitor(), accepted = acceptSubmission(form.id, input); expect(acceptSubmission(form.id, input)).toEqual({ ...accepted, duplicate: true });
  const pending = setupState().runs[0]; expect(claimRun(pending.id)).not.toBeNull(); expect(claimRun(pending.id)).toBeNull();
  finishRun(pending.id, "pending", "Simulated interrupted local step"); await processPendingRuns(true);
  finishRun(pending.id, "pending", "Simulated restart after task commit"); await processPendingRuns(true);
  expect(listTasks()).toHaveLength(1); expect(listTasks()[0].assigneeId).toBe(employee.id); expect(setupState().submissions).toHaveLength(1);
  expect(submissionForUser(accepted.id, employee.id, false)?.message).toBe(input.message);
  expect(() => acceptSubmission(form.id, { ...input, message: "Conflicting content" })).toThrow("already used");
});
it("does not expose contact details through a forged employee task goal", async () => {
  const { workflow, form } = fixture(); enableWorkflow(workflow, testWorkflow(workflow).testId, "owner"); const accepted = acceptSubmission(form.id, visitor()); await processPendingRuns(true);
  createTask({ title: "Forged access", priority: "low", assigneeId: "intruder", goal: `Website request ${accepted.id}`, dueDate: null });
  expect(submissionForUser(accepted.id, "intruder", false)).toBeUndefined();
  expect(submissionForUser(accepted.id, "owner", true)?.id).toBe(accepted.id);
});
it("pauses queued work and excludes future submissions", async () => {
  const { workflow, form } = fixture(); const live = enableWorkflow(workflow, testWorkflow(workflow).testId, "owner"); acceptSubmission(form.id, visitor()); pauseWorkflow(live.id); acceptSubmission(form.id, visitor()); await processPendingRuns();
  expect(listTasks()).toHaveLength(0); expect(setupState().runs).toHaveLength(1); expect(setupState().runs[0].status).toBe("canceled");
});
it("holds external delivery for the worker, sends references only and does not repeat confirmed deliveries", async () => {
  saveSecrets({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TTEST/BTEST/SYNTHETIC" });
  const { workflow, form } = fixture(["slack"]); enableWorkflow(workflow, testWorkflow(workflow).testId, "owner"); const input = visitor(); acceptSubmission(form.id, input);
  await processPendingRuns(true); expect(publicRequest).not.toHaveBeenCalled();
  vi.mocked(publicRequest).mockResolvedValue({ status: 200, body: "ok" }); await processPendingRuns(); await processPendingRuns();
  expect(publicRequest).toHaveBeenCalledTimes(1); const payload = JSON.stringify(vi.mocked(publicRequest).mock.calls[0][1]?.body); expect(payload).not.toContain(input.email); expect(payload).not.toContain(input.message);
  expect(setupState().runs.every(r => r.status === "completed")).toBe(true);
});
it("blocks changed destinations and leaves ambiguous failures for review without automatic retries", async () => {
  saveSecrets({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TTEST/BTEST/FIRST" });
  const { workflow, form } = fixture(["slack"]), test = testWorkflow(workflow);
  saveSecrets({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TTEST/BTEST/SECOND" }); expect(() => enableWorkflow(workflow, test.testId, "owner")).toThrow("exact workflow");
  enableWorkflow(workflow, testWorkflow(workflow).testId, "owner"); acceptSubmission(form.id, visitor());
  saveSecrets({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TTEST/BTEST/THIRD" }); await processPendingRuns(); expect(publicRequest).not.toHaveBeenCalled(); expect(setupState().runs.find(r => r.action === "slack")?.status).toBe("review");
  const current = setupState().workflows[0]; pauseWorkflow(current.id); enableWorkflow(workflow, testWorkflow(workflow).testId, "owner");
  acceptSubmission(form.id, visitor()); vi.mocked(publicRequest).mockRejectedValue(new Error("Timeout")); await processPendingRuns(); await processPendingRuns(); expect(publicRequest).toHaveBeenCalledTimes(1); expect(setupState().runs.filter(r => r.status === "review")).toHaveLength(2);
});
it("requires consent, bounds submissions, and blocks stale form updates", () => {
  const { form } = fixture(); expect(() => acceptSubmission(form.id, { ...visitor(), consent: false })).toThrow();
  for (let i = 0; i < 5; i++) acceptSubmission(form.id, visitor()); expect(() => acceptSubmission(form.id, visitor())).toThrow("hour");
  saveForm({ id: form.id, revision: form.revision, title: form.title, kind: form.kind, origins: [], enabled: false }); expect(() => saveForm({ id: form.id, revision: form.revision, title: "Stale", kind: form.kind, origins: [], enabled: true })).toThrow("changed");
  expect(() => acceptSubmission(form.id, visitor())).toThrow("not accepting");
  expect(() => saveForm({ title: "Bad origin", kind: "contact", origins: ["https://*.example.org"], enabled: true })).toThrow();
});
it("serves a branded anonymous form, restricts framing, validates proof and accepts a real form POST", async () => {
  const { form } = fixture(), context = { params: Promise.resolve({ id: form.id }) }, url = `https://business.example.test/api/website/forms/${form.id}`;
  const response = await formPage(new Request(url), context), html = await response.text(); expect(response.status).toBe(200); expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://www.example.org"); expect(html).not.toContain("dd_session");
  const proof = html.match(/name="proof" value="([^"]+)"/)![1], input = visitor();
  const request = (origin = "https://business.example.test", token = proof) => new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ proof: token, name: input.name, email: input.email, message: input.message, consent: "yes", website: "" }) });
  expect((await formSubmit(request("https://attacker.example"), context)).status).toBe(403);
  expect((await formSubmit(request(undefined, "forged"), context)).status).toBe(400);
  expect((await formSubmit(request(), context)).status).toBe(201); expect((await formSubmit(request(), context)).status).toBe(200); expect(setupState().submissions).toHaveLength(1);
  const preview = await (await formPage(new Request(url + "?preview=1"), context)).text(); const previewToken = preview.match(/name="proof" value="([^"]+)"/)![1]; expect((await formSubmit(request(undefined, previewToken), context)).status).toBe(400);
});
it("rejects non-owner setup and cross-origin commands", async () => {
  const req = (origin: string) => new Request("https://business.example.test/api/setup", { method: "POST", headers: { Origin: origin }, body: JSON.stringify({ action: "form.save", input: { title: "Private", kind: "contact", enabled: false, origins: [] } }) });
  expect((await setupCommand(req("https://attacker.example"))).status).toBe(403);
  vi.mocked(requireOwnerAccess).mockRejectedValue(new Error("Employee")); expect((await setupCommand(req("https://business.example.test"))).status).toBe(403); expect(setupState().forms).toHaveLength(0);
});
it("validates AI drafts and keeps unsupported operations explicit without enabling a workflow", async () => {
  const { form } = fixture(); vi.mocked(llmChat).mockResolvedValue({ ok: true, text: JSON.stringify({ name: "Follow up", taskTitle: "Review the request", priority: "high", channels: ["slack"], unsupported: ["Inventory reservation and QuickBooks posting are not supported by this workflow."] }) });
  const draft = await draftWorkflow("Create a task, reserve stock and post accounting", form.id); expect(draft.unsupported).toHaveLength(1); expect(setupState().workflows).toHaveLength(0); expect(publicRequest).not.toHaveBeenCalled();
  vi.mocked(llmChat).mockResolvedValue({ ok: true, text: '{"execute":"arbitrary code"}' }); await expect(draftWorkflow("Perform an arbitrary action", form.id)).rejects.toThrow();
});
