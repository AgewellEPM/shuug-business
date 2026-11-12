/**
 * Integration directory — the single catalog behind the Integrations hub. It unites
 * two kinds of connector:
 *
 *  - "settings"  — already wired into the connection framework (save/test/OAuth in
 *                  /settings). Status is read live from connectionCatalog().
 *  - "hub"       — connectable right here by saving credentials to the secure vault.
 *                  Fail-closed: no keys → not connected, nothing is called.
 *
 * This is where "what else are we missing?" gets answered: every provider a small
 * business is likely to already use is listed, grouped by what it's for.
 */
import { setting } from "../connections/vault";
import { invoiceDeliveryConnection } from "../accounting/invoice-delivery-provider";

export type IntegrationCategory =
  | "Sales channels" | "Website & domain" | "Payments" | "Marketing"
  | "Communication" | "Accounting" | "Automation" | "Logistics" | "Other";

export type ManagedBy = "settings" | "hub";
export interface IntegrationField {
  key: string; label: string; type: "password" | "text" | "email" | "tel" | "select";
  placeholder?: string; help?: string; options?: { value: string; label: string }[];
}

export interface IntegrationSpec {
  id: string;
  name: string;
  category: IntegrationCategory;
  blurb: string;
  managedBy: ManagedBy;
  /** connection id in the settings framework (managedBy: "settings"). */
  connectionId?: string;
  /** vault keys required to be considered connected (managedBy: "hub"). */
  keys?: string[];
  fields?: IntegrationField[];
  /** where to get the credentials. */
  docsUrl?: string;
  /** brand emoji/icon hint. */
  icon?: string;
}

