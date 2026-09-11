/**
 * PPC economics — decide whether paying to advertise a keyword is worth it
 * against the product's margin. Pure, integer cents, deterministic.
 *
 * The core question: each click costs `cpc`; a fraction `conversionRate` of
 * clicks become sales; each sale earns `valuePerConversion` (gross profit). So
 * the cost to win one sale (CPA) is cpc / conversionRate, and PPC pays off only
 * when the profit per sale exceeds that CPA.
 */
export type PpcVerdict = "worth" | "marginal" | "skip";

export interface KeywordInput {
  keyword: string;
  /** average cost per click, cents. */
  cpcCents: number;
  /** estimated monthly search volume for the keyword. */
  monthlySearches: number;
}

export interface PpcAssumptions {
  /** click-through rate: impressions -> clicks (fraction, e.g. 0.04). */
  ctr: number;
  /** conversion rate: clicks -> sales (fraction, e.g. 0.02). */
  conversionRate: number;
  /** gross profit earned per conversion, cents (e.g. GP on a case/order). */
  valuePerConversionCents: number;
}

export interface KeywordEconomics {
  keyword: string;
  cpcCents: number;
  monthlySearches: number;
  /** cost to acquire one sale = cpc / conversionRate, cents. */
  cpaCents: number;
  /** profit left after acquisition = value - cpa, cents (can be negative). */
  profitPerConversionCents: number;
  /** return on ad spend = value / cpa (gross-profit basis). */
  roas: number;
  /** conversion rate needed just to break even at this cpc + value. */
  breakEvenConversionRate: number;
  /** the highest cpc you could pay and still break even at the assumed cvr. */
  breakEvenCpcCents: number;
  /** projected monthly: clicks, conversions, ad spend, gross profit, net. */
  monthlyClicks: number;
  monthlyConversions: number;
  monthlySpendCents: number;
  monthlyGrossProfitCents: number;
  monthlyNetCents: number;
  verdict: PpcVerdict;
}

function verdictFor(roas: number): PpcVerdict {
  if (!Number.isFinite(roas)) return "skip";
  if (roas >= 1.5) return "worth";
  if (roas >= 1.0) return "marginal";
  return "skip";
}

export function evaluateKeyword(kw: KeywordInput, a: PpcAssumptions): KeywordEconomics {
  if (a.conversionRate <= 0 || a.conversionRate > 1) {
    throw new RangeError(`conversionRate must be in (0,1], got ${a.conversionRate}`);
  }
  if (a.ctr < 0 || a.ctr > 1) throw new RangeError(`ctr must be in [0,1], got ${a.ctr}`);
  if (kw.cpcCents < 0) throw new RangeError(`cpcCents cannot be negative`);

  const value = a.valuePerConversionCents;
  const cpaCents = Math.round(kw.cpcCents / a.conversionRate);
  const profitPerConversionCents = value - cpaCents;
  const roas = cpaCents === 0 ? Infinity : value / cpaCents;
  const breakEvenConversionRate = value === 0 ? Infinity : kw.cpcCents / value;
  const breakEvenCpcCents = Math.round(value * a.conversionRate);

  const monthlyClicks = Math.round(kw.monthlySearches * a.ctr);
  const monthlyConversions = monthlyClicks * a.conversionRate;
  const monthlySpendCents = Math.round(monthlyClicks * kw.cpcCents);
  const monthlyGrossProfitCents = Math.round(monthlyConversions * value);
  const monthlyNetCents = monthlyGrossProfitCents - monthlySpendCents;

  return {
    keyword: kw.keyword,
    cpcCents: kw.cpcCents,
    monthlySearches: kw.monthlySearches,
    cpaCents,
    profitPerConversionCents,
    roas,
    breakEvenConversionRate,
    breakEvenCpcCents,
    monthlyClicks,
    monthlyConversions: Math.round(monthlyConversions * 100) / 100,
    monthlySpendCents,
    monthlyGrossProfitCents,
    monthlyNetCents,
    verdict: verdictFor(roas),
  };
}

export interface CampaignEconomics {
  rows: KeywordEconomics[];
  totalMonthlySpendCents: number;
  totalMonthlyGrossProfitCents: number;
  totalMonthlyNetCents: number;
  blendedRoas: number;
  worthCount: number;
}

export function evaluateCampaign(keywords: KeywordInput[], a: PpcAssumptions): CampaignEconomics {
  const rows = keywords.map((k) => evaluateKeyword(k, a));
  const totalMonthlySpendCents = rows.reduce((n, r) => n + r.monthlySpendCents, 0);
  const totalMonthlyGrossProfitCents = rows.reduce((n, r) => n + r.monthlyGrossProfitCents, 0);
  return {
    rows,
    totalMonthlySpendCents,
    totalMonthlyGrossProfitCents,
    totalMonthlyNetCents: totalMonthlyGrossProfitCents - totalMonthlySpendCents,
    blendedRoas:
      totalMonthlySpendCents === 0 ? Infinity : totalMonthlyGrossProfitCents / totalMonthlySpendCents,
    worthCount: rows.filter((r) => r.verdict === "worth").length,
  };
}
