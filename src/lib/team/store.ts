/**
 * Team roster — who's on your team. Durable: backed by team.json so add/edit/
 * delete survive a restart (globalThis cache for speed), same pattern as the
 * permissions + customer archives. `listTeam`/`teamNames` are stable APIs used
 * across the app; CRUD is additive.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { slugify, uniqueSlug } from "../slug";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  initials: string;
  online: boolean;
  /** annual salary/cost in cents (drives the performance ROI). null = not set. */
  salaryCents?: number | null;
}

export interface NewMember { name: string; email: string; role: string; online?: boolean; salaryCents?: number | null }
export type MemberPatch = Partial<Pick<TeamMember, "name" | "email" | "role" | "online" | "salaryCents">>;

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function seed(): TeamMember[] {
  return [
    { id: "owner", name: "You (Owner)", role: "Owner", email: "owner@shuug.example", initials: "YO", online: true, salaryCents: null },
    { id: "alex", name: "Alex Rivera", role: "Sales", email: "alex@shuug.example", initials: initials("Alex Rivera"), online: true, salaryCents: 6500000 },
    { id: "jordan", name: "Jordan Kim", role: "Sales", email: "jordan@shuug.example", initials: initials("Jordan Kim"), online: false, salaryCents: 6000000 },
    { id: "sam", name: "Sam Cohen", role: "Production", email: "sam@shuug.example", initials: initials("Sam Cohen"), online: false, salaryCents: 5200000 },
    { id: "mia", name: "Mia Alvarez", role: "Fulfillment", email: "mia@shuug.example", initials: initials("Mia Alvarez"), online: true, salaryCents: 4800000 },
  ];
}

const holder = globalThis as unknown as { __team?: TeamMember[] };
const file = () => path.join(dataDirectory(), "team.json");

function loadFromDisk(): TeamMember[] | null {
  try {
    const v = JSON.parse(readFileSync(file(), "utf8"));
    if (!Array.isArray(v) || v.some((m) => !m?.id || !m?.name)) return null;
    return v as TeamMember[];
  } catch {
    return null;
  }
}
function persist(members: TeamMember[]) {
  holder.__team = members;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `team-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(members), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): TeamMember[] {
  holder.__team = loadFromDisk() ?? (process.env.DEMO_DATA === "true" ? seed() : seed().filter(member => member.id === "owner"));
  return holder.__team;
}

export function listTeam(): TeamMember[] {
  return state().map((m) => ({ ...m }));
}
export function teamNames(): string[] {
  return state().map((m) => m.name);
}
export function getMember(id: string): TeamMember | null {
  const found = state().find((m) => m.id === id);
  return found ? { ...found } : null;
}

export function addMember(input: NewMember): TeamMember {
  const members = state();
  const id = uniqueSlug(slugify(input.name), new Set(members.map((m) => m.id)));
  const member: TeamMember = {
    id,
    name: input.name.trim(),
    email: input.email.trim(),
    role: input.role.trim() || "Viewer",
    initials: initials(input.name),
    online: input.online ?? false,
    salaryCents: input.salaryCents ?? null,
  };
  persist([...members, member]);
  return member;
}

export function updateMember(id: string, patch: MemberPatch): TeamMember {
  const members = state();
  const member = members.find((m) => m.id === id);
  if (!member) throw new Error(`Unknown team member ${id}`);
  const next: TeamMember = {
    ...member,
    ...(patch.name !== undefined ? { name: patch.name.trim(), initials: initials(patch.name) } : {}),
    ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
    ...(patch.role !== undefined ? { role: patch.role.trim() || member.role } : {}),
    ...(patch.online !== undefined ? { online: patch.online } : {}),
    ...(patch.salaryCents !== undefined ? { salaryCents: patch.salaryCents } : {}),
  };
  persist(members.map((m) => (m.id === id ? next : m)));
  return next;
}

export function removeMember(id: string): void {
  if (id === "owner") throw new Error("The owner account can't be removed.");
  const members = state();
  if (!members.some((m) => m.id === id)) throw new Error(`Unknown team member ${id}`);
  persist(members.filter((m) => m.id !== id));
}
