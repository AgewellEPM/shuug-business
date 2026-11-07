import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { listCustomerAccounts } from "../customer-access/accounts";
import { clientTaxSummary } from "../customer-access/tax";
import { driverAccount, driverAvailable } from "../rideshare-driver/policy";
import { driverRecord, DriverError, type DriverRecord } from "../rideshare-driver/model";
import { initDriver } from "../rideshare-driver/store";
import { workspaceDatabase } from "../workspace/database";
import { readReputation } from "../driver-reputation/store";
import { isReputationQuestion, reputationAnswer } from "../driver-reputation/guide";
import { analyzeCoach, coachMilestones } from "./analysis";
import { answerCoach } from "./answers";
import { attestFinancialFacts, peelCoachAvailable } from "./peel";
import { coachMutation, coachPeriod, intakeSchema, preferencesSchema, type CoachIntake, type CoachMessage,
  type CoachPreferences, type CoachState } from "./model";

type Identity = { id: string; clientId: string };
type Profile = { preferences: CoachPreferences; intake: CoachIntake };
type StoredProfile = { preferences: string; intake: string };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX_MESSAGES = 2000;
export function initCoach(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS driver_coach_profiles (
    accountId TEXT NOT NULL, clientId TEXT NOT NULL, preferences TEXT NOT NULL CHECK(json_valid(preferences)),
    intake TEXT NOT NULL CHECK(json_valid(intake)), updatedAt TEXT NOT NULL, PRIMARY KEY(accountId,clientId));
    CREATE TABLE IF NOT EXISTS driver_coach_messages (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, accountId TEXT NOT NULL, clientId TEXT NOT NULL,
      id TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), UNIQUE(accountId,clientId,id));
    CREATE INDEX IF NOT EXISTS driver_coach_messages_scope ON driver_coach_messages(accountId,clientId,sequence);
    CREATE TABLE IF NOT EXISTS driver_coach_mutations (
      accountId TEXT NOT NULL, clientId TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL,
      createdAt TEXT NOT NULL, PRIMARY KEY(accountId,clientId,id));`);
}
function profile(db: DatabaseSync, account: Identity): Profile {
  const row = db.prepare("SELECT preferences,intake FROM driver_coach_profiles WHERE accountId=? AND clientId=?")
    .get(account.id, account.clientId) as StoredProfile | undefined;
  return row ? { preferences: preferencesSchema.parse(JSON.parse(row.preferences)), intake: intakeSchema.parse(JSON.parse(row.intake)) }
    : { preferences: {}, intake: {} };
}
function messages(db: DatabaseSync, account: Identity): CoachMessage[] {
  const rows = db.prepare("SELECT body FROM driver_coach_messages WHERE accountId=? AND clientId=? ORDER BY sequence DESC LIMIT 100")
    .all(account.id, account.clientId) as { body: string }[];
  return rows.reverse().map(row => JSON.parse(row.body) as CoachMessage);
}
function recordVersion(db: DatabaseSync, account: Identity) {
  return (db.prepare("SELECT coalesce(max(sequence),0) AS sequence FROM driver_records WHERE accountId=? AND clientId=?")
    .get(account.id, account.clientId) as { sequence: number }).sequence;
}
function sameAccount(db: DatabaseSync, token: string | undefined, expected: Identity) {
  const current = driverAccount(db, token);
  if (current.id !== expected.id || current.clientId !== expected.clientId) throw new DriverError(403, "Your client account changed. Sign in again.");
  return current;
}
function context(token: string | undefined) {
  return workspaceDatabase(db => {
    const account = driverAccount(db, token); initCoach(db); initDriver(db);
    const rows = db.prepare("SELECT body FROM driver_records WHERE accountId=? AND clientId=? AND json_extract(body,'$.deleted')=0 ORDER BY sequence")
      .all(account.id, account.clientId) as { body: string }[];
    return { account, profile: profile(db, account), records: rows.map(row => driverRecord.parse(JSON.parse(row.body))) as DriverRecord[],
      messages: messages(db, account), recordVersion: recordVersion(db, account) };
  });
}
export function readCoach(token: string | undefined, dates: { from?: unknown; through?: unknown } = {}): CoachState {
  const period = coachPeriod(dates), snapshot = context(token);
  const tax = clientTaxSummary(snapshot.account.clientId, token);
  const analysis = analyzeCoach(snapshot.records, snapshot.profile.preferences, period);
  workspaceDatabase(db => sameAccount(db, token, snapshot.account));
  return { apiVersion: 1, messages: snapshot.messages, ...snapshot.profile,
    milestones: coachMilestones(analysis, snapshot.profile.preferences, snapshot.profile.intake, tax),
    // GET performs no availability probe. Historical verification stays attached to its reply.
    engine: { mode: "record-rules", peelAvailable: false, llmAvailable: false } };
}
function previousMutation(db: DatabaseSync, account: Identity, id: string, expectedDigest: string) {
  const prior = db.prepare("SELECT digest FROM driver_coach_mutations WHERE accountId=? AND clientId=? AND id=?")
    .get(account.id, account.clientId, id) as { digest: string } | undefined;
  if (prior && prior.digest !== expectedDigest) throw new DriverError(409, "This coach operation was already used for different data. Keep the original message and retry it unchanged.");
  return Boolean(prior);
}
export async function updateCoach(token: string | undefined, raw: unknown): Promise<CoachState> {
  const command = coachMutation.parse(raw), period = coachPeriod(command), inputDigest = digest(command), snapshot = context(token);
  const account = snapshot.account;
  const duplicate = workspaceDatabase(db => { sameAccount(db, token, account); return previousMutation(db, account, command.mutationId, inputDigest); });
  if (duplicate) return readCoach(token, period);
  const preferences = command.action === "intake" ? snapshot.profile.preferences : command.preferences ?? snapshot.profile.preferences;
  // Confirmed phone and browser forms submit a full snapshot; omitted fields explicitly become unknown.
  const intake = command.action === "intake" ? command.answers : snapshot.profile.intake;
  const analysis = analyzeCoach(snapshot.records, preferences, period);
  let verified = false;
  // The optional adapter sends numerical rows only. No conversation, documents or taxpayer facts leave this service.
  const reputationQuestion = command.action === "message" && isReputationQuestion(command.text);
  if (command.action === "message" && !reputationQuestion && peelCoachAvailable() && analysis.priced.length > 0 && analysis.priced.length <= 5000) {
    try {
      const receipt = await attestFinancialFacts({ rows: analysis.priced.map(job => ({ id: job.id, grossCents: job.grossCents!,
        feesCents: job.feesCents!, vehicleCents: job.vehicleCents!, netCents: job.netCents! })), unpricedCount: analysis.jobs.length - analysis.priced.length });
      verified = receipt.available && receipt.verified && receipt.totals?.grossCents === analysis.grossCents
        && receipt.totals.feesCents === analysis.feesCents && receipt.totals.vehicleCents === analysis.vehicleCents
        && receipt.totals.netCents === analysis.netCents && receipt.totals.pricedCount === analysis.priced.length;
    } catch { /* Optional verification cannot turn a recorded-data answer into a provider dependency. */ }
  }
  // Access and shared tax visibility are checked after the optional asynchronous operation.
  workspaceDatabase(db => sameAccount(db, token, account));
  const tax = clientTaxSummary(account.clientId, token), milestones = coachMilestones(analysis, preferences, intake, tax);
  const answer = command.action === "message" ? reputationQuestion ? reputationAnswer(readReputation(token), command.text) : answerCoach(command.text, analysis, preferences, intake, milestones, tax)
    : { text: command.action === "intake" ? "Your explicitly confirmed tax context is saved with this client account. Your preparer still needs to review it; no filing or tax treatment was changed."
      : "Your operating cost and goals are saved with this client account. Future profit estimates use this explicit snapshot; it is not a tax mileage rate.", sources: [], recordIds: [] };
  const createdAt = new Date().toISOString();
  const reply: CoachMessage = { id: randomUUID(), role: "assistant", text: answer.text + (verified ? "\n\nConnected Peel verified the priced-job arithmetic. The explanation uses recorded-data rules." : ""),
    createdAt, engine: verified ? "record-rules · Peel-verified arithmetic" : "record-rules", sources: answer.sources, recordIds: answer.recordIds };
  workspaceDatabase(db => {
    sameAccount(db, token, account); initCoach(db);
    if (previousMutation(db, account, command.mutationId, inputDigest)) return;
    if (digest(profile(db, account)) !== digest(snapshot.profile)) throw new DriverError(409, "Your saved goals or tax context changed while the coach was answering. Retry your saved message to use the latest information.");
    if (recordVersion(db, account) !== snapshot.recordVersion) throw new DriverError(409, "Your records changed while the coach was answering. Retry your saved message to use the latest records.");
    if (command.action === "message" && db.prepare("SELECT id FROM driver_coach_messages WHERE accountId=? AND clientId=? AND id=?")
      .get(account.id, account.clientId, command.messageId)) throw new DriverError(409, "That message ID already belongs to another operation. Keep the original message and retry its operation ID.");
    const count = (db.prepare("SELECT count(*) AS n FROM driver_coach_messages WHERE accountId=? AND clientId=?").get(account.id, account.clientId) as { n: number }).n;
    if (count + (command.action === "message" ? 2 : 1) > MAX_MESSAGES) throw new DriverError(413, "This conversation has reached its storage capacity. Existing history is preserved. Contact your firm before adding more messages.");
    db.prepare(`INSERT INTO driver_coach_profiles VALUES(?,?,?,?,?) ON CONFLICT(accountId,clientId) DO UPDATE SET preferences=excluded.preferences,intake=excluded.intake,updatedAt=excluded.updatedAt`)
      .run(account.id, account.clientId, JSON.stringify(preferences), JSON.stringify(intake), createdAt);
    const append = (message: CoachMessage) => db.prepare("INSERT INTO driver_coach_messages(accountId,clientId,id,body) VALUES(?,?,?,?)")
      .run(account.id, account.clientId, message.id, JSON.stringify(message));
    if (command.action === "message") append({ id: command.messageId, role: "user", text: command.text, createdAt });
    append(reply);
    db.prepare("INSERT INTO driver_coach_mutations VALUES(?,?,?,?,?)").run(account.id, account.clientId, command.mutationId, inputDigest, createdAt);
  }, true);
  const result = readCoach(token, period);
  result.engine.peelAvailable = verified;
  return result;
}
/** Staff callers must require BOTH Money-view and Services-view before using this projection. */
export function staffCoachThreads() {
  if (!driverAvailable()) throw new DriverError(404, "Driver coaching is unavailable.");
  const accounts = listCustomerAccounts().filter(row => row.status === "active" && row.clientId);
  return workspaceDatabase(db => {
    initCoach(db);
    return accounts.flatMap(account => {
      const client = db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(account.clientId!) as { body: string } | undefined;
      if (!client || ["inactive", "archived", "cancelled"].includes(JSON.parse(client.body).status)) return [];
      const scoped = { id: account.id, clientId: account.clientId! }, history = messages(db, scoped);
      return history.length ? [{ accountId: account.id, clientId: account.clientId!, name: account.name, ...profile(db, scoped), messages: history }] : [];
    });
  });
}
