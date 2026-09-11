/**
 * Turn orders into invoices, settle them against recorded payments + collection
 * state, and roll up A/R. One source for the collections page + API.
 */
import { loadWorkspace } from "../data/workspace";
import { termDays } from "../cashflow/engine";
import { settleInvoice, agingFromStatuses, type Invoice, type InvoiceStatus, type Aging, type Payment } from "./collections";
import { receivableData } from "./ar-store";

const DAY = 86_400_000;

export interface CollectionsOverview {
  payments: Payment[]; audit: ReturnType<typeof receivableData>["audit"];
  statuses: InvoiceStatus[];
  aging: Aging;
  outstandingCents: number;
  overdueCents: number;
  collectedCents: number;
}

export async function receivableInvoices(): Promise<(Invoice & { issuedOn: string })[]> {
  const { deals, orders } = await loadWorkspace();
  const termsByCustomer = new Map(deals.map((d) => [d.customer.id, d.agreement.paymentTerms]));
  const companyByCustomer = new Map(deals.map((d) => [d.customer.id, d.customer.company]));

  return orders
    .map((o) => {
      const days = termDays(termsByCustomer.get(o.customerId) ?? "net30");
      const due = new Date(Date.parse(o.createdAt) + days * DAY).toISOString().slice(0, 10);
      return { issuedOn: o.createdAt.slice(0, 10), void: o.status === "cancelled", id: o.id, customerId: o.customerId, company: companyByCustomer.get(o.customerId) ?? o.customerId, totalCents: o.totalCents, dueDateISO: due, poRef: o.poNumber ?? undefined };
    });

}

export async function loadCollections(todayIso = new Date().toISOString().slice(0, 10)): Promise<CollectionsOverview> {
  const invoices = await receivableInvoices();
  const { payments, collections, audit } = receivableData();
  const statuses = invoices
    .map((inv) => settleInvoice(inv, payments, collections[inv.id], todayIso))
    // most urgent first: overdue by days, then unpaid, paid last
    .sort((a, b) => (b.status === "overdue" ? b.daysOverdue : -1) - (a.status === "overdue" ? a.daysOverdue : -1) || b.balanceCents - a.balanceCents);

  const open = statuses.filter((s) => s.status !== "paid" && s.status !== "void");
  return {
    payments, audit, statuses,
    aging: agingFromStatuses(statuses),
    outstandingCents: open.reduce((n, s) => n + s.balanceCents, 0),
    overdueCents: statuses.filter((s) => s.status === "overdue").reduce((n, s) => n + s.balanceCents, 0),
    collectedCents: statuses.reduce((n, s) => n + s.paidCents, 0),
  };
}
