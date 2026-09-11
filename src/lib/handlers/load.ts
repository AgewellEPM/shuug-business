/**
 * Assemble the Handlers view: each created handler with its template, live capability
 * availability (is the feature enabled / integration connected?), and performance from
 * its activity. Also exposes the capability-availability checker the detail page uses
 * to show what's real vs what still needs connecting.
 */
import { readFeatures } from "../features/store";
import { connectionCatalog } from "../connections/catalog";
import { hubConfigured, integrationById } from "../integrations/registry";
import { CAPABILITIES, capabilityAvailable } from "./capabilities";
import { templateById } from "./templates";
import { performance, type Handler, type HandlerTemplate, type HandlerPerformance, type Capability } from "./model";
import { listHandlers, listActivity } from "./store";

/** Is a dependency satisfied for this business? feature enabled OR integration connected. */
export function dependencyChecker(): (dep: { feature?: string; integration?: string }) => boolean {
  let enabledFeatures = new Set<string>();
  try { enabledFeatures = new Set(readFeatures().enabled); } catch { /* none */ }
  const catalog = (() => { try { return connectionCatalog(); } catch { return []; } })();
  const connected = new Set<string>(catalog.filter((c) => c.connected || c.configured).map((c) => c.id));

  return (dep) => {
    if (dep.feature) return enabledFeatures.has(dep.feature) || dep.feature === "calendar"; // calendar ships built-in
    if (dep.integration) {
      if (connected.has(dep.integration)) return true;             // settings-managed integration
      const spec = integrationById(dep.integration);               // hub-managed integration (e.g. twilio, mailgun)
      return spec ? hubConfigured(spec) : false;
    }
    return true;
  };
}

export interface CapabilityStatus { capability: Capability; available: boolean }

export function capabilityStatuses(template: HandlerTemplate, has = dependencyChecker()): CapabilityStatus[] {
  return template.capabilities
    .map((id) => CAPABILITIES.find((c) => c.id === id))
    .filter((c): c is Capability => !!c)
    .map((capability) => ({ capability, available: capabilityAvailable(capability, has) }));
}

export interface HandlerCard {
  handler: Handler;
  template: HandlerTemplate;
  performance: HandlerPerformance;
  readyCapabilities: number;
  totalCapabilities: number;
  needsConnecting: string[];
}

export function loadHandlers(): { cards: HandlerCard[] } {
  const has = dependencyChecker();
  const cards: HandlerCard[] = [];
  for (const handler of listHandlers()) {
    const template = templateById(handler.templateId);
    if (!template) continue;
    const statuses = capabilityStatuses(template, has);
    cards.push({
      handler, template,
      performance: performance(listActivity(handler.id), template.baselineMinutesPerRequest),
      readyCapabilities: statuses.filter((s) => s.available).length,
      totalCapabilities: statuses.length,
      needsConnecting: statuses.filter((s) => !s.available).map((s) => s.capability.label),
    });
  }
  return { cards };
}
