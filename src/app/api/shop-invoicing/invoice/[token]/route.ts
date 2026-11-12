import { appBaseUrl } from "@/lib/connections/vault";
import { SHOP_INVOICE_COOKIE, reserveShopInvoicePayment, shopInvoicePayment, shopInvoiceView } from "@/lib/shop-invoicing/invoice-link";
import { refreshWebsitePayment, paymentNotice } from "@/lib/website-payments/service";

export const runtime = "nodejs";
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.stripe.com; base-uri 'none'; frame-ancestors 'none'" };
function page(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your repair invoice</title><style>body{margin:0;background:#111;color:#f5f5f5;font:17px/1.5 system-ui,sans-serif}main{max-width:640px;padding:36px 24px;margin:auto}h1{line-height:1.2}pre{white-space:pre-wrap;font:inherit;background:#222;padding:20px;border-radius:12px}button{font:inherit;font-weight:700;background:#ff7900;color:#111;border:0;border-radius:10px;padding:14px 22px;cursor:pointer}a{color:#ff9a3c}.amount{font-size:32px;font-weight:800}small{color:#bbb}</style></head><body><main>${body}</main></body></html>`, { status, headers });
}
async function paymentAction(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Use the payment button on your private invoice.");
  const reader = request.body?.getReader(); if (!reader) throw new Error("Choose the payment action.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > 2000) { await reader.cancel(); throw new Error("Payment request is too large."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  if (form.get("action") !== "pay" || [...form.keys()].some(key => key !== "action")) throw new Error("Choose the payment action from your invoice.");
}
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params, invoice = shopInvoiceView(token), paymentId = new URL(request.url).searchParams.get("payment");
    const money = (amount: number) => `${invoice.currency} ${(amount / 100).toFixed(2)}`;
    const notice = paymentId ? `<p>${escape(paymentNotice(shopInvoicePayment(token, paymentId)))}</p>` : "";
    return page(`<small>Private repair invoice</small><h1>${escape(invoice.title)}</h1>${notice}<p>Issued ${escape(invoice.issuedOn)}${invoice.due ? ` · Due ${escape(invoice.due)}` : ""}</p><pre>${escape(invoice.description)}</pre>${invoice.tax !== undefined ? `<p>Reviewed subtotal ${money(invoice.subtotal!)} · Tax ${money(invoice.tax)}${invoice.depositApplied ? ` · Deposit applied ${money(invoice.depositApplied)}` : ""}</p>` : ""}<p>Invoice ${money(invoice.amount)} · Recorded payments and credits ${money(invoice.paid)}</p><p class="amount">${invoice.outstanding <= 0 ? "Paid" : `Balance ${money(invoice.outstanding)}`}</p>${invoice.canPay ? `<form method="post"><input type="hidden" name="action" value="pay"><button>${invoice.testMode ? "Open Stripe test checkout" : "Pay securely with Stripe"}</button></form>${invoice.testMode ? "<p>Test mode: no real payment is collected or posted.</p>" : ""}` : invoice.outstanding > 0 ? "<p>Contact the shop to arrange payment. Online payment is not currently available for this balance.</p>" : ""}<p><small>Keep this link private. It expires ${escape(invoice.expiresAt.slice(0, 10))}. Card details are handled by Stripe.</small></p>`);
  } catch { return page("<h1>Invoice unavailable</h1><p>Ask the shop for a current private invoice link.</p>", 404); }
}
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return page("<h1>Return to your private invoice to continue.</h1>", 403);
  try {
    await paymentAction(request);
    const { token } = await context.params;
    let payment = reserveShopInvoicePayment(token);
    payment = await refreshWebsitePayment(payment.id);
    const destination = payment.status === "open" && payment.checkoutUrl ? payment.checkoutUrl : `${new URL(appBaseUrl()).origin}/api/shop-invoicing/invoice/${token}?payment=${payment.id}`;
    const response = new Response(null, { status: 303, headers: { Location: destination, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    response.headers.set("Set-Cookie", `${SHOP_INVOICE_COOKIE}=${token}; Path=/api/shop-invoicing; HttpOnly; SameSite=Lax; Max-Age=86400${appBaseUrl().startsWith("https:") ? "; Secure" : ""}`);
    return response;
  } catch (error) { return page(`<h1>Payment needs attention</h1><p>${escape(error instanceof Error ? error.message : "Contact the shop before trying another payment.")}</p>`, 400); }
}
