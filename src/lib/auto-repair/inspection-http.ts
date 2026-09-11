import { z } from "zod";
import { requireIdentity } from "../auth/identity";
import { requireSectionAccess } from "../permissions/guard";
import { appBaseUrl } from "../connections/vault";
import { boundedJson } from "../social/http";
import { executeInspectionCommand, inspectionWorkspace } from "./inspections";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function inspectionGet(manager: boolean) { try { const actor = await requireIdentity(); if (manager) await requireSectionAccess("services", "view"); return json(inspectionWorkspace(actor, manager)); } catch { return json({ error: "Inspection access required." }, 403); } }
export async function inspectionPost(request: Request, manager: boolean) {
  let actor; try { actor = await requireIdentity(); if (manager) await requireSectionAccess("services", "edit"); } catch { return json({ error: "Inspection access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { const result = executeInspectionCommand(await boundedJson(new Response(request.body), 750000), actor, manager); return json({ result, data: inspectionWorkspace(actor, manager) }); }
  catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not save inspection." }, 400); }
}
export function inspectionPhotoResponse(photo: { bytes: Buffer; mime: string }) { return new Response(new Uint8Array(photo.bytes), { headers: { "Content-Type": photo.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; sandbox" } }); }
