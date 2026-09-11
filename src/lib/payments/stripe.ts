/**
 * Stripe client — create a hosted Checkout session to charge a card for an
 * order, and read a session's payment status. Uses Stripe's REST API directly
 * (form-encoded), so no SDK dependency. Fail-closed without a key.
 */
import { getStripeConfig, appBaseUrl } from "./config";

export interface CheckoutInput {
  orderId: string;
  amountCents: number;
  description: string;
  customerEmail?: string | null;
}

/**
 * Build the form body for a Checkout session. Pure — testable without a key.
 * One line item for the whole order total (Stripe amounts are in cents).
 */
export function buildCheckoutForm(input: CheckoutInput, baseUrl: string): URLSearchParams {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new RangeError(`amountCents must be a positive integer, got ${input.amountCents}`);
  }
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${baseUrl}/billing?paid=${encodeURIComponent(input.orderId)}`);
  form.set("cancel_url", `${baseUrl}/billing?canceled=${encodeURIComponent(input.orderId)}`);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  form.set("line_items[0][price_data][product_data][name]", input.description.slice(0, 250) || `Order ${input.orderId}`);
  form.set("metadata[orderId]", input.orderId);
  form.set("payment_intent_data[metadata][orderId]", input.orderId);
  if (input.customerEmail) form.set("customer_email", input.customerEmail);
  return form;
}

export interface CheckoutResult {
  ok: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}

export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const cfg = getStripeConfig();
  if (!cfg) return { ok: false, error: "Payments not connected — set STRIPE_SECRET_KEY." };
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildCheckoutForm(input, appBaseUrl()),
      cache: "no-store",
    });
    const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !data.url) {
      return { ok: false, error: data.error?.message ?? `Stripe error ${res.status}` };
    }
    return { ok: true, url: data.url, sessionId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe request failed" };
  }
}

export interface SessionStatus {
  ok: boolean;
  paymentStatus?: string; // "paid" | "unpaid" | "no_payment_required"
  error?: string;
}

export async function retrieveSessionStatus(sessionId: string): Promise<SessionStatus> {
  const cfg = getStripeConfig();
  if (!cfg) return { ok: false, error: "Payments not connected." };
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${cfg.secretKey}` },
      cache: "no-store",
    });
    const data = (await res.json()) as { payment_status?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: data.error?.message ?? `Stripe error ${res.status}` };
    return { ok: true, paymentStatus: data.payment_status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe request failed" };
  }
}
