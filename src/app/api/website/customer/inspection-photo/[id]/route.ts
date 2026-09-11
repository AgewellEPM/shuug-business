import { customerToken } from "@/lib/customer-access/accounts";
import { customerSettings } from "@/lib/customer-access/service";
import { inspectionPhoto } from "@/lib/auto-repair/inspections";
import { inspectionPhotoResponse } from "@/lib/auto-repair/inspection-http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const settings = customerSettings(), token = customerToken(request); if (!settings.enabled || !settings.servicePortal || !token) throw new Error("Sign in"); return inspectionPhotoResponse(inspectionPhoto((await context.params).id, { customerToken: token })); }
  catch { return new Response("Inspection photo unavailable.", { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
