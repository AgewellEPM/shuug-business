/**
 * Seed Postgres from the shared demo data (prisma db seed / npm run db:seed).
 * Idempotent: upserts customers/SKUs/agreement, and only writes version 1 if the
 * agreement has no history yet — re-running never clobbers real edits.
 */
import { PrismaClient } from "@prisma/client";
import { buildSeedDeals, buildSeedOrders } from "../src/lib/data/seed";

const prisma = new PrismaClient();

async function main() {
  const deals = buildSeedDeals();

  // SKUs are shared across deals — upsert once from the first deal.
  for (const sku of deals[0].skus) {
    await prisma.sku.upsert({
      where: { id: sku.id },
      create: sku,
      update: {
        name: sku.name,
        costPerCaseCents: sku.costPerCaseCents,
        standardPriceCents: sku.standardPriceCents,
      },
    });
  }

  for (const deal of deals) {
    const { customer, agreement, versions } = deal;

    await prisma.customer.upsert({
      where: { id: customer.id },
      create: customer,
      update: customer,
    });

    await prisma.agreement.upsert({
      where: { id: agreement.id },
      create: {
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
      },
      update: {}, // don't overwrite an existing agreement on re-seed
    });

    const haveVersions = await prisma.agreementVersion.count({
      where: { agreementId: agreement.id },
    });
    if (haveVersions === 0) {
      await prisma.agreementVersion.create({
        data: {
          agreementId: agreement.id,
          version: versions[0].version,
          changedBy: versions[0].changedBy,
          note: versions[0].note,
          snapshot: versions[0].snapshot as object,
        },
      });
    }
  }

  // Historical orders — only if none exist yet (don't duplicate on re-seed).
  if ((await prisma.order.count()) === 0) {
    for (const order of buildSeedOrders()) {
      await prisma.order.create({
        data: {
          id: order.id,
          customerId: order.customerId,
          status: order.status,
          poNumber: order.poNumber,
          note: order.note,
          subtotalCents: order.subtotalCents,
          freightCents: order.freightCents,
          totalCents: order.totalCents,
          createdAt: new Date(order.createdAt),
          lines: { create: order.lines },
        },
      });
    }
  }

  const n = await prisma.customer.count();
  const o = await prisma.order.count();
  console.log(`Seeded. Customers: ${n}, orders: ${o}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
