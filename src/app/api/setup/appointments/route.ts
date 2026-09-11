import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { listAppointmentOffers, publishAppointmentOffer, withdrawAppointmentOffer, listBusinessRecords } from "@/lib/workspace/store";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { await requireOwnerAccess(); } catch { return json({ error: "Only the owner can publish customer availability." }, 403); }
  const records = listBusinessRecords();
  return json({ offers: listAppointmentOffers().slice(0, 200), jobs: records.filter(r => r.kind === "job" && ["draft", "scheduled", "in_progress"].includes(r.status)).map(r => ({ id: r.id, title: r.title, client: records.find(c => c.id === r.fields.client)?.title ?? "" })), resources: records.filter(r => r.kind === "resource" && r.status === "active").map(r => ({ id: r.id, title: r.title })) });
}
export async function POST(request: Request) {
  let user; try { user = await requireOwnerAccess(); } catch { return json({ error: "Only the owner can publish customer availability." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const body = z.object({ action: z.enum(["publish", "withdraw"]), input: z.record(z.string(), z.unknown()) }).strict().parse(await boundedJson(new Response(request.body), 8000));
    if (body.action === "publish") return json({ offer: publishAppointmentOffer(body.input, user.id) }, 201);
    const input = z.object({ id: z.uuid() }).strict().parse(body.input); withdrawAppointmentOffer(input.id); return json({ ok: true });
  } catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not publish availability." }, 400); }
}
