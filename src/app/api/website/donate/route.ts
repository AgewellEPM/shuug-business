import { getStripeConfig } from "@/lib/payments/config";
import { z } from "zod";
import { appBaseUrl } from "@/lib/connections/vault";
import { readAuthForm, escapeHtml as e } from "@/lib/auth/forms";
import { customerPage } from "@/lib/customer-access/html";
import { websitePaymentReady, websitePaymentSettings } from "@/lib/website-payments/settings";
import { authorizeDonationReceipt, donationProof, paymentNotice, refreshWebsitePayment, reserveDonation } from "@/lib/website-payments/service";
import type { WebsitePayment } from "@/lib/website-payments/state";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/website/donate";
function receipt(p: WebsitePayment, token: string, message = "") {
  return customerPage("Donation payment", `<section><p role="status">${e(message || paymentNotice(p))}</p><p>${e(p.currency)} ${(p.amount / 100).toFixed(2)}${p.live ? "" : " · Test mode"}</p><p>Reference ${e(p.id)}</p><p>This payment confirmation is not a charitable tax acknowledgment. The organization reviews and issues any applicable acknowledgment separately.</p>${!["paid", "test_paid", "expired", "paid_review"].includes(p.status) ? `<form method="post" action="${path}"><input type="hidden" name="action" value="refresh"><input type="hidden" name="payment" value="${e(p.id)}"><input type="hidden" name="receipt" value="${e(token)}"><button>Check payment status</button></form>${p.checkoutUrl ? `<p><a href="${e(p.checkoutUrl)}" rel="noreferrer">Continue to Stripe Checkout</a></p>` : ""}` : ""}</section>`);
}
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("receipt")) { try { return receipt(authorizeDonationReceipt(params.get("payment") ?? "", params.get("receipt") ?? ""), params.get("receipt")!); } catch { return customerPage("Receipt unavailable", "<p>Use the private receipt link from your payment request.</p>", 404); } }
  const s = websitePaymentSettings(); if (!s.donationsEnabled || !websitePaymentReady()) return customerPage("Donations unavailable", "<p>Contact the organization to arrange a donation.</p>", 404);
  return customerPage(s.title, `<section>${getStripeConfig()?.live ? "" : "<p role=\"status\">Test mode. No real donation will be collected or posted.</p>"}<p>${e(s.purpose)}</p><p>One-time donation in ${e(s.currency)}. Minimum ${(s.minimum / 100).toFixed(2)}; maximum ${(s.maximum / 100).toFixed(2)}.</p><form method="post" action="${path}"><input type="hidden" name="action" value="donate"><input type="hidden" name="proof" value="${e(donationProof())}"><label>Your name<input name="name" autocomplete="name" minlength="2" maxlength="100" required></label><label>Email<input type="email" name="email" autocomplete="email" maxlength="160" required></label><label>Amount (${e(s.currency)})<input type="number" name="amount" min="${s.minimum / 100}" max="${s.maximum / 100}" step="0.01" required></label><input type="text" name="website" value="" tabindex="-1" autocomplete="off" hidden><label><input type="checkbox" name="consent" value="yes" required> I authorize this one-time donation for the purpose above and the use of my details to process and record it.</label><p>Card details are entered at Stripe. Any applicable charitable acknowledgment is reviewed separately by the organization.</p><button>Continue to Stripe Checkout</button></form></section>`);
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return customerPage("Origin not permitted", "<p>Return to the donation form.</p>", 403);
  try {
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Use the donation form.");
    const form = await readAuthForm(request, 12000);
    if (form.get("action") === "refresh") {
      const token = form.get("receipt") ?? "", p = authorizeDonationReceipt(form.get("payment") ?? "", token);
      try { return receipt(await refreshWebsitePayment(p.id), token); } catch (error) { return receipt(p, token, error instanceof Error ? error.message : "Could not refresh payment status."); }
    }
    if (form.get("action") !== "donate") throw new Error("Choose an available donation action.");
    const reserved = reserveDonation({ proof: form.get("proof"), name: form.get("name"), email: form.get("email"), amount: form.get("amount"), consent: form.get("consent") === "yes", website: form.get("website") ?? "" });
    try { const p = await refreshWebsitePayment(reserved.payment.id); if (p.status === "open" && p.checkoutUrl) return new Response(null, { status: 303, headers: { Location: p.checkoutUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); return receipt(p, reserved.receipt); }
    catch (error) { return receipt(reserved.payment, reserved.receipt, error instanceof Error ? error.message : "Your request is saved. Check its payment status before trying again."); }
  } catch (error) { return customerPage("Could not start donation", `<p role="alert">${e(error instanceof z.ZodError ? error.issues[0]?.message ?? "Check the form fields." : error instanceof Error ? error.message : "Could not process this request.")}</p><a href="${path}">Return to the donation form</a>`, 400); }
}
