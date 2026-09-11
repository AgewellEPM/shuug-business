import { domainOf, MARKETS, type Market } from "./market";
import type { AuctionRow, SpendEvidence } from "./research";

/** RFC-style quoted CSV, TSV, BOM and Google Ads report preambles. Bounded uploads. */
export function parseCsv(text: string): string[][] {
  if (text.length > 500_000) throw new Error("Choose a CSV smaller than 500 KB.");
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === delimiter || char === "\n")) {
      row.push(cell.trim()); cell = "";
      if (char === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length > 1000) throw new Error("Import up to 1,000 rows at a time.");
  return rows;
}
const header = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function table(text: string, required: string[]) {
  const rows = parseCsv(text);
  const index = rows.findIndex(r => required.every(key => r.some(c => header(c) === key)));
  if (index < 0) throw new Error(`Missing CSV columns: ${required.join(", ")}. Use the provided template or an English Google Ads export.`);
  const keys = rows[index].map(header);
  return rows.slice(index + 1).map((r, i) => {
    if (r.length !== keys.length) throw new Error(`Row ${index + i + 2}: column count does not match the header.`);
    return Object.fromEntries(keys.map((k, n) => [k, r[n] ?? ""]));
  });
}
function percentage(value: string | undefined) {
  if (!value || /^(—|--|-|n\/a)$/i.test(value)) return "—";
  if (!/^[<>]?\s*\d+(\.\d+)?%$/.test(value) || Number(value.replace(/[^\d.]/g, "")) > 100) throw new Error(`Invalid percentage: ${value}. Use values such as 24% or <10%.`);
  return value.replace(/\s/g, "");
}
export function importAuctionCsv(text: string, period: string, market: Market): AuctionRow[] {
  if (!period.trim() || period.length > 80 || !(market in MARKETS)) throw new Error("Add the report’s date range and country.");
  const normalized = text.replace(/Display URL domain/gi, "Domain");
  const rows = table(normalized, ["domain", "impressionshare"]), seen = new Set<string>();
  const result: AuctionRow[] = [];
  for (const r of rows) {
    if (/^(you|total[:\s].*)$/i.test(r.domain)) continue;
    const domain = domainOf(r.domain);
    if (!domain) throw new Error(`Invalid competitor domain: ${r.domain}`);
    if (domain === "shuug.co") continue;
    if (seen.has(domain)) throw new Error(`Duplicate ${domain}. Export an unsegmented report for one date range.`);
    seen.add(domain);
    result.push({ domain, impressionShare: percentage(r.impressionshare), overlapRate: percentage(r.overlaprate), positionAbove: percentage(r.positionaboverate), topOfPage: percentage(r.topofpagerate), outrankingShare: percentage(r.outrankingshare), period: period.trim(), market, importedAt: new Date().toISOString() });
  }
  if (!result.length) throw new Error("The report contains no competitor rows.");
  return result;
}
export function importSpendCsv(text: string): SpendEvidence[] {
  const rows = table(text, ["domain", "estimatedmonthlyspendusd", "source", "period", "market"]);
  const seen = new Set<string>();
  const result = rows.map(r => {
    const domain = domainOf(r.domain), market = r.market.toUpperCase() as Market;
    const amount = r.estimatedmonthlyspendusd.replace(/[$,]/g, "");
    if (!domain || domain === "shuug.co") throw new Error(`Invalid competitor domain: ${r.domain}`);
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) > 1_000_000_000) throw new Error(`Invalid estimated spend for ${domain}. Use a nonnegative USD amount.`);
    if (!(market in MARKETS) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period)) throw new Error("Use US, CA, GB or AU for market and YYYY-MM for the estimate month.");
    if (!r.source.trim() || r.source.length > 120) throw new Error("Every estimate needs its provider/source name.");
    const key = `${domain}:${market}:${r.period}`;
    if (seen.has(key)) throw new Error(`Duplicate estimate for ${domain} in this month and market.`);
    seen.add(key);
    return { domain, amountCents: Math.round(Number(amount) * 100), source: r.source, period: r.period, market, importedAt: new Date().toISOString(), basis: "third_party_estimate" as const };
  });
  if (!result.length) throw new Error("The CSV has no spend estimates.");
  return result;
}
export const SPEND_TEMPLATE = "domain,estimated_monthly_spend_usd,source,period,market\n";
export const AUCTION_TEMPLATE = "Domain,Impression share,Overlap rate,Position above rate,Top of page rate,Outranking share\n";
