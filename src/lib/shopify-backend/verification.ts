import { createHmac, timingSafeEqual } from "node:crypto";
import { ConnectorError, shopSchema, webhookTopics } from "./model";
function equal(a: Buffer, b: Buffer) { return a.length === b.length && timingSafeEqual(a, b); }
export function verifyWebhook(body: Uint8Array, headers: Headers, secret: string, configuredShop: string) {
  if (!secret || !configuredShop) throw new ConnectorError("Shopify is not configured.", 503);
  const signature = headers.get("x-shopify-hmac-sha256") || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature) || !equal(createHmac("sha256", secret).update(body).digest(), Buffer.from(signature, "base64"))) throw new ConnectorError("Invalid Shopify signature.", 401);
  const shop = shopSchema.safeParse(headers.get("x-shopify-shop-domain"));
  if (!shop.success || shop.data !== configuredShop) throw new ConnectorError("This store does not belong to this client workspace.", 403);
  const id = headers.get("x-shopify-webhook-id") || "", topic = headers.get("x-shopify-topic") || "";
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(id)) throw new ConnectorError("Missing delivery ID.");
  if (!(webhookTopics as readonly string[]).includes(topic)) throw new ConnectorError("Unsupported webhook topic.");
  return { shop: shop.data, id, topic };
}
export function verifyProxy(params: URLSearchParams, secret: string, configuredShop: string, now = Date.now()) {
  const signature = params.get("signature") || "", timestamp = params.get("timestamp") || "", shop = params.get("shop");
  for (const key of ["signature", "timestamp", "shop", "logged_in_customer_id", "resource", "path_prefix"]) if (params.getAll(key).length > 1) throw new ConnectorError("Ambiguous storefront request.", 401);
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) throw new ConnectorError("Invalid storefront signature.", 401);
  const keys = [...new Set(params.keys())].filter(k => k !== "signature").sort();
  const message = keys.map(k => `${k}=${params.getAll(k).join(",")}`).join("");
  if (!equal(createHmac("sha256", secret).update(message).digest(), Buffer.from(signature, "hex"))) throw new ConnectorError("Invalid storefront signature.", 401);
  if (!shopSchema.safeParse(shop).success || shop !== configuredShop) throw new ConnectorError("Store mismatch.", 403);
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new ConnectorError("Expired storefront request.", 401);
  const customer = params.get("logged_in_customer_id") || "";
  if (customer && !/^\d+$/.test(customer)) throw new ConnectorError("Invalid customer identity.", 401);
  return { shop, customerId: customer ? `gid://shopify/Customer/${customer}` : null };
}
export async function limitedBody(request: Request, limit = 1024 * 1024) {
  if (Number(request.headers.get("content-length")) > limit) throw new ConnectorError("Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new ConnectorError("Request too large.", 413); } parts.push(value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
