/** Google money uses micros of the account currency. Missing metrics stay unknown. */
export function microsToCents(micros: number): number {
  return Number.isFinite(micros) && micros >= 0 ? Math.round(micros / 10_000) : 0;
}
export function centsToMicros(cents: number): number { return Math.round(cents) * 10_000; }
export interface RawMetrics {
  avgMonthlySearches?: string | number | null;
  averageCpcMicros?: string | number | null;
  lowTopOfPageBidMicros?: string | number | null;
  highTopOfPageBidMicros?: string | number | null;
  competition?: string;
  competitionIndex?: string | number | null;
}
export interface KeywordIdeaRaw {
  text: string;
  closeVariants?: string[];
  keywordIdeaMetrics?: RawMetrics | null;
  keywordMetrics?: RawMetrics | null;
}
export interface KeywordMetric {
  keyword: string;
  cpcCents: number | null;
  monthlySearches: number | null;
  lowBidCents: number | null;
  highBidCents: number | null;
  competition: string;
  competitionIndex: number | null;
  cpcBasis: "historical_average" | "bid_proxy" | "unavailable";
  closeVariants: string[];
}
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function mapKeywordIdea(raw: KeywordIdeaRaw): KeywordMetric {
  const m = raw.keywordIdeaMetrics ?? raw.keywordMetrics;
  const average = num(m?.averageCpcMicros);
  const low = num(m?.lowTopOfPageBidMicros);
  const high = num(m?.highTopOfPageBidMicros);
  const proxy = low !== null && high !== null ? (low + high) / 2 : high ?? low;
  const cpc = average ?? proxy;
  return {
    keyword: raw.text.trim(), cpcCents: cpc === null ? null : microsToCents(cpc),
    monthlySearches: num(m?.avgMonthlySearches), lowBidCents: low === null ? null : microsToCents(low),
    highBidCents: high === null ? null : microsToCents(high), competition: m?.competition ?? "UNKNOWN",
    competitionIndex: num(m?.competitionIndex),
    cpcBasis: average !== null ? "historical_average" : proxy !== null ? "bid_proxy" : "unavailable",
    closeVariants: raw.closeVariants ?? [],
  };
}
export function mapKeywordIdeas(results: KeywordIdeaRaw[]): KeywordMetric[] {
  const seen = new Set<string>();
  return results.filter(r => typeof r.text === "string").map(mapKeywordIdea).filter(k => {
    const key = k.keyword.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
