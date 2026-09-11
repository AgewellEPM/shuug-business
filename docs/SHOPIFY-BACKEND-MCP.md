# Business backend, MCP and optional Shopify

Shuug runs independently. You do not need a Shopify store, app account or API key to use its business backend or MCP. A client can connect their own Shopify store later.

Shopify runs that client's storefront and checkout. Shuug receives signed Shopify requests, keeps local commerce snapshots and can send explicitly queued product and inventory changes. This connector does not automatically publish a theme or convert existing demo/planned business modules into implemented features.

## Use the backend now

Use Node 22.13 or newer (Node 24 is the container target), then:

```sh
npm ci --ignore-scripts
npm run db:generate
npm run backend:setup
npm run dev
```

Setup creates a backend bearer key in the encrypted local vault and a private `.data/mcp-client.json`. Import that file's `mcpServers` entry into an MCP client supporting stdio. It launches the server through an absolute Node path and connects to the running app at `http://127.0.0.1:3000`. The key stays in the local vault. Run setup again after moving the repository or changing Node installations. Respect a configured `DEALDESK_DATA_DIR` when locating these files.

For an HTTP-capable MCP client, use `https://YOUR-BACKEND/api/mcp` with an `Authorization: Bearer …` header. The endpoint implements stateless Streamable HTTP. Clients that require OAuth rather than a configured bearer header should use the stdio entry. `SHUUG_BACKEND_URL` and `SHUUG_BACKEND_TOKEN` let the stdio process connect to a remote backend over HTTPS. Never put the backend key in a Shopify theme or browser script.

An owner can retrieve the key locally with `npm run backend:setup -- --print-token` when configuring a trusted remote client. Treat this as a password; the key authorizes the entire client workspace. The separate `WORKSPACE_ACCESS_TOKEN` protects staff web access.

From another terminal, verify the actual running app:

```sh
npm run backend:smoke
```

This exercises unauthorized HTTP rejection, authorized capabilities, both MCP transports, tool discovery, business reads and optional Shopify status. It does not change store or business records.

## Available interfaces

| Endpoint | Purpose | Authentication |
| --- | --- | --- |
| `GET /api/backend` | Capabilities and implementation boundaries | Backend bearer key |
| `POST /api/backend` | Shared business and connector operations | Backend bearer key |
| `POST /api/mcp` | MCP Streamable HTTP | Backend bearer key |
| `POST /api/shopify/webhooks` | Durable Shopify event inbox | Raw-body Shopify HMAC and configured shop |
| `GET /api/shopify/proxy` | Storefront connection status or signed customer's orders | Shopify app-proxy signature, shop and fresh timestamp |
| `/api/shopify/connect`, `/api/shopify/callback` | Existing connection-wizard OAuth flow | Owner access, state cookie and callback HMAC |

HTTP operations use this envelope:

```json
{"operation":"business_read","arguments":{"resource":"features"}}
```

Successful POST requests return `{"data": ...}`. Errors return `{"error": ...}` with a non-success HTTP status. Send JSON and the bearer header. `GET /api/backend` returns the capabilities object directly.

The MCP exposes 37 tools:

| Tools | Function |
| --- | --- |
| `business_capabilities`, `business_read` | Discover capabilities and read the 31 registered business resources |
| `receivable_catalog`, `receivable_command` | Dated receipt/returned-payment evidence, captured ledger entries and collection follow-up; [instructions](RECEIVABLES.md) |
| `account_catalog`, `account_command` | Reviewed account creation/edits, 15 classifications, five-level hierarchy and retained changes |
| `journal_catalog`, `journal_command` | Reviewed balanced posting, duplicate protection and recorded reversals |
| `inspection_catalog`, `inspection_command` | Versioned checklists, assigned technician execution, findings/photos and reviewed job costs; [instructions and limits](AUTO-REPAIR-INSPECTIONS.md) |
| `repair_catalog`, `repair_command` | Reviewed labor/parts pricing, vehicle estimates and real service proposals; [instructions and limits](AUTO-REPAIR-PRICING.md) |
| `vehicle_vin_lookup`, `vehicle_vin_apply` | NHTSA specification lookup, explicit review and durable vehicle save; [instructions and limits](AUTO-REPAIR.md) |
| `workflow_catalog`, `workflow_records`, `workflow_save`, `workflow_transition` | Distinct service/nonprofit records and validated transitions |
| `restaurant_catalog`, `restaurant_command` | Restaurant menu/stock/order/kitchen/bookkeeping, credits, physical counts and specials |
| `restaurant_report` | Date-range sales patterns, reviewed opening-hour comparisons, data coverage and channel totals; [report definitions](RESTAURANT-REPORTS.md) |
| `dining_catalog`, `dining_command` | Reservation hours, bookings, arrivals and table occupancy |
| `schedule_catalog`, `schedule_command` | Staff shifts, time away and audited attendance |
| `trackers_list`, `tracker_create`, `tracker_save_record` | Persistent custom trackers with request IDs and revision checks |
| `shopify_status`, `shopify_configure` | Inspect or enable the optional connector and separate write setting |
| `shopify_records` | Paginated local products, customers, orders and inventory |
| `shopify_jobs`, `shopify_job` | Recent receipts and individual outcomes |
| `shopify_tick`, `shopify_reconcile` | Process one unit of work or schedule a new reconciliation |
| `shopify_command`, `shopify_resolve` | Queue supported changes or record owner reconciliation of an uncertain write |

