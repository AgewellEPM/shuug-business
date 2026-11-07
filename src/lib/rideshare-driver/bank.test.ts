// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { createLinkedCustomer, saveCustomerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled } from "../customer-access/accounts";
import { bankFeed, bankStatus, createBankLink, disconnectBank, exchangeBankLink, syncBankItem } from "./bank-store";
import { saveDriverRecord } from "./store";
import { GET, POST } from "@/app/api/website/customer/driver/banks/route";

let directory: string, alpha: { id: string; token: string }, beta: typeof alpha;
let calls: { path: string; body: Record<string, unknown> }[];
let provider: (path: string, body: Record<string, unknown>) => Response | Promise<Response>;
const reply = (value: unknown, status = 200) => Response.json(value, { status });
const tx = (id = "one", amount = 17.35) => ({ transaction_id: id, account_id: "bank-account", date: "2026-11-05", name: "Fixture Shell", amount, iso_currency_code: "USD", pending: false });
const page = (values: unknown[] = [tx()], cursor = "cursor-one", more = false) => ({ added: values, modified: [], removed: [], next_cursor: cursor, has_more: more });
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-driver-bank-`); calls = [];
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, APP_BASE_URL: "https://workspace.example.com", DEMO_DATA: "false", DATABASE_URL: "", PLAID_ENV: "sandbox", PLAID_CLIENT_ID: "fixture-client", PLAID_SECRET: "fixture-secret", PLAID_IOS_REDIRECT_URI: "https://workspace.example.com/plaid/callback" })) vi.stubEnv(key, value);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), "Fixture-bank-password-only");
    return { id: user.id, token: signInCustomer(user.email, "Fixture-bank-password-only") };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
  provider = path => {
    if (path === "/link/token/create") return reply({ link_token: "fixture-link", expiration: "2026-11-06T00:00:00Z" });
    if (path === "/item/public_token/exchange") return reply({ access_token: "fixture-access-token", item_id: "fixture-item" });
    if (path === "/accounts/get") return reply({ accounts: [{ account_id: "bank-account", name: "Checking", mask: "1234" }] });
    if (path === "/transactions/sync") return reply(page());
    if (path === "/item/remove") return reply({});
    throw new Error("Unexpected provider path: " + path);
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const parsed = new URL(url); expect(parsed.origin).toBe("https://sandbox.plaid.com");
    const body = JSON.parse(init.body as string); calls.push({ path: parsed.pathname, body });
    return provider(parsed.pathname, body);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
async function linked() {
  const session = await createBankLink(alpha.token, {});
  return exchangeBankLink(alpha.token, { sessionId: session.sessionId, publicToken: "fixture-public" });
}
it("requires activation and client authorization, never returns server credentials, and binds link sessions to the client", async () => {
  vi.stubEnv("PLAID_SECRET", ""); expect(bankStatus(alpha.token).ready).toBe(false);
  await expect(createBankLink(alpha.token, {})).rejects.toThrow("not activated"); expect(calls).toHaveLength(0);
  vi.stubEnv("PLAID_SECRET", "fixture-secret"); vi.stubEnv("PLAID_ENV", "production"); vi.stubEnv("PLAID_LIVE_ENABLED", "false");
  expect(bankStatus(alpha.token).ready).toBe(false); vi.stubEnv("PLAID_ENV", "sandbox");
  const session = await createBankLink(alpha.token, {});
  expect(calls[0].body).toMatchObject({ products: ["transactions"], user: { client_user_id: alpha.id } });
  expect(calls[0].body).not.toHaveProperty("webhook");
  await expect(exchangeBankLink(beta.token, { sessionId: session.sessionId, publicToken: "fixture-public" })).rejects.toThrow("expired");
  const first = await exchangeBankLink(alpha.token, { sessionId: session.sessionId, publicToken: "fixture-public" });
  expect(await exchangeBankLink(alpha.token, { sessionId: session.sessionId, publicToken: "fixture-public" })).toEqual(first);
  expect(calls.filter(x => x.path === "/item/public_token/exchange")).toHaveLength(1);
  expect(JSON.stringify(bankStatus(alpha.token))).not.toContain("fixture-access-token");
  const row = workspaceDatabase(db => db.prepare("SELECT secret FROM driver_bank_items").get()) as { secret: string };
  expect(row.secret).not.toContain("fixture-access-token"); expect(JSON.parse(row.secret)).toHaveProperty("tag");
  expect(bankStatus(beta.token).items).toEqual([]);
  setCustomerEnabled(alpha.id, false); expect(() => bankStatus(alpha.token)).toThrow("Sign in");
});
it("commits complete paginated updates, preserves cents and pending state, and isolates the bank feed", async () => {
  const { itemId } = await linked(); const initial = provider;
  provider = (path, body) => path !== "/transactions/sync" ? initial(path, body)
    : body.cursor ? reply(page([{ ...tx("two", -24.50), pending: true }], "done")) : reply(page([tx()], "next", true));
  await syncBankItem(alpha.token, itemId);
  const feed = bankFeed(alpha.token, 0);
  expect(feed.transactions.map(t => t.amountCents)).toEqual([1735, -2450]);
  expect(feed.transactions[1].pending).toBe(true); expect(feed.transactions[0].accountLabel).toBe("Checking •1234");
  expect(bankFeed(beta.token, 0).transactions).toEqual([]);
  await expect(syncBankItem(beta.token, itemId)).rejects.toThrow("unavailable");
  expect(bankFeed(alpha.token, feed.cursor).transactions).toEqual([]);
  expect(calls.some(c => c.path === "/transactions/refresh")).toBe(false);
});
it("restarts a mutated pagination batch and rolls back incomplete provider results", async () => {
  const { itemId } = await linked(); const initial = provider; let count = 0;
  provider = (path, body) => {
    if (path !== "/transactions/sync") return initial(path, body);
    count++;
    if (count === 1) return reply(page([tx("discard")], "first", true));
    if (count === 2) return reply({ error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" }, 400);
    expect(body).not.toHaveProperty("cursor");
    return reply(page([tx("kept")], "complete"));
  };
  await syncBankItem(alpha.token, itemId); expect(bankFeed(alpha.token, 0).transactions).toHaveLength(1);
  workspaceDatabase(db => db.prepare("UPDATE driver_bank_items SET lastAttempt=0").run(), true);
  provider = (path, body) => path !== "/transactions/sync" ? initial(path, body) : body.cursor === "complete"
    ? reply(page([tx("not-committed")], "partial", true)) : reply({ error_code: "INTERNAL_SERVER_ERROR" }, 500);
  await expect(syncBankItem(alpha.token, itemId)).rejects.toThrow("could not complete");
  expect(bankFeed(alpha.token, 0).transactions).toHaveLength(1);
  const state = workspaceDatabase(db => db.prepare("SELECT cursor,leaseUntil FROM driver_bank_items").get());
  expect(state).toMatchObject({ cursor: "complete", leaseUntil: 0 });
});
it("delivers bank corrections/removals without changing an approved journal and revokes provider access on disconnect", async () => {
  const { itemId } = await linked(); await syncBankItem(alpha.token, itemId);
  const feed = bankFeed(alpha.token, 0), reference = { transactionId: feed.transactions[0].id, provider: "plaid", accountLabel: "Checking 1234" };
  const record = { id: randomUUID(), kind: "expense", revision: 0, deleted: false, body: { date: "2026-11-05", merchant: "Fixture Shell", category: "fuel", amountCents: 1735, currency: "USD", classification: "business", notes: "", bankReference: reference } };
  expect(() => saveDriverRecord(alpha.token, { mutationId: randomUUID(), record })).toThrow("Sandbox");
  // Simulate a production-origin stored row to exercise journal validation, while
  // all network requests remain mocked and confined to the sandbox hostname.
  workspaceDatabase(db => db.prepare("UPDATE driver_bank_items SET environment='production'").run(), true);
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record });
  expect(() => saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...record, id: randomUUID() } })).toThrow("already linked");
  expect(() => saveDriverRecord(beta.token, { mutationId: randomUUID(), record: { ...record, id: randomUUID() } })).toThrow("unavailable");
  workspaceDatabase(db => db.prepare("UPDATE driver_bank_items SET environment='sandbox'").run(), true);
  workspaceDatabase(db => db.prepare("UPDATE driver_bank_items SET lastAttempt=0").run(), true);
  const initial = provider; provider = (path, body) => path === "/transactions/sync"
    ? reply({ added: [], modified: [], removed: [{ transaction_id: "one" }], next_cursor: "removed", has_more: false }) : initial(path, body);
  await syncBankItem(alpha.token, itemId); expect(bankFeed(alpha.token, feed.cursor).transactions[0].removed).toBe(true);
  const saved = workspaceDatabase(db => db.prepare("SELECT body FROM driver_records WHERE id=?").get(record.id)) as { body: string };
  expect(JSON.parse(saved.body).body.amountCents).toBe(1735);
  await disconnectBank(alpha.token, itemId); expect(bankStatus(alpha.token).items[0]).toMatchObject({ connected: 0 });
  expect(calls.filter(c => c.path === "/item/remove")).toHaveLength(1);
  expect(bankFeed(alpha.token, 0).transactions).toHaveLength(1);
});
it("enforces the actual handler's private response, origin, session and request bounds", async () => {
  const url = "https://workspace.example.com/api/website/customer/driver/banks";
  expect((await GET(new Request(url))).status).toBe(401);
  const response = await GET(new Request(url, { headers: { Authorization: `Bearer ${alpha.token}` } }));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const post = (body: object, origin?: string) => POST(new Request(url, { method: "POST", headers: { Authorization: `Bearer ${alpha.token}`, "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) }));
  expect((await post({ action: "link", accountId: beta.id })).status).toBe(400);
  expect((await post({ action: "link" }, "https://unrelated.example")).status).toBe(403);
});
it("refuses a pending link after provider setup changes and cancels only the caller's unfinished session", async () => {
  const session=await createBankLink(alpha.token,{});
  vi.stubEnv("PLAID_SECRET","changed-fixture-secret");
  await expect(exchangeBankLink(alpha.token,{sessionId:session.sessionId,publicToken:"fixture-public"})).rejects.toThrow("setup changed");
  expect(calls.filter(c=>c.path==="/item/public_token/exchange")).toHaveLength(0);
  const url="https://workspace.example.com/api/website/customer/driver/banks";
  const cancel=(token:string)=>POST(new Request(url,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"cancel",sessionId:session.sessionId})}));
  expect((await cancel(beta.token)).status).toBe(200);
  expect(workspaceDatabase(db=>db.prepare("SELECT 1 FROM driver_bank_links WHERE id=?").get(session.sessionId))).toBeTruthy();
  expect((await cancel(alpha.token)).status).toBe(200);
  expect(workspaceDatabase(db=>db.prepare("SELECT 1 FROM driver_bank_links WHERE id=?").get(session.sessionId))).toBeUndefined();
});
it("allows a client to revoke an existing production authorization when new live linking is paused", async () => {
  const {itemId}=await linked();
  workspaceDatabase(db=>db.prepare("UPDATE driver_bank_items SET environment='production'").run(),true);
  vi.stubEnv("PLAID_ENV","production");vi.stubEnv("PLAID_LIVE_ENABLED","false");
  vi.stubGlobal("fetch",vi.fn(async (url:string,init:RequestInit)=>{
    expect(url).toBe("https://production.plaid.com/item/remove");
    const body=JSON.parse(init.body as string);expect(body.access_token).toBe("fixture-access-token");return reply({});
  }));
  expect(bankStatus(alpha.token).ready).toBe(false);
  await disconnectBank(alpha.token,itemId);
  expect(bankStatus(alpha.token).items[0]).toMatchObject({connected:0});
});
it("removes an unreachable pending session when provider token creation fails",async()=>{
  provider=()=>reply({error_code:"INVALID_API_KEYS"},400);
  await expect(createBankLink(alpha.token,{})).rejects.toThrow("could not complete");
  expect(workspaceDatabase(db=>db.prepare("SELECT count(*) AS n FROM driver_bank_links WHERE itemId IS NULL").get())).toEqual({n:0});
});
it("revokes a canceled in-flight exchange using its original provider credentials",async()=>{
 const session=await createBankLink(alpha.token,{});
 let finish:((response:Response)=>void)|undefined;
 const wait=new Promise<Response>(resolve=>{finish=resolve;});
 const initial=provider;
 provider=(route,body)=>route==='/item/public_token/exchange' ? wait : initial(route,body);
 const exchange=exchangeBankLink(alpha.token,{sessionId:session.sessionId,publicToken:'fixture-public'});
 await new Promise(resolve=>setTimeout(resolve,0));
 const cancel=(await import('./bank-store')).cancelBankLink;cancel(alpha.token,session.sessionId);
 vi.stubEnv('PLAID_SECRET','new-provider-secret');
 finish!(reply({access_token:'fixture-access-token',item_id:'fixture-item'}));
 await expect(exchange).rejects.toThrow('setup changed');
 const removed=calls.find(call=>call.path==='/item/remove');
 expect(removed?.body.secret).toBe('fixture-secret');
 expect(bankStatus(alpha.token).items).toEqual([]);
});
it("retains encrypted failed revocations and retries with the original provider credentials",async()=>{
 const session=await createBankLink(alpha.token,{});
 let finish:((response:Response)=>void)|undefined;
 const wait=new Promise<Response>(resolve=>{finish=resolve;});
 const initial=provider;
 provider=(route,body)=>route==='/item/public_token/exchange'?wait:route==='/item/remove'?reply({error_code:'INTERNAL_SERVER_ERROR'},500):initial(route,body);
 const exchange=exchangeBankLink(alpha.token,{sessionId:session.sessionId,publicToken:'fixture-public'});
 await new Promise(resolve=>setTimeout(resolve,0));
 const {cancelBankLink,retryBankRevocations}=await import('./bank-store');cancelBankLink(alpha.token,session.sessionId);
 vi.stubEnv('PLAID_SECRET','new-provider-secret');finish!(reply({access_token:'fixture-access-token',item_id:'fixture-item'}));
 await expect(exchange).rejects.toThrow('setup changed');
 const queued=workspaceDatabase(db=>db.prepare('SELECT configuration,accessSecret FROM driver_bank_revocations').get());
 expect(JSON.stringify(queued)).not.toContain('fixture-access-token');expect(JSON.stringify(queued)).not.toContain('fixture-secret');
 provider=(route,body)=>{expect(route).toBe('/item/remove');expect(body.secret).toBe('fixture-secret');return reply({});};
 expect(await retryBankRevocations()).toEqual({revoked:1,remaining:0});
});
