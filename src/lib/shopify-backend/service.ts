import { z } from "zod";
import { setting, saveSecrets } from "../connections/vault";
import { getShopifyConfig } from "../integrations/config";
import { commandSchema, ConnectorError, resourceKinds, shopSchema } from "./model";
import { ShopifyStore } from "./store";
import { syncTick } from "./sync";

export function shopifyStatus() {
  const shop = setting("SHOPIFY_STORE_DOMAIN"), config = getShopifyConfig();
  const enabled = setting("SHOPIFY_BACKEND_ENABLED") === "true";
  const basic = { optional: true, enabled, connected: !!config, writesEnabled: setting("SHOPIFY_WRITE_ENABLED") === "true", shop: shop || null, apiVersion: config?.apiVersion || "2026-07", grantedScopes: setting("SHOPIFY_GRANTED_SCOPES").split(",").filter(Boolean), sourceOfTruth: "Shopify owns storefront, checkout and commerce records. Shuug owns its business records and explicit queued changes.", customerWorkspace: "One client per deployment and private data volume." };
  if (!shop) return { ...basic, state: "disabled", counts: [], queue: [], reconciliation: [] };
  const store = new ShopifyStore();
  try { const data = store.status(shop); return { ...basic, ...data, state: data.disconnected ? "disconnected" : enabled && config ? "ready" : enabled ? "needs_connection" : "disabled" }; }
  finally { store.close(); }
}
export async function shopifyOperation(operation: string, args: Record<string, unknown>) {
  if (operation === "shopify_status") return shopifyStatus();
  if (operation === "shopify_configure") {
    const input = z.object({ enabled: z.boolean(), writesEnabled: z.boolean().default(false) }).strict().parse(args);
    saveSecrets({ SHOPIFY_BACKEND_ENABLED: String(input.enabled), SHOPIFY_WRITE_ENABLED: String(input.writesEnabled) });
    return shopifyStatus();
  }
  if (operation === "shopify_tick") return syncTick();
  const shop = shopSchema.safeParse(setting("SHOPIFY_STORE_DOMAIN"));
  if (!shop.success) throw new ConnectorError("No client Shopify store is connected. Standalone business tools remain available.", 409);
  const store = new ShopifyStore();
  try {
    if (operation === "shopify_records") {
      const input = z.object({ kind: z.enum(resourceKinds), limit: z.number().int().min(1).max(250).default(100), after: z.string().max(250).default("") }).strict().parse(args);
      return store.list(shop.data, input.kind, input.limit, input.after);
    }
    if (operation === "shopify_jobs") return store.jobs(shop.data).map(job => ({ id: job.id, shop: job.shop, kind: job.kind, topic: job.topic, status: job.status, attempts: job.attempts, error: job.error, createdAt: job.createdAt }));
    if (operation === "shopify_job") { const { id } = z.object({ id: z.uuid() }).strict().parse(args); const job = store.getJob(shop.data, id); if (!job) throw new ConnectorError("Job not found.", 404); return job; }
    if (operation === "shopify_reconcile") { store.restart(shop.data); return { scheduled: true }; }
    if (operation === "shopify_resolve") { const input = z.object({ id: z.uuid(), note: z.string().trim().min(10).max(1000) }).strict().parse(args); return store.resolve(shop.data, input.id, input.note); }
    if (operation === "shopify_command") {
      if (setting("SHOPIFY_BACKEND_ENABLED") !== "true" || setting("SHOPIFY_WRITE_ENABLED") !== "true" || !getShopifyConfig() || store.disconnected(shop.data)) throw new ConnectorError("Connect a store and enable Shopify writes before queuing a change.", 409);
      const input = z.object({ idempotencyKey: z.uuid(), command: commandSchema }).strict().parse(args);
      return store.enqueue(shop.data, `command:${input.idempotencyKey}`, "command", input.command.type, input.command);
    }
    throw new ConnectorError("Unknown Shopify operation.", 404);
  } finally { store.close(); }
}
