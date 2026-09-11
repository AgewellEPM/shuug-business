import { requireSectionAccess } from "@/lib/permissions/guard";
import { specialManagementData } from "@/lib/restaurant/special-management";
export async function GET() {
  try { await requireSectionAccess("marketing", "view"); let money = false; try { await requireSectionAccess("money", "view"); money = true; } catch {} return Response.json(specialManagementData(money), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Marketing access required." }, { status: 403 }); }
}
