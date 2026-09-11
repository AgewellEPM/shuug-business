"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { shopifyOperation } from "@/lib/shopify-backend/service";
export async function configureShopifyAction(input: { enabled: boolean; writesEnabled: boolean }) {
  try {
    await requireWorkspaceAccess(); await requireSectionAccess("admin", "edit");
    await shopifyOperation("shopify_configure", input);
    revalidatePath("/settings/backend");
    return { ok: true, message: "Shopify settings saved. Connect a client's store and approve its permissions when needed." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not save Shopify settings." }; }
}
