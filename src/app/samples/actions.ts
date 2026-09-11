"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/** Sample actions: request a sample, and approve (→ ships) or decline it. */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSampleRequest, decideSample } from "@/lib/ops/store";
import { requireWorkspaceAccess } from "@/lib/connections/access";

export interface SampleActionResult {
  ok: boolean;
  message: string;
}

const createSchema = z.object({
  requesterName: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(7,"Enter a phone number including its area code.").max(60),
  shippingAddress: z.string().trim().min(8,"Enter the complete shipping address.").max(600),
  note: z.string().trim().max(280).optional().default(""),
  lines: z.array(z.object({ skuId: z.string().min(1), cases: z.number().int().min(0).max(50) })).min(1),
});

export async function createSampleAction(input: {
  requesterName: string;
  company: string;
  email: string;
  phone: string;
  shippingAddress: string;
  note: string;
  lines: { skuId: string; cases: number }[];
}): Promise<SampleActionResult> {
  try {
  await requireSectionAccess("sales", "edit");

    await requireWorkspaceAccess();
    const v = createSchema.parse(input);
    const lines = v.lines.filter((l) => l.cases > 0);
    if (lines.length === 0) return { ok: false, message: "Add at least one sample case." };
    const req = createSampleRequest({ ...v, lines });
    revalidatePath("/samples");
    return { ok: true, message: `Sample request ${req.id} submitted for approval.` };
  } catch (err) {
    return { ok: false, message: err instanceof z.ZodError ? err.issues[0]?.message||"Check the request details." : err instanceof Error ? err.message : "Could not submit request" };
  }
}

export async function decideSampleAction(id: string, approve: boolean): Promise<SampleActionResult> {
  try {
  await requireSectionAccess("sales", "edit");

    await requireWorkspaceAccess();
    z.string().min(1).max(160).parse(id);z.boolean().parse(approve);
    const req = decideSample(id, {
      approve,
      decidedBy: "Owner",
      carrier: "Ground",
      shippingCostCents: 1500, // flat sample freight (placeholder)
    });
    revalidatePath("/samples");
    return {
      ok: true,
      message: approve ? `Approved & shipped ${req.id} (${req.shipmentId}). Inventory updated.` : `Declined ${req.id}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Decision failed" };
  }
}
