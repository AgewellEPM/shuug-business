import { requireIdentity } from "../auth/identity";
import { requireWorkspaceAccess } from "../connections/access";
import { getActiveRole } from "../permissions/active";
import { getMatrix } from "../permissions/store";
import { can } from "../permissions/model";
import { definitionFor, recordDefinitions } from "./catalog";
import { listBusinessRecords } from "./store";
import type { BusinessRecord } from "./model";

export async function workspaceIdentity() {
  await requireWorkspaceAccess();
  const role = await getActiveRole(), matrix = getMatrix();
  return { role, matrix, actor: (await requireIdentity()).name };
}
export async function readableBusinessRecords() {
  const { role, matrix } = await workspaceIdentity();
  return listBusinessRecords(recordDefinitions.filter(d => can(matrix, role, d.section, "view")).map(d => d.kind));
}
export async function authorizeRecord(kind: string, action: "view" | "edit", fields?: BusinessRecord["fields"]) {
  const identity = await workspaceIdentity(), definition = definitionFor(kind);
  if (!can(identity.matrix, identity.role, definition.section, action)) throw new Error(`Your role does not have ${action} access to ${definition.section}.`);
  if (fields) {
    const readable = await readableBusinessRecords();
    for (const field of definition.fields.filter(f => f.type === "ref")) {
      if (fields[field.key] && !readable.some(r => r.id === fields[field.key])) throw new Error("A linked record is unavailable to your role.");
    }
  }
  return identity;
}
