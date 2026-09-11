"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { COMPETITORS, SHUUG_SOURCES, candidate, mergeCompetitors, type Competitor, type AuctionRow, type SpendEvidence } from "@/lib/ppc/research";
import { importAuctionCsv, importSpendCsv, AUCTION_TEMPLATE, SPEND_TEMPLATE } from "@/lib/ppc/imports";
import { domainOf, publicWebsite, MARKETS, type Market } from "@/lib/ppc/market";
import { researchAction } from "@/app/ads/actions";
import { formatCents } from "@/lib/money";

export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const savedSchema = z.object({
  domains: z.array(z.string().max(253)).max(50),
  candidates: z.array(z.object({domain:z.string().max(253),checkedAt:z.string().max(30),sources:z.array(z.object({title:z.string().max(500),finding:z.string().max(3000),url:z.string().max(2000).refine(v=>!!publicWebsite(v))})).max(10)})).max(50).optional(),
  auctionsCsv: z.string().max(500_000).optional(), spendCsv: z.string().max(500_000).optional(),
  period: z.string().max(80).optional(), auctionMarket: z.enum(["US", "CA", "GB", "AU"]).optional(),
  notes: z.record(z.string().max(253), z.string().max(2000)).optional(),
});
const cls = "dd-input";
export function CompetitorResearch({ market, product, searchConfigured, onKeywords }: { market: Market; product: string; searchConfigured: boolean; onKeywords: (keywords: string[], website?: string) => void }) {
  const [competitors, setCompetitors] = useState<Competitor[]>(COMPETITORS);
  const [selected, setSelected] = useState("nyshuk.com");
  const [query, setQuery] = useState("harissa zhoug amba sauces wholesale");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [spend, setSpend] = useState<SpendEvidence[]>([]);
  const [period, setPeriod] = useState("");
  const [auctionMarket, setAuctionMarket] = useState<Market>(market);
  const [auctionCsv, setAuctionCsv] = useState("");
  const [spendCsv, setSpendCsv] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("All");
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem("dealdesk-research-v1");
        if (raw) {
          const saved = savedSchema.parse(JSON.parse(raw));
          const restored=(saved.candidates||[]).filter(c=>domainOf(c.domain)).map(c=>({...candidate(domainOf(c.domain)!),checkedAt:c.checkedAt,sources:c.sources}));
          setCompetitors(mergeCompetitors(mergeCompetitors(COMPETITORS,restored), saved.domains.filter(d => domainOf(d)).map(d => candidate(domainOf(d)!))));
          setNotes(saved.notes ?? {});
          setPeriod(saved.period ?? ""); setAuctionMarket(saved.auctionMarket ?? "US");
          if (saved.auctionsCsv && saved.period) { setAuctions(importAuctionCsv(saved.auctionsCsv, saved.period, saved.auctionMarket ?? "US")); setAuctionCsv(saved.auctionsCsv); }
          if (saved.spendCsv) { setSpend(importSpendCsv(saved.spendCsv)); setSpendCsv(saved.spendCsv); }
        }
      } catch { setMessage("Saved research could not be restored. The sourced starting research is available."); }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem("dealdesk-research-v1", JSON.stringify({ domains: competitors.map(c => c.domain), candidates:competitors.filter(c=>c.kind==="Candidate").map(c=>({domain:c.domain,checkedAt:c.checkedAt,sources:c.sources})), auctionsCsv: auctionCsv, spendCsv, period: auctions[0]?.period ?? period, auctionMarket: auctions[0]?.market ?? auctionMarket, notes })); }
    catch { setTimeout(() => setMessage("Browser storage is full or unavailable. Export your brief to keep this research."), 0); }
  }, [competitors, auctionCsv, spendCsv, period, auctionMarket, auctions, notes, ready]);
  const current = competitors.find(c => c.domain === selected) ?? competitors[0];
  const visible = competitors.filter(c => filter === "All" || filter === "Relevant" && (c.products.some(p => product.toLowerCase().includes(p)) || c.kind === "Candidate") || c.kind === filter);
  const auction = auctions.find(a => a.domain === current.domain && a.market === market);
  const estimates = spend.filter(s => s.domain === current.domain && s.market === market).sort((a,b) => b.period.localeCompare(a.period));
  function addDomain() {
    const normalized = domainOf(domain);
    if (!normalized || normalized === "shuug.co") { setMessage("Enter a competitor’s public website, such as example.com."); return; }
    setCompetitors(p => mergeCompetitors(p, [candidate(normalized)])); setSelected(normalized); setDomain("");
    setMessage("Website added. Review its offer and attach your findings in research notes.");
  }
  async function discover() {
    setBusy(true); setMessage("");
    try {
      const result = await researchAction(query, market);
      if (result.ok) { setCompetitors(p => mergeCompetitors(p, result.competitors)); setMessage(`Found ${result.competitors.length} candidate websites. Search results do not prove they run ads.`); }
      else setMessage(result.error || "Research is unavailable.");
    } catch { setMessage("Search did not complete. Try again."); }
    finally { setBusy(false); }
  }
  async function importFile(file: File | undefined, kind: "auction" | "spend") {
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error("Choose a CSV smaller than 500 KB.");
      const text = await file.text();
      if (kind === "auction") {
        const rows = importAuctionCsv(text, period, auctionMarket); setAuctions(rows); setAuctionCsv(text);
        setCompetitors(p => mergeCompetitors(p, rows.map(r => candidate(r.domain)))); setMessage(`Imported ${rows.length} auction competitors for ${period}.`);
      } else {
        const rows = importSpendCsv(text); setSpend(rows); setSpendCsv(text);
        setCompetitors(p => mergeCompetitors(p, rows.map(r => candidate(r.domain)))); setMessage(`Imported ${rows.length} third-party spend estimates, with provider, month and country.`);
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : "Import failed."); }
  }
  function exportBrief() {
    downloadText("shuug-competitor-brief.md", ["# Shuug competitor research", `Exported: ${new Date().toISOString()} | Market: ${MARKETS[market].label}`, "Public-source findings and test hypotheses. Exact competitor ad spend is unavailable. Imported estimates are not verified account spend.", ...competitors.map(c => [
      `\n## ${c.name} (${c.kind})`, c.domain, `Source snapshot: ${c.checkedAt}`, c.positioning, `Wholesale: ${c.wholesale}`, `Opportunity hypothesis: ${c.opportunity}`, `Test: ${c.experiment}`,
      ...c.sources.map(s => `- ${s.finding} [${s.title}](${s.url})`),
      ...spend.filter(s => s.domain === c.domain && s.market === market).map(s => `Estimated paid-search spend: ${formatCents(s.amountCents)}/month; ${s.source}; ${s.period}; ${s.market}.`),
      ...auctions.filter(a => a.domain === c.domain && a.market === market).map(a => `Auction Insights (${a.period}, ${a.market}): impression share ${a.impressionShare}, overlap ${a.overlapRate}.`),
      notes[c.domain] ? `Your notes: ${notes[c.domain]}` : "",
    ].join("\n"))].join("\n\n"), "text/markdown");
  }
  return <div className="space-y-5">
    <div className="dd-card flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="font-semibold">Know who your buyers are comparing you with</h2><p className="mt-1 text-sm text-slate-500">{competitors.length} businesses on your research board · public sources checked September 9, 2026</p></div>
      <button className="dd-button" onClick={exportBrief}>Export research brief ↗</button>
    </div>
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section className="dd-card !p-4">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Competitors</h2><select aria-label="Filter competitors" className="rounded border border-slate-200 px-2 py-1 text-xs" value={filter} onChange={e => setFilter(e.target.value)}>{["All", "Relevant", "Direct", "Adjacent", "Candidate"].map(f => <option key={f}>{f}</option>)}</select></div>
        <div className="space-y-1">{visible.map(c => <button key={c.domain} onClick={() => setSelected(c.domain)} className={`w-full rounded-lg p-3 text-left transition ${current.domain === c.domain ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"}`}>
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold">{c.name.slice(0,2).toUpperCase()}</span><div><p className="text-sm font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.kind} · {auctions.some(a => a.domain === c.domain && a.market === market) ? "Auction evidence" : "Website research"}</p></div></div>
        </button>)}</div>
        {!visible.length && <p className="py-4 text-sm text-slate-500">No businesses match this filter.</p>}
        <form className="mt-5 border-t border-slate-100 pt-4" onSubmit={e => { e.preventDefault(); addDomain(); }}><label className="text-xs font-medium">Add a competitor website<input className={`${cls} mt-2`} placeholder="competitor.com" value={domain} onChange={e => setDomain(e.target.value)} maxLength={253} /></label><button className="dd-button mt-2 w-full">Add to research</button></form>
      </section>
      <section className="dd-card">
        <div className="flex flex-wrap justify-between gap-3"><div><span className="dd-badge">{current.kind} competitor</span><h2 className="mt-2 text-xl font-semibold tracking-tight">{current.name}</h2><a href={`https://${current.domain}`} target="_blank" rel="noreferrer" className="text-sm text-emerald-700 hover:underline">{current.domain} ↗</a></div><a href="https://adstransparency.google.com/" target="_blank" rel="noreferrer" className="dd-button h-fit">Review their ads ↗</a></div>
        <p className="mt-4 text-sm leading-6 text-slate-600">{current.positioning}</p>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[450px] text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="pb-3 font-medium text-slate-500">Compare</th><th className="pb-3 font-semibold">{current.name}</th><th className="pb-3 font-semibold text-emerald-800">Shuug</th></tr></thead><tbody className="divide-y divide-slate-100">
          <tr><th className="py-3 pr-3 font-medium">Offer</th><td className="max-w-64 py-3 pr-4 text-slate-600">{current.format}</td><td className="py-3 text-slate-600">Amba, Zhoug & Harissa sauces</td></tr>
          <tr><th className="py-3 pr-3 font-medium">Wholesale</th><td className="max-w-64 py-3 pr-4 text-slate-600">{current.wholesale}</td><td className="py-3 text-slate-600">Direct & Faire ordering</td></tr>
          <tr><th className="py-3 pr-3 font-medium">Shelf life</th><td className="py-3 pr-4 text-slate-600">{current.shelfLife}</td><td className="py-3 text-slate-600">Amba page: 18 months unopened</td></tr>
          <tr><th className="py-3 pr-3 font-medium">Ad spend</th><td className="py-3 pr-4 text-slate-600">{estimates[0] ? <>{formatCents(estimates[0].amountCents)}/mo <span className="block text-xs">Estimate · {estimates[0].source} · {estimates[0].period} · {market}</span></> : <><span className="text-slate-400">Unknown</span><span className="block text-xs">Import a provider estimate below</span></>}</td><td className="py-3 text-slate-600">Your actuals in Results</td></tr>
        </tbody></table></div>
        {auction && <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-xs font-medium">Imported Auction Insights · {auction.period} · {market}</p><div className="mt-2 grid grid-cols-3 gap-2 text-sm"><span>Impression share <strong className="block">{auction.impressionShare}</strong></span><span>Overlap <strong className="block">{auction.overlapRate}</strong></span><span>Position above <strong className="block">{auction.positionAbove}</strong></span></div></div>}
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4"><span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">What we can do differently · hypothesis</span><p className="mt-2 text-sm font-medium leading-6 text-emerald-950">{current.opportunity}</p><p className="mt-2 text-sm leading-6 text-emerald-900">{current.experiment}</p><button className="dd-primary mt-4" onClick={() => onKeywords(current.keywords.length ? current.keywords : ["wholesale hot sauce"], `https://${current.domain}`)}>Explore keyword opportunities →</button></div>
        <details className="mt-5 text-sm"><summary className="cursor-pointer font-medium text-slate-600">Sources & research notes</summary><p className="mt-3 text-xs text-slate-500">Snapshot: {current.checkedAt}. Category overlap is our research assessment; ad activity needs separate evidence. Search the advertiser name or domain in Google’s Ads Transparency Center.</p><ul className="mt-3 space-y-2">{[...current.sources, ...SHUUG_SOURCES].map(s => <li key={s.url}><a className="text-emerald-700 hover:underline" href={publicWebsite(s.url) || "#"} target="_blank" rel="noreferrer">{s.title} ↗</a><p className="text-xs leading-5 text-slate-500">{s.finding}</p></li>)}</ul><label className="mt-4 block text-xs font-medium">Your findings<textarea className={`${cls} mt-2 min-h-24`} placeholder="Add verified offers, landing-page observations, source URLs and dates…" maxLength={2000} value={notes[current.domain] || ""} onChange={e => setNotes(p => ({ ...p, [current.domain]: e.target.value }))} /></label></details>
      </section>
    </div>
    <section className="dd-card"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Find more competitors</h2><p className="mt-1 text-sm text-slate-500">Search the market for your product and buyer. New results enter as candidates for review.</p></div><span className="dd-badge">{searchConfigured ? "Search configured" : "Search not connected"}</span></div><form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); void discover(); }}><input aria-label="Competitor research query" className={cls} value={query} onChange={e => setQuery(e.target.value)} maxLength={200} /><button disabled={busy} className="dd-button shrink-0">{busy ? "Researching…" : "Research market"}</button></form></section>
    <section className="dd-card"><h2 className="font-semibold">Bring in competitive data</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Google Ads does not reveal competitors’ budgets. Auction Insights shows who overlaps with you; providers such as Semrush or SpyFu estimate paid-search spend. Keep the source, date and country with every estimate.</p>
      <div className="mt-5 grid gap-6 md:grid-cols-2"><div><h3 className="text-sm font-semibold">Auction Insights</h3><p className="mt-1 text-xs leading-5 text-slate-500">Export an English, unsegmented CSV from Google Ads → Insights and reports → Auction insights. Import replaces the previous auction report.</p><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs">Report date range<input className={`${cls} mt-1`} placeholder="Aug 1–31, 2026" value={period} onChange={e => setPeriod(e.target.value)} maxLength={80} /></label><label className="text-xs">Report market<select className={`${cls} mt-1`} value={auctionMarket} onChange={e => setAuctionMarket(e.target.value as Market)}>{Object.entries(MARKETS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></label></div><input className="mt-3 block w-full text-xs file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-2" aria-label="Import Auction Insights CSV" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={e => { void importFile(e.target.files?.[0], "auction"); e.target.value = ""; }} /><button className="mt-2 text-xs text-emerald-700 hover:underline" onClick={() => downloadText("auction-insights-template.csv", AUCTION_TEMPLATE, "text/csv")}>Download column template</button>{auctions.length > 0 && <p className="mt-2 text-xs text-emerald-700">{auctions.length} domains · {auctions[0].period} · {auctions[0].market}</p>}</div>
      <div><h3 className="text-sm font-semibold">Estimated competitor spend</h3><p className="mt-1 text-xs leading-5 text-slate-500">Map your provider export to our template: domain, estimated monthly spend in USD, provider, YYYY-MM, country code. Estimates remain labeled. Import replaces previous estimates.</p><input className="mt-3 block w-full text-xs file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-2" aria-label="Import estimated spend CSV" type="file" accept=".csv,text/csv" onChange={e => { void importFile(e.target.files?.[0], "spend"); e.target.value = ""; }} /><button className="mt-2 text-xs text-emerald-700 hover:underline" onClick={() => downloadText("competitor-spend-template.csv", SPEND_TEMPLATE, "text/csv")}>Download spend template</button>{spend.length > 0 && <p className="mt-2 text-xs text-emerald-700">{spend.length} estimates imported. Values show only for the selected country.</p>}</div></div>
    </section>
    {message && <p role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</p>}
    <p className="text-center text-xs text-slate-400">Research notes and imports are saved in this browser. Export a brief to share them.</p>
  </div>;
}
