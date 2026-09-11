/**
 * Business-trace parsers — pure. Turn what we fetch from a pasted URL into a
 * business profile: products (with prices), the platform it runs on, and where
 * else it lives online. No network here (the fetch lives in ./client), so this
 * is fully unit-testable.
 *
 * The clean path: most small food makers are on Shopify, whose /products.json is
 * structured product data — no scraping. HTML parsing is the fallback.
 */
import { parseDollarsToCents } from "../money";

export interface DiscoveredProduct {
  title: string;
  /** retail price per unit, cents (0 if not found). */
  priceCents: number;
  handle: string | null;
  sku: string | null;
  imageUrl: string | null;
}

export interface OnlinePresence {
  label: string; // "Amazon", "Instagram", ...
  url: string;
}

export interface BusinessProfile {
  url: string;
  name: string;
  description: string;
  platform: string; // "Shopify", "Website", ...
  products: DiscoveredProduct[];
  presence: OnlinePresence[];
}

// --- Shopify products.json ---------------------------------------------------

interface ShopifyVariant {
  price?: string | number;
  sku?: string | null;
}
interface ShopifyProduct {
  title: string;
  handle?: string;
  variants?: ShopifyVariant[];
  images?: { src?: string }[];
}

function priceToCents(v: string | number | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  try {
    return parseDollarsToCents(String(v));
  } catch {
    return 0;
  }
}

export function parseShopifyProducts(data: { products?: ShopifyProduct[] }): DiscoveredProduct[] {
  return (data.products ?? [])
    .filter((p) => p && typeof p.title === "string")
    .map((p) => {
      const variant = p.variants?.[0];
      return {
        title: p.title,
        priceCents: priceToCents(variant?.price),
        handle: p.handle ?? null,
        sku: variant?.sku?.trim() || null,
        imageUrl: p.images?.[0]?.src ?? null,
      };
    });
}

// --- HTML fallback -----------------------------------------------------------

function metaContent(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`, "i");
  return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
}

const PRESENCE_HOSTS: { host: RegExp; label: string }[] = [
  { host: /amazon\.[a-z.]+/i, label: "Amazon" },
  { host: /instagram\.com/i, label: "Instagram" },
  { host: /facebook\.com/i, label: "Facebook" },
  { host: /(^|\.)tiktok\.com/i, label: "TikTok" },
  { host: /etsy\.com/i, label: "Etsy" },
  { host: /(^|\.)x\.com|twitter\.com/i, label: "X / Twitter" },
  { host: /faire\.com/i, label: "Faire" },
  { host: /walmart\.com/i, label: "Walmart" },
];

/** Detect the marketplaces / socials linked from a page ("where it all lives"). */
export function findPresence(html: string): OnlinePresence[] {
  const found = new Map<string, OnlinePresence>();
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const href of hrefs) {
    for (const { host, label } of PRESENCE_HOSTS) {
      if (host.test(href) && !found.has(label)) found.set(label, { label, url: href });
    }
  }
  return [...found.values()];
}

/** Detect the platform a site runs on from telltale markers. */
export function detectPlatform(html: string): string {
  if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html)) return "Shopify";
  if (/wp-content|wordpress/i.test(html)) return "WordPress";
  if (/squarespace/i.test(html)) return "Squarespace";
  if (/wix\.com/i.test(html)) return "Wix";
  if (/bigcommerce/i.test(html)) return "BigCommerce";
  return "Website";
}

export function extractBusinessMeta(html: string): { name: string; description: string } {
  const name =
    metaContent(html, "property", "og:site_name") ||
    metaContent(html, "property", "og:title") ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    "Your business";
  const description =
    metaContent(html, "name", "description") || metaContent(html, "property", "og:description") || "";
  return { name: name.trim(), description: description.trim() };
}

/** Parse JSON-LD Product blocks (non-Shopify fallback for products). */
export function parseJsonLdProducts(html: string): DiscoveredProduct[] {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  const out: DiscoveredProduct[] = [];
  for (const b of blocks) {
    try {
      const json = JSON.parse(b[1].trim());
      for (const node of Array.isArray(json) ? json : [json]) {
        const type = node["@type"];
        if ((type === "Product" || (Array.isArray(type) && type.includes("Product"))) && node.name) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          out.push({
            title: String(node.name),
            priceCents: priceToCents(offer?.price),
            handle: null,
            sku: node.sku ? String(node.sku) : null,
            imageUrl: typeof node.image === "string" ? node.image : Array.isArray(node.image) ? node.image[0] : null,
          });
        }
      }
    } catch {
      // ignore unparseable JSON-LD block
    }
  }
  return out;
}
