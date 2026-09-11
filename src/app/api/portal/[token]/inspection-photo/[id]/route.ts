import { inspectionPhoto } from "@/lib/auto-repair/inspections";
import { inspectionPhotoResponse } from "@/lib/auto-repair/inspection-http";
export async function GET(_request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  try { const { token, id } = await context.params; return inspectionPhotoResponse(inspectionPhoto(id, { portalToken: token })); }
  catch { return new Response("Inspection photo unavailable.", { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
