import { appBaseUrl } from "../connections/vault";
import { securityHeaders } from "../security/headers";
import { getBranding } from "../branding/store";
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export async function readAuthForm(request: Request, maximumBytes = 8000) {
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) throw new Error("Origin not permitted.");
  const reader = request.body?.getReader(); if (!reader) throw new Error("Missing form.");
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > maximumBytes) { await reader.cancel(); throw new Error("Form too large."); } chunks.push(chunk.value); } } finally { reader.releaseLock(); }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}
export function authPage(title: string, content: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · ${escapeHtml(getBranding().businessName)}</title><style>body{font:16px system-ui;background:#f5f5f4;color:#17231c;display:grid;place-items:center;min-height:95vh}main{background:white;padding:2rem;border:1px solid #d5ddd7;border-radius:1rem;width:min(26rem,80vw)}label{display:block;margin-top:1rem}input,button{box-sizing:border-box;width:100%;padding:.8rem;margin-top:.7rem;border:1px solid #b3c2b8;border-radius:.5rem;font:inherit}button{background:#2c4939;color:white}p{line-height:1.5}a{color:#2c4939}</style><main><h1>${escapeHtml(title)}</h1>${content}</main></html>`, { status, headers: { ...securityHeaders(appBaseUrl().startsWith("https:")), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
