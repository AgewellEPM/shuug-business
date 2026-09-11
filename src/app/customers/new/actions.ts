"use server";

/**
 * Server action for adding a customer. Validates the form, creates the customer
 * with a slugged URL (/customers/<slug>) and a sensible default agreement, and
 * returns the new customer id so the client can navigate to its page.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDealStore } from "@/lib/data/store";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { log } from "@/lib/observability/log";

export interface CreateCustomerResult {
  ok: boolean;
  customerId?: string;
  error?: string;
}

const formSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(120),
  channel: z.enum(["wholesale_bulk", "store", "online", "amazon"]).default("store"),
  buyerName: z.string().trim().min(1, "Buyer name is required").max(120),
  buyerEmail: z.string().trim().email("Valid email required").max(160),
  accountOwner: z.string().trim().max(120).optional().default(""),
  region: z.string().trim().max(60).optional().default(""),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\//.test(v), "Website must start with http(s)://")
    .optional()
    .default(""),
  billingAddress: z.string().trim().max(240).optional().default(""),
  shippingAddress: z.string().trim().max(240).optional().default(""),
  quickbooksCustomerId: z.string().trim().max(60).optional().default(""),
  requiresPO: z.boolean().optional().default(false),
  targetPct: z.number().min(0).max(95).default(40),
  floorPct: z.number().min(0).max(95).default(30),
  items: z
    .array(
      z.object({
        skuId: z.string().min(1),
        carried: z.boolean(),
        unitPriceCents: z.number().int().min(0).max(1_000_00),
      }),
    )
    .default([]),
});

export type CreateCustomerForm = z.input<typeof formSchema>;

export async function createCustomerAction(
  form: CreateCustomerForm,
): Promise<CreateCustomerResult> {
  try {
    // Write-path authz (defense in depth): the active role must be allowed to
    // edit Sales. Owner passes; a read-only role is refused fail-closed.
    await requireSectionAccess("sales", "edit");

    const v = formSchema.parse(form);
    if (v.floorPct > v.targetPct) {
      return { ok: false, error: "Floor margin cannot exceed target margin." };
    }

    const carried = v.items
      .filter((i) => i.carried)
      .map((i) => ({ skuId: i.skuId, unitPriceCents: i.unitPriceCents }));
    if (v.items.length > 0 && carried.length === 0) {
      return { ok: false, error: "Select at least one product for this customer." };
    }

    const store = await getDealStore();
    const deal = await store.createCustomer({
      company: v.company,
      channel: v.channel,
      buyerName: v.buyerName,
      buyerEmail: v.buyerEmail,
      website: v.website ? v.website : null,
      accountOwner: v.accountOwner,
      region: v.region,
      billingAddress: v.billingAddress,
      shippingAddress: v.shippingAddress || v.billingAddress,
      quickbooksCustomerId: v.quickbooksCustomerId ? v.quickbooksCustomerId : null,
      requiresPO: v.requiresPO,
      targetMarginFraction: v.targetPct / 100,
      floorMarginFraction: v.floorPct / 100,
      lines: carried.length > 0 ? carried : undefined,
    });

    revalidatePath("/");
    log.info("customer_created", { customerId: deal.customer.id, channel: v.channel });
    return { ok: true, customerId: deal.customer.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    const message = err instanceof Error ? err.message : "Could not create customer";
    return { ok: false, error: message };
  }
}
