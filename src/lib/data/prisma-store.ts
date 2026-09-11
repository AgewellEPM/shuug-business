/**
 * Prisma/Postgres implementation of DealStore (active when DATABASE_URL is set).
 *
 * Reads assemble the persistence-neutral CustomerDeal from normalized rows.
 * saveAgreement runs in a transaction: replace the normalized current state and
 * append an immutable version snapshot — atomically, so history never diverges
 * from live pricing.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma-client";
import type {
  AgreementVersion,
  CustomerDeal,
  FreightPolicy,
  Order,
  OrderStatus,
  PaymentTermsCode,
  PriceAgreement,
  PriceLine,
  Sku,
} from "./model";
import type {
  CreateOrderInput,
  CustomerSummary,
  DealStore,
  NewCustomerInput,
  SaveAgreementInput,
} from "./store";
import { buildNewDeal, assertOrderMatches, requestedOrderId } from "./store";
import { slugify, uniqueSlug } from "../slug";

type OrderRow = Prisma.OrderGetPayload<{ include: { lines: true } }>;

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customerId,
    status: row.status as OrderStatus,
    poNumber: row.poNumber,
    createdAt: row.createdAt.toISOString(),
    note: row.note,
    subtotalCents: row.subtotalCents,
    freightCents: row.freightCents,
    totalCents: row.totalCents,
    lines: row.lines.map((l) => ({
      skuId: l.skuId,
      unit: l.unit as "case" | "bottle",
      quantity: l.quantity,
      cases: l.cases,
      unitPriceCents: l.unitPriceCents,
      tierLabel: l.tierLabel,
      isOverride: l.isOverride,
      lineTotalCents: l.lineTotalCents,
      ...(l.costAtOrderCents===null?{}:{costAtOrderCents:l.costAtOrderCents}),
    })),
  };
}

type AgreementRow = Prisma.AgreementGetPayload<{
  include: { lines: { include: { tiers: true } }; versions: true };
}>;

function toFreight(kind: string, amountCents: number | null): FreightPolicy {
  return amountCents === null
    ? { kind: kind as FreightPolicy["kind"] }
    : { kind: kind as FreightPolicy["kind"], amountCents };
}

function rowToAgreement(row: AgreementRow): PriceAgreement {
  return {
    id: row.id,
    customerId: row.customerId,
    targetMarginFraction: row.targetMarginFraction,
    floorMarginFraction: row.floorMarginFraction,
    paymentTerms: row.paymentTerms as PaymentTermsCode,
    creditLimitCents: row.creditLimitCents,
    minCasesPerOrder: row.minCasesPerOrder,
    minOrderDollarsCents: row.minOrderDollarsCents,
    freight: toFreight(row.freightKind, row.freightAmountCents),
    effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
    expirationDate: row.expirationDate.toISOString().slice(0, 10),
    approvedBy: row.approvedBy,
    lines: row.lines.map<PriceLine>((l) => ({
      skuId: l.skuId,
      unitPriceCents: l.unitPriceCents,
      minCasesPerSku: l.minCasesPerSku,
      tiers: [...l.tiers]
        .sort((a, b) => a.minQty - b.minQty)
        .map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, unitPriceCents: t.unitPriceCents })),
    })),
  };
}

class PrismaDealStore implements DealStore {
  readonly durable = true;

  async listCustomers(): Promise<CustomerSummary[]> {
    const rows = await prisma.customer.findMany({ orderBy: { company: "asc" } });
    return rows.map((c) => ({ id: c.id, company: c.company, buyerName: c.buyerName }));
  }

  async getDeal(customerId: string): Promise<CustomerDeal | null> {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return null;

    const agreementRow = await prisma.agreement.findUnique({
      where: { customerId },
      include: { lines: { include: { tiers: true } }, versions: { orderBy: { version: "asc" } } },
    });
    if (!agreementRow) throw new Error(`customer ${customerId} has no agreement`);

    const skus = await prisma.sku.findMany({ orderBy: { name: "asc" } });

    const versions: AgreementVersion[] = agreementRow.versions.map((v) => ({
      version: v.version,
      createdAt: v.createdAt.toISOString(),
      changedBy: v.changedBy,
      note: v.note,
      snapshot: v.snapshot as unknown as PriceAgreement,
    }));

    return {
      customer: {
        id: customer.id,
        company: customer.company,
        channel: customer.channel as import("./model").CustomerChannel,
        buyerName: customer.buyerName,
        buyerEmail: customer.buyerEmail,
        website: customer.website,
        accountOwner: customer.accountOwner,
        region: customer.region,
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddress,
        quickbooksCustomerId: customer.quickbooksCustomerId,
        requiresPO: customer.requiresPO,
      },
      agreement: rowToAgreement(agreementRow),
      skus: skus.map<Sku>((s) => ({
        id: s.id,
        name: s.name,
        unitsPerCase: s.unitsPerCase,
        retailPriceCents: s.retailPriceCents,
        costPerCaseCents: s.costPerCaseCents,
        standardPriceCents: s.standardPriceCents,
      })),
      versions,
    };
  }

  async saveAgreement({ agreement, changedBy, note }: SaveAgreementInput): Promise<CustomerDeal> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.agreement.findUnique({
        where: { id: agreement.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!existing) throw new Error(`saveAgreement: unknown agreement ${agreement.id}`);
      const nextVersion = (existing.versions[0]?.version ?? 0) + 1;

      // Replace normalized current state (lines+tiers cascade-delete).
      await tx.priceLine.deleteMany({ where: { agreementId: agreement.id } });
      await tx.agreement.update({
        where: { id: agreement.id },
        data: {
          targetMarginFraction: agreement.targetMarginFraction,
          floorMarginFraction: agreement.floorMarginFraction,
          paymentTerms: agreement.paymentTerms,
          creditLimitCents: agreement.creditLimitCents,
          minCasesPerOrder: agreement.minCasesPerOrder,
          minOrderDollarsCents: agreement.minOrderDollarsCents,
          freightKind: agreement.freight.kind,
          freightAmountCents: agreement.freight.amountCents ?? null,
          effectiveDate: new Date(agreement.effectiveDate),
          expirationDate: new Date(agreement.expirationDate),
          approvedBy: agreement.approvedBy,
          lines: {
            create: agreement.lines.map((l) => ({
              skuId: l.skuId,
              unitPriceCents: l.unitPriceCents,
              minCasesPerSku: l.minCasesPerSku,
              tiers: {
                create: l.tiers.map((t) => ({
                  minQty: t.minQty,
                  maxQty: t.maxQty,
                  unitPriceCents: t.unitPriceCents,
                })),
              },
            })),
          },
        },
      });

      await tx.agreementVersion.create({
        data: {
          agreementId: agreement.id,
          version: nextVersion,
          changedBy,
          note,
          snapshot: agreement as unknown as Prisma.InputJsonValue,
        },
      });
    });

    const deal = await this.getDeal(agreement.customerId);
    if (!deal) throw new Error(`saveAgreement: deal vanished for ${agreement.customerId}`);
    return deal;
  }

  async createCustomer(input: NewCustomerInput, stableId?: string): Promise<CustomerDeal> {
    if(stableId){const prior=await this.getDeal(stableId);if(prior)return prior;}
    const existing = await prisma.customer.findMany({ select: { id: true } });
    const id = stableId || uniqueSlug(slugify(input.company), new Set(existing.map((c) => c.id)));
    const deal = buildNewDeal(id, input);
    const { customer, agreement } = deal;

    await prisma.$transaction(async (tx) => {
      await tx.customer.create({
        data: {
          id: customer.id,
          company: customer.company,
          channel: customer.channel,
          buyerName: customer.buyerName,
          buyerEmail: customer.buyerEmail,
          website: customer.website,
          accountOwner: customer.accountOwner,
          region: customer.region,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress,
          quickbooksCustomerId: customer.quickbooksCustomerId,
          requiresPO: customer.requiresPO,
        },
      });
      await tx.agreement.create({
        data: {
          id: agreement.id,
          customerId: agreement.customerId,
          targetMarginFraction: agreement.targetMarginFraction,
          floorMarginFraction: agreement.floorMarginFraction,
          paymentTerms: agreement.paymentTerms,
          creditLimitCents: agreement.creditLimitCents,
          minCasesPerOrder: agreement.minCasesPerOrder,
          minOrderDollarsCents: agreement.minOrderDollarsCents,
          freightKind: agreement.freight.kind,
          freightAmountCents: agreement.freight.amountCents ?? null,
          effectiveDate: new Date(agreement.effectiveDate),
          expirationDate: new Date(agreement.expirationDate),
          approvedBy: agreement.approvedBy,
          lines: {
            create: agreement.lines.map((l) => ({
              skuId: l.skuId,
              unitPriceCents: l.unitPriceCents,
              minCasesPerSku: l.minCasesPerSku,
              tiers: { create: l.tiers },
            })),
          },
          versions: {
            create: {
              version: 1,
              changedBy: "Owner",
              note: "Customer created",
              snapshot: agreement as unknown as Prisma.InputJsonValue,
            },
          },
        },
      });
    });

    const created = await this.getDeal(id);
    if (!created) throw new Error(`createCustomer: deal vanished for ${id}`);
    return created;
  }

  async listOrders(customerId: string): Promise<Order[]> {
    const rows = await prisma.order.findMany({
      where: { customerId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rowToOrder);
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const row = await prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    return row ? rowToOrder(row) : null;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const stableId = requestedOrderId(input);
    if (stableId) { const existing = await this.getOrder(stableId); if (existing) return assertOrderMatches(existing, input); }
    let row: OrderRow;
    try { row = await prisma.order.create({
      data: {
        ...(stableId ? { id: stableId } : {}),
        customerId: input.customerId,
        status: "submitted",
        poNumber: input.poNumber,
        note: input.note,
        subtotalCents: input.subtotalCents,
        freightCents: input.freightCents,
        totalCents: input.totalCents,
        lines: {
          create: input.lines.map((l) => ({
            skuId: l.skuId,
            unit: l.unit,
            quantity: l.quantity,
            cases: l.cases,
            unitPriceCents: l.unitPriceCents,
            tierLabel: l.tierLabel,
            isOverride: l.isOverride,
            lineTotalCents: l.lineTotalCents,
            costAtOrderCents: l.costAtOrderCents ?? null,
          })),
        },
      },
      include: { lines: true },
    }); } catch (error) {
      if (stableId && (error as { code?: string }).code === "P2002") { const existing = await this.getOrder(stableId); if (existing) return assertOrderMatches(existing, input); }
      throw error;
    }
    return rowToOrder(row);
  }
}

export function createPrismaDealStore(): DealStore {
  return new PrismaDealStore();
}
