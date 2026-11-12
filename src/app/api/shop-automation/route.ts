import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl, saveSecrets } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { shopAutomationState, processShopAutomation } from "@/lib/shop-automation/service";
import { saveShopSettings, shopSettingsInput } from "@/lib/shop-automation/settings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { await requireOwnerAccess(); return json(shopAutomationState()); }
  catch { return json({ error: "Owner access required." }, 403); }
}
export async function POST(request: Request) {
  let owner; try { owner = await requireOwnerAccess(); } catch { return json({ error: "Owner access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("configure"), input: shopSettingsInput }).strict(),
      z.object({ action: z.literal("dispatch.configure"), enabled: z.boolean(), reviewed: z.literal(true) }).strict(),
      z.object({ action: z.literal("tick"), limit: z.number().int().min(1).max(50).default(20) }).strict(),
    ]).parse(await boundedJson(new Response(request.body), 8000));
    let result;
    if (input.action === "configure") result = saveShopSettings(input.input, owner.id);
    else if (input.action === "dispatch.configure") { saveSecrets({ COMMUNICATIONS_SEND_ENABLED: String(input.enabled) }); result = { enabled: input.enabled }; }
    else result = await processShopAutomation(input.limit);
    return json({ ok: true, result, state: shopAutomationState() });
  } catch (error) { return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Shop automation needs review." }, 400); }
}
