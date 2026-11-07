import { openSecret } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { UberError, uberConfiguration, requireUberConfiguration, UBER_DRIVER_SCOPES, exchangeUberToken, uberGetProfile, uberFacts, revokeUberToken, uberProfileSchema, uberTripSchema, uberPaymentSchema } from "./uber-provider";
import { scopedUber, beginUberState, consumeUberState, recheckUber, connectUberScope, claimUberSync, saveRefreshedUberTokens, commitUberFacts, releaseUberSync, detachUber, initUber, type UberLink } from "./uber-store";
import { driverAvailable } from "../rideshare-driver/policy";
import { secureTaxRequired, SECURE_TAX_REQUIRED_MESSAGE, type SecureTaxScope } from "../secure-tax/policy";

export function authorizeUber(token: string | undefined, native = false) {
  const configuration = requireUberConfiguration();
  const state = beginUberState(token, configuration.clientId, native), url = new URL("https://auth.uber.com/oauth/v2/authorize");
  for (const [key, value] of Object.entries({ response_type: "code", client_id: configuration.clientId, redirect_uri: configuration.redirectUri, scope: UBER_DRIVER_SCOPES.join(" "), state })) url.searchParams.set(key, value);
  return { authorizationUrl: url.href, expiresInSeconds: 600 };
}
export async function completeUberAuthorization(token: string | undefined, state: string, code: string) {
  const configuration = requireUberConfiguration();
  if (!code || code.length > 16_000) throw new UberError(400, "Uber did not return a usable authorization code. Start again.");
  const context = consumeUberState(state, token, configuration.clientId);
  const tokens = await exchangeUberToken({ grant_type: "authorization_code", redirect_uri: configuration.redirectUri, code });
  try {
    recheckUber(context.token, context.generation);
    const profile = await uberGetProfile(tokens);
    recheckUber(context.token, context.generation); requireUberConfiguration();
    connectUberScope(context, profile, tokens);
    return { connected: true };
  } catch (error) { await revokeUberToken(tokens); throw error; }
}
const DAY = 86400;
export function uberSyncPeriod(fromDay?: string, throughDay?: string) {
  const valid = (value: string) => { try { return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; } catch { return false; } };
  const today = new Date().toISOString().slice(0, 10);
  const end = throughDay ?? today;
  if (!valid(end)) throw new UberError(400, "Choose valid start and end dates.");
  const start = fromDay ?? new Date(Date.parse(`${end}T00:00:00Z`) - 6 * DAY * 1000).toISOString().slice(0, 10);
  if (!valid(start) || !valid(end)) throw new UberError(400, "Choose valid start and end dates.");
  const from = Date.parse(`${start}T00:00:00Z`) / 1000, to = Date.parse(`${end}T00:00:00Z`) / 1000 + DAY;
  if (to <= from || to - from > 31 * DAY || end > today || start < "2000-01-01") throw new UberError(400, "Choose a past or current period of at most 31 days.");
  return { from, to, fromDay: start, throughDay: end };
}
export async function syncUber(token: string, fromDay?: string, throughDay?: string) {
  const configuration = requireUberConfiguration(), period = uberSyncPeriod(fromDay, throughDay), link = claimUberSync(token);
  let invalidAuthorization = false;
  try {
    let tokens = link.tokens;
    if (tokens.clientId !== configuration.clientId) throw new UberError(409, "The firm's Uber application changed. Reconnect your driver account.", true);
    if (tokens.expiresAt <= Date.now() + 60_000) {
      if (!tokens.refreshToken) throw new UberError(409, "Reconnect your Uber account to renew access.", true);
      tokens = await exchangeUberToken({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }, tokens);
      try { saveRefreshedUberTokens(token, link, tokens); }
      catch (error) { await revokeUberToken(tokens); throw error; }
    }
    const recheck = () => { requireUberConfiguration(); recheckUber(token, link.generation); };
    recheck(); const profile = await uberGetProfile(tokens); recheck();
    if (profile.driver_id !== link.driverId) throw new UberError(409, "The connected Uber driver changed. No provider records were imported.", true);
    const facts = await uberFacts(tokens, profile.driver_id, period.from, period.to, recheck);
    recheck(); commitUberFacts(token, link, profile, facts, period.from, period.to);
    return { ok: true, tripsReceived: facts.trips.length, paymentsReceived: facts.payments.length, fromDay: period.fromDay, throughDay: period.throughDay, journalRecordsPosted: 0 };
  } catch (error) { invalidAuthorization = error instanceof UberError && error.providerAuthorization; throw error; }
  finally { releaseUberSync(link.accountId, link.generation, link.leaseId, invalidAuthorization); }
}
export async function disconnectUber(token: string) {
  const tokens = detachUber(token), revoked = tokens ? await revokeUberToken(tokens) : true;
  return { connected: false, providerRevoked: revoked,
    message: revoked ? "Uber connection removed. Previously imported provider records remain available for review."
      : "Uber connection removed here. Uber could not confirm revocation; also disconnect this application in your Uber account settings. Previously imported records remain available for review." };
}

