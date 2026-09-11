"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/** Settings actions: test the Shopify connection and run a Shopify→QBO sync. */
import { testShopifyConnection } from "@/lib/integrations/shopify";
import { type SyncResult } from "@/lib/integrations/sync";

import { requireWorkspaceAccess } from "@/lib/connections/access";

export interface TestResult {
  ok: boolean;
  message: string;
}

export async function testShopifyAction(): Promise<TestResult> {
  try {
  await requireSectionAccess("admin", "edit");

    await requireWorkspaceAccess();
    const name = await testShopifyConnection();
    return { ok: true, message: `Connected to ${name}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Shopify test failed" };
  }
}

export interface RunSyncResult {
  ok: boolean;
  message: string;
  result?: SyncResult;
}

export async function runSyncAction(): Promise<RunSyncResult> {
  await requireSectionAccess("admin", "edit");

  return { ok: false, message: "Open Settings → Preview orders to review invoices before creating them." };
}
