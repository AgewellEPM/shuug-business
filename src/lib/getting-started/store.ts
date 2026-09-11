import { createHash, randomUUID } from "node:crypto";
import { workspaceDatabase } from "../workspace/database";
import { formInput, submissionInput, workflowInput, allowedOrigin, type Form, type Submission, type Workflow, type WorkflowInput, type Run } from "./model";
import { setting } from "../connections/vault";
import { listTeam } from "../team/store";
import { listTasks } from "../tasks/store";
import { websiteIntakeRecords } from "../workspace/store";
type Db = import("node:sqlite").DatabaseSync;
const now = () => new Date().toISOString();
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function init(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS setup_objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS setup_kind ON setup_objects(kind);
    CREATE TABLE IF NOT EXISTS setup_receipts (id TEXT PRIMARY KEY, digest TEXT NOT NULL, submission TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS setup_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
}
function transaction<T>(work: (db: Db) => T) { return workspaceDatabase(db => { init(db); return work(db); }, true); }
function read<T>(db: Db, kind: string, id: string): T | undefined { const row = db.prepare("SELECT body FROM setup_objects WHERE id=? AND kind=?").get(id, kind) as { body: string } | undefined; return row ? JSON.parse(row.body) : undefined; }
function all<T>(db: Db, kind: string): T[] { return (db.prepare("SELECT body FROM setup_objects WHERE kind=? ORDER BY rowid DESC").all(kind) as { body: string }[]).map(row => JSON.parse(row.body)); }
function put<T extends { id: string }>(db: Db, kind: string, record: T) { db.prepare("INSERT INTO setup_objects VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(record.id, kind, JSON.stringify(record)); }
export function setupState() { return transaction(db => ({ forms: all<Form>(db, "form"), submissions: all<Submission>(db, "submission").slice(0, 200), workflows: all<Workflow>(db, "workflow"), runs: all<Run>(db, "run").slice(0, 200) })); }
export function findForm(id: string) { return transaction(db => read<Form>(db, "form", id)); }
export function submissionForUser(id: string, memberId: string, isOwner: boolean) {
  const tasks = listTasks();
  return transaction(db => {
    const submission = read<Submission>(db, "submission", id);
    if (isOwner) return submission;
    const assigned = all<Run>(db, "run").some(r => r.submissionId === id && r.action === "task" && r.status === "completed" && tasks.some(t => t.id === `T-${createHash("sha256").update(`website:${r.id}`).digest("hex")}` && t.assigneeId === memberId));
    return assigned ? submission : undefined;
  });
}
export function saveForm(raw: unknown): Form {
  const input = formInput.parse(raw); const origins = [...new Set(input.origins.map(allowedOrigin))];
  return transaction(db => {
    const previous = input.id ? read<Form>(db, "form", input.id) : undefined;
    if (input.id && (!previous || previous.revision !== input.revision)) throw new Error("This form changed. Refresh before saving.");
    if (!previous && all<Form>(db, "form").length >= 50) throw new Error("This workspace supports up to 50 website forms.");
    const form: Form = { ...input, origins, id: previous?.id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now() };
    put(db, "form", form); return form;
  });
}
export function checkWorkflow(raw: unknown) {
  const input = workflowInput.parse(raw);
  if (!findForm(input.formId)) throw new Error("Choose a saved website form.");
  if (input.assigneeId && !listTeam().some(m => m.id === input.assigneeId)) throw new Error("Choose a current team member.");
  for (const channel of input.channels) if (!destination(channel)) throw new Error(`Connect ${channel === "slack" ? "Slack" : "Zapier"} first, or remove that delivery step.`);
  return input;
}
export function destination(channel: string) { return setting(channel === "slack" ? "SLACK_WEBHOOK_URL" : "ZAPIER_WEBHOOK_URL"); }
function workflowDigest(input: WorkflowInput) { return digest({ input, destinations: input.channels.map(c => digest(destination(c))) }); }
export function testWorkflow(raw: unknown) {
  const input = checkWorkflow(raw), testId = randomUUID(), testedAt = now();
  transaction(db => put(db, "test", { id: testId, digest: workflowDigest(input), testedAt }));
  return { testId, testedAt, steps: [`Receive ${findForm(input.formId)!.title}`, `Create one ${input.priority} priority task: ${input.taskTitle} — Example visitor`, ...input.channels.map(c => `Send a request reference to ${c === "slack" ? "the connected Slack channel" : "the configured Zapier hook"}`)], message: "Preview passed. No request, task, payment or external message was created." };
}
export function enableWorkflow(raw: unknown, testId: string, actor: string) {
  const input = checkWorkflow(raw);
  return transaction(db => {
    const test = read<{ digest: string; testedAt: string }>(db, "test", testId);
    if (!test || test.digest !== workflowDigest(input) || Date.now() - Date.parse(test.testedAt) > 30 * 60 * 1000) throw new Error("Test this exact workflow again before enabling it.");
    if (all<Workflow>(db, "workflow").length >= 100) throw new Error("This workspace supports up to 100 workflows.");
    const workflow: Workflow = { ...input, id: randomUUID(), enabled: true, testedAt: test.testedAt, createdAt: now(), actor, destinations: Object.fromEntries(input.channels.map(c => [c, digest(destination(c))])) };
    put(db, "workflow", workflow); db.prepare("DELETE FROM setup_objects WHERE id=? AND kind='test'").run(testId); return workflow;
  });
}
export function pauseWorkflow(id: string) { return transaction(db => { const workflow = read<Workflow>(db, "workflow", id); if (!workflow) throw new Error("Workflow unavailable."); workflow.enabled = false; put(db, "workflow", workflow); for (const run of all<Run>(db, "run").filter(r => r.workflowId === id && r.status === "pending")) put(db, "run", { ...run, status: "canceled", detail: "Workflow paused before this step ran.", updatedAt: now() }); return workflow; }); }
export function reviewSubmission(id: string) { return transaction(db => { const row = read<Submission>(db, "submission", id); if (!row) throw new Error("Request unavailable."); put(db, "submission", { ...row, status: "reviewed" }); }); }
export function acceptSubmission(formId: string, raw: unknown): { id: string; duplicate: boolean } {
  const input = submissionInput.parse(raw);
  return transaction(db => {
    const form = read<Form>(db, "form", formId); if (!form?.enabled) throw new Error("This form is not accepting requests.");
    const receiptId = `${formId}:${input.requestId}`, hash = digest(input), receipt = db.prepare("SELECT digest,submission FROM setup_receipts WHERE id=?").get(receiptId) as { digest: string; submission: string } | undefined;
    if (receipt) { if (receipt.digest !== hash) throw new Error("This request identifier was already used. Reload the form."); return { id: receipt.submission, duplicate: true }; }
    db.prepare("DELETE FROM setup_limits WHERE expires<=?").run(Date.now());
    for (const [key, max] of [[`form:${formId}`, 100], [`email:${formId}:${digest(input.email.toLowerCase())}`, 5]] as const) {
      const count = db.prepare("SELECT count FROM setup_limits WHERE id=?").get(key) as { count: number } | undefined;
      if ((count?.count ?? 0) >= max) throw new Error("This form received too many requests. Please try again in an hour.");
      db.prepare("INSERT INTO setup_limits VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1").run(key, Date.now() + 3600000);
    }
    const submission: Submission = { ...input, id: randomUUID(), formId, formTitle: form.title, kind: form.kind, createdAt: now(), status: "new" };
    submission.records = websiteIntakeRecords(db, submission);
    put(db, "submission", submission); db.prepare("INSERT INTO setup_receipts VALUES(?,?,?)").run(receiptId, hash, submission.id);
    for (const workflow of all<Workflow>(db, "workflow").filter(w => w.enabled && w.formId === formId)) {
      for (const action of ["task", ...workflow.channels] as const) { const run: Run = { id: randomUUID(), workflowId: workflow.id, workflowName: workflow.name, submissionId: submission.id, action, status: "pending", detail: "Queued", createdAt: now(), updatedAt: now(), snapshot: workflow, destination: action === "task" ? "" : workflow.destinations?.[action] ?? "" }; put(db, "run", run); }
    }
    return { id: submission.id, duplicate: false };
  });
}
export function claimRun(id: string): { run: Run; submission: Submission } | null {
  return transaction(db => {
    const run = read<Run>(db, "run", id); if (!run || run.status !== "pending") return null;
    const submission = read<Submission>(db, "submission", run.submissionId); if (!submission) return null;
    const active = read<Workflow>(db, "workflow", run.workflowId)?.enabled;
    if (!active) { put(db, "run", { ...run, status: "canceled", detail: "Workflow paused.", updatedAt: now() }); return null; }
    if (run.action !== "task") { const task = all<Run>(db, "run").find(r => r.workflowId === run.workflowId && r.submissionId === run.submissionId && r.action === "task"); if (task?.status !== "completed") return null; }
    put(db, "run", { ...run, status: "working", detail: "In progress", updatedAt: now() }); return { run, submission };
  });
}
export function finishRun(id: string, status: Run["status"], detail: string) { transaction(db => { const run = read<Run>(db, "run", id); if (run) put(db, "run", { ...run, status, detail, updatedAt: now() }); }); }
export function pendingRuns() { return transaction(db => { const runs = all<Run>(db, "run"); for (const run of runs.filter(r => r.status === "working" && Date.now() - Date.parse(r.updatedAt) > 60000)) { run.status = run.action === "task" ? "pending" : "review"; run.detail = run.action === "task" ? "Retrying interrupted local task" : "Delivery was interrupted. Check the destination before taking further action."; put(db, "run", run); } return runs.filter(r => r.status === "pending").sort((a, b) => (a.action === "task" ? -1 : 1) - (b.action === "task" ? -1 : 1) || a.createdAt.localeCompare(b.createdAt)).slice(0, 30); }); }
