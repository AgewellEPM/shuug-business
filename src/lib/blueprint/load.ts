/**
 * "It molds around you" — the mirror of the industry front door. Given what the owner
 * said they run, this shows how Shuug configured itself: which capability packs turned
 * on, how many modules that lit up, and which live business capabilities that unlocks.
 * The apps aren't 100 separate products here — they're the shape the platform took for
 * THIS business. Pure mapping core (`blueprintFromSetup`) + a thin live loader.
 */
import { getBranding } from "../branding/store";
import { packs, industries } from "../industry/catalog";
import { workspaceItems } from "../navigation/catalog";
import { listHandlers } from "../handlers/store";
import { capabilitySurface } from "../state/capabilities";

export interface BlueprintPack { id: string; label: string; tools: { id: string; label: string }[] }
export interface Blueprint {
  configured: boolean;
  industryId: string | null;
  industryLabel: string | null;
  packs: BlueprintPack[];
  moduleCount: number;
  handlerCount: number;
  liveCapabilities: number;
}

/** Pure: turn an industry setup into the "how it molded" view using the catalog. */
export function blueprintFromSetup(setup: { industryId?: string; packs?: string[] } | null | undefined, handlerCount = 0): Blueprint {
  const industryId = setup?.industryId ?? null;
  const industryLabel = industryId ? industries.find((i) => i.id === industryId)?.label ?? null : null;
  const enabled = new Set(setup?.packs ?? []);
  const itemLabel = new Map(workspaceItems.map((i) => [i.id, i.label]));

  const bpPacks: BlueprintPack[] = packs
    .filter((p) => enabled.has(p.id))
    .map((p) => ({ id: p.id, label: p.label, tools: (p.tools as readonly string[]).map((t) => ({ id: t, label: itemLabel.get(t) ?? t })) }));

  const moduleCount = new Set(bpPacks.flatMap((p) => p.tools.map((t) => t.id))).size;

  return {
    configured: !!setup?.industryId,
    industryId, industryLabel,
    packs: bpPacks,
    moduleCount,
    handlerCount,
    liveCapabilities: capabilitySurface().live,
  };
}

export function loadBlueprint(): Blueprint {
  let setup: { industryId?: string; packs?: string[] } | null = null;
  try { setup = (getBranding() as { industrySetup?: { industryId?: string; packs?: string[] } | null }).industrySetup ?? null; } catch { setup = null; }
  let handlerCount = 0;
  try { handlerCount = listHandlers().length; } catch { handlerCount = 0; }
  return blueprintFromSetup(setup, handlerCount);
}
