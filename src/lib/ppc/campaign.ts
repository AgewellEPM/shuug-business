import { z } from "zod";
import { MARKETS, publicWebsite } from "./market";
import { centsToMicros } from "./google-ads-map";
import type { CampaignPlan, GeneratedAds } from "./plan";
const keyword = z.string().trim().min(1).max(80);
export const campaignSchema = z.object({
  campaignName: z.string().trim().min(1).max(100),
  dailyBudgetCents: z.number().int().min(100).max(100_000),
  maxCpcCents: z.number().int().min(1).max(10_000),
  finalUrl: z.string().max(2048).refine(v => !!publicWebsite(v) && v.startsWith("https://"), "Enter a public HTTPS landing page."),
  market: z.enum(["US", "CA", "GB", "AU"]),
  keywords: z.array(keyword).min(1).max(50), skipKeywords: z.array(keyword).max(100),
  negativeKeywords: z.array(keyword).max(100),
}).refine(p => p.maxCpcCents <= p.dailyBudgetCents, "CPC cap must not exceed the daily budget.");

/** Never trust client withinLimit flags; validate actual copy. */
export function validatedDraft(plan: CampaignPlan, ads: GeneratedAds) {
  const p = campaignSchema.parse(plan);
  const asset = (max: number) => z.object({ text: z.string().trim().min(1).max(max) });
  const a = z.object({ ok: z.literal(true), headlines: z.array(asset(30)).min(3).max(15), descriptions: z.array(asset(90)).min(2).max(4) }).parse(ads);
  const unique = (values: string[]) => [...new Map(values.map(v => [v.toLowerCase(), v])).values()];
  const headlines = unique(a.headlines.map(h => h.text)), descriptions = unique(a.descriptions.map(d => d.text));
  if (headlines.length < 3 || descriptions.length < 2) throw new Error("Use at least 3 different headlines and 2 different descriptions.");
  const negatives = unique(p.negativeKeywords), keywords = unique(p.keywords);
  for (const kw of keywords) {
    if (negatives.some(n => ` ${kw.toLowerCase()} `.includes(` ${n.toLowerCase()} `))) {
      throw new Error(`Negative keyword conflicts with “${kw}”. Remove the conflict before validation.`);
    }
  }
  return { plan: { ...p, keywords, negativeKeywords: negatives }, headlines, descriptions };
}

/** One atomic mutation, using temporary resources, avoids orphan campaign pieces. */
export function campaignOperations(customerId: string, draft: ReturnType<typeof validatedDraft>, reviewId: string) {
  const { plan: p, headlines, descriptions } = draft;
  const resource = (kind: string, id: number) => `customers/${customerId}/${kind}/${id}`;
  const budget = resource("campaignBudgets", -1), campaign = resource("campaigns", -2), adGroup = resource("adGroups", -3);
  const market = MARKETS[p.market];
  return [
    { campaignBudgetOperation: { create: { resourceName: budget, name: `${p.campaignName} ${reviewId.slice(0, 8)}`, amountMicros: String(centsToMicros(p.dailyBudgetCents)), deliveryMethod: "STANDARD", explicitlyShared: false } } },
    { campaignOperation: { create: {
      resourceName: campaign, name: `${p.campaignName} [${reviewId.slice(0, 8)}]`, status: "PAUSED",
      advertisingChannelType: "SEARCH", campaignBudget: budget, manualCpc: {},
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE", negativeGeoTargetType: "PRESENCE" },
    } } },
    { campaignCriterionOperation: { create: { campaign, location: { geoTargetConstant: `geoTargetConstants/${market.geoId}` } } } },
    { campaignCriterionOperation: { create: { campaign, language: { languageConstant: `languageConstants/${market.languageId}` } } } },
    ...p.negativeKeywords.map(text => ({ campaignCriterionOperation: { create: { campaign, negative: true, keyword: { text, matchType: "PHRASE" } } } })),
    { adGroupOperation: { create: { resourceName: adGroup, name: "Wholesale intent", campaign, status: "PAUSED", type: "SEARCH_STANDARD", cpcBidMicros: String(centsToMicros(p.maxCpcCents)) } } },
    ...p.keywords.map(text => ({ adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", cpcBidMicros: String(centsToMicros(p.maxCpcCents)), keyword: { text, matchType: "PHRASE" } } } })),
    { adGroupAdOperation: { create: { adGroup, status: "PAUSED", ad: { finalUrls: [p.finalUrl], responsiveSearchAd: { headlines: headlines.map(text => ({ text })), descriptions: descriptions.map(text => ({ text })) } } } } },
  ];
}
