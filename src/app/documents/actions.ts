"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDoc, removeDoc, setSignature } from "@/lib/documents/store";
import { requestSignature } from "@/lib/integrations/esign";
import { requireSectionAccess } from "@/lib/permissions/guard";
import type { DocCategory } from "@/lib/documents/model";

export interface DocResult { ok: boolean; error?: string; message?: string; id?: string }
const rev = () => revalidatePath("/documents");

const docSchema = z.object({
  name: z.string().trim().min(1, "Name the document").max(160),
  category: z.enum(["license", "insurance", "permit", "agreement", "tax", "form", "other"]),
  issuer: z.string().trim().max(160).optional(),
  fileDataUrl: z.string().max(2 * 1024 * 1024).nullable().optional(),
  fileName: z.string().max(200).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export async function addDocAction(form: z.input<typeof docSchema>): Promise<DocResult> {
  try {
    await requireSectionAccess("admin", "edit");
    const v = docSchema.parse(form);
    const d = addDoc({ ...v, category: v.category as DocCategory });
    rev();
    return { ok: true, id: d.id };
  } catch (e) { return fail(e); }
}

export async function removeDocAction(id: string): Promise<DocResult> {
  try { await requireSectionAccess("admin", "edit"); removeDoc(id); rev(); return { ok: true }; }
  catch (e) { return fail(e); }
}

export async function requestSignatureAction(id: string, docName: string, signerEmail: string): Promise<DocResult> {
  try {
    await requireSectionAccess("admin", "edit");
    const r = requestSignature(docName, signerEmail);
    if (r.ok) setSignature(id, "sent", r.provider ?? null);
    rev();
    return { ok: r.ok, message: r.message, error: r.ok ? undefined : r.message };
  } catch (e) { return fail(e); }
}

function fail(e: unknown): DocResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
