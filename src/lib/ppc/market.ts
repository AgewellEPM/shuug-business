/** Keep research, Keyword Planner and campaign targeting aligned. */
export const MARKETS = {
  US: { label: "United States", geoId: "2840", languageId: "1000", language: "English" },
  CA: { label: "Canada", geoId: "2124", languageId: "1000", language: "English" },
  GB: { label: "United Kingdom", geoId: "2826", languageId: "1000", language: "English" },
  AU: { label: "Australia", geoId: "2036", languageId: "1000", language: "English" },
} as const;
export type Market = keyof typeof MARKETS;

export function publicWebsite(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    const host = url.hostname.toLowerCase();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return null;
    if (/\.(localhost|local|internal|test|invalid|example)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
export function domainOf(value: string): string | null {
  const url = publicWebsite(value);
  return url ? new URL(url).hostname.replace(/^www\./, "") : null;
}
