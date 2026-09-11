/**
 * Distribution overview — turns the customer roster + revenue rollups into the
 * numbers a wholesale operator actually manages a territory by: who covers what
 * region, which channels the accounts sit in, rep load, and delivery-route
 * groupings. Pure aggregation; no I/O. Revenue is joined in from analytics
 * (byRegion / byOwner keyed by label), counts come from the customers list.
 */
import { CHANNEL_LABELS, type Customer, type CustomerChannel } from "../data/model";
import type { NamedRevenue } from "../analytics/metrics";

export interface Territory {
  region: string;
  accounts: number;
  owners: string[];
  channels: Partial<Record<CustomerChannel, number>>;
  revenueCents: number;
  orderCount: number;
}

export interface RepLoad {
  owner: string;
  accounts: number;
  regions: string[];
  revenueCents: number;
}

export interface ChannelRow {
  channel: CustomerChannel;
  label: string;
  accounts: number;
  revenueCents: number;
  orderCount: number;
}

export interface RouteStop {
  customerId: string;
  company: string;
  channel: CustomerChannel;
  shippingAddress: string;
}
export interface RouteGroup {
  region: string;
  stops: RouteStop[];
}

export interface DistributionOverview {
  territories: Territory[];
  reps: RepLoad[];
  channels: ChannelRow[];
  routes: RouteGroup[];
  totalAccounts: number;
  regionsCovered: number;
}

const UNASSIGNED = "Unassigned";
function regionOf(c: Customer) { return c.region?.trim() || UNASSIGNED; }
function ownerOf(c: Customer) { return c.accountOwner?.trim() || UNASSIGNED; }

/** Look up revenue/orders for a label in a NamedRevenue rollup (0 when absent). */
function rev(rollup: NamedRevenue[], label: string) {
  const row = rollup.find((r) => r.label === label);
  return { revenueCents: row?.revenueCents ?? 0, orderCount: row?.orderCount ?? 0 };
}

export function distributionOverview(
  customers: Customer[],
  byRegion: NamedRevenue[],
  byOwner: NamedRevenue[],
  byChannel: NamedRevenue[],
): DistributionOverview {
  // Territories
  const terrMap = new Map<string, Territory>();
  for (const c of customers) {
    const region = regionOf(c);
    let t = terrMap.get(region);
    if (!t) {
      const r = rev(byRegion, region);
      t = { region, accounts: 0, owners: [], channels: {}, revenueCents: r.revenueCents, orderCount: r.orderCount };
      terrMap.set(region, t);
    }
    t.accounts += 1;
    const owner = ownerOf(c);
    if (!t.owners.includes(owner)) t.owners.push(owner);
    t.channels[c.channel] = (t.channels[c.channel] ?? 0) + 1;
  }

  // Rep load
  const repMap = new Map<string, RepLoad>();
  for (const c of customers) {
    const owner = ownerOf(c);
    let r = repMap.get(owner);
    if (!r) { r = { owner, accounts: 0, regions: [], revenueCents: rev(byOwner, owner).revenueCents }; repMap.set(owner, r); }
    r.accounts += 1;
    const region = regionOf(c);
    if (!r.regions.includes(region)) r.regions.push(region);
  }

  // Channel mix
  const chanCount = new Map<CustomerChannel, number>();
  for (const c of customers) chanCount.set(c.channel, (chanCount.get(c.channel) ?? 0) + 1);
  const channels: ChannelRow[] = (Object.keys(CHANNEL_LABELS) as CustomerChannel[])
    .map((channel) => {
      const label = CHANNEL_LABELS[channel];
      const r = rev(byChannel, label);
      return { channel, label, accounts: chanCount.get(channel) ?? 0, revenueCents: r.revenueCents, orderCount: r.orderCount };
    })
    .filter((r) => r.accounts > 0 || r.revenueCents > 0);

  // Delivery routes: group physical accounts by region (online has no route stop).
  const routeMap = new Map<string, RouteStop[]>();
  for (const c of customers) {
    if (c.channel === "online") continue; // shipped by carrier, not a route stop
    const region = regionOf(c);
    const stops = routeMap.get(region) ?? [];
    stops.push({ customerId: c.id, company: c.company, channel: c.channel, shippingAddress: c.shippingAddress });
    routeMap.set(region, stops);
  }

  return {
    territories: [...terrMap.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.accounts - a.accounts),
    reps: [...repMap.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.accounts - a.accounts),
    channels: channels.sort((a, b) => b.revenueCents - a.revenueCents),
    routes: [...routeMap.entries()].map(([region, stops]) => ({ region, stops })).sort((a, b) => b.stops.length - a.stops.length),
    totalAccounts: customers.length,
    regionsCovered: terrMap.size,
  };
}
