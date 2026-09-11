import { createTask } from "../tasks/store";
import { listTeam } from "../team/store";
import { appBaseUrl, saveSecrets } from "../connections/vault";
import { publicRequest } from "../connections/public-http";
import { claimRun, destination, digest, finishRun, pendingRuns } from "./store";
export async function processPendingRuns(localOnly = false) {
  let completed = 0;
  for (const item of pendingRuns().filter(r => !localOnly || r.action === "task")) {
    const claimed = claimRun(item.id); if (!claimed) continue;
    const { run, submission } = claimed;
    try {
      if (run.action === "task") {
        if (run.snapshot.assigneeId && !listTeam().some(m => m.id === run.snapshot.assigneeId)) throw new Error("Assigned team member no longer exists.");
        const task = createTask({ title: `${run.snapshot.taskTitle} — ${submission.name}`.slice(0, 140), assigneeId: run.snapshot.assigneeId, priority: run.snapshot.priority, goal: `Website request ${submission.id}`, dueDate: null }, `website:${run.id}`);
        finishRun(run.id, "completed", `Created task ${task.id}`);
      } else {
        const url = destination(run.action);
        if (!url || digest(url) !== run.destination) { finishRun(run.id, "review", "The destination changed or was disconnected. Review this request and test a new workflow."); continue; }
        const reference = { id: run.id, type: "website.requested", requestId: submission.id, formKind: submission.kind, receivedAt: submission.createdAt, workspaceUrl: `${appBaseUrl()}/setup#attach` };
        const response = await publicRequest(url, { method: "POST", headers: { "Idempotency-Key": run.id }, body: run.action === "slack" ? { text: `A ${submission.kind} request arrived. Reference: ${submission.id}. Open ${reference.workspaceUrl}`, mrkdwn: false, unfurl_links: false, unfurl_media: false } : reference });
        if (response.status < 200 || response.status >= 300 || (run.action === "slack" && response.body.trim() !== "ok")) { finishRun(run.id, "review", `Destination returned HTTP ${response.status}. No automatic retry; inspect the destination first.`); continue; }
        finishRun(run.id, "completed", "Request reference delivered. Visitor contact details were not sent.");
        saveSecrets({ [run.action === "slack" ? "SLACK_CHECKED_AT" : "ZAPIER_CHECKED_AT"]: new Date().toISOString() });
      }
      completed++;
    } catch { finishRun(run.id, "review", run.action === "task" ? "Task could not be created. Check the assignee and workspace storage." : "Delivery could not be confirmed. Check the destination; this step will not resend automatically."); }
  }
  return { completed };
}
