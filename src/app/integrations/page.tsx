import { requireSectionAccess } from "@/lib/permissions/guard";
import { INTEGRATIONS, CATEGORY_ORDER, hubConfigured, type IntegrationCategory } from "@/lib/integrations/registry";
import { connectionCatalog } from "@/lib/connections/catalog";
import { IntegrationsHub } from "@/components/IntegrationsHub";
import { connectIntegrationAction, disconnectIntegrationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await requireSectionAccess("admin", "view");

  // Live status for framework-managed connectors (read-only — /settings owns them).
  const catalog = connectionCatalog();
  const statusOf = (connectionId?: string) => {
    const c = connectionId ? catalog.find((x) => x.id === connectionId) : undefined;
    return { configured: c?.configured ?? false, connected: c?.connected ?? false };
  };

  const cards = INTEGRATIONS.map((spec) => {
    const configured = spec.managedBy === "hub" ? hubConfigured(spec) : statusOf(spec.connectionId).configured;
    const connected = spec.managedBy === "hub" ? hubConfigured(spec) : statusOf(spec.connectionId).connected;
    return { spec, configured, connected };
  });

  const connectedCount = cards.filter((c) => c.connected).length;
  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: cards.filter((c) => c.spec.category === cat) }))
    .filter((g) => g.items.length > 0) as { cat: IntegrationCategory; items: typeof cards }[];

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Bring your whole business under one roof</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Integrations</h1>
        <p className="mt-2 text-sm text-slate-500">
          Hook up the tools you already use — your Amazon business, your Shopify store, your GoDaddy domain, Zapier,
          Slack and more. {connectedCount} of {cards.length} connected. Everything is fail-closed: nothing is called
          until you add real credentials, and secrets never leave your workspace.
        </p>
      </header>

      <IntegrationsHub
        groups={byCategory}
        connectAction={connectIntegrationAction}
        disconnectAction={disconnectIntegrationAction}
      />
    </div>
  );
}
