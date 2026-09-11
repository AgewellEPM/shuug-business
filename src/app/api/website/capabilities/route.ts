import { diningPublicInfo } from "@/lib/restaurant/dining-website";
import { restaurantStorefront } from "@/lib/restaurant/website";
import { setupState } from "@/lib/getting-started/store";
import { customerSettings } from "@/lib/customer-access/service";
import { websitePaymentReady, websitePaymentSettings } from "@/lib/website-payments/settings";
import { getBranding } from "@/lib/branding/store";
/** Public installation metadata only. No accounts, submissions or credentials. */
export function GET() {
  const s = customerSettings(), payments = websitePaymentSettings(), ready = websitePaymentReady();
  return Response.json({ version: 1, businessName: getBranding().businessName,
    capabilities: [...(diningPublicInfo().enabled ? [{ id: "restaurant_booking", label: "Reserve a restaurant table", path: "/api/website/reservations" }] : []), ...(restaurantStorefront().enabled ? [{ id: "restaurant_ordering", label: "Order food for pickup", path: "/api/website/restaurant" }] : []), ...(ready && payments.donationsEnabled ? [{ id: "donations", label: "Make a donation", path: "/api/website/donate" }] : []), ...(s.enabled ? [{ id: "customer_login", label: "Customer login", path: "/api/website/customer" }, ...(s.servicePortal && ready && payments.invoiceEnabled ? [{ id: "pay_invoice", label: "Pay an invoice", path: "/api/website/customer#invoices" }] : []), ...(s.booking ? [{ id: "book_service", label: "Book a service", path: "/api/website/customer#appointments" }] : []), ...(s.pricing ? [{ id: "pricing", label: "Customer-specific pricing", path: "/api/website/customer#pricing" }] : []), ...(s.ordering ? [{ id: "wholesale", label: "Wholesale ordering", path: "/api/website/customer#pricing" }] : []), ...(s.orderStatus ? [{ id: "order_status", label: "Order status", path: "/api/website/customer#orders" }] : [])] : [])],
    forms: setupState().forms.filter(f => f.enabled).map(f => ({ id: f.id, kind: f.kind, title: f.title, origins: f.origins })) }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
