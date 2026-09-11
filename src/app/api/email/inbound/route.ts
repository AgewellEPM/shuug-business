/**
 * Inbound email webhook — your mail provider (Postmark/SendGrid inbound parse,
 * Cloudflare Email Workers, etc.) POSTs each incoming email here as JSON; we
 * triage it and drop it in the inbox. Optional shared secret via
 * EMAIL_INBOUND_SECRET (header x-inbound-secret) to reject spoofed posts.
 */
import { ingestEmail } from "@/lib/email/store";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  // Rate-limit the public ingest so a flood can't overwhelm triage (120/min/IP).
  const rl = rateLimit(clientKey(request, "email-inbound"), 120, 60_000);
  if (!rl.allowed) {
    return Response.json({ ok: false, error: "rate limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const secret = process.env.EMAIL_INBOUND_SECRET?.trim();
  if (secret && request.headers.get("x-inbound-secret") !== secret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const p = payload as Record<string, unknown>;
  // Accept common field names from different providers.
  const from = String(p.from ?? p.From ?? p.sender ?? "").trim();
  const subject = String(p.subject ?? p.Subject ?? "").trim();
  const body = String(p.text ?? p.body ?? p.TextBody ?? p.plain ?? "").trim();
  const fromName = p.fromName ? String(p.fromName) : p.FromName ? String(p.FromName) : undefined;

  if (!from || (!subject && !body)) {
    return Response.json({ ok: false, error: "missing from/subject/body" }, { status: 400 });
  }
  const email = ingestEmail({ from, fromName, subject, body });
  return Response.json({ ok: true, id: email.id, category: email.category, autoHandle: email.autoHandle });
}
