/**
 * QuickBooks Online client. Handles the OAuth2 authorization-code flow, token
 * refresh, and the accounting API calls we need (find/create customer, create
 * invoice). Credentials come from env; tokens from the token store. Fail-fast.
 */
import { getQuickBooksConfig, quickBooksUrls } from "./config";
import { getQboTokens, setQboTokens, type QboTokens } from "./token-store";
import type { QboCustomerPayload, QboInvoicePayload } from "./quickbooks-map";

const SCOPE = "com.intuit.quickbooks.accounting";

function requireConfig() {
  const cfg = getQuickBooksConfig();
  if (!cfg) throw new Error("QuickBooks not configured (set QBO_CLIENT_ID + QBO_CLIENT_SECRET)");
  return cfg;
}

/** Build the Intuit consent URL to start the OAuth flow. */
export function quickBooksAuthorizeUrl(state: string): string {
  const cfg = requireConfig();
  const { authorizeUrl } = quickBooksUrls(cfg.environment);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `${authorizeUrl}?${params.toString()}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const cfg = requireConfig();
  const { tokenUrl } = quickBooksUrls(cfg.environment);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`QuickBooks authorization failed (${res.status}). Reconnect your account.`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_in)) throw new Error("QuickBooks returned invalid authorization tokens.");
  return data;
}

/** Exchange the OAuth code (and realmId from the callback) for tokens. */
export async function exchangeQboCode(code: string, realmId: string): Promise<QboTokens> {
  const cfg = requireConfig();
  const resp = await postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }),
  );
  const tokens: QboTokens = {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token,
    realmId,
    expiresAt: nowMs() + resp.expires_in * 1000,
  };
  setQboTokens(tokens);
  return tokens;
}

function nowMs(): number {
  return new Date().getTime();
}

async function refresh(tokens: QboTokens): Promise<QboTokens> {
  const resp = await postToken(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }),
  );
  const next: QboTokens = {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token,
    realmId: tokens.realmId,
    expiresAt: nowMs() + resp.expires_in * 1000,
  };
  setQboTokens(next);
  return next;
}

let refreshing: Promise<QboTokens> | null = null;
async function validTokens(): Promise<QboTokens> {
  const tokens = getQboTokens();
  if (!tokens) throw new Error("QuickBooks not connected — start the OAuth flow first");
  // Refresh a minute before expiry to avoid mid-request 401s.
  if (nowMs() > tokens.expiresAt - 60_000) {
    refreshing ??= refresh(tokens).finally(() => { refreshing = null; });
    return refreshing;
  }
  return tokens;
}

async function qboApi<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const cfg = requireConfig();
  const tokens = await validTokens();
  const { apiBase } = quickBooksUrls(cfg.environment);
  const url = `${apiBase}/v3/company/${tokens.realmId}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`QuickBooks request failed (${res.status}). Check the company connection and permissions.`);
  }
  return (await res.json()) as T;
}

interface QboCustomerEntity {
  Id: string;
  DisplayName: string;
}

