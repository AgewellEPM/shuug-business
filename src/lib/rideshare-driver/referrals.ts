import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount } from "./policy";
import { DriverError } from "./model";

export const referralProgram = {
  version: 1, name: "Driver Rewards", referralBonusCents: 2000, pointsPerReferral: 100,
  milestonePoints: 500, milestoneCreditCents: 2000, currency: "USD",
  terms: "Refer a new tax-prep client. After the firm confirms that you use its tax-prep services and your referral's first paid tax preparation is complete, earn a $20 reward—choose cash or tax-prep credit—and 100 points. Every 500 lifetime points unlocks an extra $20 tax-prep credit. Points do not expire or have a cash value. Self-referrals and duplicate claims for the same new client do not qualify. Rewards require staff approval; cash and credits are fulfilled by the firm.",
};
type Claim = { id: string; referrerId: string; referrerClientId: string; referredId: string; referredClientId: string; status: string; createdAt: string; qualifiedAt: string | null; proof: string | null };
type Reward = { id: string; accountId: string; clientId: string; source: string; kind: string; amountCents: number; status: string; method: string | null; createdAt: string; fulfilledAt: string | null; reference: string | null };
function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS driver_referral_codes(accountId TEXT PRIMARY KEY,clientId TEXT NOT NULL,code TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS driver_referrals(id TEXT PRIMARY KEY,referrerId TEXT NOT NULL,referrerClientId TEXT NOT NULL,referredId TEXT NOT NULL,
      referredClientId TEXT NOT NULL UNIQUE,status TEXT NOT NULL,createdAt TEXT NOT NULL,qualifiedAt TEXT,proof TEXT);
    CREATE TABLE IF NOT EXISTS driver_referral_points(source TEXT PRIMARY KEY,accountId TEXT NOT NULL,clientId TEXT NOT NULL,points INTEGER NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS driver_referral_rewards(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,clientId TEXT NOT NULL,source TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,amountCents INTEGER NOT NULL,status TEXT NOT NULL,method TEXT,createdAt TEXT NOT NULL,fulfilledAt TEXT,reference TEXT);
    CREATE TABLE IF NOT EXISTS driver_referral_audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT,entityId TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,at TEXT NOT NULL,details TEXT NOT NULL);`);
}
function audit(db: DatabaseSync, entityId: string, actor: string, action: string, details: object = {}) {
  db.prepare("INSERT INTO driver_referral_audit(entityId,actor,action,at,details) VALUES(?,?,?,?,?)")
    .run(entityId, actor, action, new Date().toISOString(), JSON.stringify(details));
}
function personalCode(db: DatabaseSync, accountId: string, clientId: string) {
  const existing = db.prepare("SELECT code,clientId FROM driver_referral_codes WHERE accountId=?").get(accountId) as { code: string; clientId: string } | undefined;
  if (existing) {
    if (existing.clientId !== clientId) throw new DriverError(403, "Your referral account's client link changed. Contact the firm.");
    return existing.code;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = "RTP-" + randomBytes(5).toString("hex").toUpperCase();
    const result = db.prepare("INSERT OR IGNORE INTO driver_referral_codes VALUES(?,?,?)").run(accountId, clientId, code);
    if (result.changes) return code;
  }
  throw new DriverError(503, "Please try creating your referral code again.");
}
function summary(db: DatabaseSync, token: string | undefined) {
  const account = driverAccount(db, token); init(db);
  const code = personalCode(db, account.id, account.clientId);
  const claims = db.prepare("SELECT id,status,createdAt,qualifiedAt FROM driver_referrals WHERE referrerId=? AND referrerClientId=? ORDER BY createdAt DESC").all(account.id, account.clientId);
  const referredBy = db.prepare("SELECT status FROM driver_referrals WHERE referredClientId=?").get(account.clientId) ?? null;
  const points = (db.prepare("SELECT coalesce(sum(points),0) AS n FROM driver_referral_points WHERE accountId=? AND clientId=?").get(account.id, account.clientId) as { n: number }).n;
  const rewards = db.prepare("SELECT id,kind,amountCents,status,method,createdAt,fulfilledAt FROM driver_referral_rewards WHERE accountId=? AND clientId=? ORDER BY createdAt DESC").all(account.id, account.clientId);
  return { program: referralProgram, code, points, nextMilestone: (Math.floor(points/referralProgram.milestonePoints)+1)*referralProgram.milestonePoints,
    shareUrl: `https://rideshare-tax-pros.pages.dev/?ref=${encodeURIComponent(code)}`, claims, referredBy, rewards };
}
export function referralSummary(token: string | undefined) { return workspaceDatabase(db => summary(db, token), true); }
export function claimReferral(token: string | undefined, raw: unknown) {
  const input = z.object({ code: z.string().trim().toUpperCase().regex(/^RTP-[A-F0-9]{10}$/) }).strict().parse(raw);
  return workspaceDatabase(db => {
    const account = driverAccount(db, token); init(db);
    const owner = db.prepare(`SELECT c.accountId,c.clientId,a.status FROM driver_referral_codes c JOIN customer_accounts a ON a.id=c.accountId
      WHERE c.code=? AND c.clientId=a.clientId`).get(input.code) as { accountId: string; clientId: string; status: string } | undefined;
    if (!owner || owner.status !== "active") throw new DriverError(404, "Check the referral code with the person who shared it.");
    if (owner.accountId === account.id || owner.clientId === account.clientId) throw new DriverError(422, "Self-referrals do not qualify.");
    const existing = db.prepare("SELECT * FROM driver_referrals WHERE referredClientId=?").get(account.clientId) as Claim | undefined;
    if (existing) {
      if (existing.referrerId === owner.accountId && existing.status !== "rejected") return summary(db, token);
      throw new DriverError(409, "A referral is already recorded for this client. Ask the firm to review any correction.");
    }
    const id = randomUUID();
    db.prepare("INSERT INTO driver_referrals VALUES(?,?,?,?,?,'pending',?,NULL,NULL)")
      .run(id, owner.accountId, owner.clientId, account.id, account.clientId, new Date().toISOString());
    audit(db, id, account.id, "claim", { programVersion: referralProgram.version });
    return summary(db, token);
  }, true);
}
export function requestReferralReward(token: string | undefined, raw: unknown) {
  const input = z.object({ rewardId: z.uuid(), method: z.enum(["cash", "credit"]) }).strict().parse(raw);
  return workspaceDatabase(db => {
    const account = driverAccount(db, token); init(db);
    const reward = db.prepare("SELECT * FROM driver_referral_rewards WHERE id=? AND accountId=? AND clientId=?")
      .get(input.rewardId, account.id, account.clientId) as Reward | undefined;
    if (!reward) throw new DriverError(404, "Reward unavailable.");
    if (reward.kind === "milestone" && input.method !== "credit") throw new DriverError(422, "Milestone rewards are tax-prep credit.");
    if (reward.status === "requested" && reward.method === input.method) return summary(db, token);
    if (reward.status !== "available") throw new DriverError(409, "This reward has already been requested or fulfilled.");
    db.prepare("UPDATE driver_referral_rewards SET status='requested',method=? WHERE id=?").run(input.method, reward.id);
    audit(db, reward.id, account.id, "redemption-requested", { method: input.method, amountCents: reward.amountCents });
    return summary(db, token);
  }, true);
}
function reward(db: DatabaseSync, claim: Claim, source: string, kind: string, cents: number) {
  db.prepare("INSERT OR IGNORE INTO driver_referral_rewards VALUES(?,?,?,?,?,?,'available',NULL,?,NULL,NULL)")
    .run(randomUUID(), claim.referrerId, claim.referrerClientId, source, kind, cents, new Date().toISOString());
}
/** Staff callers must enforce Money edit access and obtain actor from the signed-in session. */
export function approveReferral(raw: unknown, actor: string) {
  const input = z.object({ claimId: z.uuid(), referrerUsesTaxPrep: z.literal(true), firstPaidPreparationComplete: z.literal(true), proof: z.string().trim().min(3).max(300) }).strict().parse(raw);
  return workspaceDatabase(db => {
    init(db);
    const claim = db.prepare("SELECT * FROM driver_referrals WHERE id=?").get(input.claimId) as Claim | undefined;
    if (!claim) throw new DriverError(404, "Referral unavailable.");
    if (claim.status === "qualified") return;
    if (claim.status !== "pending") throw new DriverError(409, "Only a pending referral can be qualified.");
    for (const [accountId, clientId] of [[claim.referrerId, claim.referrerClientId], [claim.referredId, claim.referredClientId]]) {
      if (!db.prepare("SELECT id FROM customer_accounts WHERE id=? AND clientId=? AND status='active'").get(accountId, clientId)) {
        throw new DriverError(409, "A linked client account changed or is disabled. Review it before approving a reward.");
      }
    }
    const at = new Date().toISOString();
    db.prepare("UPDATE driver_referrals SET status='qualified',qualifiedAt=?,proof=? WHERE id=?").run(at, input.proof, claim.id);
    reward(db, claim, "referral:" + claim.id, "referral", referralProgram.referralBonusCents);
    db.prepare("INSERT INTO driver_referral_points VALUES(?,?,?,?,?)").run(claim.id, claim.referrerId, claim.referrerClientId, referralProgram.pointsPerReferral, at);
    const points = (db.prepare("SELECT sum(points) AS n FROM driver_referral_points WHERE accountId=? AND clientId=?").get(claim.referrerId, claim.referrerClientId) as { n: number }).n;
    for (let milestone = referralProgram.milestonePoints; milestone <= points; milestone += referralProgram.milestonePoints) {
      reward(db, claim, `milestone:${claim.referrerId}:${claim.referrerClientId}:${milestone}`, "milestone", referralProgram.milestoneCreditCents);
    }
    audit(db, claim.id, actor, "qualified", { proof: input.proof, programVersion: referralProgram.version, points: referralProgram.pointsPerReferral });
  }, true);
}
export function rejectReferral(raw: unknown, actor: string) {
  const input = z.object({ claimId: z.uuid(), reason: z.string().trim().min(3).max(300) }).strict().parse(raw);
  return workspaceDatabase(db => {
    init(db); const claim = db.prepare("SELECT status FROM driver_referrals WHERE id=?").get(input.claimId) as { status: string } | undefined;
    if (!claim || claim.status !== "pending") throw new DriverError(409, "Only a pending referral can be rejected. Earned rewards require an audited adjustment.");
    db.prepare("UPDATE driver_referrals SET status='rejected',proof=? WHERE id=?").run(input.reason, input.claimId);
    audit(db, input.claimId, actor, "rejected", { reason: input.reason });
  }, true);
}
export function fulfillReferralReward(raw: unknown, actor: string) {
  const input = z.object({ rewardId: z.uuid(), reference: z.string().trim().min(3).max(240) }).strict().parse(raw);
  return workspaceDatabase(db => {
    init(db); const reward = db.prepare("SELECT * FROM driver_referral_rewards WHERE id=?").get(input.rewardId) as Reward | undefined;
    if (!reward) throw new DriverError(404, "Reward unavailable.");
    if (reward.status === "fulfilled" && reward.reference === input.reference) return;
    if (reward.status !== "requested") throw new DriverError(409, "Only a requested reward can be marked fulfilled.");
    db.prepare("UPDATE driver_referral_rewards SET status='fulfilled',fulfilledAt=?,reference=? WHERE id=?").run(new Date().toISOString(), input.reference, input.rewardId);
    audit(db, input.rewardId, actor, "fulfilled", { method: reward.method, amountCents: reward.amountCents, reference: input.reference });
  }, true);
}
/** Staff-only projection; never expose referred clients' identities to the referrer. */
export function staffReferralLedger() {
  return workspaceDatabase(db => {
    init(db);
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_accounts'").get()) return { claims: [], rewards: [] };
    const claims = db.prepare(`SELECT r.*,a.name AS referrerName,b.name AS referredName FROM driver_referrals r
      LEFT JOIN customer_accounts a ON a.id=r.referrerId LEFT JOIN customer_accounts b ON b.id=r.referredId ORDER BY r.createdAt DESC`).all();
    const rewards = db.prepare(`SELECT r.*,a.name AS clientName FROM driver_referral_rewards r LEFT JOIN customer_accounts a ON a.id=r.accountId ORDER BY r.createdAt DESC`).all();
    return { claims: claims as unknown as (Claim & { referrerName: string; referredName: string })[], rewards: rewards as unknown as (Reward & { clientName: string })[] };
  });
}
