import { z } from "zod";

export const resourceKinds = ["products", "customers", "orders", "inventory"] as const;
export type ResourceKind = typeof resourceKinds[number];
export const shopSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/);
export const gid = (type: string) => z.string().regex(new RegExp(`^gid://shopify/${type}/[0-9]+$`));
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("product_update"), productId: gid("Product"), title: z.string().trim().min(1).max(255), descriptionHtml: z.string().max(30000).optional() }).strict(),
  z.object({ type: z.literal("variant_price"), productId: gid("Product"), variantId: gid("ProductVariant"), price: z.string().regex(/^\d{1,10}(\.\d{1,3})?$/) }).strict(),
  z.object({ type: z.literal("inventory_set"), inventoryItemId: gid("InventoryItem"), locationId: gid("Location"), quantity: z.number().int().min(0).max(100000000), compareQuantity: z.number().int().min(-100000000).max(100000000) }).strict(),
]);
export type ShopifyCommand = z.infer<typeof commandSchema>;
export const webhookTopics = [
  "products/create", "products/update", "products/delete", "customers/create", "customers/update", "customers/delete",
  "orders/create", "orders/updated", "orders/paid", "orders/cancelled", "orders/delete", "refunds/create",
  "fulfillments/create", "fulfillments/update", "inventory_levels/update", "inventory_levels/connect", "inventory_levels/disconnect",
  "app/uninstalled", "app/scopes_update", "customers/data_request", "customers/redact", "shop/redact",
] as const;
export const baseScopes = ["read_products", "read_customers", "read_orders", "read_fulfillments", "read_inventory", "read_locations", "write_app_proxy"] as const;
export const writeScopes = ["write_products", "write_inventory"] as const;
export type Resource = { shop: string; kind: ResourceKind; id: string; data: Record<string, unknown>; updatedAt: string; observedAt: string; deleted: boolean };
export type Job = { id: string; shop: string; kind: "webhook" | "command"; topic: string; payload: Record<string, unknown>; status: string; attempts: number; error: string | null; result: unknown; createdAt: number };
export class ConnectorError extends Error {
  constructor(message: string, public status = 400, public retryable = false, public uncertain = false) { super(message); }
}
