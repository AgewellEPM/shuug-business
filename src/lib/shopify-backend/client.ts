import { z } from "zod";
import { setting } from "../connections/vault";
import { getShopifyConfig, type ShopifyConfig } from "../integrations/config";
import { ConnectorError, type ResourceKind, type ShopifyCommand } from "./model";

export type GraphRequest = (query: string, variables?: Record<string, unknown>, mutation?: boolean) => Promise<Record<string, unknown>>;
export function graphClient(config: ShopifyConfig, fetcher: typeof fetch = fetch): GraphRequest {
  if (!/^\d{4}-(01|04|07|10)$/.test(config.apiVersion)) throw new ConnectorError("Choose a supported stable Shopify API version.");
  return async (query, variables = {}, mutation = false) => {
    let response: Response;
    try {
      response = await fetcher(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": config.adminToken },
        body: JSON.stringify({ query, variables }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
      });
    } catch { throw new ConnectorError("Shopify did not return a response. Check the connection.", 502, !mutation, mutation); }
    if (!response.ok) throw new ConnectorError(`Shopify returned HTTP ${response.status}. Check credentials, scopes or retry later.`, 502, response.status === 429 || (!mutation && response.status >= 500), mutation && response.status >= 500);
    let json: { data?: Record<string, unknown>; errors?: { extensions?: { code?: string } }[] };
    try { json = await response.json(); } catch { throw new ConnectorError("Shopify returned an invalid response.", 502, !mutation, mutation); }
    if (json.errors?.length) {
      const throttled = json.errors.every(e => e.extensions?.code === "THROTTLED");
      throw new ConnectorError(throttled ? "Shopify is throttling requests; the worker will retry." : "Shopify rejected the operation. Verify app scopes and API fields.", 502, throttled, mutation && !throttled && !!json.data);
    }
    if (!json.data || typeof json.data !== "object") throw new ConnectorError("Shopify returned incomplete data.", 502, !mutation, mutation);
    return json.data;
  };
}
export function connectedConfig() {
  if (setting("SHOPIFY_BACKEND_ENABLED") !== "true") throw new ConnectorError("Shopify is optional and currently disabled. Connect a client's store and enable sync when needed.", 409);
  const config = getShopifyConfig();
  if (!config) throw new ConnectorError("Connect a Shopify store before enabling synchronization.", 409);
  return config;
}

const money = "shopMoney { amount currencyCode }";
const variant = "id title sku price inventoryItem { id }";
const orderLine = `id title sku quantity currentQuantity originalUnitPriceSet { ${money} } variant { id }`;
const level = 'id location { id name } quantities(names:["available","on_hand","committed"]) { name quantity }';
const pageInfo = "pageInfo { hasNextPage endCursor }";
export const fields: Record<ResourceKind, string> = {
  products: `id title handle descriptionHtml status vendor productType tags updatedAt onlineStoreUrl variants(first:100) { ${pageInfo} nodes { ${variant} } }`,
  customers: "id firstName lastName displayName updatedAt defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } tags",
  orders: `id name createdAt updatedAt cancelledAt displayFinancialStatus displayFulfillmentStatus customer { id } currentTotalPriceSet { ${money} } totalRefundedSet { ${money} } lineItems(first:100) { ${pageInfo} nodes { ${orderLine} } } fulfillments { id status trackingInfo { number url company } }`,
  inventory: `id sku updatedAt tracked inventoryLevels(first:100) { ${pageInfo} nodes { ${level} } }`,
};
const spec = {
  products: { root: "products", one: "product", child: "variants", childFields: variant },
  customers: { root: "customers", one: "customer", child: "", childFields: "" },
  orders: { root: "orders", one: "order", child: "lineItems", childFields: orderLine },
  inventory: { root: "inventoryItems", one: "inventoryItem", child: "inventoryLevels", childFields: level },
} as const;
const connection = z.object({ nodes: z.array(z.record(z.string(), z.unknown())), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) });
const nodeSchema = z.object({ id: z.string().startsWith("gid://shopify/"), updatedAt: z.iso.datetime() }).passthrough();

