"use server";
import { z } from "zod";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { createPortalGrant, listPortalGrants, revokePortalGrant } from "@/lib/workspace/portal";
import { appBaseUrl } from "@/lib/connections/vault";
export async function portalLinkAction(clientId?: string, revokeId?: string) {
  try { await requireSectionAccess("services", "edit"); await requireSectionAccess("money", "view");
    if (revokeId) revokePortalGrant(z.uuid().parse(revokeId));
    const grant = clientId ? createPortalGrant(z.uuid().parse(clientId)) : null;
    return { ok: true as const, url: grant ? `${appBaseUrl()}/api/portal/${grant.token}` : null, grants: listPortalGrants() };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Portal link unavailable." }; }
}
