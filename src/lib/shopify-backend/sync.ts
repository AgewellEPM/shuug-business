import { z } from "zod";
import { setting, saveSecrets } from "../connections/vault";
import { connectedConfig, graphClient, fetchPage, fetchResource, sendCommand, type GraphRequest } from "./client";
import { commandSchema, ConnectorError, resourceKinds, type Job, type ResourceKind } from "./model";
import { ShopifyStore } from "./store";
import { freshShopifyConfig } from "./tokens";

const numericId = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(String);
function externalId(payload: Record<string, unknown>, key = "id") { return numericId.parse(payload[key]); }
async function refresh(store: ShopifyStore, shop: string, kind: ResourceKind, id: string, graph: GraphRequest, heartbeat: () => void) {
  const node = await fetchResource(kind, id, graph, heartbeat);
  if (node) store.upsert(shop, kind, node); else store.remove(shop, kind, id);
}
async function processWebhook(job: Job, store: ShopifyStore, graph: GraphRequest, heartbeat: () => void) {
  const { topic, payload, shop } = job;
  if (topic === "app/uninstalled") {
    store.disconnect(shop);
    saveSecrets({ SHOPIFY_ADMIN_TOKEN: "", SHOPIFY_REFRESH_TOKEN: "", SHOPIFY_TOKEN_EXPIRES_AT: "", SHOPIFY_CONNECTED_AT: "", SHOPIFY_BACKEND_ENABLED: "false" });
    return { disconnected: true };
  }
  if (topic === "shop/redact") { store.redactShop(shop); return { erased: true }; }
  if (topic === "customers/redact") {
    const customer = z.object({ id: numericId }).parse(payload.customer);
    store.redactCustomer(shop, `gid://shopify/Customer/${customer.id}`);
    return { erased: true };
  }
  if (topic === "customers/data_request") {
    const customer = z.object({ id: numericId }).parse(payload.customer);
    const id = `gid://shopify/Customer/${customer.id}`;
    const records = store.db.prepare("SELECT data FROM resources WHERE shop=? AND kind='customers' AND id=? AND deleted=0").all(shop, id).map(r => JSON.parse(String(r.data)));
    return { requiresOwnerDelivery: true, customer: records, orders: store.customerOrders(shop, id, -1) };
  }
  if (topic === "app/scopes_update") {
    const current = z.array(z.string()).parse(payload.current);
    saveSecrets({ SHOPIFY_GRANTED_SCOPES: current.join(",") });
    return { scopesUpdated: true };
  }
  let kind: ResourceKind, id: string;
  if (topic.startsWith("products/")) { kind = "products"; id = `gid://shopify/Product/${externalId(payload)}`; }
  else if (topic.startsWith("customers/")) { kind = "customers"; id = `gid://shopify/Customer/${externalId(payload)}`; }
  else if (topic.startsWith("inventory_levels/")) { kind = "inventory"; id = `gid://shopify/InventoryItem/${externalId(payload, "inventory_item_id")}`; }
  else { kind = "orders"; id = `gid://shopify/Order/${externalId(payload, topic.startsWith("orders/") ? "id" : "order_id")}`; }
  if (topic.endsWith("/delete")) store.remove(shop, kind, id);
  else await refresh(store, shop, kind, id, graph, heartbeat);
  return { kind, id, refreshed: !topic.endsWith("/delete") };
}

/** One durable delivery or one cursor page per tick. A supervisor keeps ticking;
 * webhook HTTP handlers only verify and commit, never wait for Shopify. */
export async function syncTick(options: { store?: ShopifyStore; graph?: GraphRequest; shop?: string; force?: boolean } = {}) {
  const store = options.store || new ShopifyStore();
  const shop = options.shop || setting("SHOPIFY_STORE_DOMAIN");
  let owner: string | null = null;
  try {
    if (!shop) return { state: "disabled" };
    // Privacy and uninstall events must finish even while regular sync is disabled.
    const enabled = options.force || setting("SHOPIFY_BACKEND_ENABLED") === "true";
    owner = store.acquire(shop);
    if (!owner) return { state: "busy" };
    const heartbeat = () => store.heartbeat(shop, owner!);
    const job = store.claim(shop);
    if (job && ["app/uninstalled", "shop/redact", "customers/redact", "customers/data_request", "app/scopes_update"].includes(job.topic)) {
      try { const result = await processWebhook(job, store, async () => { throw new Error("No network for privacy events"); }, heartbeat); store.finish(job.id, result); return { state: "processed", jobId: job.id }; }
      catch (error) { store.fail(job, error); return { state: "failed", jobId: job.id }; }
    }
    if (!enabled || store.disconnected(shop)) {
      if (job) store.db.prepare("UPDATE jobs SET status='pending',attempts=attempts-1 WHERE id=?").run(job.id);
      return { state: "disabled" };
    }
    let graph: GraphRequest;
    try { graph = options.graph || graphClient(await freshShopifyConfig() || connectedConfig()); }
    catch (error) { if (job) store.fail(job, error); throw error; }
    if (job) {
      try {
        heartbeat();
        if (job.kind === "command") {
          if (!options.force && setting("SHOPIFY_WRITE_ENABLED") !== "true") throw new ConnectorError("Shopify writes are disabled. Enable them after client authorization.", 409);
          const command = commandSchema.parse(job.payload);
          const result = await sendCommand(command, job.id, graph);
          // Commit the acknowledgement before a follow-up read. A failed read must
          // never cause an already acknowledged mutation to be sent a second time.
          store.finish(job.id, result);
          try { store.enqueue(shop, `refresh:${job.id}`, "webhook", command.type === "inventory_set" ? "inventory_levels/update" : "products/update", command.type === "inventory_set" ? { inventory_item_id: command.inventoryItemId.split("/").pop() } : { id: command.productId.split("/").pop() }); }
          catch { store.restart(shop); } // periodic reconciliation can recover the refresh
        } else { store.finish(job.id, await processWebhook(job, store, graph, heartbeat)); }
        return { state: "processed", jobId: job.id };
      } catch (error) { store.fail(job, error); return { state: "failed", jobId: job.id }; }
    }
    const now = Date.now();
    for (const kind of resourceKinds) {
      const saved = store.cursor(shop, kind);
      if (saved?.completed_at && now - Date.parse(String(saved.completed_at)) < 15 * 60000) continue;
      const cycle = saved && !saved.completed_at ? String(saved.cycle) : new Date(now).toISOString();
      const after = saved && !saved.completed_at && saved.cursor ? String(saved.cursor) : null;
      const page = await fetchPage(kind, after, graph, heartbeat);
      heartbeat(); store.savePage(shop, kind, page.nodes, page.nextCursor, cycle, page.complete);
      return { state: "reconciling", kind, count: page.nodes.length, complete: page.complete };
    }
    return { state: "idle" };
  } finally { if (owner) store.release(shop, owner); if (!options.store) store.close(); }
}
