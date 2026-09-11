import Link from "next/link";
import { readableBusinessRecords } from "@/lib/workspace/access";
import { numberField as n, textField as s, paymentTotal } from "@/lib/workspace/model";
import type { OrganizationType } from "@/lib/navigation/catalog";
import { definitionFor } from "@/lib/workspace/catalog";
export async function OrganizationHome({ profiles }: { profiles: OrganizationType[] }) {
  const records = (await readableBusinessRecords()).filter(r => profiles.includes(definitionFor(r.kind).profile)), today = new Date().toISOString().slice(0, 10);
  const service = profiles.includes("service"), nonprofit = profiles.includes("nonprofit");
  const cards: { label: string; value: string | number; href: string }[] = [];
  if (service) {
    cards.push({ label: "Today's appointments", value: records.filter(r => r.kind === "booking" && r.status === "scheduled" && s(r, "start").startsWith(today)).length, href: "/modules/service-booking" },
      { label: "Unassigned work", value: records.filter(r => r.kind === "job" && !r.fields.owner && !["accepted", "cancelled"].includes(r.status)).length, href: "/modules/service-work" },
      { label: "Quotes awaiting approval", value: records.filter(r => r.kind === "proposal" && r.status === "sent").length, href: "/modules/service-proposals" },
      { label: "Accepted work to invoice", value: records.filter(r => r.kind === "job" && r.status === "accepted" && !records.some(i => i.kind === "invoice" && i.fields.job === r.id && i.status === "issued" && i.fields.method !== "deposit")).length, href: "/modules/service-billing" });
  }
  if (nonprofit) {
    cards.push({ label: "Reports awaiting submission", value: records.filter(r => r.kind === "report" && r.status !== "submitted").length, href: "/modules/nonprofit-reporting" },
      { label: "Unfilled volunteer shifts", value: records.filter(r => r.kind === "shift" && r.status === "draft").length, href: "/modules/nonprofit-shifts" },
      { label: "Program costs awaiting review", value: records.filter(r => r.kind === "program_cost" && r.status === "draft").length, href: "/modules/nonprofit-budgets" },
      { label: "Enrollment waitlist", value: records.filter(r => r.kind === "enrollment" && r.status === "waitlisted").length, href: "/modules/nonprofit-enrollment" });
    for (const currency of [...new Set(records.filter(r => r.kind === "donation").map(r => r.currency))]) {
      const amount = records.filter(r => r.kind === "donation" && r.currency === currency).reduce((t, r) => t + paymentTotal(records, "gift_payment", "donation", r.id), 0);
      cards.unshift({ label: "Donation cash received", value: `${currency} ${(amount / 100).toFixed(2)}`, href: "/modules/nonprofit-donations" });
    }
  }
  const overdue = records.filter(r => s(r, "due") && s(r, "due") < today && !["closed", "paid", "cancelled", "completed", "submitted", "reconciled"].includes(r.status));
  const overBudget = records.filter(r => r.kind === "job" && n(r, "budget") > 0 && records.filter(x => x.kind === "time_entry" && x.fields.job === r.id && x.status === "approved").reduce((t, x) => t + n(x, "cost"), 0) > n(r, "budget"));
  return <section className="space-y-5"><header><p className="dd-eyebrow">Your organization, right now</p><h1 className="mt-2 text-2xl font-bold">{nonprofit && service ? "Programs & service delivery" : nonprofit ? "Nonprofit workspace" : "Service workspace"}</h1><p className="mt-2 text-sm text-slate-500">Funding, people and work drawn from your recorded activity.</p></header><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <Link key={card.label + card.value} href={card.href} className="rounded-xl border bg-white p-5 hover:border-emerald-500"><p className="text-xs text-slate-500">{card.label}</p><p className="mt-3 text-2xl font-semibold">{card.value}</p></Link>)}</div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Needs attention</h2><p className="mt-2 text-sm text-slate-600">{overdue.length} overdue records{service ? ` · ${overBudget.length} jobs over budget` : ""}.</p><ul className="mt-3 space-y-2 text-sm">{overdue.slice(0, 8).map(r => <li key={r.id}>{r.title} · Due {s(r, "due")}</li>)}</ul>{!overdue.length && <p className="mt-3 text-sm text-slate-500">No overdue records in this workspace.</p>}</div><div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Start a complete workflow</h2><div className="mt-3 flex flex-wrap gap-2">{service && <Link href="/modules/service-intake" className="rounded-lg border px-3 py-2 text-sm text-emerald-800">New service inquiry →</Link>}{nonprofit && <><Link href="/modules/nonprofit-donors" className="rounded-lg border px-3 py-2 text-sm text-emerald-800">Add a donor →</Link><Link href="/modules/nonprofit-budgets" className="rounded-lg border px-3 py-2 text-sm text-emerald-800">Create a program →</Link></>}<Link href="/copilot?tab=roadmap" className="rounded-lg border px-3 py-2 text-sm text-emerald-800">Plan my work →</Link></div></div></div></section>;
}
