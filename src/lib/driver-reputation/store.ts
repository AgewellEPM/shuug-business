import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount, driverAvailable } from "../rideshare-driver/policy";
import { DriverError } from "../rideshare-driver/model";
import { listCustomerAccounts } from "../customer-access/accounts";
import { ratingSchema, reputationMutation, reviewSchema, type ReputationState } from "./model";

type Scope = { id: string; clientId: string };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function initReputation(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS driver_reputation (
    accountId TEXT NOT NULL, clientId TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('rating','review')),
    id TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), digest TEXT NOT NULL,
    PRIMARY KEY(accountId,clientId,kind,id));
    CREATE TABLE IF NOT EXISTS driver_reputation_mutations (
      accountId TEXT NOT NULL, clientId TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL,
      PRIMARY KEY(accountId,clientId,id));`);
}
function state(db: DatabaseSync, account: Scope): ReputationState {
  const rows = db.prepare("SELECT kind,body FROM driver_reputation WHERE accountId=? AND clientId=? ORDER BY json_extract(body,'$.recordedAt'),id")
    .all(account.id, account.clientId) as { kind: string; body: string }[];
  return { apiVersion: 1, ratings: rows.filter(row => row.kind === "rating").map(row => ratingSchema.parse(JSON.parse(row.body))),
    reviews: rows.filter(row => row.kind === "review").map(row => reviewSchema.parse(JSON.parse(row.body))) };
}
export function readReputation(token: string | undefined) {
  return workspaceDatabase(db => { const account = driverAccount(db, token); initReputation(db); return state(db, account); });
}
export function updateReputation(token: string | undefined, raw: unknown): ReputationState {
  const command = reputationMutation.parse(raw), operationDigest = digest(command);
  return workspaceDatabase(db => {
    const account = driverAccount(db, token); initReputation(db);
    const prior = db.prepare("SELECT digest FROM driver_reputation_mutations WHERE accountId=? AND clientId=? AND id=?")
      .get(account.id, account.clientId, command.mutationId) as { digest: string } | undefined;
    if (prior) {
      if (prior.digest !== operationDigest) throw new DriverError(409, "This reputation operation was already used for different data. Retry its original content unchanged.");
      return { ...state(db, account), acknowledgedMutationId: command.mutationId };
    }
    const add = command.action === "addRating" || command.action === "addReview";
    const kind = command.action === "addRating" || command.action === "deleteRating" ? "rating" : "review";
    const payload = command.action === "addRating" ? command.rating : command.action === "addReview" ? command.review : undefined;
    const id = payload?.id ?? (command as { id: string }).id;
    const existing = db.prepare("SELECT body,digest FROM driver_reputation WHERE accountId=? AND clientId=? AND kind=? AND id=?")
      .get(account.id, account.clientId, kind, id) as { body: string; digest: string } | undefined;
    if (add) {
      const contentDigest = digest(payload);
      if (existing && (existing.digest !== contentDigest || JSON.parse(existing.body).deleted)) throw new DriverError(409, "This saved record ID cannot be changed or restored. Add a new rating snapshot or review instead.");
      if (!existing) {
        const count = (db.prepare("SELECT count(*) AS n FROM driver_reputation WHERE accountId=? AND clientId=? AND kind=?")
          .get(account.id, account.clientId, kind) as { n: number }).n;
        if (count >= 500) throw new DriverError(413, "This account has reached its 500-record capacity for this type. Saved history and deletion markers are preserved. Contact your firm before adding more.");
        db.prepare("INSERT INTO driver_reputation VALUES(?,?,?,?,?,?)").run(account.id, account.clientId, kind, id, JSON.stringify(payload), contentDigest);
      }
    } else {
      if (!existing) throw new DriverError(404, "That reputation record is unavailable. Sync its original addition before deleting it.");
      const row = JSON.parse(existing.body);
      if (!row.deleted) db.prepare("UPDATE driver_reputation SET body=? WHERE accountId=? AND clientId=? AND kind=? AND id=?")
        .run(JSON.stringify({ ...row, deleted: true }), account.id, account.clientId, kind, id);
    }
    db.prepare("INSERT INTO driver_reputation_mutations VALUES(?,?,?,?)").run(account.id, account.clientId, command.mutationId, operationDigest);
    return { ...state(db, account), acknowledgedMutationId: command.mutationId };
  }, true);
}
/** Staff route must enforce Services-view before calling this account-scoped projection. */
export function staffReputation() {
  if (!driverAvailable()) throw new DriverError(404, "Driver reputation is unavailable.");
  const accounts = listCustomerAccounts().filter(row => row.status === "active" && row.clientId);
  return workspaceDatabase(db => {
    initReputation(db);
    return accounts.flatMap(account => {
      const client = db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(account.clientId!) as { body: string } | undefined;
      if (!client || ["inactive", "archived", "cancelled"].includes(JSON.parse(client.body).status)) return [];
      const data = state(db, { id: account.id, clientId: account.clientId! });
      return data.ratings.length || data.reviews.length ? [{ accountId: account.id, name: account.name, state: data }] : [];
    });
  });
}