/** Read every customer page, including inactive accounts; the preview can skip them. */
export async function fetchQboCustomers() {
  const realm=getQboTokens()?.realmId;
  if(!realm)throw new Error("Connect QuickBooks before importing customers.");
  const result:import("../customers/import-model").ImportCustomer[]=[];
  type Address={Line1?:string;Line2?:string;City?:string;CountrySubDivisionCode?:string;PostalCode?:string;Country?:string};
  type Customer={Id:string;DisplayName?:string;CompanyName?:string;GivenName?:string;FamilyName?:string;PrimaryEmailAddr?:{Address?:string};PrimaryPhone?:{FreeFormNumber?:string};BillAddr?:Address;ShipAddr?:Address;WebAddr?:{URI?:string}};
  const address=(a?:Address)=>a?[a.Line1,a.Line2,a.City,a.CountrySubDivisionCode,a.PostalCode,a.Country].filter(Boolean).join(", "):"";
  const seen=new Set<string>();
  for(let start=1;start<=10001;start+=1000){
    if(getQboTokens()?.realmId!==realm)throw new Error("The QuickBooks company changed. Start a new customer preview.");
    const query=encodeURIComponent(`select * from Customer where Active in (true, false) orderby Id startposition ${start} maxresults 1000`);
    const data=await qboApi<{QueryResponse:{Customer?:Customer[]}}>("GET",`query?query=${query}`),rows=data.QueryResponse?.Customer||[];
    if(getQboTokens()?.realmId!==realm)throw new Error("The QuickBooks company changed. Start a new customer preview.");
    if(start>10000&&rows.length)throw new Error("This company has more than 10,000 customers. Export and import smaller spreadsheet batches.");
    for(const c of rows){if(!c.Id||seen.has(c.Id))throw new Error("QuickBooks returned a repeated or missing customer ID. Preview again.");seen.add(c.Id);const company=c.CompanyName||c.DisplayName||[c.GivenName,c.FamilyName].filter(Boolean).join(" ");result.push({externalId:c.Id,company,buyerName:[c.GivenName,c.FamilyName].filter(Boolean).join(" ")||c.DisplayName||company,buyerEmail:c.PrimaryEmailAddr?.Address||"",phone:c.PrimaryPhone?.FreeFormNumber||"",billingAddress:address(c.BillAddr),shippingAddress:address(c.ShipAddr)||address(c.BillAddr),website:c.WebAddr?.URI||"",region:c.BillAddr?.CountrySubDivisionCode||"",accountOwner:"Owner",channel:"store"});}
    if(rows.length<1000)break;
  }
  return result;
}

