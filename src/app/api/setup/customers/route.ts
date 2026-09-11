import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { listCustomerAccounts, issueCustomerInvitation, setCustomerEnabled } from "@/lib/customer-access/accounts";
import { createLinkedCustomer, customerSettings, saveCustomerSettings } from "@/lib/customer-access/service";
import { getDealStore } from "@/lib/data/store";
import { listBusinessRecords } from "@/lib/workspace/store";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { await requireOwnerAccess(); } catch { return json({ error: "Only the owner can manage customer access." }, 403); }
  return json({ accounts: listCustomerAccounts(), settings: customerSettings(), customers: await (await getDealStore()).listCustomers(), clients: listBusinessRecords(["client"]).map(r => ({ id: r.id, title: r.title })) });
}
export async function POST(request: Request) {
  try { await requireOwnerAccess(); } catch { return json({ error: "Only the owner can manage customer access." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const body = z.object({ action: z.enum(["create", "invite", "enable", "settings"]), input: z.record(z.string(), z.unknown()) }).strict().parse(await boundedJson(new Response(request.body), 12000));
    if (body.action === "settings") return json({ settings: saveCustomerSettings(body.input) });
    if (body.action === "create") return json({ account: await createLinkedCustomer(body.input) }, 201);
    if (body.action === "enable") { const input = z.object({ id: z.uuid(), enabled: z.boolean() }).strict().parse(body.input); setCustomerEnabled(input.id, input.enabled); return json({ ok: true }); }
    const input = z.object({ id: z.uuid() }).strict().parse(body.input), token = issueCustomerInvitation(input.id);
    return json({ url: new URL(`/api/website/customer?invite=${token}`, appBaseUrl()).href, expiresHours: 48 });
  } catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not update customer access." }, 400); }
}
