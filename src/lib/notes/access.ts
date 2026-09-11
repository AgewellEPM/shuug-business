import { requireIdentity } from "../auth/identity";
import { getActiveRole } from "../permissions/active";
import { getMatrix } from "../permissions/store";
import { can, sectionForPath } from "../permissions/model";
import { listNotes } from "./store";
import { activeWorkspace } from "../navigation/active-profile";
export async function readableNotes() {
  const user = await requireIdentity();
  const role = await getActiveRole(), matrix = getMatrix(), { config } = await activeWorkspace();
  return listNotes().filter(n => (n.ownerId ? (n.ownerId === user.id || (n.visibility === "team" && can(matrix, role, "team", "view"))) : user.isOwner) && (n.profile === "all" || config.organizationTypes?.includes(n.profile)) && (n.scope === "internal" || can(matrix, role, sectionForPath(n.pageKey), "view")));
}
