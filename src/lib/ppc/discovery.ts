import { setting } from "../connections/vault";
import { z } from "zod";
import { domainOf, publicWebsite, type Market } from "./market";
import { candidate, type ResearchResult } from "./research";

/** Search API results are discovery evidence, not proof that a domain advertises. */
export async function discoverCompetitors(query: string, market: Market): Promise<ResearchResult> {
  const parsed = z.object({ query: z.string().trim().min(3).max(200), market: z.enum(["US", "CA", "GB", "AU"]) }).safeParse({ query, market });
  if (!parsed.success) return { ok: false, competitors: [], error: "Enter a product or buyer search and select a country." };
  const key = setting("BRAVE_SEARCH_API_KEY");
  if (!key) return { ok: false, competitors: [], error: "Live discovery needs a search connection. The sourced Shuug research is ready below; you can also add a website or import Auction Insights." };
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.search = new URLSearchParams({ q: `${parsed.data.query} -site:shuug.co`, country: market, search_lang: "en", count: "10", text_decorations: "false" }).toString();
    const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { ok: false, competitors: [], error: `Search connection returned ${response.status}. Check the subscription and available quota.` };
    const data = await response.json() as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
    const seen = new Set<string>();
    const competitors = (data.web?.results ?? []).flatMap(r => {
      const domain = r.url ? domainOf(r.url) : null, link = r.url ? publicWebsite(r.url) : null;
      if (!domain || !link || domain === "shuug.co" || seen.has(domain)) return [];
      seen.add(domain);
      const plain = (text: string) => text.replace(/<[^>]*>/g, "").slice(0, 300);
      return [candidate(domain, { title: plain(r.title || domain), url: link, finding: plain(r.description || "Search result; open the source to verify relevance.") })];
    });
    return { ok: true, competitors, query: parsed.data.query, fetchedAt: new Date().toISOString() };
  } catch { return { ok: false, competitors: [], error: "Live search is unavailable. Existing research and imports are still available." }; }
}
