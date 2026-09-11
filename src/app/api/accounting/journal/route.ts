import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { executeJournalCommand, manualJournalData } from "@/lib/accounting/journal-store";
import { z } from "zod";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { await requireSectionAccess("money", "view"); } catch { return json({ error: "Accounting access required." }, 403); }
  try { return json(manualJournalData()); } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not read the journal." }, 400); }
}
export async function POST(request: Request) {
  let actor; try { await requireSectionAccess("money", "edit"); actor = await requireIdentity(); } catch { return json({ error: "Accounting edit access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { return json({ result: executeJournalCommand(await boundedJson(new Response(request.body), 100000), `${actor.name} (${actor.id})`) }); }
  catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not update the journal." }, 400); }
}
