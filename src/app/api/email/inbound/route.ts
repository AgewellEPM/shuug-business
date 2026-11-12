/**
 * Inbound email webhook — your mail provider (Postmark/SendGrid inbound parse,
 * Cloudflare Email Workers, etc.) POSTs each incoming email here as JSON; we
 * triage it and drop it in the inbox. A configured EMAIL_INBOUND_SECRET in the
 * private vault (or existing environment fallback) is always required.
 */
import { ingestEmail } from "@/lib/email/store";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { setting } from "@/lib/connections/vault";
import { equalSecret } from "@/lib/connections/access";
import { boundedJson } from "@/lib/social/http";
import { z } from "zod";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const short = z.string().trim().max(500).nullable().optional();
const text = z.string().trim().max(48000).nullable().optional();
const payloadInput = z.object({ from: short, From: short, sender: short, subject: short, Subject: short,
  text, body: text, TextBody: text, plain: text, fromName: z.string().trim().max(200).nullable().optional(), FromName: z.string().trim().max(200).nullable().optional() }).passthrough();

export async function POST(request: Request) {
  let secret: string;
  try { secret = setting("EMAIL_INBOUND_SECRET").trim(); } catch { return json({ ok: false, error: "Inbound email is not configured." }, 503); }
  if (!secret) return json({ ok: false, error: "Inbound email is not configured." }, 503);
  if (!equalSecret(request.headers.get("x-inbound-secret") ?? "", secret)) return json({ ok: false, error: "unauthorized" }, 401);
  // Rate-limit the public ingest so a flood can't overwhelm triage (120/min/IP).
  const rl = rateLimit(clientKey(request, "email-inbound"), 120, 60_000);
  if (!rl.allowed) {
    return Response.json({ ok: false, error: "rate limited" }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" } });
  }
  if (Number(request.headers.get("content-length")) > 64000) return json({ ok: false, error: "Inbound email payload is too large." }, 413);
  try {
    const p = payloadInput.parse(await boundedJson(new Response(request.body), 64000));
    // Preserve the existing adapter aliases and display-name mailbox form.
    const from = p.from ?? p.From ?? p.sender ?? "", subject = p.subject ?? p.Subject ?? "", body = p.text ?? p.body ?? p.TextBody ?? p.plain ?? "";
    const mailbox = from.match(/<([^<>]+)>$/)?.[1]?.trim() ?? from;
    if ([...from].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || !z.email().max(254).safeParse(mailbox).success || (!subject && !body)) return json({ ok: false, error: "Check the sender, subject and text body." }, 400);
    const email = ingestEmail({ from, fromName: p.fromName || p.FromName || undefined, subject, body });
    return json({ ok: true, id: email.id, category: email.category, autoHandle: email.autoHandle });
  } catch (error) {
    if (error instanceof Error && error.message === "The service response exceeded this workspace's limit.") return json({ ok: false, error: "Inbound email payload is too large." }, 413);
    return json({ ok: false, error: "Invalid inbound email payload." }, 400);
  }
}
