/**
 * Stripe payment config — read from the encrypted vault or environment. We use Stripe
 * Checkout (hosted), so card entry is handled by Stripe.
 *   STRIPE_SECRET_KEY  (sk_test_… or sk_live_…)
 *   [STRIPE_WEBHOOK_SECRET]  (whsec_…) for /api/website/stripe/webhook
 *   [APP_BASE_URL]  for success/cancel redirects
 */
import { setting, appBaseUrl as workspaceBaseUrl } from "../connections/vault";
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string | null;
  live: boolean;
}

export function getStripeConfig(): StripeConfig | null {
  const secretKey = setting("STRIPE_SECRET_KEY");
  if (!secretKey || !/^sk_(test|live)_/.test(secretKey)) return null;
  return {
    secretKey,
    webhookSecret: setting("STRIPE_WEBHOOK_SECRET") || null,
    live: secretKey.startsWith("sk_live_"),
  };
}

export function stripeConfigured(): boolean {
  return getStripeConfig() !== null;
}

export function appBaseUrl(): string {
  return workspaceBaseUrl();
}
