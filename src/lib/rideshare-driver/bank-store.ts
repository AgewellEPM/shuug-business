import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { openSecret, sealSecret } from "../connections/vault";
import { driverAccount } from "./policy";
import { DriverError } from "./model";
import { accountsReply, bankConfiguration, BankProviderError, plaid, syncReply, type ProviderTransaction } from "./bank-provider";
import { assertPlaintextTaxAllowed, secureTaxRequired, SECURE_TAX_REQUIRED_MESSAGE } from "../secure-tax/policy";

type Item = { id: string; accountId: string; clientId: string; providerItem: string; secret: string; label: string; cursor: string; lastSync: string | null; lastAttempt: number; leaseUntil: number; connected: number; error: string | null; environment: string };
type InboxTransaction = { id: string; provider: string; accountLabel: string; date: string; merchant: string; amountCents: number; currency: string; pending: boolean; removed: boolean; isTestData: boolean };
function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS driver_bank_items (
    id TEXT PRIMARY KEY, accountId TEXT NOT NULL, clientId TEXT NOT NULL, providerItem TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL, label TEXT NOT NULL, cursor TEXT NOT NULL DEFAULT '', lastSync TEXT,
    lastAttempt INTEGER NOT NULL DEFAULT 0, leaseUntil INTEGER NOT NULL DEFAULT 0, connected INTEGER NOT NULL DEFAULT 1, error TEXT, environment TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS driver_bank_links (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, clientId TEXT NOT NULL, at INTEGER NOT NULL, itemId TEXT, updating TEXT);
    CREATE TABLE IF NOT EXISTS driver_bank_transactions (id TEXT PRIMARY KEY, itemId TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), sequence INTEGER NOT NULL UNIQUE);
    CREATE INDEX IF NOT EXISTS driver_bank_transactions_item ON driver_bank_transactions(itemId,sequence);
    CREATE TABLE IF NOT EXISTS driver_bank_clock (id INTEGER PRIMARY KEY CHECK(id=1), sequence INTEGER NOT NULL);
    INSERT OR IGNORE INTO driver_bank_clock VALUES(1,0);
    CREATE TABLE IF NOT EXISTS driver_bank_revocations (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, clientId TEXT NOT NULL,
      configuration TEXT NOT NULL, accessSecret TEXT NOT NULL, createdAt TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);`);
  const columns = new Set((db.prepare("PRAGMA table_info(driver_bank_links)").all() as { name: string }[]).map(row => row.name));
  if (!columns.has("platform")) db.exec("ALTER TABLE driver_bank_links ADD COLUMN platform TEXT");
  if (!columns.has("configuration")) db.exec("ALTER TABLE driver_bank_links ADD COLUMN configuration TEXT");
}
const configurationKey = (platform: "ios" | "android") => {
  const config = bankConfiguration(platform);
  return createHash("sha256").update(JSON.stringify([config.environment, config.clientId, config.secret, config.redirect, config.androidPackage, platform])).digest("hex");
};
function context(token: string | undefined, plaintext = false) {
  return workspaceDatabase(db => { const account = driverAccount(db, token); if (plaintext) assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db); init(db); return account; });
}
function ownedItem(db: DatabaseSync, token: string | undefined, id: string) {
  const account = driverAccount(db, token); init(db);
  const item = db.prepare("SELECT * FROM driver_bank_items WHERE id=? AND accountId=? AND clientId=?").get(id, account.id, account.clientId) as Item | undefined;
  if (!item) throw new DriverError(404, "Bank connection unavailable.");
  return item;
}
export function bankStatus(token: string | undefined, platform: "ios" | "android" = "ios") {
  const config = bankConfiguration(platform);
  return workspaceDatabase(db => {
    const account = driverAccount(db, token); init(db);
    const items = db.prepare("SELECT id,label,lastSync,error,connected,environment FROM driver_bank_items WHERE accountId=? AND clientId=? ORDER BY label").all(account.id, account.clientId);
    const secure = secureTaxRequired({ accountId: account.id, clientId: account.clientId }, db);
    return { ready: config.ready && !secure, environment: config.environment, reason: secure ? SECURE_TAX_REQUIRED_MESSAGE : config.reason, secureTaxRequired: secure, items };
  });
}
export async function createBankLink(token: string | undefined, raw: unknown) {
  const input = z.object({ itemId: z.uuid().optional(), platform: z.enum(["ios", "android"]).default("ios") }).strict().parse(raw);
  const config = bankConfiguration(input.platform); const account = context(token, true);
  if (!config.ready) throw new DriverError(503, config.reason);
  const id = randomUUID();
  const configuration = configurationKey(input.platform);
  const item = workspaceDatabase(db => {
    const current = driverAccount(db, token);
    assertPlaintextTaxAllowed({ accountId: current.id, clientId: current.clientId }, db);
    init(db);
    const recent = db.prepare("SELECT count(*) AS n FROM driver_bank_links WHERE accountId=? AND at>?").get(account.id, Date.now()-600_000) as { n: number };
    if (recent.n >= 5) throw new DriverError(429, "Wait a few minutes before opening another bank connection.");
    const count = db.prepare("SELECT count(*) AS n FROM driver_bank_items WHERE accountId=? AND connected=1").get(account.id) as { n: number };
    if (!input.itemId && count.n >= 20) throw new DriverError(422, "Disconnect an unused bank before adding another.");
    const item = input.itemId ? ownedItem(db, token, input.itemId) : undefined;
    if (item && (!item.connected || item.environment !== config.environment)) throw new DriverError(409, "This bank connection cannot be updated in the current provider environment.");
    db.prepare("INSERT INTO driver_bank_links(id,accountId,clientId,at,updating,platform,configuration) VALUES(?,?,?,?,?,?,?)").run(id, account.id, account.clientId, Date.now(), input.itemId ?? null, input.platform, configuration);
    db.prepare("DELETE FROM driver_bank_links WHERE at<?").run(Date.now()-86400_000);
    return item;
  }, true);
  try {
    const reply = await plaid("/link/token/create", {
    client_name: "Gig Tax Pros", language: "en", country_codes: ["US"], user: { client_user_id: account.id },
    ...(input.platform === "android" ? { android_package_name: config.androidPackage } : { redirect_uri: config.redirect }),
    ...(item ? { access_token: openSecret(item.secret) } : { products: ["transactions"], transactions: { days_requested: 90 } }),
  }, z.object({ link_token: z.string(), expiration: z.string() }));
    const current = context(token, true);
    if (current.id !== account.id || current.clientId !== account.clientId) throw new DriverError(403, "Client access changed.");
    if (configuration !== configurationKey(input.platform)) throw new DriverError(409, "The bank provider setup changed. Open bank linking again.");
    return { linkToken: reply.link_token, sessionId: id, environment: config.environment, redirectUri: config.redirect };
  } catch (error) {
    // No bank authorization exists at this stage. An unreachable session ID
    // must not lock the owner out of correcting invalid provider credentials.
    workspaceDatabase(db => {
      init(db);
      db.prepare("DELETE FROM driver_bank_links WHERE id=? AND accountId=? AND clientId=? AND itemId IS NULL").run(id, account.id, account.clientId);
    }, true);
    throw error;
  }
}
export async function exchangeBankLink(token: string | undefined, raw: unknown) {
  const input = z.object({ sessionId: z.uuid(), publicToken: z.string().max(1000) }).strict().parse(raw);
  const account = context(token, true);
  const link = workspaceDatabase(db => db.prepare("SELECT * FROM driver_bank_links WHERE id=? AND accountId=? AND clientId=? AND at>?")
    .get(input.sessionId, account.id, account.clientId, Date.now()-4*3600_000)) as { itemId: string | null; updating: string | null; platform: "ios" | "android" | null; configuration: string | null } | undefined;
  if (!link) throw new DriverError(400, "This connection session expired. Open bank linking again.");
  if (link.itemId) return { itemId: link.itemId };
  if (!link.platform || link.configuration !== configurationKey(link.platform)) throw new DriverError(409, "The bank provider setup changed. Open bank linking again.");
  const providerConfiguration = bankConfiguration(link.platform);
  if (link.updating) {
    workspaceDatabase(db => {
      const item = ownedItem(db, token, link.updating!);
      assertPlaintextTaxAllowed({ accountId: item.accountId, clientId: item.clientId }, db);
      db.prepare("UPDATE driver_bank_items SET error=NULL WHERE id=?").run(item.id);
      db.prepare("UPDATE driver_bank_links SET itemId=? WHERE id=?").run(item.id, input.sessionId);
    }, true);
    return { itemId: link.updating };
  }
  if (!input.publicToken) throw new DriverError(400, "The bank did not return a connection token.");
  const reply = await plaid("/item/public_token/exchange", { public_token: input.publicToken }, z.object({ access_token: z.string(), item_id: z.string() }), providerConfiguration);
  let committed = false;
  try {
    const id = workspaceDatabase(db => {
      const current = driverAccount(db, token);
      assertPlaintextTaxAllowed({ accountId: current.id, clientId: current.clientId }, db);
      init(db);
      if (current.id !== account.id || current.clientId !== account.clientId) throw new DriverError(403, "Client access changed.");
      if (link.configuration !== configurationKey(link.platform!)) throw new DriverError(409, "The bank provider setup changed. Open bank linking again.");
      const pending = db.prepare("SELECT 1 FROM driver_bank_links WHERE id=? AND accountId=? AND clientId=? AND itemId IS NULL AND at>?").get(input.sessionId, current.id, current.clientId, Date.now()-4*3600_000);
      if (!pending) throw new DriverError(409, "This bank connection was canceled or changed. Open bank linking again.");
      const existing = db.prepare("SELECT * FROM driver_bank_items WHERE providerItem=?").get(reply.item_id) as Item | undefined;
      if (existing && (existing.accountId !== current.id || existing.clientId !== current.clientId)) throw new DriverError(403, "This bank belongs to a different client connection.");
      const id = existing?.id ?? randomUUID();
      db.prepare(`INSERT INTO driver_bank_items(id,accountId,clientId,providerItem,secret,label,environment) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,connected=1,error=NULL`).run(id, current.id, current.clientId, reply.item_id,
          sealSecret(reply.access_token), "Connected bank", bankConfiguration().environment);
      db.prepare("UPDATE driver_bank_links SET itemId=? WHERE id=?").run(id, input.sessionId);
      return id;
    }, true);
    committed = true; return { itemId: id };
  } finally {
    // A failed local save must not leave an inaccessible subscribed Item behind.
    if (!committed) {
      try { await plaid("/item/remove", { access_token: reply.access_token }, z.object({}), providerConfiguration); }
      catch {
        // Preserve failed cleanup with its original encrypted credentials so
        // the owner can retry revocation even after provider settings change.
        workspaceDatabase(db => { init(db); db.prepare("INSERT INTO driver_bank_revocations VALUES(?,?,?,?,?,?,0)").run(randomUUID(), account.id, account.clientId,
          sealSecret(JSON.stringify(providerConfiguration)), sealSecret(reply.access_token), new Date().toISOString()); }, true);
      }
    }
  }
}
export function cancelBankLink(token: string | undefined, id: string) {
  z.uuid().parse(id);
  workspaceDatabase(db => {
    const account = driverAccount(db, token); init(db);
    db.prepare("DELETE FROM driver_bank_links WHERE id=? AND accountId=? AND clientId=? AND itemId IS NULL").run(id, account.id, account.clientId);
  }, true);
}
/** Owner-only settings actions call this to recover failed provider cleanup. */
export async function retryBankRevocations() {
  const pending = workspaceDatabase(db => { init(db); return db.prepare("SELECT id,configuration,accessSecret FROM driver_bank_revocations ORDER BY createdAt LIMIT 3").all() as { id: string; configuration: string; accessSecret: string }[]; });
  let revoked = 0;
  for (const row of pending) {
    try {
      const config = JSON.parse(openSecret(row.configuration)) as ReturnType<typeof bankConfiguration>;
      await plaid("/item/remove", { access_token: openSecret(row.accessSecret) }, z.object({}), config);
      workspaceDatabase(db => db.prepare("DELETE FROM driver_bank_revocations WHERE id=?").run(row.id), true); revoked++;
    } catch { workspaceDatabase(db => db.prepare("UPDATE driver_bank_revocations SET attempts=attempts+1 WHERE id=?").run(row.id), true); }
  }
  return { revoked, remaining: workspaceDatabase(db => Number((db.prepare("SELECT count(*) AS n FROM driver_bank_revocations").get() as { n: number }).n)) };
}
const transactionId = (item: string, providerId: string) => "plaid:" + createHash("sha256").update(item + "|" + providerId).digest("hex");
function normalize(item: Item, row: ProviderTransaction, accounts: Map<string, string>): InboxTransaction {
  const cents = Math.round(row.amount * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents - row.amount * 100) > 0.001) throw new BankProviderError("INVALID_AMOUNT");
  return { id: transactionId(item.id, row.transaction_id), provider: "plaid", accountLabel: accounts.get(row.account_id) ?? "Bank account",
    date: row.date, merchant: (row.merchant_name || row.name).slice(0,160), amountCents: cents,
    currency: row.iso_currency_code ?? "UNKNOWN", pending: row.pending, removed: false, isTestData: item.environment !== "production" };
}
function putTransaction(db: DatabaseSync, item: Item, row: InboxTransaction) {
  const previous = db.prepare("SELECT body FROM driver_bank_transactions WHERE id=?").get(row.id) as { body: string } | undefined;
  const body = JSON.stringify(row); if (previous?.body === body) return;
  db.prepare("UPDATE driver_bank_clock SET sequence=sequence+1 WHERE id=1").run();
  const sequence = (db.prepare("SELECT sequence FROM driver_bank_clock WHERE id=1").get() as { sequence: number }).sequence;
  db.prepare("INSERT INTO driver_bank_transactions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,sequence=excluded.sequence").run(row.id, item.id, body, sequence);
}
export async function syncBankItem(token: string | undefined, id: string) {
  z.uuid().parse(id);
  const start = Date.now();
  const item = workspaceDatabase(db => {
    const item = ownedItem(db, token, id);
    assertPlaintextTaxAllowed({ accountId: item.accountId, clientId: item.clientId }, db);
    if (!item.connected || item.environment !== bankConfiguration().environment) throw new DriverError(409, "This bank is disconnected or belongs to a different provider environment.");
    if (item.leaseUntil > start || start - item.lastAttempt < 60_000) return null;
    db.prepare("UPDATE driver_bank_items SET leaseUntil=?,lastAttempt=? WHERE id=?").run(start+180_000, start, id);
    return item;
  }, true);
  if (!item) return { synced: false };
  try {
    const access_token = openSecret(item.secret), accountResponse = await plaid("/accounts/get", { access_token }, accountsReply);
    context(token, true);
    const accounts = new Map(accountResponse.accounts.map(a => [a.account_id, (a.name + (a.mask ? " •" + a.mask : "")).slice(0,100)]));
    let cursor = item.cursor, changes: InboxTransaction[] = [], removed: string[] = [], complete = false;
    for (let attempt = 0; attempt < 3 && !complete; attempt++) {
      cursor = item.cursor; changes = []; removed = [];
      try {
        for (let page = 0; page < 100; page++) {
          if (Date.now()-start > 90_000) throw new BankProviderError("SYNC_TIMEOUT");
          context(token, true);
          const reply = await plaid("/transactions/sync", { access_token, ...(cursor ? { cursor } : {}), count: 500 }, syncReply);
          changes.push(...[...reply.added, ...reply.modified].map(row => normalize(item, row, accounts)));
          removed.push(...reply.removed.map(row => transactionId(item.id, row.transaction_id)));
          cursor = reply.next_cursor;
          if (changes.length + removed.length > 50_000) throw new BankProviderError("CAPACITY_REVIEW_REQUIRED");
          if (!reply.has_more) { complete = true; break; }
        }
      } catch (error) {
        if (!(error instanceof BankProviderError) || error.code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || attempt === 2) throw error;
      }
    }
    if (!complete) throw new BankProviderError("INCOMPLETE_SYNC");
    workspaceDatabase(db => {
      const current = ownedItem(db, token, id);
      assertPlaintextTaxAllowed({ accountId: current.accountId, clientId: current.clientId }, db);
      if (!current.connected || current.cursor !== item.cursor || current.lastAttempt !== start) throw new DriverError(409, "The bank changed during this update. Refresh again.");
      for (const row of changes) putTransaction(db, item, row);
      for (const removedId of removed) {
        const stored = db.prepare("SELECT body FROM driver_bank_transactions WHERE id=? AND itemId=?").get(removedId, id) as { body: string } | undefined;
        if (stored) putTransaction(db, item, { ...JSON.parse(stored.body), removed: true });
      }
      const count = db.prepare("SELECT count(*) AS n FROM driver_bank_transactions WHERE itemId=?").get(id) as { n: number };
      if (count.n > 100_000) throw new DriverError(413, "This bank inbox needs a capacity review.");
      const label = Array(accounts.values()).slice(0,3).join(", ").slice(0,240) || "Connected bank";
      db.prepare("UPDATE driver_bank_items SET cursor=?,lastSync=?,leaseUntil=0,error=NULL,label=? WHERE id=?")
        .run(cursor, new Date().toISOString(), label, id);
    }, true);
    return { synced: true };
  } catch (error) {
    workspaceDatabase(db => {
      init(db);
      db.prepare("UPDATE driver_bank_items SET leaseUntil=0,error=? WHERE id=? AND lastAttempt=?")
        .run(error instanceof BankProviderError && error.code === "ITEM_LOGIN_REQUIRED" ? "Reconnect this bank" : "Update unavailable; saved transactions kept", id, start);
    }, true);
    throw error;
  }
}
export function bankFeed(token: string | undefined, after: number) {
  if (!Number.isSafeInteger(after) || after < 0) throw new DriverError(400, "Invalid bank cursor.");
  return workspaceDatabase(db => {
    const account = driverAccount(db, token); init(db);
    const rows = db.prepare(`SELECT t.body,t.sequence FROM driver_bank_transactions t JOIN driver_bank_items i ON i.id=t.itemId
      WHERE i.accountId=? AND i.clientId=? AND t.sequence>? ORDER BY t.sequence LIMIT 501`).all(account.id, account.clientId, after) as { body: string; sequence: number }[];
    const page = rows.slice(0,500);
    return { transactions: page.map(row => JSON.parse(row.body)), cursor: page.at(-1)?.sequence ?? after, hasMore: rows.length > 500 };
  });
}
export async function disconnectBank(token: string | undefined, id: string) {
  z.uuid().parse(id);
  const item = workspaceDatabase(db => ownedItem(db, token, id));
  if (!item.connected) return;
  if (item.environment !== bankConfiguration().environment) throw new DriverError(409, "Restore this connection's provider environment before disconnecting it.");
  await plaid("/item/remove", { access_token: openSecret(item.secret) }, z.object({}));
  workspaceDatabase(db => {
    ownedItem(db, token, id);
    db.prepare("UPDATE driver_bank_items SET secret='',connected=0,error=NULL,leaseUntil=0 WHERE id=?").run(id);
  }, true);
}
export function validateBankReference(db: DatabaseSync, accountId: string, clientId: string, transactionId: string, alreadyLinked: boolean) {
  init(db);
  const row = db.prepare(`SELECT t.body,i.environment FROM driver_bank_transactions t JOIN driver_bank_items i ON i.id=t.itemId
    WHERE t.id=? AND i.accountId=? AND i.clientId=?`).get(transactionId, accountId, clientId) as { body: string; environment: string } | undefined;
  if (!row) throw new DriverError(422, "This bank transaction is unavailable for this client account.");
  const value = JSON.parse(row.body) as InboxTransaction;
  if (row.environment !== "production") throw new DriverError(422, "Sandbox bank data cannot be posted to a real journal.");
  if (!alreadyLinked && (value.pending || value.removed || value.currency !== "USD")) throw new DriverError(422, "Only posted, available USD transactions can be linked to a new record.");
}
