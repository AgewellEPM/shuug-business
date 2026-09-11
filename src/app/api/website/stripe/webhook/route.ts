import { getStripeConfig } from "@/lib/payments/config";
import { verifyStripeWebhook } from "@/lib/website-payments/stripe";
import { queueStripeEvent } from "@/lib/website-payments/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = getStripeConfig()?.webhookSecret; if (!secret) return new Response("Website payments are not configured.", { status: 503 });
  const reader = request.body?.getReader(); if (!reader) return new Response("Empty webhook.", { status: 400 });
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const p = await reader.read(); if (p.done) break; size += p.value.length; if (size > 1_000_000) { await reader.cancel(); return new Response("Webhook too large.", { status: 413 }); } chunks.push(p.value); } } finally { reader.releaseLock(); }
  const raw = Buffer.concat(chunks);
  if (!verifyStripeWebhook(raw, request.headers.get("stripe-signature") ?? "", secret)) return new Response("Invalid signature.", { status: 400 });
  try { queueStripeEvent(JSON.parse(raw.toString("utf8"))); return Response.json({ received: true }, { status: 202 }); }
  catch { return new Response("Webhook could not be saved. Retry delivery.", { status: 503 }); }
}
