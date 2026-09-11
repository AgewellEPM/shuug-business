/**
 * AI ad-copy generation (grounded in the product). Structure/plan types live in
 * ./plan (pure); this module adds the LLM-backed asset generation. Nothing is
 * pushed anywhere — see ./google-ads for the (scaffolded) "run it" path.
 */
import { llmChat } from "../llm";
import { HEADLINE_MAX, DESCRIPTION_MAX, type AdAsset, type GeneratedAds } from "./plan";

export type { CampaignPlan, GeneratedAds, AdAsset } from "./plan";
export { HEADLINE_MAX, DESCRIPTION_MAX } from "./plan";

function asAssets(lines: string[], max: number): AdAsset[] {
  return lines
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length > 0)
    .map((text) => ({ text, chars: text.length, withinLimit: text.length <= max }));
}

function parseAdSections(raw: string): { headlines: string[]; descriptions: string[] } {
  const lower = raw.toLowerCase();
  const hIdx = lower.indexOf("headline");
  const dIdx = lower.indexOf("description");
  const headSection = dIdx > hIdx && hIdx >= 0 ? raw.slice(hIdx, dIdx) : raw;
  const descSection = dIdx >= 0 ? raw.slice(dIdx) : "";
  const bullets = (s: string) =>
    s.split("\n").filter((l) => /^[-*\d.)\s]*\S/.test(l) && !/^(headlines?|descriptions?)/i.test(l.trim()));
  return { headlines: bullets(headSection), descriptions: bullets(descSection) };
}

export async function generateAds(
  productName: string,
  brand: string,
  keywords: string[],
): Promise<GeneratedAds> {
  const system = `You are a Google Ads copywriter for ${brand}, a wholesale hot-sauce brand selling to grocery stores and distributors. Write responsive search ad assets.
Rules: headlines <= ${HEADLINE_MAX} characters, descriptions <= ${DESCRIPTION_MAX} characters. Be specific and benefit-driven. Only claim facts supplied below. Do not invent delivery speed, discounts, certifications, minimum orders, prices or retailer margins. Do not mention competitor brands. Facts: Shuug sells Amba, Zhoug and Harissa sauces to retail and foodservice buyers; wholesale ordering is available. No emojis.`;
  const prompt = `Product: ${productName}. Target keywords: ${keywords.slice(0, 10).join(", ")}.
Write exactly:
HEADLINES:
- (8 headlines, each <= ${HEADLINE_MAX} chars)
DESCRIPTIONS:
- (4 descriptions, each <= ${DESCRIPTION_MAX} chars)`;

  const res = await llmChat({ system, messages: [{ role: "user", content: prompt }], temperature: 0.6 });
  if (!res.ok || !res.text) {
    return { ok: false, headlines: [], descriptions: [], error: res.error ?? "no output" };
  }
  const { headlines, descriptions } = parseAdSections(res.text);
  return {
    ok: true,
    headlines: asAssets(headlines, HEADLINE_MAX).slice(0, 10),
    descriptions: asAssets(descriptions, DESCRIPTION_MAX).slice(0, 6),
  };
}
