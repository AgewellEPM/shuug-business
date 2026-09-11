# Connections and live checks

Open **Settings & connections** for the wizard. It saves credentials on the server, shows saved-secret placeholders, and runs a real connection check. No live account was connected or charged during implementation.

| Connection | What the wizard needs | Implemented behavior |
| --- | --- | --- |
| Shopify | Store domain, app client ID/secret and registered redirect; or existing Admin token | OAuth callback HMAC/state verification; GraphQL Admin reads; store-name connection check |
| QuickBooks | Intuit client ID/secret, matching redirect and sandbox/production choice | OAuth authorization, durable encrypted tokens, refresh and company check |
| Amazon | Selling Partner app client ID/secret, refresh token, marketplace ID and region | LWA refresh, Orders API v2026-01-01, resumable order pulls and persistent shipping pipeline |
| Google Maps | Separate server and browser API keys | Places business search/details, browser map and Google Routes optimization |
| Zapier | Catch-hook URL | Explicit test event, prospect-created delivery, and tested website request-reference workflows |
| Slack | Incoming webhook URL | Explicit test message and enabled website request-reference workflows to the configured channel |
| Stripe | Test or live secret key | Read-only account check and hosted Checkout for supported order payments |
| Custom API | Public HTTPS URL, optional Bearer token | Connection check, event delivery; private/internal destinations and redirects rejected |
| Google Ads | Developer token, OAuth client, refresh token, customer ID and optional MCC | OAuth refresh, historical metrics, keyword ideas, account results, validate-only review and atomic paused campaign creation |
| Competitor discovery | Optional Brave Search API key | Sourced candidate websites; does not claim they advertise or know exact spend |

OAuth still requires a provider app registration. A wizard cannot manufacture Shopify/Intuit/Google credentials or grant itself access to an account. Match callback URLs exactly to the base URL shown in the wizard. Shopify needs `read_orders` and `read_customers`, plus any provider approval needed to access protected customer fields. The API normally exposes recent orders; historical access requires the appropriate scope. [Shopify authentication](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps), [Shopify orders](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders).

The Maps server key needs Places API (New) and Routes API. Restrict the separate browser key to the JavaScript Maps API and the app's HTTP referrers. Searching other businesses uses **Places**; Business Profile ownership access does not provide decision-maker identities. Public phone numbers come from available listings; buyer names and direct contacts are merchant-entered. Google Place IDs and merchant notes persist; listing details refresh from Google. [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Routes stop optimization](https://developers.google.com/maps/documentation/routes/opt-way).

## Invoice review

Preview the latest 25 Shopify orders. Only fully unpaid `PENDING`, unedited, non-test, non-cancelled USD orders with complete SKU lines, no shipping, and no discount/tax discrepancy are eligible for the implemented invoice mapping. Other orders show a reason. Paid orders require a sales receipt or payment-aware accounting workflow that is not implemented here.

Preview snapshots expire after 15 minutes and bind to the shop and QuickBooks company. An order is fetched again before submitting; changed orders require another preview. Each source order has a durable receipt and an Intuit request ID. An ambiguous submission is never automatically retried. Accountants should review the sandbox result, including customer/item mappings and currency settings, before using production. There is no automatic background invoice sync.

## Ads and competition

Google Ads defaults to API v25. Missing CPCs remain unknown; bid-range proxies are labeled separately from historical average CPC. Economics assume USD, with market/volume assumptions shown. Google account currencies other than USD are blocked for that calculation. [Google Ads release notes](https://developers.google.com/google-ads/api/docs/release-notes), [Historical metrics](https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics).

Campaign creation validates the exact saved draft, binds it to the selected account, and uses one atomic mutation with paused resources. Submission is separately enabled in Settings. The app never enables a campaign automatically. Check the saved campaign in Google Ads before activating it there.

Competitor cards distinguish sourced findings, unverified candidates and suggested experiments. Auction Insights imports show overlap/share; third-party spend imports retain provider, period and country. Exact competitor spend is unavailable. Research notes and imported evidence are saved in this browser; export the brief for backup. [Auction Insights](https://support.google.com/google-ads/answer/2579754).

## Hosting and verification

- Run local development on loopback (`npm run dev`). Configure the owner password, create employee accounts, and deploy behind HTTPS. Browser access uses individual sessions and server-side permissions. Broad backend/MCP credentials belong only on trusted servers; see [employee accounts](EMPLOYEE-ACCOUNTS.md) and [getting started](GETTING-STARTED.md). Each client requires a separate data directory.
- Back up the whole private data directory, including **vault.key** and submission receipts. Losing receipts can remove duplicate-submission protection. Stateless serverless deployment without a persistent data volume is unsupported.
- A successful local build and mocked API tests do not establish live provider access. Finish each wizard's check, then verify provider-specific reads and sandbox writes with your own account.
- UI inspection must use the configured IsolatedTester/TinkyVision tools. No Chromium, Playwright, Selenium or bundled browser runtime is used. The earlier TinkyVision inspection was cancelled, so final visual verification remains uncompleted.
