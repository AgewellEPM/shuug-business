import { inspectionReportsHtml } from "@/lib/auto-repair/inspection-html";
import { NextResponse } from "next/server";
import { portalView } from "@/lib/workspace/portal";
import { acceptPortalRecord } from "@/lib/workspace/store";
import { getBranding } from "@/lib/branding/store";
import { appBaseUrl } from "@/lib/connections/vault";
import { securityHeaders } from "@/lib/security/headers";
import { readLimitedBody } from "@/lib/security/body";
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const amount = (cents: unknown, currency: unknown) => `${esc(currency)} ${(Number(cents) / 100).toFixed(2)}`;
const accept = (r: { id: string; revision: number }) => `<form method="post"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="revision" value="${r.revision}"><label>Your name <input name="name" required maxlength="100"></label><label><input type="checkbox" name="accepted" value="yes" required> I accept the scope, price or completed work shown above.</label><button>Record my acceptance</button></form>`;
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const token = (await params).token, data = portalView(token), brand = getBranding();
    const body = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(brand.businessName)} · Client portal</title><style>body{font:16px system-ui;background:#f5f5f4;color:#17231c;max-width:850px;margin:2rem auto;padding:1rem}article{background:white;padding:1.3rem;border:1px solid #d5ddd7;border-radius:1rem;margin:1rem 0}p{white-space:pre-wrap;line-height:1.6}label{display:block;margin:.8rem 0}input,button{padding:.6rem;border:1px solid #b3c2b8;border-radius:.4rem}button{background:#2c4939;color:white}small{color:#53635b}</style><h1>${esc(brand.businessName)}</h1><p>Client portal · ${esc(data.client.title)}</p>${inspectionReportsHtml(data.inspections, `/api/portal/${token}/inspection-photo/`)}<h2>Proposals</h2>${data.proposals.map(r => `<article><h3>${esc(r.title)}</h3><small>${esc(r.status)} · Offer expires ${esc(r.expires)}</small><p>${esc(r.scope)}</p><p>Exclusions: ${esc(r.exclusions)}</p><p>Price: <strong>${amount(r.amount, r.currency)}</strong></p>${r.status === "sent" ? accept(r) : ""}</article>`).join("") || "<p>No proposals awaiting review.</p>"}<h2>Work</h2>${data.jobs.map(r => `<article><h3>${esc(r.title)}</h3><p>${esc(r.status)}${r.due ? ` · Due ${esc(r.due)}` : ""}</p>${r.status === "completed" ? accept(r) : ""}</article>`).join("")}<h2>Appointments</h2>${data.appointments.map(r => `<article><h3>${esc(r.title)}</h3><p>${esc(r.start)} → ${esc(r.end)}</p></article>`).join("")}<h2>Invoices</h2>${data.invoices.map(r => `<article><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><p>Invoice: ${amount(r.amount, r.currency)} · Remaining: ${amount(Number(r.amount) - r.paid, r.currency)}</p><small>Due ${esc(r.due)}</small><p>Contact the organization for its payment instructions.</p></article>`).join("")}<p><small>This private link expires after seven days. Keep it private.</small></p></html>`;
    return new Response(body, { headers: { ...securityHeaders(new URL(appBaseUrl()).protocol === "https:"), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return new Response("This portal link is unavailable, revoked or expired. Ask the organization for a new link.", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return new Response("Origin not permitted", { status: 403 });
    const text = (await readLimitedBody(request, 4000)).toString("utf8");
    const token = (await params).token, form = new URLSearchParams(text);
    acceptPortalRecord(token, { id: form.get("id"), revision: Number(form.get("revision")), name: form.get("name"), accepted: form.get("accepted") === "yes" });
    return NextResponse.redirect(new URL(`/api/portal/${token}`, appBaseUrl()), 303);
  } catch (e) { return new Response(e instanceof Error ? e.message : "Acceptance failed. Reload and try again.", { status: 400, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
}
