/**
 * Deal store — persistence-neutral repository the UI/server-actions talk to.
 *
 * Two implementations sit behind this interface:
 *   - in-memory demo store (this file), active when DATABASE_URL is unset.
 *   - Prisma/Postgres store (./prisma-store), active on deploy (Neon).
 *
 * Selecting by DATABASE_URL keeps the app runnable with zero infra for the
 * milestone demo while the production path stays a real relational store.
 */
import { importedArchive, archiveImportedDeal } from "../customers/import-archive";
import type { Customer, CustomerChannel, CustomerDeal, Order, OrderLine, PriceAgreement } from "./model";
import { buildSeedDeals, buildSeedOrders } from "./seed";
import { SKUS } from "./seed";
import { defaultAgreement } from "./defaults";
import { slugify, uniqueSlug } from "../slug";
import { randomUUID } from "node:crypto";
import { archiveLocalOrder, archivedLocalOrders } from "./order-archive";

export interface CustomerSummary {
  id: string;
  company: string;
  buyerName: string;
}

export interface SaveAgreementInput {
  agreement: PriceAgreement;
  changedBy: string;
  note: string;
}

/** A validated, priced order ready to persist (store assigns id/createdAt/status). */
export interface CreateOrderInput {
  /** Server-issued UUID for idempotent website order submission. */
  requestId?: string;
  customerId: string;
  poNumber: string | null;
  note: string;
  lines: OrderLine[];
  subtotalCents: number;
  freightCents: number;
  totalCents: number;
}

/** Details entered when adding a customer (id/slug is derived from company). */
export interface NewCustomerInput {
  company: string;
  channel: CustomerChannel;
  buyerName: string;
  buyerEmail: string;
  phone?: string;
  website: string | null;
  accountOwner: string;
  region: string;
  billingAddress: string;
  shippingAddress: string;
  quickbooksCustomerId: string | null;
  requiresPO: boolean;
  targetMarginFraction?: number;
  floorMarginFraction?: number | null;
  /** chosen item list + per-case price. Omit to carry all SKUs at standard. */
  lines?: { skuId: string; unitPriceCents: number }[];
}

export interface DealStore {
  /** True for the Postgres workspace. Local mode still includes seeded demo
   * data, although imported customers and newly created orders are archived. */
  readonly durable: boolean;
  listCustomers(): Promise<CustomerSummary[]>;
  getDeal(customerId: string): Promise<CustomerDeal | null>;
  createCustomer(input: NewCustomerInput, stableId?: string): Promise<CustomerDeal>;
  saveAgreement(input: SaveAgreementInput): Promise<CustomerDeal>;
  listOrders(customerId: string): Promise<Order[]>;
  getOrder(orderId: string): Promise<Order | null>;
  createOrder(input: CreateOrderInput): Promise<Order>;
}

export function assertOrderMatches(order: Order, input: CreateOrderInput) {
  const shape = (r: Order | CreateOrderInput) => ({ customerId: r.customerId, poNumber: r.poNumber, note: r.note, subtotalCents: r.subtotalCents, freightCents: r.freightCents, totalCents: r.totalCents,
    lines: r.lines.map(l => ({ skuId: l.skuId, unit: l.unit, quantity: l.quantity, cases: l.cases, unitPriceCents: l.unitPriceCents, tierLabel: l.tierLabel, isOverride: l.isOverride, lineTotalCents: l.lineTotalCents, costAtOrderCents: l.costAtOrderCents ?? null })).sort((a,b) => a.skuId.localeCompare(b.skuId)) });
  if (JSON.stringify(shape(order)) !== JSON.stringify(shape(input))) throw new Error("This order request ID was already used for different data.");
  return order;
}
export function requestedOrderId(input: CreateOrderInput) {
  if (!input.requestId) return undefined;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.requestId)) throw new Error("Invalid order request ID.");
  return `ORD-${input.requestId}`;
}

/** Build a full CustomerDeal for a newly-added customer (shared by both stores). */
export function buildNewDeal(id: string, input: NewCustomerInput): CustomerDeal {
  const now = new Date();
  const effectiveDate = now.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  const expirationDate = end.toISOString().slice(0, 10);

  const customer: Customer = {
    id,
    company: input.company,
    channel: input.channel,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    phone: input.phone,
    website: input.website,
    accountOwner: input.accountOwner || "Owner",
    region: input.region || "",
    billingAddress: input.billingAddress,
    shippingAddress: input.shippingAddress,
    quickbooksCustomerId: input.quickbooksCustomerId,
    requiresPO: input.requiresPO,
  };

  const agreement = defaultAgreement(id, SKUS, {
    targetMarginFraction: input.targetMarginFraction,
    floorMarginFraction: input.floorMarginFraction,
    approvedBy: "Owner",
    effectiveDate,
    expirationDate,
    lines: input.lines,
  });

  return {
    customer,
    agreement,
    skus: structuredClone(SKUS),
    versions: [
      {
        version: 1,
        createdAt: now.toISOString(),
        changedBy: "Owner",
        note: "Customer created",
        snapshot: structuredClone(agreement),
      },
    ],
  };
}

