import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { boundedJson } from "../social/http";
import { openSecret } from "../connections/vault";
import type { WebsitePayment } from "./state";

const sessionSchema = z.object({ id: z.string().regex(/^cs_[a-zA-Z0-9_]+$/), object: z.literal("checkout.session"), mode: z.literal("payment"), client_reference_id: z.string(), amount_total: z.number().int(), currency: z.string(), livemode: z.boolean(), metadata: z.object({ shuug_payment: z.uuid() }), status: z.enum(["open", "complete", "expired"]), payment_status: z.enum(["paid", "unpaid", "no_payment_required"]), payment_intent: z.string().regex(/^pi_[a-zA-Z0-9_]+$/).nullable(), url: z.string().nullable() });
export type CheckoutSession = z.infer<typeof sessionSchema>;
export async function stripeSession(payment: WebsitePayment, operation: "create" | "read" | "expire", recoveredId?: string) {
  const session = recoveredId ?? payment.sessionId;
  if (operation !== "create" && (!session || !/^cs_[a-zA-Z0-9_]+$/.test(session))) throw new Error("A valid Stripe Checkout session is required.");
  const suffix = operation === "create" ? "" : `/${session}${operation === "expire" ? "/expire" : ""}`;
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions${suffix}`, { method: operation === "read" ? "GET" : "POST", headers: { Authorization: `Bearer ${openSecret(payment.sealedKey)}`, "Content-Type": "application/x-www-form-urlencoded", ...(operation === "create" ? { "Idempotency-Key": `shuug-website-${payment.id}` } : {}) }, ...(operation === "create" ? { body: payment.parameters } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Stripe returned ${response.status}. The payment remains reserved until its current status can be verified.`); }
  const parsed = sessionSchema.safeParse(await boundedJson(response, 100000));
  if (!parsed.success) throw new Error("Stripe returned an incomplete payment status. Refresh again or contact the organization.");
  const s = parsed.data;
  if ((session && s.id !== session) || s.client_reference_id !== payment.id || s.metadata.shuug_payment !== payment.id || s.amount_total !== payment.amount || s.currency.toUpperCase() !== payment.currency || s.livemode !== payment.live || (payment.intentId && payment.intentId !== s.payment_intent)) throw new Error("Stripe's payment details do not match the reserved amount and account. Staff review is required.");
  if (s.url) { const u = new URL(s.url); if (u.protocol !== "https:" || u.hostname !== "checkout.stripe.com" || u.port || u.username || u.password) throw new Error("Stripe returned an unsupported Checkout address."); }
  return s;
}
/** Verify the untouched bytes before parsing any webhook fields. */
export function verifyStripeWebhook(raw: Uint8Array, signature: string, secret: string, now = Date.now()) {
  if (signature.length > 4096 || !secret.startsWith("whsec_")) return false;
  const parts = signature.split(",").map(p => p.trim().split("=")), timestamps = parts.filter(p => p[0] === "t");
  if (timestamps.length !== 1 || !/^\d{10}$/.test(timestamps[0][1] ?? "")) return false;
  const timestamp = timestamps[0][1]; if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest();
  return parts.filter(p => p[0] === "v1" && /^[a-f0-9]{64}$/.test(p[1] ?? "")).some(p => timingSafeEqual(expected, Buffer.from(p[1], "hex")));
}
