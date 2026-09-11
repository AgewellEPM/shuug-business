import Link from "next/link";
import { shopifyStatus } from "@/lib/shopify-backend/service";
import { setting } from "@/lib/connections/vault";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { can } from "@/lib/permissions/model";
import { getMatrix } from "@/lib/permissions/store";
import { getActiveRole } from "@/lib/permissions/active";
import { ShopifyBackendSettings } from "@/components/ShopifyBackendSettings";
export const dynamic = "force-dynamic";
export default async function BackendSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSectionAccess("admin");
  const shopifyTab = (await searchParams).tab === "shopify", status = shopifyStatus();
  const canEdit = can(getMatrix(), await getActiveRole(), "admin", "edit");
  return <div className="max-w-4xl"><p className="dd-eyebrow">Setup · connections</p><h1 className="mt-2 text-2xl font-bold">{shopifyTab ? "Shopify connection" : "Backend & MCP"}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">Use the business platform independently. Connect a client’s Shopify store when they want it.</p>
    {!shopifyTab && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Business backend &amp; MCP</h2>
      <p className="mt-2 text-sm text-slate-600">Backend access: <strong>{setting("BACKEND_ACCESS_TOKEN") ? "Configured" : "Setup needed"}</strong>. The MCP exposes 14 tools for business records, trackers and the optional Shopify connector.</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Authenticated business API</dt><dd className="mt-1 font-mono">/api/backend</dd></div><div><dt className="text-slate-500">Authenticated MCP endpoint</dt><dd className="mt-1 font-mono">/api/mcp</dd></div></dl>
      <p className="mt-4 text-sm leading-6 text-slate-600">Run <code>npm run backend:setup</code> on the backend host, then import the generated <code>mcp-client.json</code> from its private data folder into your MCP client. Remote clients need the backend bearer key.</p>
      <p className="mt-3 text-xs text-slate-500">The deployment guide is <code>docs/SHOPIFY-BACKEND-MCP.md</code> in this project.</p>
    </section>}
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Optional Shopify backend</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{status.state.replaceAll("_", " ")}</span></div>
      <p className="mt-2 text-sm text-slate-600">{status.shop || "No client store configured."}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">Receives signed webhooks and storefront requests, and synchronizes products, customers, orders and inventory. Shopify operates the storefront and checkout.</p>
      <ShopifyBackendSettings enabled={status.enabled} writesEnabled={status.writesEnabled} canEdit={canEdit}/>
      <Link href="/settings" className="mt-4 inline-block text-sm font-semibold text-emerald-800 hover:underline">Open connection wizard →</Link>
    </section>
    <Link href="/branding" className="mt-5 inline-block text-sm text-slate-600 hover:underline">Change which tools appear in the sidebar →</Link>
  </div>;
}
