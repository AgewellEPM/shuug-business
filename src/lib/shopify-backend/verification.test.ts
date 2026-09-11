// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyProxy, verifyWebhook, limitedBody } from "./verification";
const secret = "fixture-secret", shop = "client.myshopify.com";
function headers(body: string) { return new Headers({ "x-shopify-shop-domain": shop, "x-shopify-topic": "orders/create", "x-shopify-webhook-id": "event-1", "x-shopify-hmac-sha256": createHmac("sha256", secret).update(body).digest("base64") }); }
describe("Shopify request identity", () => {
  it("verifies the exact raw bytes and rejects a valid signature from a different client", () => {
    const raw = '{ "id": 1 }', h = headers(raw);
    expect(verifyWebhook(Buffer.from(raw), h, secret, shop).id).toBe("event-1");
    expect(() => verifyWebhook(Buffer.from('{"id":1}'), h, secret, shop)).toThrow("signature");
    expect(() => verifyWebhook(Buffer.from(raw), h, secret, "other.myshopify.com")).toThrow("does not belong");
    h.set("x-shopify-hmac-sha256", "not-base64");
    expect(() => verifyWebhook(Buffer.from(raw), h, secret, shop)).toThrow("signature");
  });
  it("matches Shopify's documented repeated-query signature vector", () => {
    const params = new URLSearchParams("extra=1&extra=2&shop={shop}.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555");
    params.set("shop", shop);
    const message = `extra=1,2logged_in_customer_id=1path_prefix=/apps/awesome_reviewsshop=${shop}timestamp=1317327555`;
    params.set("signature", createHmac("sha256", "hush").update(message).digest("hex"));
    expect(verifyProxy(params, "hush", shop, 1317327555000).customerId).toBe("gid://shopify/Customer/1");
    expect(() => verifyProxy(params, "hush", shop, 1317328000000)).toThrow("Expired");
    params.append("logged_in_customer_id", "2");
    expect(() => verifyProxy(params, "hush", shop, 1317327555000)).toThrow("Ambiguous");
  });
  it("enforces streamed body limits even when content-length is absent", async () => {
    const request = new Request("http://localhost/webhook", { method: "POST", body: "1234567" });
    await expect(limitedBody(request, 5)).rejects.toThrow("too large");
  });
});