// ---- in-memory demo implementation -----------------------------------------

export class MemoryDealStore implements DealStore {
  readonly durable = false;
  private deals = new Map<string, CustomerDeal>();
  private orders: Order[] = [];
  private seq = 0;

  constructor() {
    if (process.env.DEMO_DATA === "true") for (const deal of buildSeedDeals()) this.deals.set(deal.customer.id, deal);
    for (const deal of importedArchive().deals) this.deals.set(deal.customer.id, deal);
    this.orders = process.env.DEMO_DATA === "true" ? buildSeedOrders() : [];
    for(const saved of archivedLocalOrders()) {
      this.orders.push(saved.order);
      if(!this.deals.has(saved.deal.customer.id))this.deals.set(saved.deal.customer.id,saved.deal);
    }
    this.seq = this.orders.length;
  }

  async listCustomers(): Promise<CustomerSummary[]> {
    return [...this.deals.values()].map((d) => ({
      id: d.customer.id,
      company: d.customer.company,
      buyerName: d.customer.buyerName,
    }));
  }

  async getDeal(customerId: string): Promise<CustomerDeal | null> {
    const deal = this.deals.get(customerId);
    return deal ? structuredClone(deal) : null;
  }

  async createCustomer(input: NewCustomerInput, stableId?: string): Promise<CustomerDeal> {
    if (stableId && this.deals.has(stableId)) return structuredClone(this.deals.get(stableId)!);
    const id = stableId || uniqueSlug(slugify(input.company), new Set(this.deals.keys()));
    const deal = buildNewDeal(id, input);
    this.deals.set(id, deal);
    // Persist to the durable archive so the new customer survives an in-memory
    // store rebuild (dev HMR / server restart). A sourceKey is REQUIRED —
    // archiveImportedDeal is a no-op for a brand-new id without one.
    archiveImportedDeal(deal, `manual:${id}`);
    return structuredClone(deal);
  }

  async saveAgreement({ agreement, changedBy, note }: SaveAgreementInput): Promise<CustomerDeal> {
    const deal = this.deals.get(agreement.customerId);
    if (!deal) throw new Error(`saveAgreement: unknown customer ${agreement.customerId}`);
    const nextVersion = deal.versions.length + 1;
    deal.agreement = structuredClone(agreement);
    deal.versions.push({
      version: nextVersion,
      createdAt: new Date().toISOString(),
      changedBy,
      note,
      snapshot: structuredClone(agreement),
    });
    archiveImportedDeal(deal, `manual:${agreement.customerId}`);
    return structuredClone(deal);
  }

  async listOrders(customerId: string): Promise<Order[]> {
    return this.orders
      .filter((o) => o.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => structuredClone(o));
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const order = this.orders.find((o) => o.id === orderId);
    return order ? structuredClone(order) : null;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const stableId = requestedOrderId(input);
    if (stableId) {
      const existing = archivedLocalOrders().find(r => r.order.id === stableId)?.order ?? this.orders.find(o => o.id === stableId);
      if (existing) return structuredClone(assertOrderMatches(existing, input));
    }
    if (!this.deals.has(input.customerId)) {
      throw new Error(`createOrder: unknown customer ${input.customerId}`);
    }
    this.seq += 1;
    const order: Order = {
      id: stableId ?? `ORD-${randomUUID()}`,
      customerId: input.customerId,
      status: "submitted",
      poNumber: input.poNumber,
      createdAt: new Date().toISOString(),
      lines: input.lines,
      subtotalCents: input.subtotalCents,
      freightCents: input.freightCents,
      totalCents: input.totalCents,
      note: input.note,
    };
    archiveLocalOrder(order,this.deals.get(input.customerId)!);
    this.orders.push(structuredClone(order));
    return structuredClone(order);
  }
}

// ---- singleton selection ----------------------------------------------------
// Stash on globalThis so Next.js dev HMR doesn't wipe demo edits every reload.

type Holder = { store?: DealStore };
const holder = globalThis as unknown as { __dealStore?: Holder };
holder.__dealStore ??= {};

export async function getDealStore(): Promise<DealStore> {
  // Local archives are durable. Reopen them for each repository request so
  // customer prices and order history reflect other workers and owner changes.
  if (!process.env.DATABASE_URL) return new MemoryDealStore();
  if (holder.__dealStore!.store) {
    // Keep the user's in-memory edits during HMR while applying repository fixes.
    if(process.env.NODE_ENV==="development"&&!holder.__dealStore!.store.durable)Object.setPrototypeOf(holder.__dealStore!.store,MemoryDealStore.prototype);
    return holder.__dealStore!.store;
  }

  let store: DealStore;
  if (process.env.DATABASE_URL) {
    const { createPrismaDealStore } = await import("./prisma-store");
    store = createPrismaDealStore();
  } else {
    store = new MemoryDealStore();
  }
  holder.__dealStore!.store = store;
  return store;
}