async function completeNode(kind: ResourceKind, raw: unknown, graph: GraphRequest, heartbeat: () => void) {
  const node = nodeSchema.parse(raw), { child, childFields, one } = spec[kind];
  if (!child) return node;
  let part = connection.parse(node[child]);
  const nodes = [...part.nodes], visited = new Set<string>();
  while (part.pageInfo.hasNextPage) {
    const cursor = part.pageInfo.endCursor;
    if (!cursor || visited.has(cursor)) throw new ConnectorError("Shopify nested pagination did not advance.", 502);
    visited.add(cursor); heartbeat();
    const result = await graph(`query ShuugNested($id:ID!,$after:String){ ${one}(id:$id){ ${child}(first:100,after:$after){ ${pageInfo} nodes { ${childFields} } } } }`, { id: node.id, after: cursor });
    const parent = result[one] as Record<string, unknown> | null;
    if (!parent) throw new ConnectorError("The Shopify record changed during pagination; retrying.", 409, true);
    part = connection.parse(parent[child]); nodes.push(...part.nodes);
  }
  return { ...node, [child]: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } };
}
export async function fetchPage(kind: ResourceKind, after: string | null, graph: GraphRequest, heartbeat = () => {}) {
  const { root } = spec[kind]; heartbeat();
  // Two parent nodes with 100 nested nodes keep requested query cost below 1000.
  const result = await graph(`query ShuugSync($after:String){ ${root}(first:${kind === "customers" ? 50 : 2},after:$after){ ${pageInfo} nodes { ${fields[kind]} } } }`, { after });
  const page = connection.parse(result[root]);
  if (page.pageInfo.hasNextPage && (!page.pageInfo.endCursor || page.pageInfo.endCursor === after || !page.nodes.length)) throw new ConnectorError("Shopify pagination did not advance.", 502);
  const nodes = [];
  for (const node of page.nodes) nodes.push(await completeNode(kind, node, graph, heartbeat));
  return { nodes, nextCursor: page.pageInfo.endCursor, complete: !page.pageInfo.hasNextPage };
}
export async function fetchResource(kind: ResourceKind, id: string, graph: GraphRequest, heartbeat = () => {}) {
  heartbeat(); const { one } = spec[kind];
  const result = await graph(`query ShuugRecord($id:ID!){ ${one}(id:$id){ ${fields[kind]} } }`, { id });
  if (result[one] === null) return null;
  return completeNode(kind, result[one], graph, heartbeat);
}
export async function sendCommand(command: ShopifyCommand, id: string, graph: GraphRequest) {
  let result: Record<string, unknown>, root: string;
  if (command.type === "product_update") {
    root = "productUpdate";
    result = await graph("mutation ShuugProduct($product:ProductUpdateInput!){ productUpdate(product:$product){ product { id } userErrors { field message } } }", { product: { id: command.productId, title: command.title, ...(command.descriptionHtml === undefined ? {} : { descriptionHtml: command.descriptionHtml }) } }, true);
  } else if (command.type === "variant_price") {
    root = "productVariantsBulkUpdate";
    result = await graph("mutation ShuugPrice($productId:ID!,$variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$productId,variants:$variants,allowPartialUpdates:false){ product { id } userErrors { field message } } }", { productId: command.productId, variants: [{ id: command.variantId, price: command.price }] }, true);
  } else {
    root = "inventorySetQuantities";
    result = await graph("mutation ShuugInventory($input:InventorySetQuantitiesInput!,$key:String!){ inventorySetQuantities(input:$input) @idempotent(key:$key){ inventoryAdjustmentGroup { createdAt referenceDocumentUri } userErrors { field message } } }", { key: id, input: { name: "available", reason: "correction", referenceDocumentUri: `shuug://inventory/${id}`, quantities: [{ inventoryItemId: command.inventoryItemId, locationId: command.locationId, quantity: command.quantity, compareQuantity: command.compareQuantity }] } }, true);
  }
  const payload = z.object({ userErrors: z.array(z.object({ message: z.string() })) }).passthrough().safeParse(result[root]);
  if (!payload.success) throw new ConnectorError("Shopify did not confirm the write. Reconcile this command before retrying.", 502, false, true);
  if (payload.data.userErrors.length) throw new ConnectorError(`Shopify rejected the change: ${payload.data.userErrors.map(e => e.message).join("; ").slice(0, 500)}`, 409);
  if (!payload.data.product && !payload.data.inventoryAdjustmentGroup) throw new ConnectorError("Shopify's write result was incomplete; reconcile before retrying.", 502, false, true);
  return payload.data;
}
