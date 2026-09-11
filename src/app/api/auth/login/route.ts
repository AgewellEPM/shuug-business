import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { signInEmployee, signOutEmployee } from "@/lib/auth/employees";
import { signInOwner, signOutOwner } from "@/lib/auth/owner-session";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/config";
import { appBaseUrl } from "@/lib/connections/vault";
import { getBranding } from "@/lib/branding/store";
import { securityHeaders } from "@/lib/security/headers";
export const runtime = "nodejs";
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const secure = () => appBaseUrl().startsWith("https:");
export async function GET() {
  const csrf = randomBytes(32).toString("hex");
  (await cookies()).set("owner_login_csrf", csrf, { httpOnly: true, sameSite: "strict", secure: secure(), path: "/api/auth/login", maxAge: 600 });
  const branding = getBranding();
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · ${escape(branding.businessName)}</title><style>body{font:16px system-ui;background:#f5f5f4;color:#17231c;display:grid;place-items:center;min-height:95vh}main{background:white;padding:2rem;border:1px solid #d5ddd7;border-radius:1rem;width:min(26rem,80vw)}input,button{box-sizing:border-box;width:100%;padding:.8rem;margin-top:.7rem;border:1px solid #b3c2b8;border-radius:.5rem;font:inherit}button{background:#2c4939;color:white}p{font-size:.9rem;color:#53635b;line-height:1.5}</style><main><h1>${escape(branding.businessName)}</h1><p>Sign in to your private workspace.</p><form method="post"><input type="hidden" name="csrf" value="${csrf}"><label>Email (employees)<input name="email" type="email" autocomplete="username" maxlength="160" placeholder="you@company.com"></label><p>Owner: leave email blank.</p><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="200" autofocus></label><button>Sign in</button></form><p>Forgot your password? Ask the owner for a new setup link.</p><p>First installation: run <code>npm run workspace:setup</code> on the server to create the owner password.</p></main></html>`, { headers: { ...securityHeaders(secure()), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(appBaseUrl()).origin) return new Response("Origin not permitted", { status: 403 });
    const reader = request.body?.getReader(); let total = 0; const chunks: Uint8Array[] = [];
    if (!reader) throw new Error("Missing form.");
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; total += chunk.value.length; if (total > 8000) { await reader.cancel(); throw new Error("Form too large."); } chunks.push(chunk.value); } } finally { reader.releaseLock(); }
    const form = new URLSearchParams(Buffer.concat(chunks).toString()), jar = await cookies();
    const expected = Buffer.from(jar.get("owner_login_csrf")?.value ?? ""), supplied = Buffer.from(form.get("csrf") ?? "");
    if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return new Response("Refresh the sign-in page and try again.", { status: 403 });
    const email = form.get("email")?.trim();
    const token = email ? signInEmployee(email, form.get("password") ?? "") : signInOwner(form.get("password") ?? "");
    signOutEmployee(jar.get(SESSION_COOKIE)?.value);
    signOutOwner(jar.get(SESSION_COOKIE)?.value);
    jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: SESSION_TTL_SECONDS });
    jar.delete("owner_login_csrf");
    jar.delete("dd_active_role");
    return NextResponse.redirect(new URL(email ? "/me" : "/", appBaseUrl()), 303);
  } catch (e) { return new Response(e instanceof Error ? e.message : "Sign-in failed.", { status: 400, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } }); }
}
