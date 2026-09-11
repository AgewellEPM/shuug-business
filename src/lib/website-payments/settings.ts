import { z } from "zod";
import { persistentState } from "../workspace/state";
import { getStripeConfig } from "../payments/config";
import { appBaseUrl } from "../connections/vault";
import { listBusinessRecords } from "../workspace/store";
export const paymentCurrencies = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export const paymentSettingsSchema = z.object({ invoiceEnabled: z.boolean(), donationsEnabled: z.boolean(), currency: z.enum(paymentCurrencies), minimum: z.number().int().min(100).max(99_999_999), maximum: z.number().int().min(100).max(99_999_999), title: z.string().trim().min(1).max(100), purpose: z.string().trim().min(1).max(2000), fund: z.uuid().nullable(), campaign: z.uuid().nullable() }).strict().refine(s => s.minimum <= s.maximum, "Maximum donation must be at least the minimum.");
const state = persistentState("website-payment-settings", () => ({ invoiceEnabled: false, donationsEnabled: false, currency: "USD", minimum: 500, maximum: 1000000, title: "Support our work", purpose: "Support the organization's work.", fund: null, campaign: null }));
export const websitePaymentSettings = () => paymentSettingsSchema.parse(state.read());
export function websitePaymentReady() { const config = getStripeConfig(); return !!config && !!config.webhookSecret?.startsWith("whsec_"); }
export function saveWebsitePaymentSettings(raw: unknown) {
  const input = paymentSettingsSchema.parse(raw);
  if ((input.invoiceEnabled || input.donationsEnabled) && !websitePaymentReady()) throw new Error("Connect Stripe and save the website webhook signing secret first.");
  const url = new URL(appBaseUrl());
  if ((input.invoiceEnabled || input.donationsEnabled) && (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && !getStripeConfig()?.live)))) throw new Error("Use an HTTPS backend address for payments. Test mode also permits local development.");
  const records = listBusinessRecords();
  for (const key of ["fund", "campaign"] as const) if (input[key] && !records.some(r => r.id === input[key] && r.kind === key && r.status === "active" && r.currency === input.currency)) throw new Error(`Select an active ${key} in the donation currency.`);
  return state.change(s => Object.assign(s, input));
}