export function uberSummaryFromDatabase(db: Parameters<typeof scopedUber>[0], link: UberLink | undefined, scope?: SecureTaxScope) {
  const configuration = uberConfiguration();
  const secure = secureTaxRequired(scope ?? { accountId: link?.accountId, clientId: link?.clientId }, db);
  const stored = link?.driverId ? ["payments", "trips"].flatMap(kind => db.prepare("SELECT kind,body,observedAt FROM gig_uber_facts WHERE accountId=? AND clientId=? AND driverId=? AND kind=? ORDER BY observedAt DESC,providerId LIMIT 10").all(link.accountId, link.clientId, link.driverId, kind) as unknown as { kind: string; body: string; observedAt: string }[]) : [];
  const payments = stored.filter(row => row.kind === "payments").map(row => ({ fact: uberPaymentSchema.parse(JSON.parse(openSecret(row.body))), observedAt: row.observedAt }));
  const trips = stored.filter(row => row.kind === "trips").map(row => ({ fact: uberTripSchema.parse(JSON.parse(openSecret(row.body))), observedAt: row.observedAt }));
  const profile = link?.profile ? uberProfileSchema.parse(JSON.parse(openSecret(link.profile))) : null;
  const counts = link?.driverId ? db.prepare("SELECT coalesce(sum(CASE WHEN kind='trips' THEN 1 ELSE 0 END),0) AS trips,coalesce(sum(CASE WHEN kind='payments' THEN 1 ELSE 0 END),0) AS payments,coalesce(sum(paymentAmountCents),0) AS usdPaymentAmountCents,coalesce(sum(CASE WHEN kind='payments' AND paymentAmountCents IS NULL THEN 1 ELSE 0 END),0) AS otherCurrencyPayments FROM gig_uber_facts WHERE accountId=? AND clientId=? AND driverId=?").get(link.accountId, link.clientId, link.driverId) as { trips: number; payments: number; usdPaymentAmountCents: number; otherCurrencyPayments: number } : { trips: 0, payments: 0, usdPaymentAmountCents: 0, otherCurrencyPayments: 0 };
  return { ready: configuration.ready && !secure, secureTaxRequired: secure, approvalRequired: !configuration.approved, availability: secure ? SECURE_TAX_REQUIRED_MESSAGE : configuration.reason,
    status: link?.status ?? "disconnected", connected: link?.status === "connected" && Boolean(link.secrets),
    profile: profile ? { name: `${profile.first_name} ${profile.last_name}`.trim(), activationStatus: profile.activation_status ?? null } : null,
    lastSyncAt: link?.lastSyncAt ?? null,
    lastPeriod: link?.lastFrom != null && link.lastTo != null ? { fromDay: new Date(link.lastFrom * 1000).toISOString().slice(0, 10), throughDay: new Date((link.lastTo - 1) * 1000).toISOString().slice(0, 10) } : null,
    ...counts,
    recentPayments: payments.slice(0, 10).map(({ fact, observedAt }) => ({ date: new Date(fact.event_time * 1000).toISOString().slice(0, 10), amount: fact.amount, currency: fact.currency_code, category: fact.category ?? "Payment", observedAt })),
    recentTrips: trips.slice(0, 10).map(({ fact, observedAt }) => ({ status: fact.status, pickupAt: fact.pickup?.timestamp != null ? new Date(fact.pickup.timestamp * 1000).toISOString() : null, dropoffAt: fact.dropoff?.timestamp != null ? new Date(fact.dropoff.timestamp * 1000).toISOString() : null, observedAt })),
    accountingPolicy: "Provider payment amounts and trip history are separate source records. They are not added to your tax journal, bank deposits or trip earnings automatically, and are not a tax-liability calculation." };
}
export function uberConnectionSummary(token: string) {
  return workspaceDatabase(db => { const { account, link } = scopedUber(db, token); return uberSummaryFromDatabase(db, link, { accountId: account.id, clientId: account.clientId }); });
}
export type UberConnectionSummary = ReturnType<typeof uberConnectionSummary>;

