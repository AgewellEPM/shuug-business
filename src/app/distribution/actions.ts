"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

import { randomUUID } from "node:crypto";
import { getDealStore } from "@/lib/data/store";
import { loadAnalytics } from "@/lib/analytics/load";
import { distributionOverview } from "@/lib/distribution/summary";
import { optimizeRoute } from "@/lib/visits/google";

export interface OptimizedRoute {
  ok: boolean;
  message?: string;
  /** driving order, starting and ending at the first account (a delivery loop). */
  ordered?: { company: string; address: string }[];
  miles?: number;
  minutes?: number;
}

/**
 * Optimize the driving order of one territory's delivery run. The first account
 * is the depot; the rest are ordered by Google Routes (traffic-aware) and the run
 * loops back. Fail-closed: with no Maps key, optimizeRoute throws a friendly
 * "connect Google Maps" message which we surface verbatim — never a fake order.
 */
export async function optimizeRegionRouteAction(region: string): Promise<OptimizedRoute> {
  await requireSectionAccess("distribution", "edit");

  const store = await getDealStore();
  const { analytics, customers } = await loadAnalytics(store);
  const o = distributionOverview(customers, analytics.byRegion, analytics.byOwner, analytics.byChannel);
  const group = o.routes.find((g) => g.region === region);

  const stops = (group?.stops ?? []).filter((s) => s.shippingAddress.trim().length > 2);
  if (stops.length < 2) {
    return { ok: false, message: "Need at least two accounts with a shipping address to plan a run." };
  }

  const [depot, ...rest] = stops;
  // optimizeRoute requires UUID stop ids; map to our accounts and back.
  const idMap = new Map<string, (typeof rest)[number]>();
  const waypoints = rest.map((s) => {
    const id = randomUUID();
    idMap.set(id, s);
    return { id, placeId: null, address: s.shippingAddress };
  });

  try {
    const plan = await optimizeRoute(depot.shippingAddress, waypoints, true);
    const ordered = [
      { company: depot.company, address: depot.shippingAddress },
      ...plan.orderedIds.map((id) => {
        const s = idMap.get(id)!;
        return { company: s.company, address: s.shippingAddress };
      }),
    ];
    return {
      ok: true,
      ordered,
      miles: Math.round((plan.distanceMeters / 1609.34) * 10) / 10,
      minutes: Math.round(plan.durationSeconds / 60),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Route planning failed. Try again." };
  }
}