/** Find a QBO customer by DisplayName, or create it. Returns the QBO Id. */
export async function findOrCreateQboCustomer(payload: QboCustomerPayload): Promise<string> {
  const escaped = payload.DisplayName.replace(/'/g, "\\'");
  const query = encodeURIComponent(`select * from Customer where DisplayName = '${escaped}'`);
  const found = await qboApi<{ QueryResponse: { Customer?: QboCustomerEntity[] } }>(
    "GET",
    `query?query=${query}`,
  );
  const existing = found.QueryResponse.Customer?.[0];
  if (existing) return existing.Id;

  const created = await qboApi<{ Customer: QboCustomerEntity }>("POST", "customer", payload);
  return created.Customer.Id;
}

export interface QboInvoiceEntity {
  Id: string;
  DocNumber?: string;
  TotalAmt?: number;
}

// ---- Transaction extraction (bills) for anomaly auditing -------------------

interface QboBillLine {
  Amount?: number;
  Description?: string;
  ItemBasedExpenseLineDetail?: { ItemRef?: { name?: string }; Qty?: number; UnitPrice?: number };
  AccountBasedExpenseLineDetail?: { AccountRef?: { name?: string } };
}
interface QboBillEntity {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  VendorRef?: { name?: string };
  Line?: QboBillLine[];
}

export interface QboExtractResult {
  ok: boolean;
  invoices: import("../ops/model").SupplierInvoice[];
  error?: string;
}

function dollarsToCents(v: number | undefined): number {
  return Math.round((v ?? 0) * 100);
}

/**
 * Pull recent QuickBooks Bills and normalize them into SupplierInvoices so they
 * can run through the same overcharge/anomaly audit as manual invoices. Each
 * bill line becomes an item line (by item or expense account). Fail-closed.
 */
export async function pullQboBillsAsInvoices(limit = 100): Promise<QboExtractResult> {
  if (!getQuickBooksConfig()) return { ok: false, invoices: [], error: "QuickBooks app is not configured." };
  if (!getQboTokens()) return { ok: false, invoices: [], error: "QuickBooks is not connected — connect it in Settings." };
  try {
    const query = encodeURIComponent(`select * from Bill maxresults ${Math.min(limit, 1000)}`);
    const data = await qboApi<{ QueryResponse: { Bill?: QboBillEntity[] } }>("GET", `query?query=${query}`);
    const invoices = (data.QueryResponse.Bill ?? []).map<import("../ops/model").SupplierInvoice>((bill) => ({
      id: `qbo-bill-${bill.Id}`,
      vendor: bill.VendorRef?.name ?? "Unknown vendor",
      invoiceNumber: bill.DocNumber ?? bill.Id,
      date: bill.TxnDate ?? "",
      lines: (bill.Line ?? [])
        .filter((l) => l.ItemBasedExpenseLineDetail || l.AccountBasedExpenseLineDetail)
        .map((l) => {
          const item = l.ItemBasedExpenseLineDetail;
          if (item) {
            const qty = item.Qty && item.Qty > 0 ? item.Qty : 1;
            return {
              itemCode: item.ItemRef?.name ?? "Item",
              description: l.Description ?? item.ItemRef?.name ?? "",
              unitPriceCents: item.UnitPrice ? dollarsToCents(item.UnitPrice) : Math.round(dollarsToCents(l.Amount) / qty),
              quantity: qty,
            };
          }
          const acct = l.AccountBasedExpenseLineDetail?.AccountRef?.name ?? "Expense";
          return { itemCode: acct, description: l.Description ?? acct, unitPriceCents: dollarsToCents(l.Amount), quantity: 1 };
        }),
    }));
    return { ok: true, invoices };
  } catch (err) {
    return { ok: false, invoices: [], error: err instanceof Error ? err.message : "QuickBooks pull failed" };
  }
}

export async function createQboInvoice(payload: QboInvoicePayload, requestId?: string): Promise<QboInvoiceEntity> {
  const created = await qboApi<{ Invoice: QboInvoiceEntity }>("POST", requestId ? `invoice?requestid=${encodeURIComponent(requestId)}` : "invoice", payload);
  return created.Invoice;
}

// ---- Item mapping (SKU/product name -> QBO Item.Id) -------------------------

interface QboAccountEntity {
  Id: string;
  Name: string;
}
interface QboItemEntity {
  Id: string;
  Name: string;
}

let cachedIncomeAccountId: string | null = null;

/** The QBO Income account new Service items post to. Cached per process. */
async function resolveIncomeAccountId(): Promise<string> {
  if (cachedIncomeAccountId) return cachedIncomeAccountId;
  const query = encodeURIComponent(
    "select Id, Name from Account where AccountType = 'Income' maxresults 1",
  );
  const res = await qboApi<{ QueryResponse: { Account?: QboAccountEntity[] } }>(
    "GET",
    `query?query=${query}`,
  );
  const account = res.QueryResponse.Account?.[0];
  if (!account) {
    throw new Error("QBO: no Income account found to attach new items to");
  }
  cachedIncomeAccountId = account.Id;
  return account.Id;
}

/**
 * Find a QBO Item by exact Name, or create it as a Service item posting to the
 * Income account. Returns the QBO Item.Id. This is what makes synced invoices
 * post correct line items instead of bare amounts.
 */
export async function findOrCreateQboItem(name: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(`select Id, Name from Item where Name = '${escaped}'`);
  const found = await qboApi<{ QueryResponse: { Item?: QboItemEntity[] } }>(
    "GET",
    `query?query=${query}`,
  );
  const existing = found.QueryResponse.Item?.[0];
  if (existing) return existing.Id;

  const incomeAccountId = await resolveIncomeAccountId();
  const created = await qboApi<{ Item: QboItemEntity }>("POST", "item", {
    Name: name.slice(0, 100),
    Type: "Service",
    IncomeAccountRef: { value: incomeAccountId },
  });
  return created.Item.Id;
}

export async function testQuickBooksConnection():Promise<string> { const tokens=getQboTokens();if(!tokens)throw new Error("Sign in to QuickBooks first.");const r=await qboApi<{CompanyInfo:{CompanyName:string}}>("GET",`companyinfo/${tokens.realmId}`);return r.CompanyInfo.CompanyName; }