`shuug://capabilities` is also an MCP resource. The MCP tool `business_capabilities` maps to HTTP operation `capabilities`; other tool names match their HTTP operation names. Business reads retain the existing live/partial/planned and demo boundaries returned by capabilities.

## Connect a client later

Deploy **one workspace with its own private data volume per client**. This implementation is not a shared multi-tenant account system.

1. Give the backend a stable HTTPS origin and set `APP_BASE_URL` to it. Protect owner pages with the built-in owner sign-in or an authenticated owner gateway. Allow Shopify to reach the webhook and proxy routes; these perform their own signature verification. Allow the OAuth callback without gateway header injection so its signed state/cookie check can complete.
2. Create the client's Shopify app in the Dev Dashboard and choose the appropriate distribution. Generate its app configuration locally:

   ```sh
   npm run shopify:configure -- --client-id CLIENT_APP_ID --url https://client-backend.example.com
   ```

   The generator creates `shopify.app.toml` without overwriting an existing file. Review it and deploy the configuration using Shopify CLI's `shopify app deploy` from the app's configured project, or apply matching settings through the Dev Dashboard. This command is not executed by Shuug. An example is in `integrations/shopify/shopify.app.example.toml`.
3. Enable the connector with `shopify_configure` arguments `{"enabled":true,"writesEnabled":false}` through the authenticated backend or MCP. In **Settings → Shopify**, save that client's `*.myshopify.com` domain, app client ID and secret, then connect and approve the requested permissions. Enable the backend before connecting so OAuth requests its sync scopes.
4. Run `npm run shopify:worker` under your service supervisor, alongside the web process, using the same `DEALDESK_DATA_DIR`. Leave the worker running while connected, including after uninstall so pending privacy events finish. `-- --once` processes one tick and exits.
5. Inspect `shopify_status`, wait for reconciliation to finish, and compare records with the client's store. Initial sync and subsequent full scans are paginated. Webhook deliveries refresh changed records in the background; reconciliation repairs missed deliveries. Updates are eventual, not an atomic transaction across both systems.
6. If the client wants storefront access, add `integrations/shopify/shuug-orders.liquid` to the theme's `sections` folder and add that section to a suitable page template. It calls `/apps/shuug?resource=orders`. Shopify forwards this to the signed proxy endpoint. The example relies on a theme customer session and shows up to 100 orders for that signed-in customer. Adapt it to the client's account experience; it is not a customer-account UI extension.

The generated config subscribes to product, customer, order, refund, fulfillment and inventory events, uninstall/scope changes and privacy topics. It configures `/apps/shuug` and requests the required read scopes plus `write_app_proxy`. Shopify's [app configuration reference](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration) describes deployment of these settings. Shopify signs [webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries) and [app-proxy requests](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies) differently; Shuug implements each verification separately.

OAuth requests expiring offline tokens and rotates refresh tokens under a shared worker lock. Revoked authorization requires reconnection. This follows Shopify's [standalone-app authentication flow](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps).

## Sending changes to Shopify

Enable writes only for a client who wants them. Generate/deploy a matching configuration with `--writes`, call `shopify_configure` with `writesEnabled: true`, then reconnect so the client can approve `write_products` and `write_inventory`.

Supported commands are product title/description, variant price and inventory available quantity. Example HTTP operation:

```json
{
  "operation": "shopify_command",
  "arguments": {
    "idempotencyKey": "6226264e-9602-49e7-ae3e-d367d535752a",
    "command": {
      "type": "inventory_set",
      "inventoryItemId": "gid://shopify/InventoryItem/123",
      "locationId": "gid://shopify/Location/456",
      "quantity": 12,
      "compareQuantity": 10
    }
  }
}
```

