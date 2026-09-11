import { exportBusinessTemplate } from "@/lib/branding/templates";
import { requireSectionAccess } from "@/lib/permissions/guard";
export async function GET() {
  try { await requireSectionAccess("admin", "view"); return Response.json(exportBusinessTemplate(), { headers: { "Content-Disposition": "attachment; filename=business-template.json", "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Workspace administrator access required." }, { status: 403 }); }
}
