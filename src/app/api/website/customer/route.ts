import { NextResponse } from "next/server";
import { z } from "zod";
import { appBaseUrl } from "@/lib/connections/vault";
import { readAuthForm } from "@/lib/auth/forms";
import { acceptCustomerInvitation, signInCustomer, signOutCustomer, changeCustomerPassword, customerToken, customerCookie, CUSTOMER_PATH } from "@/lib/customer-access/accounts";
import { customerView, customerSettings, requireCustomer, previewCustomerOrder, submitCustomerOrder } from "@/lib/customer-access/service";
import { customerPage, customerInvite, customerLogin, customerDashboard, customerOrderReview } from "@/lib/customer-access/html";
import { escapeHtml } from "@/lib/auth/forms";
import { acceptCustomerRecord, bookCustomerAppointment, cancelCustomerAppointment } from "@/lib/workspace/store";
import { authorizeInvoicePayment, paymentNotice, refreshWebsitePayment, reserveInvoicePayment } from "@/lib/website-payments/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function redirect(token?: string) { const response = NextResponse.redirect(new URL(CUSTOMER_PATH, appBaseUrl()), 303); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer"); if (token !== undefined) response.headers.set("Set-Cookie", customerCookie(token, appBaseUrl().startsWith("https:"))); return response; }
export async function GET(request: Request) {
  if (!customerSettings().enabled) return customerPage("Customer portal unavailable", "<p>Contact the organization for access.</p>", 404);
  const invite = new URL(request.url).searchParams.get("invite"); if (invite && /^[a-f0-9]{64}$/.test(invite)) return customerInvite(invite);
  const token = customerToken(request); if (!token) return customerLogin();
  try { return customerDashboard(await customerView(token)); } catch { return customerLogin("Sign in again to view your customer account."); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return customerPage("Origin not permitted", "<p>Return to the customer account to continue.</p>", 403);
  try {
    if (!customerSettings().enabled) throw new Error("The customer portal is not available.");
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Use the customer account form.");
    const form = await readAuthForm(request, 64000), operation = form.get("action"), token = customerToken(request);
    if (operation === "login") return redirect(signInCustomer(form.get("email") ?? "", form.get("password") ?? ""));
    if (operation === "activate") { if (form.get("password") !== form.get("confirmation")) throw new Error("The passwords do not match."); acceptCustomerInvitation(form.get("invite") ?? "", form.get("password") ?? ""); return customerLogin("Account activated. Sign in with your email and new password."); }
    requireCustomer(token);
    if (operation === "payment.start" || operation === "payment.refresh") {
      const reserved = operation === "payment.start" ? reserveInvoicePayment(token!, form.get("invoice") ?? "") : authorizeInvoicePayment(token!, form.get("payment") ?? "");
      const payment = await refreshWebsitePayment(reserved.id);
      if (operation === "payment.start" && payment.status === "open" && payment.checkoutUrl) { const response = NextResponse.redirect(payment.checkoutUrl, 303); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer"); return response; }
      return customerDashboard(await customerView(token!), paymentNotice(payment));
    }
    if (operation === "logout") { signOutCustomer(token); return redirect(""); }
    if (operation === "password") { if (form.get("password") !== form.get("confirmation")) throw new Error("The passwords do not match."); changeCustomerPassword(token!, form.get("current") ?? "", form.get("password") ?? ""); return redirect(""); }
    if (operation === "accept") { if (!customerSettings().servicePortal) throw new Error("Service portal is not enabled."); acceptCustomerRecord(token!, { id: form.get("id"), revision: Number(form.get("revision")), accepted: form.get("accepted") === "yes" }); return redirect(); }
    if (operation === "booking.book" || operation === "booking.cancel") {
      if (!customerSettings().booking) throw new Error("Online booking is not enabled.");
      if (form.get("accepted") !== "yes") throw new Error("Confirm your appointment choice before continuing.");
      const result = operation === "booking.book" ? bookCustomerAppointment(token!, form.get("id") ?? "") : cancelCustomerAppointment(token!, form.get("id") ?? "");
      return customerDashboard(await customerView(token!), `Appointment ${result.status}.`);
    }
    if (operation === "order.preview") {
      const lines = []; for (const [key, skuId] of form.entries()) { if (!/^sku\.\d{1,6}$/.test(key)) continue; const i = key.slice(4), quantity = Number(form.get(`qty.${i}`)); if (quantity !== 0) lines.push({ skuId, quantity, unit: form.get(`unit.${i}`) }); }
      return customerOrderReview(await previewCustomerOrder(token!, { lines, poNumber: form.get("poNumber")?.trim() || null, note: form.get("note") ?? "" }));
    }
    if (operation === "order.submit") { if (form.get("accepted") !== "yes") throw new Error("Review and accept the order before placing it."); const result = await submitCustomerOrder(token!, form.get("quote") ?? ""); return customerDashboard(await customerView(token!), `Order ${result.id} ${result.duplicate ? "was already received" : "received"}.`); }
    throw new Error("Choose an available customer action.");
  } catch (e) { const message = e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the form fields." : e instanceof Error ? e.message : "Could not complete this request."; return customerPage("Could not complete this request", `<p role="alert">${escapeHtml(message)}</p><p><a href="${CUSTOMER_PATH}">Return to your customer account</a></p>`, 400); }
}
