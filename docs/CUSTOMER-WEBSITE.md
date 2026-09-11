# Customer access from an existing website

Start at **Setup → Attach → Configure customer login, booking, prices, wholesale ordering and order status** (`/setup/customers`). Keep the Shuug backend running at its own public HTTPS origin.

1. Enable customer sign-in and choose pricing, wholesale ordering, order history, service portal and appointment booking capabilities. Save.
2. Create a customer account linked to the exact product customer, service client, or both. The account cannot choose its own business-record mapping.
3. Create a private setup link and share it with the verified recipient. It expires after 48 hours and works once. No invitation email is sent automatically.
4. The customer chooses a password and signs in at `/api/website/customer`. Customer login does not require WordPress login and does not grant employee or owner access.

Customer passwords use scrypt; session tokens and invitations are stored hashed. Sessions expire after 12 hours. Cookies are HttpOnly, SameSite=Lax, scoped to the customer endpoint and Secure on HTTPS. Password changes, setup/reset links and disabling accounts revoke prior sessions. Forgotten passwords use an owner-issued setup link. Every form mutation checks the backend origin; private account pages cannot be framed.

## Products, ordering and status

Customers see their own current agreement's products, prices and quantity tiers. Margin policies, costs, other customers, agreement history and staff notes are omitted. Agreements outside their effective/expiration dates or lacking approval cannot be used for ordering.

**Review order and total** recalculates prices, quantity minimums, required purchase order number and freight in Shuug. The review expires in 15 minutes. **Place order** checks the account and agreement again; an agreement change requires another review. Server-issued request IDs prevent duplicate creation and recover an order saved before its receipt was written. Captured prices remain unchanged after subsequent agreement edits. Browser-supplied price overrides are rejected.

Order history includes order status and recorded shipment progress/carrier/tracking. A submitted order is awaiting fulfillment; submission does not charge a payment method, reserve inventory, post accounting or prove delivery. The website ordering flow currently uses the existing USD product-order model. Credit-limit enforcement, tax calculation and automated fulfillment/payment workflows remain release work.

## Service proposals and confirmed appointments

Customers review sent proposals, scope, exclusions and prices, and accept their own proposals or completed work. Acceptance records the authenticated account and updates the same service records used by staff.

To offer confirmed booking, first create an accepted proposal, signed service agreement and work order. Confirm any required deposit through the existing service payment workflow, and activate the staff, equipment or room resource. Under **Publish service availability**, choose the work and resource, start/end, and preparation/travel buffer. Times entered by the owner use their local timezone; customer pages explicitly display UTC.

The linked customer sees available times and confirms one. Booking and resource conflict checks commit in one transaction with the appointment and work-order status. Competing requests cannot reserve the same resource. Retries preserve the original appointment, and alternative times for the same visit are withdrawn. Customers may cancel a future appointment; cancellation releases the resource and preserves agreements, charges and recorded payments. It does not automatically waive a fee or issue a refund.

This booking path covers existing agreed work. New visitors can submit the separate appointment request form for staff review. General anonymous service-catalog scheduling is not implemented.

Issued service invoices, including deposits for unscheduled work, show amounts, payments and balances. Enable Stripe Checkout under **Money → Website payments**. See [Website payments](WEBSITE-PAYMENTS.md) for configuration, worker, test-mode isolation, recovery and bank reconciliation.

## WordPress and other websites

In WordPress **Business → Connection**, save the backend origin, reload to discover available capabilities, select what to expose and save. Add the shortcodes:

| Website capability | Shortcode |
| --- | --- |
| Customer login | `[shuug_customer_login]` |
| Confirmed service booking | `[shuug_book_service]` |
| Customer-specific prices | `[shuug_pricing]` |
| Wholesale order | `[shuug_wholesale]` |
| Order status | `[shuug_order_status]` |
| Pay invoice | `[shuug_pay_invoice]` |
| One-time donation | `[shuug_donations]` |
| Quote request | `[shuug_quote]` |
| Volunteer signup | `[shuug_volunteer]` |
| Contact form | `[shuug_contact]` |
| Appointment request / job inquiry | `[shuug_booking]` / `[shuug_job]` |

Account capabilities open the private backend account page. Forms embed the selected published form, whose allowed origins must include the WordPress website. The plugin keeps business logic and records in Shuug. `[shuug_workspace]` and `[shuug_login]` remain employee workspace entry points.

Other websites can link to the customer account URL or use the public form embeds. They need no customer account API token. See [WordPress installation](WORDPRESS.md) and [Getting started](GETTING-STARTED.md).

Quote submissions atomically create a prospective service client and linked inquiry for staff review. Contact details are self-reported; staff can correct/relink the draft inquiry before preparing a proposal. Volunteer signup atomically creates a volunteer record with consent evidence and onboarding incomplete. Approval requires the organization's checks; signup does not assign a shift. Replaying either submission does not duplicate its business records.

Automated verification covers isolated customer sessions, private prices, order retries, proposal acceptance, availability conflicts/cancellation and intake records. Production HTTP and WordPress runtime checks use disposable data. Visual verification and live payment/provider acceptance remain separate open gates.
