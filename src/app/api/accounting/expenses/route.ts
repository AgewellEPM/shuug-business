import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { executeExpenseAccountingCommand, expenseAccountingData } from "@/lib/expenses/accounting";
import { readExpense } from "@/lib/expenses/store";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { await requireSectionAccess("money", "view"); } catch { return json({ error: "Accounting access required." }, 403); }
  try { return json(expenseAccountingData()); } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not read expense accounting." }, 400); }
}
export async function POST(request: Request) {
  let actor; try { await requireSectionAccess("money", "edit"); actor = await requireIdentity(); } catch { return json({ error: "Accounting edit access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { const result = executeExpenseAccountingCommand(await boundedJson(new Response(request.body), 100000), `${actor.name} (${actor.id})`); return json({ result, expense: readExpense(result.id) }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Could not update expense accounting." }, 400); }
}
