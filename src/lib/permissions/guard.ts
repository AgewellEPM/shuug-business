/**
 * Server-side section guard. A page (or server action) calls this to enforce the
 * matrix for the currently-active role. Throws when the role lacks the level —
 * fail-closed. Pair with getActiveRole so the "acting as" preview is real
 * enforcement, not decoration.
 */
import { requireOwnerAccess } from "../auth/identity";
import { requireWorkspaceAccess } from "../connections/access";
import { getMatrix } from "./store";
import { getActiveRole } from "./active";
import { can, sectionForPath, type Action, type SectionKey } from "./model";

export async function requireSectionAccess(section: SectionKey, action: Action = "view"): Promise<void> {
  await requireWorkspaceAccess();
  if (section === "admin") await requireOwnerAccess();
  const role = await getActiveRole();
  if (!can(getMatrix(), role, section, action)) {
    throw new Error(`Your role (${role}) doesn't have ${action} access to ${section}.`);
  }
}

export async function requirePathAccess(path: string, action: Action = "view"): Promise<void> {
  await requireSectionAccess(sectionForPath(path), action);
}