function recordPage(db: Parameters<typeof scopedUber>[0], link: UberLink | undefined, kind: "trips" | "payments", requestedPage: number) {
  const count = link?.driverId ? (db.prepare("SELECT count(*) AS count FROM gig_uber_facts WHERE accountId=? AND clientId=? AND driverId=? AND kind=?").get(link.accountId, link.clientId, link.driverId, kind) as { count: number }).count : 0;
  const pages = Math.max(1, Math.ceil(count / 25)), page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(pages, requestedPage) : 1;
  const rows = link?.driverId ? db.prepare("SELECT body,observedAt FROM gig_uber_facts WHERE accountId=? AND clientId=? AND driverId=? AND kind=? ORDER BY observedAt DESC,providerId LIMIT 25 OFFSET ?").all(link.accountId, link.clientId, link.driverId, kind, (page - 1) * 25) as unknown as { body: string; observedAt: string }[] : [];
  return { kind, count, pages, page, records: rows.map(row => {
    if (kind === "payments") { const fact = uberPaymentSchema.parse(JSON.parse(openSecret(row.body))); return { id: fact.payment_id, observedAt: row.observedAt, date: new Date(fact.event_time * 1000).toISOString().slice(0, 10), amount: fact.amount, currency: fact.currency_code, category: fact.category ?? "Payment", status: null }; }
    const fact = uberTripSchema.parse(JSON.parse(openSecret(row.body)));
    return { id: fact.trip_id, observedAt: row.observedAt, date: fact.pickup?.timestamp != null ? new Date(fact.pickup.timestamp * 1000).toISOString().slice(0, 10) : null, amount: null, currency: null, category: "Trip", status: fact.status };
  }) };
}
export function uberRecordPage(token: string, kind: "trips" | "payments", page = 1) {
  return workspaceDatabase(db => { const { link } = scopedUber(db, token); return recordPage(db, link, kind, page); });
}
/** Enforce staff Money view permission at the route before using these projections. */
export function staffUberConnections() {
  return workspaceDatabase(db => {
    if (!driverAvailable(db)) throw new UberError(404, "Provider records are unavailable.");
    initUber(db);
    const links = db.prepare("SELECT l.* FROM gig_uber_links l JOIN customer_accounts a ON a.id=l.accountId AND a.clientId=l.clientId WHERE l.driverId IS NOT NULL ORDER BY a.name LIMIT 1000").all() as unknown as UberLink[];
    return links.map(link => {
      const user = db.prepare("SELECT name,email,status FROM customer_accounts WHERE id=?").get(link.accountId) as { name: string; email: string; status: string };
      return { accountId: link.accountId, clientId: link.clientId, user, ...uberSummaryFromDatabase(db, link) };
    });
  });
}
export function staffUberRecordPage(accountId: string, kind: "trips" | "payments", page = 1) {
  return workspaceDatabase(db => {
    if (!driverAvailable(db)) throw new UberError(404, "Provider records are unavailable.");
    initUber(db);
    const link = db.prepare("SELECT l.* FROM gig_uber_links l JOIN customer_accounts a ON a.id=l.accountId AND a.clientId=l.clientId WHERE l.accountId=?").get(accountId) as UberLink | undefined;
    if (!link) throw new UberError(404, "Provider records are unavailable.");
    return recordPage(db, link, kind, page);
  });
}
