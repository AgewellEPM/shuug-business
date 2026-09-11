import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { listWebsitePayments } from "@/lib/website-payments/state";
import { websitePaymentReady, websitePaymentSettings, saveWebsitePaymentSettings } from "@/lib/website-payments/settings";
import { refreshWebsitePayment } from "@/lib/website-payments/service";
import { reconcileWebsiteReceipt } from "@/lib/workspace/store";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() { try { await requireOwnerAccess(); } catch { return json({ error: "Only the owner can manage website payments." }, 403); } return json({ settings: websitePaymentSettings(), ready: websitePaymentReady(), payments: listWebsitePayments() }); }
export async function POST(request: Request) {
  try { await requireOwnerAccess(); } catch { return json({ error: "Only the owner can manage website payments." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const body = z.object({ action: z.enum(["settings", "refresh", "expire", "recover", "reconcile"]), input: z.record(z.string(), z.unknown()) }).strict().parse(await boundedJson(new Response(request.body), 16000));
    if (body.action === "settings") return json({ settings: saveWebsitePaymentSettings(body.input) });
    if (body.action === "reconcile") { const input = z.object({ id: z.uuid(), evidence: z.string().min(5).max(6000) }).strict().parse(body.input); return json({ receipt: reconcileWebsiteReceipt(input.id, input.evidence, "Workspace owner") }); }
    const input = z.object({ id: z.uuid(), sessionId: z.string().regex(/^cs_[a-zA-Z0-9_]+$/).optional() }).strict().parse(body.input);
    if (body.action === "recover" && !input.sessionId) throw new Error("Supply the Checkout session ID from Stripe.");
    await refreshWebsitePayment(input.id, body.action === "expire" ? "expire" : "refresh", body.action === "recover" ? input.sessionId : undefined);
    return json({ payments: listWebsitePayments() });
  } catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not update website payments." }, 400); }
}
