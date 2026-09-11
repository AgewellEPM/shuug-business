/**
 * Permissions store — the editable role×section matrix and each member's role.
 * Durable: backed by a JSON file (permissions.json) so admin changes survive a
 * restart, with a globalThis cache for speed. Same durable-demo pattern as the
 * customer archive; the production path is the relational DB (see readiness doc).
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { DEFAULT_MATRIX, DEFAULT_ROLES, SECTION_KEYS, PERMISSION_LEVELS, type PermissionMatrix, type PermissionLevel, type SectionKey } from "./model";
import { listTeam } from "../team/store";

interface PermState {
  matrix: PermissionMatrix;
  /** memberId -> role name. */
  assignments: Record<string, string>;
}

const holder = globalThis as unknown as { __perms?: PermState };
const file = () => path.join(dataDirectory(), "permissions.json");
const knownRole = (role: string) => (DEFAULT_ROLES as readonly string[]).includes(role);

function seed(): PermState {
  const matrix: PermissionMatrix = JSON.parse(JSON.stringify(DEFAULT_MATRIX));
  const assignments: Record<string, string> = {};
  for (const m of listTeam()) assignments[m.id] = knownRole(m.role) ? m.role : m.id === "owner" ? "Owner" : "Viewer";
  return { matrix, assignments };
}

function loadFromDisk(): PermState | null {
  try {
    const v = JSON.parse(readFileSync(file(), "utf8"));
    if (!v || !v.matrix || !v.assignments || typeof v.matrix !== "object" || typeof v.assignments !== "object") throw new Error("Invalid permissions file.");
    return { matrix: v.matrix, assignments: v.assignments };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Permissions could not be read. Restore the permissions backup before granting access.");
  }
}

function persist(state: PermState) {
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `permissions-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, file());
}

function state(): PermState {
  holder.__perms = loadFromDisk() ?? seed();
  return holder.__perms;
}

export function getMatrix(): PermissionMatrix { const matrix = state().matrix; return { ...matrix, Employee: matrix.Employee ?? { home: "view" }, Owner: { ...matrix.Owner, ...DEFAULT_MATRIX.Owner } }; }
export function listRoles(): string[] { return Object.keys(getMatrix()); }
export function getAssignments(): Record<string, string> { return { ...state().assignments }; }

/** Built-in roles ship with the app and can't be deleted; the rest are custom. */
export function isBuiltInRole(role: string): boolean { return (DEFAULT_ROLES as readonly string[]).includes(role); }

/** Create a custom role. Starts minimal (home:view only) — tune it in the matrix. */
export function createRole(name: string): void {
  const clean = name.trim();
  if (!clean || clean.length > 40 || ["__proto__", "constructor", "prototype"].includes(clean)) throw new Error("Role name must be 1–40 characters.");
  const s = state();
  if (s.matrix[clean]) throw new Error(`A role named “${clean}” already exists.`);
  s.matrix[clean] = { home: "view" };
  persist(s);
}

/** Delete a custom role; anyone assigned it drops to Viewer. Built-ins are safe. */
export function deleteRole(name: string): void {
  if (isBuiltInRole(name)) throw new Error("Built-in roles can’t be deleted.");
  const s = state();
  if (!s.matrix[name]) throw new Error(`Unknown role: ${name}`);
  delete s.matrix[name];
  for (const id of Object.keys(s.assignments)) if (s.assignments[id] === name) s.assignments[id] = "Viewer";
  persist(s);
}

export function roleForMember(memberId: string): string {
  return state().assignments[memberId] ?? "Viewer";
}

/** Set one cell. Owner stays fully locked to edit — never lock out the owner. */
export function setPermission(role: string, section: SectionKey, level: PermissionLevel): void {
  if (!listRoles().includes(role) || !SECTION_KEYS.includes(section) || !PERMISSION_LEVELS.includes(level)) throw new Error("Invalid permission.");
  if (role === "Owner") return;
  const s = state();
  (s.matrix[role] ??= {})[section] = level;
  persist(s);
}

export function assignRole(memberId: string, role: string): void {
  if (!listRoles().includes(role)) throw new Error(`Unknown role: ${role}`);
  const s = state();
  s.assignments[memberId] = role;
  persist(s);
}
