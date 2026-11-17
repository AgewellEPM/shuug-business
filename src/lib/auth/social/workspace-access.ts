import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../../workspace/database";
import { secureStaffIdentity, verifiedOwnerSession } from "../../secure-tax/staff-session";
import { SocialSignInError } from "./providers";

export const workspaceSecret = z.string().regex(/^[a-f0-9]{64}$/);
export const workspaceSecretDigest = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const ticketLifetime = 90_000;
const sessionLifetime = 8 * 3600_000;
const inviteLifetime = 48 * 3600_000;

type Assignment = {
  id: string; role: "staff" | "location"; targetId: string; label: string;
  enabled: number; revision: number;
};

function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_role_assignments (
    id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('staff','location')),
    targetId TEXT NOT NULL, label TEXT NOT NULL, enabled INTEGER NOT NULL,
    revision INTEGER NOT NULL, inviteHash TEXT UNIQUE, inviteExpires INTEGER
  );
  CREATE TABLE IF NOT EXISTS workspace_role_sessions (
    tokenHash TEXT PRIMARY KEY, assignmentId TEXT REFERENCES workspace_role_assignments(id),
    revision INTEGER, ownerTokenHash TEXT, kind TEXT NOT NULL CHECK(kind IN ('ticket','session')), expires INTEGER NOT NULL,
    CHECK ((assignmentId IS NOT NULL AND revision IS NOT NULL AND ownerTokenHash IS NULL) OR
      (assignmentId IS NULL AND revision IS NULL AND ownerTokenHash IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS workspace_role_session_expiry ON workspace_role_sessions(expires);`);
}

function owner(db: DatabaseSync, token: string) {
  const { user } = secureStaffIdentity(db, token);
  if (!user.isOwner) throw new SocialSignInError("Only the owner can configure workspace access.", 403);
  init(db);
  return user.id;
}

function assignments(db: DatabaseSync) {
  const social = db.prepare("SELECT 1 FROM sqlite_schema WHERE name='social_identities'").get();
  const providers = social && db.prepare("SELECT provider FROM social_identities WHERE audience='workspace-member' AND accountId=? ORDER BY provider");
  const passwordTable = db.prepare("SELECT 1 FROM sqlite_schema WHERE name='workspace_password_credentials'").get();
  const password = passwordTable && db.prepare("SELECT 1 FROM workspace_password_credentials WHERE kind='workspace-member' AND id=?");
  const rows = db.prepare("SELECT id,role,targetId,label,enabled,revision FROM workspace_role_assignments ORDER BY label,id").all() as Assignment[];
  return rows.map(row => ({ ...row, enabled: row.enabled === 1, providers: providers ? providers.all(row.id).map(value => value.provider) : [], passwordConfigured: !!(password && password.get(row.id)) }));
}

export function listWorkspaceAssignments(token: string) {
  return workspaceDatabase(db => { owner(db, token); return { assignments: assignments(db) }; });
}

const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.uuid().optional(), revision: z.number().int().positive().optional(),
    role: z.enum(["staff", "location"]), targetId: z.string().regex(/^[1-9]\d{0,18}$/), label: z.string().trim().min(1).max(120), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("invite"), id: z.uuid(), revision: z.number().int().positive() }).strict(),
]);

export function manageWorkspaceAssignment(token: string, raw: unknown) {
  const input = mutation.parse(raw);
  return workspaceDatabase(db => {
    const actor = owner(db, token), id = input.id ?? randomUUID();
    const current = db.prepare("SELECT id,role,targetId,label,enabled,revision FROM workspace_role_assignments WHERE id=?").get(id) as Assignment | undefined;
    if (input.id && (!current || current.revision !== input.revision)) throw new SocialSignInError("This assignment changed. Refresh before making changes.", 409);
    let invitation: string | undefined;
    if (input.action === "save") {
      db.prepare(`INSERT INTO workspace_role_assignments (id,role,targetId,label,enabled,revision) VALUES(?,?,?,?,?,1)
        ON CONFLICT(id) DO UPDATE SET role=excluded.role,targetId=excluded.targetId,label=excluded.label,
        enabled=excluded.enabled,revision=revision+1,inviteHash=NULL,inviteExpires=NULL`)
        .run(id, input.role, input.targetId, input.label, Number(input.enabled));
      db.prepare("DELETE FROM workspace_role_sessions WHERE assignmentId=?").run(id);
    } else {
      if (!current?.enabled) throw new SocialSignInError("Enable this assignment before creating a sign-in link.", 409);
      invitation = secret();
      db.prepare("UPDATE workspace_role_assignments SET inviteHash=?,inviteExpires=? WHERE id=?").run(workspaceSecretDigest(invitation), Date.now() + inviteLifetime, id);
    }
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)")
      .run(id, actor, `auth.workspace.${input.action}`, new Date().toISOString(), "{}");
    return { assignmentId: id, assignments: assignments(db), ...(invitation ? { invitation } : {}) };
  }, true);
}

// Called within the same transaction as consumption of a verified provider flow.
export function acceptWorkspaceInvitation(db: DatabaseSync, invitationDigest: string) {
  init(db);
  const row = db.prepare("SELECT id FROM workspace_role_assignments WHERE inviteHash=? AND inviteExpires>? AND enabled=1")
    .get(invitationDigest, Date.now()) as { id: string } | undefined;
  if (!row) throw new SocialSignInError("This workspace invitation expired or was used. Ask the owner for a new link.", 409);
  db.prepare("UPDATE workspace_role_assignments SET inviteHash=NULL,inviteExpires=NULL WHERE id=?").run(row.id);
  return row.id;
}

export function issueWorkspaceTicket(db: DatabaseSync, assignmentId: string) {
  init(db);
  const assignment = db.prepare("SELECT role,revision FROM workspace_role_assignments WHERE id=? AND enabled=1").get(assignmentId) as Pick<Assignment, "role" | "revision"> | undefined;
  if (!assignment) throw new SocialSignInError("Your workspace access is unavailable. Contact the owner.", 403);
  const now = Date.now(), ticket = secret();
  db.prepare("DELETE FROM workspace_role_sessions WHERE expires<=?").run(now);
  db.prepare("INSERT INTO workspace_role_sessions VALUES(?,?,?,NULL,'ticket',?)").run(workspaceSecretDigest(ticket), assignmentId, assignment.revision, now + ticketLifetime);
  return { audience: assignment.role, ticket };
}

export function issueOwnerSdrTicket(token: string) {
  return workspaceDatabase(db => {
    owner(db, token);
    const ticket = secret(), now = Date.now();
    db.prepare("DELETE FROM workspace_role_sessions WHERE expires<=?").run(now);
    db.prepare("INSERT INTO workspace_role_sessions VALUES(?,NULL,NULL,?,'ticket',?)").run(workspaceSecretDigest(ticket), workspaceSecretDigest(token), now + ticketLifetime);
    return { ticket };
  }, true);
}

type RoleSession = {
  assignmentId: string | null; revision: number | null; ownerTokenHash: string | null;
  role: Assignment["role"] | null; targetId: string | null; expires: number;
};

const sessionInput = z.object({ action: z.enum(["redeem", "read", "revoke"]), token: workspaceSecret }).strict();
export function workspaceRoleSession(raw: unknown) {
  const { action, token } = sessionInput.parse(raw);
  const key = workspaceSecretDigest(token), now = Date.now();
  return workspaceDatabase(db => {
    init(db);
    if (action === "revoke") {
      db.prepare("DELETE FROM workspace_role_sessions WHERE tokenHash=? AND kind='session'").run(key);
      return { revoked: true };
    }
    const row = db.prepare(`SELECT s.assignmentId,s.revision,s.ownerTokenHash,a.role,a.targetId,s.expires
      FROM workspace_role_sessions s LEFT JOIN workspace_role_assignments a ON a.id=s.assignmentId AND a.revision=s.revision AND a.enabled=1
      WHERE s.tokenHash=? AND s.kind=? AND s.expires>?`)
      .get(key, action === "redeem" ? "ticket" : "session", now) as RoleSession | undefined;
    const ownerSession = row?.ownerTokenHash ? verifiedOwnerSession(db, row.ownerTokenHash, now) : undefined;
    const role = ownerSession ? "owner" : row?.role;
    if (!row || !role) throw new SocialSignInError("Sign-in expired or workspace access changed. Sign in again.", 401);
    const targetId = row.targetId;
    if (action === "read") return { role, targetId, expires: row.expires };
    const session = secret(), expires = Math.min(now + sessionLifetime, ownerSession?.expires ?? Infinity);
    db.prepare("DELETE FROM workspace_role_sessions WHERE tokenHash=?").run(key);
    db.prepare("INSERT INTO workspace_role_sessions VALUES(?,?,?,?,'session',?)").run(workspaceSecretDigest(session), row.assignmentId, row.revision, row.ownerTokenHash, expires);
    return { role, targetId, session, expires };
  }, action !== "read");
}
