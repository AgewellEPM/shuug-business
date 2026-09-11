export const dynamic = "force-dynamic";
import { getBranding, readableOn } from "@/lib/branding/store";
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export async function GET() {
  const brand = getBranding();
  const graphic = brand.logoImageUrl ? `<image href="${escape(brand.logoImageUrl)}" width="64" height="64"/>` : `<rect width="64" height="64" rx="14" fill="${escape(brand.accentColor)}"/><text x="32" y="43" text-anchor="middle" font-family="sans-serif" font-size="30" fill="${readableOn(brand.accentColor)}">${escape(brand.logoText)}</text>`;
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${graphic}</svg>`, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" } });
}
