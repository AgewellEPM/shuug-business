// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshShopifyConfig } from "./tokens";
import { saveSecrets, setting } from "../connections/vault";
import { requestedShopifyScopes } from "../connections/shopify-oauth";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "shuug-tokens-"));
  vi.stubEnv("DEALDESK_DATA_DIR", dir);
  saveSecrets({ SHOPIFY_STORE_DOMAIN: "fixture.myshopify.com", SHOPIFY_ADMIN_TOKEN: "old-token", SHOPIFY_REFRESH_TOKEN: "old-refresh", SHOPIFY_TOKEN_EXPIRES_AT: String(Date.now() - 1), SHOPIFY_CLIENT_ID: "fixture-id", SHOPIFY_CLIENT_SECRET: "fixture-secret", SHOPIFY_BACKEND_ENABLED: "false", SHOPIFY_WRITE_ENABLED: "false" });
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("rotates both credentials and reuses the fresh token across calls", async () => {
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({ grant_type: "refresh_token", refresh_token: "old-refresh" });
    return Response.json({ access_token: "new-token", refresh_token: "new-refresh", expires_in: 3600 });
  });
  expect((await freshShopifyConfig(fetcher))?.adminToken).toBe("new-token");
  expect(setting("SHOPIFY_REFRESH_TOKEN")).toBe("new-refresh");
  expect((await freshShopifyConfig(fetcher))?.adminToken).toBe("new-token");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("retains credentials on temporary failure and clears rejected authorization", async () => {
  await expect(freshShopifyConfig(async () => new Response(null, { status: 503 }))).rejects.toMatchObject({ retryable: true });
  expect(setting("SHOPIFY_REFRESH_TOKEN")).toBe("old-refresh");
  await expect(freshShopifyConfig(async () => new Response(null, { status: 401 }))).rejects.toMatchObject({ status: 401 });
  expect(setting("SHOPIFY_REFRESH_TOKEN")).toBe("");
  expect(setting("SHOPIFY_ADMIN_TOKEN")).toBe("");
});
it("serializes overlapping refresh calls and releases the lease afterward", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = freshShopifyConfig(async () => { await gate; return Response.json({ access_token: "new", refresh_token: "refresh", expires_in: 3600 }); });
  try { await expect(freshShopifyConfig()).rejects.toMatchObject({ status: 503, retryable: true }); }
  finally { release(); await first; }
  expect((await freshShopifyConfig())?.adminToken).toBe("new");
});
it("requests the optional backend permissions only when enabled, with separate write consent", () => {
  expect(requestedShopifyScopes()).toEqual(["read_orders", "read_customers"]);
  saveSecrets({ SHOPIFY_BACKEND_ENABLED: "true" });
  expect(requestedShopifyScopes()).toContain("read_fulfillments");
  expect(requestedShopifyScopes()).toContain("write_app_proxy");
  expect(requestedShopifyScopes()).not.toContain("write_inventory");
  saveSecrets({ SHOPIFY_WRITE_ENABLED: "true" });
  expect(requestedShopifyScopes()).toContain("write_inventory");
});
