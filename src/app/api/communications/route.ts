import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { queueMessageInput, smsConsentInput } from "@/lib/communications/model";
import { communicationSnapshot, queueMessage, recordSmsConsent, cancelQueuedMessage } from "@/lib/communications/store";
import { communicationConnectionStatus } from "@/lib/communications/provider";
import { dispatchQueuedMessages, resolveUncertainMessage } from "@/lib/communications/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { await requireOwnerAccess(); return json({ ...communicationSnapshot(), connections: communicationConnectionStatus() }); }
  catch { return json({ error: "Owner access required." }, 403); }
}
const commandInput = z.discriminatedUnion("command", [
  z.object({ command: z.literal("queue"), input: queueMessageInput }).strict(),
  z.object({ command: z.literal("consent"), input: smsConsentInput }).strict(),
  z.object({ command: z.literal("dispatch"), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ command: z.literal("cancel"), id: z.uuid() }).strict(),
  z.object({ command: z.literal("resolve"), id: z.uuid(), outcome: z.enum(["accepted", "not_sent"]), evidence: z.string().min(10).max(2000), providerId: z.string().min(1).max(300).optional() }).strict(),
]);
export async function POST(request: Request) {
  let owner; try { owner = await requireOwnerAccess(); } catch { return json({ error: "Owner access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const input = commandInput.parse(await boundedJson(new Response(request.body), 16000));
    const result = input.command === "queue" ? queueMessage(input.input) : input.command === "consent" ? recordSmsConsent({ ...input.input, actor: owner.name })
      : input.command === "cancel" ? cancelQueuedMessage(input.id) : input.command === "resolve" ? resolveUncertainMessage(input.id, input.outcome, input.evidence, input.providerId)
      : await dispatchQueuedMessages(input.limit);
    return json({ ok: true, result, ...communicationSnapshot(), connections: communicationConnectionStatus() });
  } catch (error) { return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "The message action could not be completed." }, 400); }
}
