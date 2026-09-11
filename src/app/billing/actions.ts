"use server";

/**
 * Billing actions: create a Stripe Checkout link to charge a card for an order,
 * and verify payment status with Stripe (server-side, not a spoofable redirect).
 */
import { requireSectionAccess } from "@/lib/permissions/guard";
import { revalidatePath } from "next/cache";
import { getDealStore } from "@/lib/data/store";
import { createCheckoutSession, retrieveSessionStatus } from "@/lib/payments/stripe";
import { recordPayment, getPayment, setPaymentStatus } from "@/lib/payments/store";

export interface ChargeResult {
  ok: boolean;
  url?: string;
  message: string;
}

export async function chargeOrderAction(orderId: string): Promise<ChargeResult> {
  await requireSectionAccess("money", "edit");
  const previous = getPayment(orderId);
  if (previous?.status === "paid") return { ok: false, message: "This order is already paid." };
  if (previous?.status === "pending") return { ok: true, url: previous.url, message: "Existing payment link retrieved." };
  const store = await getDealStore();
  const order = await store.getOrder(orderId);
  if (!order) return { ok: false, message: `Unknown order ${orderId}` };
  const deal = await store.getDeal(order.customerId);

  const res = await createCheckoutSession({
    orderId: order.id,
    amountCents: order.totalCents,
    description: `${deal?.customer.company ?? order.customerId} — order ${order.id}`,
    customerEmail: deal?.customer.buyerEmail ?? null,
  });
  if (!res.ok || !res.url || !res.sessionId) return { ok: false, message: res.error ?? "Could not create payment" };

  recordPayment({ orderId: order.id, sessionId: res.sessionId, url: res.url, amountCents: order.totalCents });
  revalidatePath("/billing");
  return { ok: true, url: res.url, message: `Payment link ready for ${order.id}.` };
}

export interface StatusResult {
  ok: boolean;
  status?: string;
  message: string;
}

export async function checkPaymentAction(orderId: string): Promise<StatusResult> {
  await requireSectionAccess("money", "edit");
  const payment = getPayment(orderId);
  if (!payment) return { ok: false, message: "No payment started for this order." };
  const res = await retrieveSessionStatus(payment.sessionId);
  if (!res.ok) return { ok: false, message: res.error ?? "Could not check status" };
  if (res.paymentStatus === "paid") setPaymentStatus(orderId, "paid");
  revalidatePath("/billing");
  return { ok: true, status: res.paymentStatus, message: `Payment status: ${res.paymentStatus}` };
}
