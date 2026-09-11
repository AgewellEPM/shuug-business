"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addComm, assignComm, markReplied, type CommChannel, type CommDirection } from "@/lib/comms/store";
import { createQuote, setQuoteStatus, getQuote } from "@/lib/quotes/store";
import { addDoc, removeDoc } from "@/lib/documents/store";
import { DOC_CATEGORIES } from "@/lib/documents/model";
import { getDealStore } from "@/lib/data/store";
import { requireSectionAccess } from "@/lib/permissions/guard";
import type { OrderLine } from "@/lib/data/model";

export interface ActionResult { ok: boolean; error?: string; id?: string }

const revalidate = (customerId: string) => {
  revalidatePath(`/customers/${customerId}/timeline`);
  revalidatePath(`/customers/${customerId}/portal`);
};

// ---- Communications ----
const commSchema = z.object({
  customerId: z.string().min(1),
  channel: z.enum(["email", "call", "message", "note"]),
  direction: z.enum(["in", "out"]),
  subject: z.string().trim().min(1, "Subject required").max(200),
  body: z.string().trim().max(4000).default(""),
  from: z.string().trim().max(160).default("You"),
  ownerId: z.string().nullable().optional(),
});

export async function addCommAction(form: z.input<typeof commSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("sales", "edit");
    const v = commSchema.parse(form);
    const c = addComm({ customerId: v.customerId, channel: v.channel as CommChannel, direction: v.direction as CommDirection, subject: v.subject, body: v.body, from: v.from, ownerId: v.ownerId ?? null });
    revalidate(v.customerId);
    return { ok: true, id: c.id };
  } catch (e) { return fail(e); }
}

export async function assignCommAction(customerId: string, id: string, ownerId: string | null): Promise<ActionResult> {
  try { await requireSectionAccess("sales", "edit"); assignComm(id, ownerId); revalidate(customerId); return { ok: true, id }; }
  catch (e) { return fail(e); }
}
export async function markRepliedAction(customerId: string, id: string, replied: boolean): Promise<ActionResult> {
  try { await requireSectionAccess("sales", "edit"); markReplied(id, replied); revalidate(customerId); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

// ---- Quotes ----
const quoteSchema = z.object({
  customerId: z.string().min(1),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an expiration date"),
  note: z.string().trim().max(500).default(""),
  lines: z.array(z.object({ skuId: z.string().min(1), name: z.string().min(1), cases: z.number().int().min(1).max(100000), unitPriceCents: z.number().int().min(0).max(10000000) })).min(1, "Add at least one product"),
});

export async function createQuoteAction(form: z.input<typeof quoteSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("sales", "edit");
    const v = quoteSchema.parse(form);
    const q = createQuote(v);
    revalidate(v.customerId);
    return { ok: true, id: q.id };
  } catch (e) { return fail(e); }
}

export async function setQuoteStatusAction(customerId: string, id: string, status: "accepted" | "declined"): Promise<ActionResult> {
  try { await requireSectionAccess("sales", "edit"); setQuoteStatus(id, status); revalidate(customerId); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

/** Convert an accepted quote into a real order (no retyping). */
export async function convertQuoteAction(customerId: string, id: string): Promise<ActionResult> {
  try {
    await requireSectionAccess("sales", "edit");
    const q = getQuote(id);
    if (!q) return { ok: false, error: "Quote not found" };
    const lines: OrderLine[] = q.lines.map((l) => ({
      skuId: l.skuId, unit: "case", quantity: l.cases, cases: l.cases,
      unitPriceCents: l.unitPriceCents, tierLabel: "quote", isOverride: true, lineTotalCents: l.lineTotalCents,
    }));
    const store = await getDealStore();
    const order = await store.createOrder({ customerId, poNumber: null, note: `Converted from quote ${id.slice(0, 8)}`, lines, subtotalCents: q.subtotalCents, freightCents: 0, totalCents: q.subtotalCents });
    setQuoteStatus(id, "converted", order.id);
    revalidate(customerId);
    revalidatePath(`/customers/${customerId}/orders`);
    return { ok: true, id: order.id };
  } catch (e) { return fail(e); }
}

// ---- Documents (attach a signed agreement / COI / license to this customer) ----
const DOC_KEYS = DOC_CATEGORIES.map((c) => c.key) as [string, ...string[]];
const attachDocSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().trim().min(1, "Name the document").max(160),
  category: z.enum(DOC_KEYS),
  issuer: z.string().trim().max(160).default(""),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fileDataUrl: z.string().max(2_800_000).nullable().optional(),
  fileName: z.string().max(200).default(""),
});

export async function attachDocumentAction(form: z.input<typeof attachDocSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("sales", "edit");
    const v = attachDocSchema.parse(form);
    const d = addDoc({
      name: v.name, category: v.category as (typeof DOC_CATEGORIES)[number]["key"], issuer: v.issuer,
      fileDataUrl: v.fileDataUrl ?? null, fileName: v.fileName,
      expiresAt: v.expiresAt ?? null, linkedType: "customer", linkedId: v.customerId,
    });
    revalidate(v.customerId);
    return { ok: true, id: d.id };
  } catch (e) { return fail(e); }
}

export async function removeDocumentAction(customerId: string, id: string): Promise<ActionResult> {
  try { await requireSectionAccess("sales", "edit"); removeDoc(id); revalidate(customerId); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
