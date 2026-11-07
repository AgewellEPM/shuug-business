import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { sealSecret, openSecret } from "../connections/vault";
import { driverAccount } from "../rideshare-driver/policy";
import { UberError, type UberTokens, type UberProfile, type UberTrip, type UberPayment } from "./uber-provider";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";

export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type UberLink = { accountId: string; clientId: string; generation: string; status: "connected" | "disconnected" | "reauthorize"; driverId: string | null; profile: string | null; secrets: string | null; lastSyncAt: string | null; lastFrom: number | null; lastTo: number | null; leaseId: string | null; leaseUntil: number };
type Pending = { stateHash: string; accountId: string; clientId: string; sessionHash: string; sessionProof: string; generation: string; authClientId: string; native: number; expires: number };
export function initUber(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS gig_uber_links (
    accountId TEXT PRIMARY KEY, clientId TEXT NOT NULL, generation TEXT NOT NULL, status TEXT NOT NULL,
    driverId TEXT UNIQUE, profile TEXT, secrets TEXT, lastSyncAt TEXT, lastFrom INTEGER, lastTo INTEGER, leaseId TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS gig_uber_states (stateHash TEXT PRIMARY KEY, accountId TEXT NOT NULL, clientId TEXT NOT NULL, sessionHash TEXT NOT NULL, sessionProof TEXT NOT NULL, generation TEXT NOT NULL, authClientId TEXT NOT NULL, native INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS gig_uber_facts (accountId TEXT NOT NULL, clientId TEXT NOT NULL, driverId TEXT NOT NULL, kind TEXT NOT NULL, providerId TEXT NOT NULL, body TEXT NOT NULL, observedAt TEXT NOT NULL, paymentCurrency TEXT, paymentAmountCents INTEGER, PRIMARY KEY(accountId,kind,providerId));`);
  const columns = db.prepare("PRAGMA table_info(gig_uber_facts)").all() as unknown as { name: string }[];
  if (!columns.some(column => column.name === "paymentCurrency")) db.exec("ALTER TABLE gig_uber_facts ADD COLUMN paymentCurrency TEXT");
  if (!columns.some(column => column.name === "paymentAmountCents")) db.exec("ALTER TABLE gig_uber_facts ADD COLUMN paymentAmountCents INTEGER");
}
export function scopedUber(db: DatabaseSync, token: string | undefined) {
  const account = driverAccount(db, token); initUber(db);
  const link = db.prepare("SELECT * FROM gig_uber_links WHERE accountId=?").get(account.id) as UberLink | undefined;
  if (link && link.clientId !== account.clientId) throw new UberError(409, "Your client link changed. Contact the firm before using this connection.");
  return { account, link };
}
export function beginUberState(token: string | undefined, authClientId: string, native: boolean) {
  return workspaceDatabase(db => {
    const { account, link } = scopedUber(db, token), generation = randomUUID(), state = randomBytes(32).toString("hex");
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
    db.prepare("DELETE FROM gig_uber_states WHERE expires<=? OR accountId=?").run(Date.now(), account.id);
    if (link) db.prepare("UPDATE gig_uber_links SET generation=?,leaseId=NULL,leaseUntil=0 WHERE accountId=?").run(generation, account.id);
    else db.prepare("INSERT INTO gig_uber_links(accountId,clientId,generation,status) VALUES(?,?,?,'disconnected')").run(account.id, account.clientId, generation);
    db.prepare("INSERT INTO gig_uber_states VALUES(?,?,?,?,?,?,?,?,?)").run(tokenHash(state), account.id, account.clientId, tokenHash(token!), sealSecret(token!), generation, authClientId, native ? 1 : 0, Date.now() + 10 * 60_000);
    return state;
  }, true);
}
export function consumeUberState(state: string, currentToken: string | undefined, authClientId: string) {
  if (!/^[a-f0-9]{64}$/.test(state)) throw new UberError(400, "Uber connection expired or unavailable. Start the connection again.");
  return workspaceDatabase(db => {
    initUber(db);
    const pending = db.prepare("SELECT * FROM gig_uber_states WHERE stateHash=? AND expires>?").get(tokenHash(state), Date.now()) as Pending | undefined;
    if (!pending || pending.authClientId !== authClientId || (currentToken ? tokenHash(currentToken) !== pending.sessionHash : !pending.native)) throw new UberError(400, "Uber connection expired or the signed-in account changed. Start again from your own profile.");
    const token = openSecret(pending.sessionProof), { account, link } = scopedUber(db, token);
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
    if (!link || link.generation !== pending.generation || account.id !== pending.accountId || account.clientId !== pending.clientId) throw new UberError(400, "Your account or connection changed. Start the Uber connection again.");
    db.prepare("DELETE FROM gig_uber_states WHERE stateHash=?").run(pending.stateHash);
    return { token, accountId: account.id, clientId: account.clientId, generation: pending.generation };
  }, true);
}
export function recheckUber(token: string, generation: string) {
  return workspaceDatabase(db => {
    const scope = scopedUber(db, token);
    assertPlaintextTaxAllowed({ accountId: scope.account.id, clientId: scope.account.clientId }, db);
    if (!scope.link || scope.link.generation !== generation) throw new UberError(409, "Your connection changed. No provider records were imported.");
    return scope;
  });
}
export function connectUberScope(context: ReturnType<typeof consumeUberState>, profile: UberProfile, tokens: UberTokens) {
  workspaceDatabase(db => {
    const { account, link } = scopedUber(db, context.token);
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
    if (!link || link.generation !== context.generation || account.id !== context.accountId || account.clientId !== context.clientId) throw new UberError(409, "Your account or connection changed. Reconnect from your profile.");
    if (link.driverId && link.driverId !== profile.driver_id) throw new UberError(409, "This profile is linked to a different Uber driver. Contact the firm before changing the linked driver.");
    const other = db.prepare("SELECT accountId FROM gig_uber_links WHERE driverId=? AND accountId<>?").get(profile.driver_id, account.id);
    if (other) throw new UberError(409, "This Uber driver is already linked to another client profile. Contact the firm to review the link.");
    db.prepare("UPDATE gig_uber_links SET status='connected',driverId=?,profile=?,secrets=?,leaseId=NULL,leaseUntil=0 WHERE accountId=?").run(profile.driver_id, sealSecret(JSON.stringify(profile)), sealSecret(JSON.stringify(tokens)), account.id);
  }, true);
}
export function claimUberSync(token: string) {
  return workspaceDatabase(db => {
    const { account, link } = scopedUber(db, token);
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
    if (!link || link.status !== "connected" || !link.driverId || !link.secrets) throw new UberError(409, "Connect your Uber driver account before syncing.");
    if (link.leaseUntil > Date.now()) throw new UberError(409, "An Uber sync is already running. Wait for it to finish.");
    const leaseId = randomUUID(); db.prepare("UPDATE gig_uber_links SET leaseId=?,leaseUntil=? WHERE accountId=?").run(leaseId, Date.now() + 120_000, account.id);
    return { ...link, leaseId, tokens: JSON.parse(openSecret(link.secrets)) as UberTokens };
  }, true);
}
export function saveRefreshedUberTokens(token: string, link: UberLink, tokens: UberTokens) {
  workspaceDatabase(db => {
    const { account, link: current } = scopedUber(db, token);
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
    if (!current || current.generation !== link.generation || current.leaseId !== link.leaseId) throw new UberError(409, "The Uber connection changed during sync.");
    db.prepare("UPDATE gig_uber_links SET secrets=? WHERE accountId=?").run(sealSecret(JSON.stringify(tokens)), account.id);
  }, true);
}
export function commitUberFacts(token: string, link: UberLink, profile: UberProfile, facts: { trips: UberTrip[]; payments: UberPayment[] }, from: number, to: number) {
  workspaceDatabase(db => {
    const { account, link: current } = scopedUber(db, token);
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
    if (!current || current.generation !== link.generation || current.leaseId !== link.leaseId || current.driverId !== profile.driver_id) throw new UberError(409, "Your Uber connection changed. No provider records were imported.");
    const existing = db.prepare("SELECT kind,providerId FROM gig_uber_facts WHERE accountId=?").all(account.id) as unknown as { kind: string; providerId: string }[];
    const identities = new Set(existing.map(row => `${row.kind}:${row.providerId}`));
    for (const fact of facts.trips) identities.add(`trips:${fact.trip_id}`);
    for (const fact of facts.payments) identities.add(`payments:${fact.payment_id}`);
    if (identities.size > 100_000) throw new UberError(409, "Your imported provider history needs a capacity review. No records were added.");
    const observedAt = new Date().toISOString();
    for (const kind of ["trips", "payments"] as const) for (const fact of facts[kind]) {
      const id = "trip_id" in fact && kind === "trips" ? (fact as UberTrip).trip_id : (fact as UberPayment).payment_id;
      const payment = kind === "payments" ? fact as UberPayment : null;
      const cents = payment?.currency_code === "USD" && Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) < 0.000001 ? Math.round(payment.amount * 100) : null;
      db.prepare("INSERT INTO gig_uber_facts VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(accountId,kind,providerId) DO UPDATE SET body=excluded.body,observedAt=excluded.observedAt,paymentCurrency=excluded.paymentCurrency,paymentAmountCents=excluded.paymentAmountCents").run(account.id, account.clientId, profile.driver_id, kind, id, sealSecret(JSON.stringify(fact)), observedAt, payment?.currency_code ?? null, cents);
    }
    db.prepare("UPDATE gig_uber_links SET profile=?,lastSyncAt=?,lastFrom=?,lastTo=? WHERE accountId=?").run(sealSecret(JSON.stringify(profile)), observedAt, from, to, account.id);
  }, true);
}
export function releaseUberSync(accountId: string, generation: string, leaseId: string, invalidAuthorization: boolean) {
  workspaceDatabase(db => {
    initUber(db);
    if (invalidAuthorization) db.prepare("UPDATE gig_uber_links SET status='reauthorize',secrets=NULL WHERE accountId=? AND generation=? AND leaseId=?").run(accountId, generation, leaseId);
    db.prepare("UPDATE gig_uber_links SET leaseId=NULL,leaseUntil=0 WHERE accountId=? AND generation=? AND leaseId=?").run(accountId, generation, leaseId);
  }, true);
}
export function detachUber(token: string) {
  return workspaceDatabase(db => {
    const { account, link } = scopedUber(db, token);
    const tokens = link?.secrets ? JSON.parse(openSecret(link.secrets)) as UberTokens : undefined;
    db.prepare("DELETE FROM gig_uber_states WHERE accountId=?").run(account.id);
    db.prepare("UPDATE gig_uber_links SET status='disconnected',generation=?,secrets=NULL,leaseId=NULL,leaseUntil=0 WHERE accountId=?").run(randomUUID(), account.id);
    return tokens;
  }, true);
}
