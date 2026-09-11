# Customer imports and Amazon shipping

## Import customers

Open **Customers → Import customers**. Choose QuickBooks or an Excel/CSV/TSV file, set the default Bulk/Stores/Online channel, then review the rows and choose which customers to add. File imports have automatic and editable column matching, a sheet picker, and a blank CSV template.

Imports retain company and contact names, email, phone, billing/shipping addresses, supported public website, region, account owner and channel. Names are required; blank email addresses are allowed. Invalid rows show a reason. Source IDs, email and company names identify likely duplicates, which are skipped to preserve existing details and pricing. New accounts receive standard catalog pricing. This workflow does not change QuickBooks or send marketing messages.

QuickBooks pulls active and inactive customer pages with stable ordering, up to 10,000 customers. An account switch or repeated source ID invalidates that preview. Spreadsheet imports support files up to 5 MB, 30 sheets, 60 unique headers and 5,000 customer rows per sheet; larger exports must be split. Phone numbers formatted as text retain leading zeroes. Workbook formulas are not executed; only available cell values are read.

Reviewed rows are held for 30 minutes. Only selected eligible rows can be committed. Saved import receipts and stable customer IDs protect retries. `imported-customers.json` stores profiles, source IDs and pricing snapshots; imported profiles and later pricing changes reload in local mode after a restart. Core orders still use the existing demo store unless Postgres is configured. Do not treat imported contacts as proof that the rest of the demo is production accounting.

Back up the private data directory. Imports allow one writer at a time. An abnormal process termination can leave `customer-imports/import.lock`; after confirming the import process has stopped, an operator can remove that stale lock and retry the reviewed import. The file stores assume one application host; use a database-backed design before running multiple replicas.

## Connect Amazon and follow shipments

Open **Settings → Amazon** and save the authorized Selling Partner app's client ID, secret, refresh token, marketplace and region. Run the connection check, then open **Shipping pipeline** from the sidebar or Orders. Amazon requires selling-partner authorization and an appropriate app role. The adapter requests fulfillment, packages, proceeds and payment datasets, without buyer or recipient PII. [Amazon order data and access requirements](https://developer-docs.amazon/sp-api/docs/get-order-information).

The pipeline shows:

- Ordered / payment check, ready to ship, partially shipped, shipped / in transit, delivered, and needs attention.
- Products and SKUs, quantities ordered/fulfilled/outstanding when reported, FBA/merchant fulfillment and ship-by deadlines.
- Package carriers, tracking numbers, package status and observed status changes in each order's details.
- Search, fulfillment and overdue filters, plus the shared Online channel view.

Refresh checks orders updated in the chosen 7/30/90/365-day window, including older orders with recent shipment changes. Saved snapshots remain visible between refreshes. Each refresh follows up to ten 100-order pages; **Continue sync** resumes a larger pull. Completed pages persist if the API interrupts the pull. Optional refresh runs every five minutes while the page is visible; this is polling, not a background webhook service.

Payment executions and amounts are shown only when Amazon reports them. A reported execution is not proof that funds have settled into the seller's bank account. This implementation does not label an order paid based on shipment status and does not reconcile Amazon settlements. Missing amounts stay unknown. Tracking can be absent, especially for Amazon-fulfilled orders; delivery requires a fully shipped order and all reported packages marked delivered. Recorded history timestamps indicate when this app observed a change. [Amazon Orders API model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json).

Amazon snapshots and the latest 2,000 observed changes persist in `amazon-{account-key}.json`, isolated by app, authorization, marketplace and region. They are separate from website-order accounting totals. The integration reads Amazon data; it does not buy labels, confirm shipments, issue refunds or update listings.

## Verification

Automated coverage includes actual Excel workbook parsing, reviewed row selection, duplicate protection, import retry/restart persistence, QuickBooks pagination/account switches, Amazon API request shape, partial shipment mapping, missing payment data, saved pagination and stale snapshot protection. Provider responses are fixtures. Live account access and provider-specific results still require successful owner connection checks. Browser visual verification remains uncompleted after the earlier TinkyVision inspection was cancelled.
