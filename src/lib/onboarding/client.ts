/**
 * Business trace — fetch a pasted URL and assemble a BusinessProfile. Tries the
 * Shopify products.json first (clean structured products), falls back to JSON-LD
 * in the page HTML. Also detects the platform and where the business lives
 * online. All network here; parsing lives in ./trace (pure). Fail-soft: returns
 * whatever it could find with a clear error if the fetch fails.
 */
import {
  detectPlatform,
  extractBusinessMeta,
  findPresence,
  parseJsonLdProducts,
  parseShopifyProducts,
  type BusinessProfile,
  type DiscoveredProduct,
} from "./trace";

export interface TraceResult {
  ok: boolean;
  profile?: BusinessProfile;
  error?: string;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ShuugBusiness/1.0 (+business onboarding)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function getShopifyProducts(origin: string): Promise<DiscoveredProduct[]> {
  for (const path of ["/products.json?limit=250", "/collections/all/products.json?limit=250"]) {
    const text = await getText(`${origin}${path}`);
    if (!text) continue;
    try {
      const data = JSON.parse(text);
      const products = parseShopifyProducts(data);
      if (products.length > 0) return products;
    } catch {
      // not JSON / not Shopify — try next
    }
  }
  return [];
}

export async function traceBusiness(rawUrl: string): Promise<TraceResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: "Enter a valid website address, e.g. yourshop.com" };

  const html = await getText(url);
  if (html === null) {
    return { ok: false, error: "Couldn't reach that address. Check it and try again." };
  }

  const origin = new URL(url).origin;
  const meta = extractBusinessMeta(html);
  const platform = detectPlatform(html);
  const presence = findPresence(html);

  // Products: Shopify JSON first, then JSON-LD in the page.
  let products = await getShopifyProducts(origin);
  if (products.length === 0) products = parseJsonLdProducts(html);

  return {
    ok: true,
    profile: { url, name: meta.name, description: meta.description, platform, products, presence },
  };
}
