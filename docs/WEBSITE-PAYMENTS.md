# Website invoice payments and donations

Shuug owns customer authorization, amounts and business records. Stripe hosts card entry. The WordPress plugin links into the same backend payment flow; no processor secret is sent to WordPress or a customer browser.

## Configure

1. Set the backend's public HTTPS `APP_BASE_URL`. Local HTTP is allowed only for Stripe test mode on localhost or 127.0.0.1.
2. In **Connections → Stripe**, save `STRIPE_SECRET_KEY`. Register `https://YOUR-BACKEND/api/website/stripe/webhook` in Stripe and save that endpoint's `STRIPE_WEBHOOK_SECRET` in Connections.
3. Subscribe the endpoint to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`.
4. Run `npm run website-payments:worker` against the backend's private data directory, encryption key and configuration. `compose.backend.yaml` includes the `website-payments` service. `-- --once` processes one batch for a scheduled job. Do not run a worker against another client's data volume.
5. Open **Money → Website payments**, also linked from **Setup → Attach**. Enable invoice payment and/or donations. Set the donation currency, limits, displayed purpose, and optional active fund/campaign in that currency.

The connector supports one-time card Checkout in USD, EUR, GBP, CAD and AUD, with integer-cent amounts from 1.00 to 999,999.99. It does not calculate invoice tax or add discounts: customers pay the issued invoice's remaining amount. Configure and review the invoice correctly before issuing it.

Test-mode Checkout ends in `test_paid`; it does **not** post a business payment, settle a real invoice or create donation income. Test mode is displayed to payers. Switch to the appropriate live key and matching webhook endpoint only after validating your own Stripe configuration. Existing attempts retain their encrypted original credential so key changes cannot accidentally redirect an in-flight verification to another Stripe account. Revoking that credential requires restoring access before unresolved attempts can be verified.

## Customer invoices

Enable the customer service portal and invite the customer at `/setup/customers`. The account must be linked to the invoice's service client. Issued deposit invoices are visible before the associated job is scheduled.

**Pay with Stripe** reserves the remaining balance in a database transaction. A second click reuses the same pending request. Shuug rejects balance-changing manual receipts, credits, refunds and invoice voids while that Checkout remains unresolved. Another customer cannot open or refresh the payment.

Stripe's success/cancel return URL is not evidence of payment. The worker or **Check payment status** retrieves the session directly from Stripe, checks its identity, amount, currency, account mode and payment intent, then posts one confirmed service receipt atomically. Concurrent retries cannot post it twice. Bank reconciliation remains a separate staff action.

## Donations

The public page is `/api/website/donate`. It collects the donor's self-reported name/email, amount and affirmative processing consent. A signed, expiring request binds the displayed purpose and funding configuration. Retries cannot change the amount or donor details under the same request. Request limits and a honeypot reduce automated submissions.

Verified live payment creates a website-origin donor record, a distinct cash donation and a confirmed donation receipt in one transaction. Later contributions group under that website-origin email without granting authenticated access or marketing permission. No invoice or pledge is substituted for a donation. Staff review the organization's applicable acknowledgment separately; the payment receipt does not assert tax deductibility.

## WordPress and other sites

After enabling capabilities in Shuug, reload WordPress **Business → Connection**, select the capabilities, and save:

- `[shuug_pay_invoice]` opens the private customer invoices area.
- `[shuug_donations]` opens the public donation page.

These are top-level links so customer cookies and Stripe Checkout work independently of third-party iframe cookie settings. Wix, Squarespace and other websites can use the same URLs as ordinary links.

## Recovery and accounting

**Website payments → Payments and recovery** lists requests, provider session IDs and verification errors. No button treats a network error or a cancel return as proof that a charge failed.

- **Refresh Stripe status** verifies the existing session and applies a confirmed payment.
- **Expire unpaid Checkout** asks Stripe to expire the session, then verifies its state. Only verified expiry releases the invoice reservation.
- If creation succeeded but its response was lost, retries use the same parameters and Stripe idempotency key. After 22 hours, Shuug stops retrying creation. Find the request ID in Stripe's session metadata (`shuug_payment`) and use **Verify and recover** with its `cs_…` session ID. Every linked identifier and amount must match.
- A confirmed capture that cannot be applied remains `paid_review`, with its payment intent and reason preserved. Partial donor/receipt writes roll back together. Review the conflicting business record before refreshing; do not charge the payer again.
- **Record bank reconciliation** requires reviewed bank/deposit evidence and adds an audit entry. Provider confirmation alone does not reconcile bank deposits or processor fees.

Provider refunds/disputes, recurring donations, automatic fee/net-deposit matching, automatic charitable acknowledgment delivery, and jurisdiction-specific tax calculation are not implemented by this connector. Record reviewed refunds through the existing business payment workflow; initiating a Stripe refund and synchronizing its status require further integration work.

## Verification

Automated tests use a synthetic Stripe transport and disposable data. They exercise customer isolation, balance reservations, replay/concurrent settlement, stale creation recovery, mismatched provider responses, signature verification, queued processing, donation records, test-mode isolation and bank-evidence reconciliation. These tests do not establish acceptance by a live Stripe account. Production HTTP checks verify configuration screens, public form rendering, permissions and unsigned webhook rejection without initiating a provider request. Visual verification remains dependent on the configured IsolatedTester/TinkyVision tools.

Provider references: [Checkout creation](https://docs.stripe.com/api/checkout/sessions/create), [idempotency](https://docs.stripe.com/api/idempotent_requests), [webhook verification and delivery](https://docs.stripe.com/webhooks).
