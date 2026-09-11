import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { baseScopes, writeScopes, webhookTopics } from "../src/lib/shopify-backend/model";
const { values } = parseArgs({ options: { "client-id": { type: "string" }, url: { type: "string" }, output: { type: "string", default: "shopify.app.toml" }, writes: { type: "boolean", default: false } } });
if (!values["client-id"] || !values.url) throw new Error("Usage: npm run shopify:configure -- --client-id CLIENT_ID --url https://client-backend.example.com [--writes]");
if (!/^[a-zA-Z0-9_-]+$/.test(values["client-id"])) throw new Error("Invalid app client ID.");
const url = new URL(values.url);
if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Use the HTTPS origin of the deployed client backend.");
const scopes = [...baseScopes, ...(values.writes ? writeScopes : [])].join(",");
const ordinary = webhookTopics.filter(t => !["customers/data_request", "customers/redact", "shop/redact"].includes(t));
const toml = `# Generated for this client workspace. No app secret belongs in this file.
client_id = ${JSON.stringify(values["client-id"])}
name = "Shuug Business"
application_url = ${JSON.stringify(`${url.origin}/settings`)}
embedded = false

[access_scopes]
scopes = ${JSON.stringify(scopes)}
optional_scopes = ${JSON.stringify(values.writes ? [] : writeScopes)}
use_legacy_install_flow = true

[auth]
redirect_urls = [${JSON.stringify(`${url.origin}/api/shopify/callback`)}]

[webhooks]
api_version = "2026-07"

[[webhooks.subscriptions]]
topics = ${JSON.stringify(ordinary)}
uri = "/api/shopify/webhooks"

[[webhooks.subscriptions]]
compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "/api/shopify/webhooks"

[app_proxy]
url = ${JSON.stringify(`${url.origin}/api/shopify/proxy`)}
prefix = "apps"
subpath = "shuug"

[build]
automatically_update_urls_on_dev = false
`;
writeFileSync(values.output!, toml, { flag: "wx" });
console.log(`Wrote ${values.output}. Review and deploy this app configuration in the client's Shopify Dev Dashboard. Nothing was installed or published.`);
