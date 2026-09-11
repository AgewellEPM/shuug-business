import { domainOf, type Market } from "./market";

export interface EvidenceSource { title: string; url: string; finding: string }
export interface Competitor {
  domain: string; name: string; kind: "Direct" | "Adjacent" | "Candidate";
  positioning: string; wholesale: string; format: string; shelfLife: string;
  products: string[]; sources: EvidenceSource[]; checkedAt: string;
  opportunity: string; experiment: string; keywords: string[];
}
const checkedAt = "2026-09-09";
/** Public-source research snapshots, not live advertising observations. */
export const COMPETITORS: Competitor[] = [
  {
    domain: "nyshuk.com", name: "New York Shuk", kind: "Direct", products: ["harissa", "amba", "zhoug"],
    positioning: "Middle Eastern pantry brand with a harissa-led assortment and recipe education.",
    wholesale: "Wholesale available to restaurants, hotels and retailers.", format: "Harissa, spice blends and pantry condiments", shelfLife: "Not verified",
    sources: [
      { title: "Wholesale & product FAQ", url: "https://www.nyshuk.com/faq/", finding: "Offers wholesale pricing to hospitality and retail buyers." },
      { title: "Product assortment", url: "https://www.nyshuk.com/shop-shuk", finding: "Harissa, preserved lemon, matbucha and spice collections." },
    ], checkedAt,
    opportunity: "Make Shuug’s Amba + Zhoug + Harissa assortment easy for a buyer to understand in one visit.",
    experiment: "Test a three-flavor wholesale landing page against a single-product page. Measure qualified buyer requests and first-order gross profit.",
    keywords: ["harissa wholesale", "middle eastern sauces wholesale", "zhoug sauce wholesale"],
  },
  {
    domain: "zwitafoods.com", name: "Zwïta", kind: "Direct", products: ["harissa"],
    positioning: "Tunisian family heritage and traditional sun-dried chili harissa paste.",
    wholesale: "US retail presence; wholesale terms not verified.", format: "Harissa paste in jars", shelfLife: "1 year unopened (brand FAQ)",
    sources: [{ title: "Product & shelf-life FAQ", url: "https://zwitafoods.com/pages/faqs", finding: "Describes traditional Tunisian harissa, a one-year shelf life and refrigeration after opening." }], checkedAt,
    opportunity: "Give buyers specific shelf-life and usage information. Shuug’s Amba page states 18 months unopened; verify each SKU before using it in ads.",
    experiment: "Compare a flavor-first pitch with a retailer information sheet: shelf life, case size, margin and uses. Track qualified responses, not only clicks.",
    keywords: ["harissa sauce for retailers", "harissa wholesale", "mediterranean hot sauce wholesale"],
  },
  {
    domain: "yellowbirdfoods.com", name: "Yellowbird", kind: "Adjacent", products: ["amba", "zhoug", "harissa"],
    positioning: "Broad hot-sauce range with a clear restaurant and storefront wholesale entry point.",
    wholesale: "Direct wholesale application for restaurants and brick-and-mortar stores.", format: "Bulk bags, tabletop bottles and travel sizes", shelfLife: "Not verified",
    sources: [{ title: "Wholesale program", url: "https://www.yellowbirdfoods.com/pages/wholesale", finding: "Organizes wholesale around bulk, tabletop and travel formats, with a buyer application." }], checkedAt,
    opportunity: "Target buyers looking for Mediterranean flavors and show the exact formats Shuug actually offers.",
    experiment: "Test ‘Mediterranean sauces for your shelves’ against generic ‘wholesale hot sauce’. Compare cost per qualified buyer and first-order margin.",
    keywords: ["mediterranean sauces wholesale", "hot sauce for specialty stores", "amba sauce wholesale"],
  },
  {
    domain: "brooklyndelhi.com", name: "Brooklyn Delhi", kind: "Adjacent", products: ["amba", "zhoug", "harissa"],
    positioning: "Indian pantry sauces and condiments with a retailer-focused wholesale offer.",
    wholesale: "Faire wholesale; introductory offers and payment terms have eligibility conditions.", format: "Sauces, condiments and bundles", shelfLife: "Not verified",
    sources: [{ title: "Retailer wholesale offer", url: "https://brooklyndelhi.com/pages/wholesale", finding: "Promotes Faire ordering, eligible retailer terms and introductory benefits subject to conditions." }], checkedAt,
    opportunity: "Reduce buying friction with clear case pricing, an easy first-order path and a direct reorder link.",
    experiment: "Test a guided first-order page. Publish only approved minimums and shipping terms; measure completed orders and repeat purchases.",
    keywords: ["specialty sauces wholesale", "sauces for independent grocers", "wholesale mediterranean condiments"],
  },
];
export const SHUUG_SOURCES: EvidenceSource[] = [
  { title: "Shuug Amba product details", url: "https://shuug.co/products/original-amba-sauce", finding: "Green mango and habanero; 9 oz bottle; page states 18-month unopened shelf life." },
  { title: "Shuug wholesale", url: "https://shuug.co/collections/wholesale", finding: "Public wholesale collection for retail and foodservice buyers." },
];
export function candidate(domain: string, source?: EvidenceSource): Competitor {
  return { domain, name: domain, kind: "Candidate", products: [], positioning: "Review this business to confirm product and buyer overlap.", wholesale: "Not researched", format: "Not researched", shelfLife: "Not researched", sources: source ? [source] : [], checkedAt: new Date().toISOString().slice(0, 10), opportunity: "Confirm the offer and audience before choosing a response.", experiment: "Review the website, capture evidence and compare keyword demand.", keywords: [] };
}
export interface AuctionRow {
  domain: string; impressionShare: string; overlapRate: string; positionAbove: string; topOfPage: string; outrankingShare: string;
  period: string; market: Market; importedAt: string;
}
export interface SpendEvidence {
  domain: string; amountCents: number; source: string; period: string; market: Market;
  importedAt: string; basis: "third_party_estimate";
}
export interface ResearchResult { ok: boolean; competitors: Competitor[]; error?: string; query?: string; fetchedAt?: string }

/** A scenario for the selected keyword basket; never presented as a rival's total spend. */
export function modeledSpend(searches: number, cpcCents: number, visibility: number, ctr: number) {
  if (![searches, cpcCents, visibility, ctr].every(Number.isFinite) || searches < 0 || cpcCents < 0 || visibility < 0 || visibility > 1 || ctr < 0 || ctr > 1) return null;
  return Math.round(searches * visibility * ctr * cpcCents);
}
export function mergeCompetitors(existing: Competitor[], incoming: Competitor[]): Competitor[] {
  const result = new Map(existing.map(c => [c.domain, c]));
  for (const c of incoming) {
    const domain = domainOf(c.domain);
    if (domain && domain !== "shuug.co" && !result.has(domain)) result.set(domain, { ...c, domain });
  }
  return [...result.values()].slice(0, 50);
}
