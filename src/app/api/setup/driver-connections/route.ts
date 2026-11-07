import { checkArgyleAccess, registerArgyleWebhooks, argyleCoverage } from "@/lib/gig-connections/argyle-setup";
import { recoverArgyleUsers } from "@/lib/gig-connections/argyle-service";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { driverProviderSetup, saveDriverProviderSetup } from "@/lib/rideshare-driver/provider-setup";
import { retryBankRevocations } from "@/lib/rideshare-driver/bank-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export async function GET() {
  try { await requireOwnerAccess(); } catch { return json({ error: "Only the owner can configure providers." }, 403); }
  return json(driverProviderSetup());
}
export async function POST(request: Request) {
  try { await requireOwnerAccess(); } catch { return json({ error: "Only the owner can configure providers." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "Use application/json." }, 415);
  try {
    const input = await boundedJson(new Response(request.body), 8000);
    if (input && typeof input === "object" && "action" in input && input.action === "retryBankRevocations" && Object.keys(input).length === 1) return json(await retryBankRevocations());
    if (input && typeof input === "object" && "action" in input) {
      if (input.action === "argyle.check") return json(await checkArgyleAccess());
      if (input.action === "argyle.register") return json(await registerArgyleWebhooks());
      if (input.action === "argyle.recover") return json(await recoverArgyleUsers());
      if (input.action === "argyle.coverage" && "query" in input && typeof input.query === "string") return json(await argyleCoverage(input.query));
    }
    return json(saveDriverProviderSetup(input));
  }
  catch { return json({ error: "Provider settings were not saved. Check the fields and finish or cancel any pending bank connections first." }, 400); }
}
