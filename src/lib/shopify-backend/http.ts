import { z } from "zod";
import { setting } from "../connections/vault";
import { ConnectorError } from "./model";
import { limitedBody, verifyProxy, verifyWebhook } from "./verification";
import { ShopifyStore } from "./store";
export function jsonError(error: unknown) {
  return Response.json({ error: error instanceof ConnectorError ? error.message : error instanceof z.ZodError ? "Invalid request fields." : "The backend could not complete this request." }, { status: error instanceof ConnectorError ? error.status : error instanceof z.ZodError ? 400 : 500, headers: { "Cache-Control": "no-store" } });
}
export async function webhookHandler(request: Request) {
  try {
    const body = await limitedBody(request, 4 * 1024 * 1024);
    const identity = verifyWebhook(body, request.headers, setting("SHOPIFY_CLIENT_SECRET"), setting("SHOPIFY_STORE_DOMAIN"));
    let payload: unknown;
    try { payload = JSON.parse(Buffer.from(body).toString("utf8")); } catch { throw new ConnectorError("Invalid JSON payload."); }
    const raw = z.record(z.string(), z.unknown()).parse(payload);
    // Keep only routing IDs in the durable inbox. Current records are fetched
    // through GraphQL; stale webhook bodies cannot overwrite newer data.
    const data: Record<string, unknown> = {};
    for (const key of ["id", "order_id", "inventory_item_id", "current"]) if (raw[key] !== undefined) data[key] = raw[key];
    if (identity.topic.startsWith("customers/") && raw.customer && typeof raw.customer === "object") data.customer = { id: (raw.customer as Record<string, unknown>).id };
    if (raw.data_request && typeof raw.data_request === "object") data.data_request = { id: (raw.data_request as Record<string, unknown>).id };
    const store = new ShopifyStore();
    try {
      const receipt = store.enqueue(identity.shop, `webhook:${identity.id}`, "webhook", identity.topic, data);
      // Disable outgoing work immediately on uninstall; the worker clears tokens.
      if (identity.topic === "app/uninstalled") store.disconnect(identity.shop);
      return Response.json({ received: true, duplicate: receipt.duplicate }, { status: 200 });
    } finally { store.close(); }
  } catch (error) { return jsonError(error); }
}
export async function proxyHandler(request: Request) {
  try {
    const url = new URL(request.url);
    const identity = verifyProxy(url.searchParams, setting("SHOPIFY_CLIENT_SECRET"), setting("SHOPIFY_STORE_DOMAIN"));
    if (setting("SHOPIFY_BACKEND_ENABLED") !== "true") throw new ConnectorError("This store's Shuug connection is disabled.", 503);
    const store = new ShopifyStore();
    try {
      if (store.disconnected(identity.shop!)) throw new ConnectorError("The store has disconnected.", 403);
      const resource = url.searchParams.get("resource") || "status";
      if (resource === "status") return Response.json({ service: "Shuug Business", connected: true }, { headers: { "Cache-Control": "no-store" } });
      if (resource !== "orders") throw new ConnectorError("Unknown storefront resource.", 404);
      if (!identity.customerId) throw new ConnectorError("Sign in to your store account to view your orders.", 401);
      // Never accept a customer ID from the body, resource path or a separate query.
      const orders = store.customerOrders(identity.shop!, identity.customerId).map(order => ({ id: order.id, name: order.name, createdAt: order.createdAt, financialStatus: order.displayFinancialStatus, fulfillmentStatus: order.displayFulfillmentStatus, total: order.currentTotalPriceSet, fulfillments: order.fulfillments }));
      return Response.json({ orders, source: "Shuug synchronized records" }, { headers: { "Cache-Control": "private, no-store" } });
    } finally { store.close(); }
  } catch (error) { return jsonError(error); }
}