export const INTEGRATIONS: IntegrationSpec[] = [
  // Already wired through /settings (the connection framework owns these).
  { id: "shopify", name: "Shopify", category: "Sales channels", managedBy: "settings", connectionId: "shopify", icon: "🛍️", docsUrl: "https://admin.shopify.com/settings/apps/development", blurb: "Sync your storefront orders, customers and products." },
  { id: "amazon", name: "Amazon (Selling Partner)", category: "Sales channels", managedBy: "settings", connectionId: "amazon", icon: "📦", docsUrl: "https://sellercentral.amazon.com/apps/store/dashboard", blurb: "Pull your Amazon business orders and inventory." },
  { id: "amazonads", name: "Amazon Ads", category: "Marketing", managedBy: "settings", connectionId: "amazonads", icon: "📣", docsUrl: "https://advertising.amazon.com/API/docs/en-us/setting-up/overview", blurb: "Bring in Amazon advertising spend and ROAS." },
  { id: "googleads", name: "Google Ads", category: "Marketing", managedBy: "settings", connectionId: "googleads", icon: "🔎", docsUrl: "https://ads.google.com/aw/apicenter", blurb: "Live keyword CPCs and campaign management." },
  { id: "quickbooks", name: "QuickBooks Online", category: "Accounting", managedBy: "settings", connectionId: "quickbooks", icon: "📒", docsUrl: "https://developer.intuit.com/app/developer/myapps", blurb: "Push invoices and sync your books." },
  { id: "stripe", name: "Stripe", category: "Payments", managedBy: "settings", connectionId: "stripe", icon: "💳", docsUrl: "https://dashboard.stripe.com/apikeys", blurb: "Take card payments and reconcile payouts." },
  { id: "slack", name: "Slack", category: "Communication", managedBy: "settings", connectionId: "slack", icon: "💬", docsUrl: "https://api.slack.com/apps", blurb: "Send alerts and workflow notifications to a channel." },
  { id: "zapier", name: "Zapier", category: "Automation", managedBy: "settings", connectionId: "zapier", icon: "⚡", docsUrl: "https://zapier.com/app/zaps", blurb: "Fan events out to 6,000+ apps with no code." },
  { id: "maps", name: "Google Maps & Places", category: "Logistics", managedBy: "settings", connectionId: "maps", icon: "🗺️", docsUrl: "https://console.cloud.google.com/apis/credentials", blurb: "Store finder, coverage and optimized delivery routes." },
  { id: "custom", name: "Custom API / webhook", category: "Automation", managedBy: "settings", connectionId: "custom", icon: "🧩", blurb: "Point events at any HTTPS endpoint you control." },

  // New — connectable in the hub (fail-closed on vault keys). This is the gap-fill.
  { id: "godaddy", name: "GoDaddy", category: "Website & domain", managedBy: "hub", keys: ["GODADDY_API_KEY", "GODADDY_API_SECRET"], icon: "🌐", docsUrl: "https://developer.godaddy.com/keys", blurb: "Where you already own your domain, DNS and email — track renewals and records." },
  { id: "mailchimp", name: "Mailchimp", category: "Marketing", managedBy: "hub", keys: ["MAILCHIMP_API_KEY"], icon: "📧", docsUrl: "https://mailchimp.com/help/about-api-keys/", blurb: "Email marketing lists, campaigns and audience sync." },
  { id: "twilio", name: "Twilio (SMS)", category: "Communication", managedBy: "hub", keys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "TWILIO_MODE"], fields: [
    { key: "TWILIO_ACCOUNT_SID", label: "Twilio account ID", type: "text", placeholder: "AC followed by your account ID" },
    { key: "TWILIO_AUTH_TOKEN", label: "Twilio auth token", type: "password" },
    { key: "TWILIO_FROM_NUMBER", label: "Shop texting number", type: "tel", placeholder: "+1 860 555 0100", help: "Use the SMS sender approved in your Twilio account." },
    { key: "TWILIO_MODE", label: "Text message mode", type: "select", options: [{ value: "test", label: "Test — local preview, no texts sent" }, { value: "live", label: "Live — eligible texts can be sent" }] },
  ], icon: "📱", docsUrl: "https://www.twilio.com/console", blurb: "Text customers service updates, reminders and confirmations. Sending remains controlled separately in Shop operations." },
  { id: "paypal", name: "PayPal", category: "Payments", managedBy: "hub", keys: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"], icon: "🅿️", docsUrl: "https://developer.paypal.com/dashboard/", blurb: "Accept PayPal and reconcile alongside your other payments." },
  { id: "square", name: "Square", category: "Payments", managedBy: "hub", keys: ["SQUARE_ACCESS_TOKEN"], icon: "◼️", docsUrl: "https://developer.squareup.com/apps", blurb: "In-person and online payments plus catalog sync." },
  { id: "google-business", name: "Google Business Profile", category: "Marketing", managedBy: "hub", keys: ["GOOGLE_BUSINESS_ACCESS_TOKEN"], icon: "🏪", docsUrl: "https://developers.google.com/my-business", blurb: "Reviews, hours and posts for your storefront listing." },
  { id: "meta", name: "Meta (Facebook & Instagram)", category: "Marketing", managedBy: "hub", keys: ["META_PAGE_ACCESS_TOKEN"], icon: "📸", docsUrl: "https://developers.facebook.com/apps/", blurb: "Page/shop insights and ad spend for social ROAS." },
  { id: "mailgun", name: "Mailgun invoice email", category: "Communication", managedBy: "hub", keys: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM_EMAIL", "MAILGUN_REGION", "MAILGUN_MODE", "MAILGUN_WEBHOOK_SIGNING_KEY"], fields: [
    { key: "MAILGUN_API_KEY", label: "Mailgun API key", type: "password" },
    { key: "MAILGUN_DOMAIN", label: "Verified sending domain", type: "text", placeholder: "mail.yourshop.com" },
    { key: "MAILGUN_FROM_EMAIL", label: "Shop sender email", type: "email", placeholder: "service@mail.yourshop.com", help: "The email must use the sending domain above." },
    { key: "MAILGUN_REGION", label: "Mailgun account region", type: "select", options: [{ value: "US", label: "United States (US)" }, { value: "EU", label: "European Union (EU)" }] },
    { key: "MAILGUN_MODE", label: "Email message mode", type: "select", options: [{ value: "test", label: "Test — no email delivered" }, { value: "live", label: "Live — eligible email can be sent" }] },
    { key: "MAILGUN_WEBHOOK_SIGNING_KEY", label: "Email webhook signing key", type: "password", help: "Use the HTTP webhook signing key from Mailgun API security, not the API key." },
  ], icon: "✉️", docsUrl: "https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http", blurb: "Send service emails and private invoice links from your verified domain. Saved configuration does not verify delivery." },
  { id: "xero", name: "Xero", category: "Accounting", managedBy: "hub", keys: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"], icon: "📗", docsUrl: "https://developer.xero.com/app/manage", blurb: "Alternative to QuickBooks for the general ledger sync." },
];

export const CATEGORY_ORDER: IntegrationCategory[] = [
  "Sales channels", "Website & domain", "Payments", "Accounting", "Marketing", "Communication", "Automation", "Logistics", "Other",
];

/** Whether a hub-managed provider has all its vault keys set (fail-closed). */
export function hubConfigured(spec: IntegrationSpec): boolean {
  if (spec.id === "mailgun") return invoiceDeliveryConnection().ready;
  return spec.managedBy === "hub" && (spec.keys ?? []).length > 0 && (spec.keys ?? []).every((k) => !!setting(k));
}

export function integrationById(id: string): IntegrationSpec | null {
  return INTEGRATIONS.find((i) => i.id === id) ?? null;
}
