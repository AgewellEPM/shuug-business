import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { escapeHtml } from "@/lib/auth/forms";
import { appBaseUrl, sealSecret, openSecret } from "@/lib/connections/vault";
import { getBranding } from "@/lib/branding/store";
import { securityHeaders } from "@/lib/security/headers";
import { acceptSubmission, findForm } from "@/lib/getting-started/store";
import { formLabels, type Form } from "@/lib/getting-started/model";
import { processPendingRuns } from "@/lib/getting-started/runner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
function page(form: Form | undefined, content: string, status = 200) {
  const branding = getBranding(), color = /^#[a-f0-9]{6}$/i.test(branding.primaryColor) ? branding.primaryColor : "#2c4939";
  const headers = securityHeaders(appBaseUrl().startsWith("https:"));
  // Only this anonymous intake surface may be framed. The employee app keeps DENY.
  headers["Content-Security-Policy"] = `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self' ${(form?.origins ?? []).join(" ")}`;
  delete headers["X-Frame-Options"];
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(form?.title ?? "Request")} · ${escapeHtml(branding.businessName)}</title><style>body{font:16px system-ui;color:#17231c;background:#fff;margin:0;padding:20px}main{max-width:620px;margin:auto}h1{font-size:1.4rem}label{display:block;margin:14px 0}input:not([type=checkbox]),textarea,button{box-sizing:border-box;width:100%;padding:12px;border:1px solid #aab9af;border-radius:6px;font:inherit}textarea{min-height:120px}input:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid #7b9a89;outline-offset:2px}button{background:${color};color:white;cursor:pointer}p{line-height:1.5}.trap{position:absolute;left:-10000px}</style></head><body><main><p>${escapeHtml(branding.businessName)}</p>${content}</main></body></html>`, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
export async function GET(request: Request, context: Context) {
  const { id } = await context.params; if (!z.uuid().safeParse(id).success) return page(undefined, "<h1>Form unavailable</h1>", 404);
  const form = findForm(id), preview = new URL(request.url).searchParams.get("preview") === "1";
  if (preview) { try { await requireOwnerAccess(); } catch { return page(undefined, "<h1>Sign in as owner to preview this form.</h1>", 401); } }
  if (!form || (!form.enabled && !preview)) return page(undefined, "<h1>This form is not accepting requests.</h1>", 404);
  const branding = getBranding();
  const proof = Buffer.from(sealSecret(JSON.stringify({ formId: id, requestId: randomUUID(), issued: Date.now(), preview }))).toString("base64url");
  return page(form, `<h1>${escapeHtml(form.title)}</h1><p>${escapeHtml(formLabels[form.kind])}. Your request will be reviewed by the organization. Submitting does not confirm a booking, price, payment, employment or enrollment.</p>${preview ? "<p><strong>Owner preview: submissions are disabled.</strong></p>" : ""}<form method="post" action="/api/website/forms/${id}"><input type="hidden" name="proof" value="${proof}"><label>Name<input name="name" autocomplete="name" maxlength="100" required></label><label>Email<input name="email" type="email" autocomplete="email" maxlength="160" required></label><label>How can we help?<textarea name="message" maxlength="4000" required></textarea></label><label class="trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label><input type="checkbox" name="consent" value="yes" required> I agree to share these details with ${escapeHtml(branding.businessName)} so they can respond.</label><p>Please leave out payment details and sensitive personal records.</p><button${preview ? " disabled" : ""}>Send request</button></form>`);
}
export async function POST(request: Request, context: Context) {
  let form: Form | undefined;
  try {
    const { id } = await context.params; z.uuid().parse(id); form = findForm(id);
    if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return page(form, "<h1>Request origin not permitted.</h1>", 403);
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Use the website form to send this request.");
    const reader = request.body?.getReader(); if (!reader) throw new Error("Missing form."); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 20000) { await reader.cancel(); throw new Error("Request too large."); } chunks.push(chunk.value); } } finally { reader.releaseLock(); }
    const values = new URLSearchParams(Buffer.concat(chunks).toString()), proof = values.get("proof") ?? "";
    if (proof.length > 2000 || values.get("website")) throw new Error("Reload the form and try again.");
    const ticket = z.object({ formId: z.uuid(), requestId: z.uuid(), issued: z.number(), preview: z.boolean() }).strict().parse(JSON.parse(openSecret(Buffer.from(proof, "base64url").toString())));
    if (ticket.formId !== id || ticket.preview || Date.now() - ticket.issued > 3600000 || ticket.issued > Date.now()) throw new Error("Reload the form before submitting.");
    const result = acceptSubmission(id, { requestId: ticket.requestId, name: values.get("name"), email: values.get("email"), message: values.get("message"), consent: values.get("consent") === "yes" });
    // Local work is immediate. External steps remain durable for the worker.
    await processPendingRuns(true).catch(() => undefined); // A committed request stays accepted; the worker can resume pending local steps.
    return page(form, `<h1>Request received</h1><p>The organization will review your details.</p><p>Reference: ${escapeHtml(result.id)}</p>`, result.duplicate ? 200 : 201);
  } catch (e) { const message = e instanceof z.ZodError ? "Check your name, email, message and consent." : e instanceof Error && /form|request|hour|identifier/i.test(e.message) ? e.message : "The request could not be accepted. Reload the form and try again."; return page(form, `<h1>Could not send request</h1><p>${escapeHtml(message)}</p><p>Return to the form to review your entries.</p>`, 400); }
}
