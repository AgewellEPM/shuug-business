import { timingSafeEqual } from "node:crypto";
import { requireIdentity } from "../auth/identity";
export function equalSecret(a: string, b: string) { const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); }
/** Authenticate only. Call a section or owner guard before accessing business data. */
export async function requireWorkspaceAccess() { await requireIdentity(); }
