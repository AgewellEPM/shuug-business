import { cookies } from "next/headers";
import { appBaseUrl } from "@/lib/connections/vault";
import { SHOP_INVOICE_COOKIE, shopInvoicePayment } from "@/lib/shop-invoicing/invoice-link";
import { refreshWebsitePayment } from "@/lib/website-payments/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const token = (await cookies()).get(SHOP_INVOICE_COOKIE)?.value, id = new URL(request.url).searchParams.get("payment");
    if (!token || !id) throw new Error("Return to your private invoice link.");
    const payment = shopInvoicePayment(token, id);
    try { await refreshWebsitePayment(payment.id); } catch { /* The original invoice still shows its reserved, unconfirmed state. */ }
    return new Response(null, { status: 303, headers: { Location: `${new URL(appBaseUrl()).origin}/api/shop-invoicing/invoice/${token}?payment=${payment.id}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return new Response("Return to the private invoice link sent by the shop to review payment status. Do not pay again until its status is confirmed.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }); }
}
