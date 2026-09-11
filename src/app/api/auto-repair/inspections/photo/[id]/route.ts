import { requireIdentity } from "@/lib/auth/identity";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { inspectionPhoto } from "@/lib/auto-repair/inspections";
import { inspectionPhotoResponse } from "@/lib/auto-repair/inspection-http";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireIdentity(); let manager = false; try { await requireSectionAccess("services", "view"); manager = true; } catch {} return inspectionPhotoResponse(inspectionPhoto((await context.params).id, { actor, manager })); }
  catch { return new Response("Inspection photo unavailable.", { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
