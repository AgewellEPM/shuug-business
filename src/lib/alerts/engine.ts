/**
 * Alerts engine — the connective tissue. It scans signals from every module
 * (inventory, lots, tasks, samples, invoices, email, HACCP) and turns them into
 * one ranked "needs attention" list, so the owner opens one screen and knows
 * exactly what to do today. Pure and deterministic.
 */
import { formatCents } from "../money";

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

export interface AlertInput {
  reorder: { skuId: string; name: string; onHandCases: number; reorderPointCases: number }[];
  expiringLots: { lotCode: string; name: string; daysToExpiry: number; expired: boolean }[];
  overdueTasks: { id: string; title: string; assignee: string; dueDate: string }[];
  pendingSamples: number;
  heldInvoices: { vendor: string; invoiceNumber: string; atRiskCents: number }[];
  unroutedEmails: { subject: string; category: string }[];
  failingCcp: { ccp: string; lotCode: string | null }[];
}

const RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function buildAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];

  for (const r of input.reorder) {
    alerts.push({
      id: `reorder-${r.skuId}`,
      severity: r.onHandCases === 0 ? "critical" : "warning",
      category: "Inventory",
      title: `Low stock: ${r.name}`,
      detail: `${r.onHandCases} cases on hand (reorder at ${r.reorderPointCases}).`,
      href: "/operations",
      actionLabel: "Plan a batch",
    });
  }

  for (const l of input.expiringLots) {
    alerts.push({
      id: `expiry-${l.lotCode}`,
      severity: l.expired ? "critical" : "warning",
      category: "Traceability",
      title: l.expired ? `Expired lot: ${l.name}` : `Expiring soon: ${l.name}`,
      detail: l.expired ? `Lot ${l.lotCode} is past its best-by date.` : `Lot ${l.lotCode} expires in ${l.daysToExpiry} days.`,
      href: "/traceability",
      actionLabel: "Trace lot",
    });
  }

  for (const c of input.failingCcp) {
    alerts.push({
      id: `haccp-${c.ccp}-${c.lotCode ?? "x"}`,
      severity: "critical",
      category: "Food safety",
      title: `HACCP out of limit: ${c.ccp}`,
      detail: c.lotCode ? `On lot ${c.lotCode}. Corrective action required.` : "Corrective action required.",
      href: "/production",
      actionLabel: "Review",
    });
  }

  for (const inv of input.heldInvoices) {
    alerts.push({
      id: `invoice-${inv.vendor}-${inv.invoiceNumber}`,
      severity: "warning",
      category: "Money",
      title: `Overcharge held: ${inv.vendor}`,
      detail: `Invoice #${inv.invoiceNumber} — ${formatCents(inv.atRiskCents)} at risk.`,
      href: "/invoices",
      actionLabel: "Review overcharge",
    });
  }

  for (const t of input.overdueTasks) {
    alerts.push({
      id: `task-${t.id}`,
      severity: "warning",
      category: "Tasks",
      title: `Overdue: ${t.title}`,
      detail: `${t.assignee} · was due ${t.dueDate}.`,
      href: "/tasks",
      actionLabel: "Open board",
    });
  }

  if (input.unroutedEmails.length > 0) {
    alerts.push({
      id: "emails-unrouted",
      severity: "info",
      category: "Inbox",
      title: `${input.unroutedEmails.length} email${input.unroutedEmails.length === 1 ? "" : "s"} need a person`,
      detail: input.unroutedEmails.slice(0, 3).map((e) => e.subject).join("; "),
      href: "/inbox",
      actionLabel: "Open inbox",
    });
  }

  if (input.pendingSamples > 0) {
    alerts.push({
      id: "samples-pending",
      severity: "info",
      category: "Samples",
      title: `${input.pendingSamples} sample request${input.pendingSamples === 1 ? "" : "s"} to approve`,
      detail: "Approve to ship (deducts inventory).",
      href: "/samples",
      actionLabel: "Review",
    });
  }

  return alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export function alertCounts(alerts: Alert[]): Record<AlertSeverity, number> {
  return {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };
}
