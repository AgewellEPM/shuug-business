/**
 * Demo seed — Joe's Market and two other stores, matching Luke's spec examples
 * (Original $44, standard $48, cost $25.20 -> 42.7% margin, etc.).
 *
 * Used by the in-memory store when no DATABASE_URL is configured, and by the
 * Prisma seed script to populate Postgres.
 */
import { standardLadder } from "../pricing/ladder";
import { priceOrder } from "../pricing/order";
import type {
  AgreementVersion,
  Customer,
  CustomerDeal,
  Order,
  OrderDraftLine,
  PriceAgreement,
  Sku,
} from "./model";

// Shuug's real product line (https://shuug.co) — sold wholesale by the case
// (12 bottles), $11.99 retail/bottle. Cost/standard are per case.
export const SKUS: Sku[] = [
  { id: "shuug-amba", name: "Amba Hot Sauce", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 3600, standardPriceCents: 7200 },
  { id: "shuug-zhoug", name: "Zhoug Hot Sauce", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 3600, standardPriceCents: 7200 },
  { id: "shuug-harissa", name: "Harissa Hot Sauce", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 3800, standardPriceCents: 7500 },
];

interface DealSpec {
  customer: Customer;
  targetMarginFraction: number;
  floorMarginFraction: number | null;
  prices: Record<string, number>; // skuId -> base case price cents
}

const DEALS: DealSpec[] = [
  {
    customer: {
      id: "joes-market",
      company: "Joe's Market",
      channel: "store",
      buyerName: "Joe Ferraro",
      buyerEmail: "joe@joesmarket.example",
      website: "https://joesmarket.example",
      accountOwner: "Alex Rivera",
      region: "MA",
      billingAddress: "12 Main St, Springfield, MA 01103",
      shippingAddress: "12 Main St (rear dock), Springfield, MA 01103",
      quickbooksCustomerId: "QB-1042",
      requiresPO: true,
    },
    targetMarginFraction: 0.4,
    floorMarginFraction: 0.3,
    prices: { "shuug-amba": 6600, "shuug-zhoug": 6600, "shuug-harissa": 6800 },
  },
  {
    customer: {
      id: "big-y",
      company: "Big Y",
      channel: "wholesale_bulk",
      buyerName: "Dana Whitfield",
      buyerEmail: "dana.whitfield@bigy.example",
      website: "https://bigy.example",
      accountOwner: "Alex Rivera",
      region: "MA",
      billingAddress: "2145 Roosevelt Ave, Springfield, MA 01104",
      shippingAddress: "DC 3, 40 Bay State Rd, Springfield, MA 01151",
      quickbooksCustomerId: "QB-1088",
      requiresPO: true,
    },
    targetMarginFraction: 0.4,
    floorMarginFraction: 0.32,
    prices: { "shuug-amba": 6300, "shuug-zhoug": 6300, "shuug-harissa": 6500 },
  },
  {
    customer: {
      id: "local-mart",
      company: "Local Mart",
      channel: "online",
      buyerName: "Priya Anand",
      buyerEmail: "priya@localmart.example",
      website: null,
      accountOwner: "Jordan Kim",
      region: "Western MA",
      billingAddress: "88 Elm St, Northampton, MA 01060",
      shippingAddress: "88 Elm St, Northampton, MA 01060",
      quickbooksCustomerId: null,
      requiresPO: false,
    },
    targetMarginFraction: 0.4,
    floorMarginFraction: null,
    prices: { "shuug-amba": 6900, "shuug-zhoug": 6900, "shuug-harissa": 7100 },
  },
];

function agreementFor(spec: DealSpec): PriceAgreement {
  return {
    id: `agr-${spec.customer.id}`,
    customerId: spec.customer.id,
    targetMarginFraction: spec.targetMarginFraction,
    floorMarginFraction: spec.floorMarginFraction,
    paymentTerms: "net30",
    creditLimitCents: 2_000_000,
    minCasesPerOrder: 10,
    minOrderDollarsCents: 250_000, // $2,500
    freight: { kind: "free_over", amountCents: 250_000, belowChargeCents: 7_500 },
    effectiveDate: "2027-01-01",
    expirationDate: "2027-12-31",
    approvedBy: "Luke (Owner)",
    lines: SKUS.map((s) => ({
      skuId: s.id,
      unitPriceCents: spec.prices[s.id],
      tiers: standardLadder(spec.prices[s.id]),
      minCasesPerSku: 0,
    })),
  };
}

/** Build a fresh copy of every seeded deal (deep-cloned so callers can mutate). */
export function buildSeedDeals(): CustomerDeal[] {
  return DEALS.map((spec) => {
    const agreement = agreementFor(spec);
    const version: AgreementVersion = {
      version: 1,
      createdAt: "2027-01-01T00:00:00.000Z",
      changedBy: spec.customer.id === "joes-market" ? "Luke (Owner)" : "Import",
      note: "Initial agreement",
      snapshot: structuredClone(agreement),
    };
    return {
      customer: structuredClone(spec.customer),
      agreement,
      skus: structuredClone(SKUS),
      versions: [version],
    };
  });
}

export const SEED_CUSTOMER_IDS = DEALS.map((d) => d.customer.id);

/** A few historical orders so order history and one-click reorder have data. */
export function buildSeedOrders(): Order[] {
  const joes = DEALS.find((d) => d.customer.id === "joes-market");
  if (!joes) return [];
  const agreement = agreementFor(joes);

  const build = (
    id: string,
    createdAt: string,
    poNumber: string,
    draft: OrderDraftLine[],
  ): Order => {
    const p = priceOrder(draft, agreement);
    return {
      id,
      customerId: "joes-market",
      status: "fulfilled",
      poNumber,
      createdAt,
      lines: p.lines,
      subtotalCents: p.subtotalCents,
      freightCents: p.freightCents,
      totalCents: p.totalCents,
      note: "Imported from history",
    };
  };

  return [
    build("ORD-0001", "2026-08-14T15:30:00.000Z", "JM-7781", [
      { skuId: "shuug-amba", cases: 60 },
      { skuId: "shuug-zhoug", cases: 24 },
    ]),
    build("ORD-0002", "2026-09-02T14:05:00.000Z", "JM-7802", [
      { skuId: "shuug-amba", cases: 40 },
      { skuId: "shuug-harissa", cases: 20 },
    ]),
  ];
}
