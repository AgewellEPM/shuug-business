/** Server-only transport to an administrator-configured local Peel worker.
 * The worker verifies arithmetic over scoped numeric records. It does not
 * establish tax eligibility, validate source records or generate advice.
 */
import { createHash } from "node:crypto";

export type PeelFinancialRow = {
  id: string;
  grossCents: number;
  feesCents: number;
  vehicleCents: number;
  netCents: number;
};
export type PeelFinancialInput = { rows: PeelFinancialRow[]; unpricedCount: number };
export type PeelFinancialTotals = Omit<PeelFinancialRow, "id"> & { pricedCount: number };
export type PeelFinancialAttestation = {
  available: boolean;
  verified: boolean;
  engine: string;
  coverage: { pricedCount: number; unpricedCount: number };
  tools: string[];
  totals?: PeelFinancialTotals;
  sourceDigest?: string;
  modelCalls?: 0;
  reason?: string;
};

const ENGINE = "Peel symbolic-floor";
const MAX_ROWS = 5_000;
const MAX_CENTS = 1_000_000_000;
const MAX_BODY = 1_048_576;
const MONEY_KEYS = ["grossCents", "feesCents", "vehicleCents", "netCents"] as const;
const TOOL_NAMES = [
  "derive_numeric_property_row_count",
  ...MONEY_KEYS.map(key => `derive_numeric_property_gig_tax_${key}`),
];

function configuration() {
  const endpoint = process.env.GIG_TAX_PEEL_URL?.trim();
  const token = process.env.GIG_TAX_PEEL_TOKEN;
  if (!endpoint || !token || !/^[\x21-\x7e]{32,256}$/.test(token)) return null;
  try {
    const url = new URL(endpoint);
    // The private worker is a local server-side dependency. User-provided
    // destinations, proxy redirects and public plaintext endpoints are refused.
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
      || url.pathname !== "/v1/financial-attestation" || url.search || url.hash
      || url.username || url.password) return null;
    return { endpoint: url.toString(), token };
  } catch { return null; }
}

/** Configuration only; availability is established by an actual request. */
export function peelCoachAvailable(): boolean { return configuration() !== null; }

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

function projection(input: PeelFinancialInput): PeelFinancialInput | null {
  if (!object(input) || Object.keys(input).some(key => !["rows", "unpricedCount"].includes(key))
    || !Array.isArray(input.rows) || input.rows.length > MAX_ROWS
    || !integer(input.unpricedCount, 0, 100_000)) return null;
  const seen = new Set<string>();
  const rows: PeelFinancialRow[] = [];
  for (const row of input.rows) {
    if (!object(row) || Object.keys(row).some(key => !["id", ...MONEY_KEYS].includes(key))
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.id)
      || seen.has(row.id)) return null;
    for (const key of MONEY_KEYS) {
      if (!integer(row[key], key === "netCents" ? -MAX_CENTS : 0, MAX_CENTS)) return null;
    }
    if (row.netCents !== row.grossCents - row.feesCents - row.vehicleCents) return null;
    seen.add(row.id);
    rows.push({ id: row.id, grossCents: row.grossCents, feesCents: row.feesCents,
      vehicleCents: row.vehicleCents, netCents: row.netCents });
  }
  return { rows, unpricedCount: input.unpricedCount };
}

async function boundedReply(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) { await reader.cancel(); throw new Error("oversized response"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export async function attestFinancialFacts(input: PeelFinancialInput): Promise<PeelFinancialAttestation> {
  const safe = projection(input);
  const coverage = { pricedCount: safe?.rows.length ?? 0, unpricedCount: safe?.unpricedCount ?? 0 };
  const unavailable = (reason: string): PeelFinancialAttestation =>
    ({ available: false, verified: false, engine: ENGINE, coverage, tools: [], reason });
  if (!safe) return unavailable("invalid-numeric-projection");
  const config = configuration();
  if (!config) return unavailable("not-configured");
  const body = JSON.stringify({ version: 1, ...safe });
  if (Buffer.byteLength(body) > MAX_BODY) return unavailable("projection-too-large");
  try {
    const response = await fetch(config.endpoint, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json",
        Authorization: `Bearer ${config.token}` },
      body, signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return unavailable("worker-unavailable");
    const reply = await boundedReply(response);
    const digest = createHash("sha256").update(body).digest("hex");
    if (!object(reply) || reply.version !== 1 || reply.engine !== ENGINE
      || reply.requestDigest !== digest || reply.modelCalls !== 0
      || typeof reply.sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(reply.sourceDigest)
      || !object(reply.coverage) || reply.coverage.pricedCount !== coverage.pricedCount
      || reply.coverage.unpricedCount !== coverage.unpricedCount
      || !Array.isArray(reply.tools) || reply.tools.some(tool => typeof tool !== "string" || !TOOL_NAMES.includes(tool))) {
      return unavailable("invalid-worker-reply");
    }
    if (reply.verified !== true) {
      return { available: true, verified: false, engine: ENGINE, coverage, tools: [],
        sourceDigest: reply.sourceDigest, modelCalls: 0,
        reason: safe.rows.length === 0 ? "no-priced-records" : "verification-unavailable" };
    }
    const totals = reply.totals;
    const tools = reply.tools as string[];
    if (safe.rows.length === 0 || !object(totals) || totals.pricedCount !== safe.rows.length
      || TOOL_NAMES.some(name => !tools.includes(name))
      || MONEY_KEYS.some(key => !integer(totals[key], key === "netCents" ? -MAX_ROWS * MAX_CENTS : 0, MAX_ROWS * MAX_CENTS))) {
      return unavailable("invalid-worker-reply");
    }
    return { available: true, verified: true, engine: ENGINE, coverage,
      tools: [...new Set(tools)], sourceDigest: reply.sourceDigest, modelCalls: 0,
      totals: { pricedCount: safe.rows.length, grossCents: totals.grossCents as number,
        feesCents: totals.feesCents as number, vehicleCents: totals.vehicleCents as number,
        netCents: totals.netCents as number } };
  } catch { return unavailable("worker-unavailable"); }
}