Use a new UUID for each intended command and reuse it only for retries of that exact command. A queue receipt means accepted, not applied: inspect `shopify_job` until `done` or an error. Inventory changes compare the observed quantity and include Shopify's required [idempotency directive](https://shopify.dev/docs/api/usage/idempotent-requests). The [inventory mutation documentation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities) explains quantity comparison.

Failed reads and throttled requests retry with backoff. A write whose response was lost becomes `uncertain` and blocks later writes while read synchronization continues. Check the actual Shopify result, record that outcome with `shopify_resolve`, then submit a new command only if needed. Shuug does not automatically replay uncertain writes.

## Persistence and operating boundaries

The backend uses a private persistent volume. `connections.enc` and `vault.key` contain encrypted credentials; `shopify.sqlite` contains commerce snapshots, queue receipts, cursors and leases. Stop web and worker processes before a simple whole-volume copy, or use SQLite's online backup facilities. Keep the vault and key together. A stateless/serverless filesystem is unsupported.

`Dockerfile.backend` and `compose.backend.yaml` provide a web/worker deployment template using Node 24 and one shared volume. They are supplied for deployment preparation; the container image has not been built or deployed as part of this change. Set the public base URL and configure an owner password or owner gateway before deployment. After starting the containers, run `docker compose -f compose.backend.yaml exec web npm run backend:setup`. The template binds the host port to loopback for a TLS gateway. It does not provision a domain, external login gateway or Shopify app.

Commerce snapshots preserve Shopify IDs, units and decimal money/currencies. They are exposed through `shopify_records`; existing case-priced orders and accounting resources retain their original data sources. There is no automatic posting into the ledger, tax calculation, payout reconciliation or mapping from Shopify units to business cases. The supported write commands do not create orders, capture payments or fulfill shipments.

Availability depends on the client's granted scopes and protected-customer-data access. Shopify normally restricts accessible order history; older orders require approved `read_all_orders` access in addition to order scopes. See Shopify's [Order API reference](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order). Scans do not treat absence from the accessible order window as a deletion.

Uninstall stops regular work immediately and the worker clears tokens. Privacy events are processed even while sync is disabled. Customer/shop redaction removes mirrored records; blocked customer IDs prevent accidental reimport. A data-request job prepares an owner-only export of stored customer/order snapshots, including more than 100 orders if present. Its result has `requiresOwnerDelivery: true`: the owner must deliver it to the verified requester. The connector does not send messages automatically or erase unrelated business records/backups on a guessed identity match.

## Verification

`npm run test:backend` exercises durable queue recovery, duplicate delivery, worker exclusion, pagination, token rotation, signature validation, customer isolation, actual MCP protocol negotiation and backend operations using fixtures. `npm run backend:smoke` checks the running app through both MCP transports. No live Shopify store, theme installation, app deployment or container deployment is part of these local checks.

The dependency audit currently reports four high-severity entries in the existing Prisma tooling dependency chain. The MCP SDK is not among the flagged packages; no forced Prisma version downgrade was applied.

## Workflow and sign-in additions

The MCP exposes 37 tools, including `workflow_catalog`, `workflow_records`, `workflow_save` and `workflow_transition`. These use distinct durable service/nonprofit records, validated transitions and audit history. Their payment confirmation action records an external transaction; it does not charge a card. The backend bearer authorizes the whole client workspace.

Built-in owner setup is available via `npm run workspace:setup`; an external owner gateway is optional. Separate employee invitations, activation, permissions and personal work areas are available through [employee accounts](EMPLOYEE-ACCOUNTS.md). Each client still needs its own deployment; this does not provide multi-tenant authorization. See [workflow and release boundaries](WORKFLOWS-AND-RELEASE.md).

Manual accounting adds `journal_catalog` and `journal_command`, plus the `accounting-journal` and `accounting-manual` resources. Read the [manual audit](QUICKBOOKS-MANUAL-ACCEPTANCE.md) for posting/reversal behavior and outstanding accounting requirements. Backend credentials authorize the whole workspace; employee access belongs on the authenticated role-checked app/API.

Accounting also exposes `account_catalog` and `account_command` for reviewed creation/edits, classification and hierarchy checks, and inactive-account lifecycle. Read the `accounts` resource for current revisions before a change. System account mappings and used-account classifications are protected.
