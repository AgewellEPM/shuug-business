import Link from "next/link";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { listWebsitePayments } from "@/lib/website-payments/state";
import { websitePaymentSettings, websitePaymentReady } from "@/lib/website-payments/settings";
import { WebsitePaymentSetup } from "@/components/WebsitePaymentSetup";
import { appBaseUrl } from "@/lib/connections/vault";
import { listBusinessRecords } from "@/lib/workspace/store";
export const dynamic = "force-dynamic";
export default async function WebsitePaymentsPage() {
  await requireOwnerAccess();
  return <div className="mx-auto max-w-5xl"><Link href="/setup#attach" className="text-sm underline">Back to website setup</Link><h1 className="my-4 text-3xl font-semibold">Website payments</h1><p className="mb-6 text-slate-600">Collect customer invoice payments and one-time donations with Stripe Checkout.</p><WebsitePaymentSetup initial={{ settings: websitePaymentSettings(), ready: websitePaymentReady(), payments: listWebsitePayments() }} baseUrl={appBaseUrl()} references={listBusinessRecords(["fund", "campaign"]).filter(r => r.status === "active").map(r => ({ id: r.id, kind: r.kind, title: r.title, currency: r.currency }))}/></div>;
}
