import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { saveForm, testWorkflow, enableWorkflow, pauseWorkflow, reviewSubmission, setupState } from "@/lib/getting-started/store";
import { draftWorkflow } from "@/lib/getting-started/draft";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() { try { await requireOwnerAccess(); return json(setupState()); } catch { return json({ error: "Only the workspace owner can manage setup." }, 403); } }
export async function POST(request: Request) {
  let user; try { user = await requireOwnerAccess(); } catch { return json({ error: "Only the workspace owner can manage setup." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const { action, input } = z.object({ action: z.enum(["form.save", "workflow.draft", "workflow.test", "workflow.enable", "workflow.pause", "request.review"]), input: z.record(z.string(), z.unknown()) }).strict().parse(await boundedJson(new Response(request.body), 20000));
    if (action === "form.save") return json({ form: saveForm(input) });
    if (action === "workflow.draft") { const data = z.object({ request: z.string(), formId: z.uuid() }).strict().parse(input); return json(await draftWorkflow(data.request, data.formId)); }
    if (action === "workflow.test") return json(testWorkflow(input));
    if (action === "workflow.enable") { const data = z.object({ workflow: z.record(z.string(), z.unknown()), testId: z.uuid() }).strict().parse(input); return json({ workflow: enableWorkflow(data.workflow, data.testId, user.id) }); }
    const id = z.uuid().parse(input.id);
    if (action === "workflow.pause") pauseWorkflow(id); else reviewSubmission(id);
    return json({ ok: true });
  } catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not save setup." }, 400); }
}
