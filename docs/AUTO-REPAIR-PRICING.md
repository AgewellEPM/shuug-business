# Repair pricing, proposals and reusable templates

The auto-repair pack uses **Services → Labor & parts pricing** (`/m/labor-rates`; also available in Parts markup rules) and **Services → Estimates & proposals** (`/modules/service-proposals`). Prices are calculated in Shuug. No store, pricing provider or AI account is required.

## Review and publish rates

1. Create a pricing version with a name, version number, currency and effective dates. Supported currencies are USD, CAD, EUR, GBP, AUD and NZD, all using two decimal places. Effective dates use UTC.
2. Add labor categories with hourly rates, minimum minutes and billing increments. Each labor line bills at least its minimum and rounds up to the increment. Round the resulting line amount to the nearest cent, with half cents rounded up.
3. Add parts categories with cost bands and markup percentages. A band includes its lower cost and excludes its upper cost. Cover every cost from zero to an unlimited final band. Markup is added to cost; it is not a target margin percentage. Round the selling price of one unit to cents, then multiply by quantity.
4. Save the draft. Review the displayed rates and effective dates, enter your review notes, and select **Publish reviewed pricing**.

Published terms cannot be edited. Use **Copy to new version** to change them; use a unique name/version combination. Retiring a version stops new estimates from using it and preserves old evidence. Each mutation has a revision check and an exact retry receipt. The library supports 100 retained versions, 30 labor and parts categories per version, and 15 bands per parts category.

The older labor-rate and parts-markup reference forms remain below the working pricing controls. They are not automatically interpreted as executable rules: their historic records do not fully specify minimums, increments, band boundaries or review status.

## Create a customer proposal

1. Create the service client and link an active vehicle in **Vehicles & clients**. VIN lookup is optional; reviewed manual vehicle details also work.
2. In **Estimates & proposals**, choose published, currently effective pricing and the vehicle. Enter the title, scope, exclusions and offer expiry.
3. Add labor descriptions and estimated minutes. Add parts descriptions, unit costs and quantities. Each line selects a category from the chosen pricing version.
4. Enter the applicable labor and parts tax percentages and a review reference. Rates, including exemptions represented by zero, need review for this job. Shuug applies the entered rates; it does not determine the jurisdiction or taxability. It rounds each tax bucket once on its subtotal.
5. Select **Calculate estimate**. Review requested versus billed minutes, cost bands/markups, selling prices, tax and the customer-facing scope. Calculation alone creates no proposal.
6. Confirm the review, then select **Create reviewed proposal**. Open the resulting record using its link. It appears as a real draft service proposal with captured pricing evidence.

The example fixture bills 31 requested minutes as 45 minutes at USD 123.45/hour: USD 92.59. A USD 1.01 part at 50% markup sells for USD 1.52 per unit; three total USD 4.56. With zero labor tax and 6.25% parts tax, the quoted total is USD 97.44. These are synthetic acceptance-test numbers, not installed business rates.

Review proofs belong to the authenticated staff/backend actor and expire after 15 minutes. Changes to the vehicle, client, pricing version or UTC pricing date require recalculation. Concurrent saves and repeated requests for the same review produce one proposal. Successful retries recover its identity even after the proof expires. A generic record edit cannot change the captured price, vehicle/client, title, scope, exclusions or expiry; prepare another reviewed proposal for revised terms.

Use the existing proposal, customer portal, signed agreement, resource booking, completion and service billing workflow next. Customer views show the agreed scope, billed labor, selling prices, tax and total. They omit internal unit costs, markup definitions, review notes and fingerprints. Marking a proposal sent does not email it: share the scoped customer access through your normal delivery process. Customer acceptance preserves the staff pricing evidence. Fixed billing enforces the accepted amount, approved changes and prior deposits and blocks duplicate invoicing.

## Consultant templates

Mark a published version **Share in templates**, then use **Branding → Export saved template**. Template format 3 contains only those deliberately shared pricing definitions plus existing branding, profiles, tools and module dependencies. It excludes instance IDs, clients, vehicles, estimates, unit costs entered for jobs, reviewer identities, internal tax notes and credentials. Unshared, draft and retired pricing is omitted. Exports without pricing retain format 2; formats 1 and 2 remain importable.

Import preview reports new and existing pricing versions. Missing module dependencies, incomplete cost bands, duplicate name/version pairs or conflicting existing definitions fail validation. Imported versions start as unshared drafts with no carried-over publication approval. Review them for the new organization before publishing. A matching existing version is retained, including its status; import does not republish a retired version. Retrying an interrupted template import does not duplicate definitions. Configuration import spans several durable stores and is retryable, not one transaction across all stores.

## API and MCP

Staff use `GET /api/auto-repair` and `POST /api/auto-repair`. GET requires Services view access; POST requires Services edit access, a signed-in identity and the configured application origin. Responses are private and uncached. Staff permissions are independent of profile visibility.

Both MCP transports expose `repair_catalog` and `repair_command`; the corresponding authenticated HTTP backend operations use the same names. Read `repair_catalog` for the exact schemas and `business_read` with `resource: "auto-repair-pricing"` for current data. Commands are `book.save`, `book.publish`, `book.retire`, `book.share`, `estimate.review` and `estimate.create`. Monetary API inputs are integer cents; percentages use integer basis points (625 = 6.25%). Writes use a UUID `requestId`; review calculation returns an actor-bound `proof` for the separately reviewed creation. Backend credentials authorize the whole deployment and must never be embedded in a customer website.

Pricing publication, audit and command receipts commit together. Proposal creation, captured pricing, audit and both request/review receipts commit in one SQLite transaction. Include the private data directory and vault key in backups.

## Boundaries and verification

This workflow quotes labor and parts. It does not reserve parts stock, procure parts, calculate technician payroll, send reminders, charge a customer or post separate repair tax liabilities into the general ledger. Service payment confirmation/reconciliation records verified external evidence. The [inspection workflow](AUTO-REPAIR-INSPECTIONS.md) supplies linked reviewed reports and job-costed technician time. Tax-ledger posting, richer repair execution and provider delivery remain separate unfinished work.

Run the domain, authorization, actual MCP and form acceptance checks with:

```sh
npx vitest run src/lib/auto-repair src/components/auto-repair
npm run build
npm run workspace:smoke
```

The installed check creates a temporary authenticated backend, prices a job, races two saves, rejects stale cross-process edits, checks customer privacy and acceptance, completes booked work, invoices the exact amount and records synthetic reconciliation. It verifies rendered pricing/estimate routes and a template export, then shuts down and removes its fixture. It makes no external pricing, message or payment call. This is separate from visual acceptance and an independent business pilot.
