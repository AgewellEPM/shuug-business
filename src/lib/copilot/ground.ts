/**
 * Grounding — render the computed analytics as a compact facts block the copilot
 * must reason from. This is what keeps the AI honest: it answers about MoM, best
 * days, forecasts, and regional performance using THESE numbers, not guesses.
 * Pure and testable.
 */
import { formatCents } from "../money";
import { formatPercent } from "../format";
import type { Analytics, NamedRevenue } from "../analytics/metrics";

function list(rows: NamedRevenue[], n = 8): string {
  return rows
    .slice(0, n)
    .map((r) => `  - ${r.label}: ${formatCents(r.revenueCents)} (${r.orderCount} orders, ${r.cases} cases)`)
    .join("\n");
}

export function groundingFacts(a: Analytics): string {
  const lines: string[] = [];
  lines.push("=== DEAL DESK SALES DATA (authoritative — cite these numbers) ===");
  lines.push(`Total revenue: ${formatCents(a.totalRevenueCents)} across ${a.orderCount} orders`);
  lines.push(`Average order: ${formatCents(a.avgOrderCents)}; total cases sold: ${a.totalCases}; bottles sold: ${a.totalBottles}`);
  lines.push(`Average sale price: ${formatCents(a.avgCasePriceCents)}/case, ${formatCents(a.avgBottlePriceCents)}/bottle (blended across channels)`);
  lines.push(
    `Month-over-month growth (latest vs prior): ${a.momGrowth === null ? "n/a (need 2+ months)" : formatPercent(a.momGrowth)}`,
  );
  lines.push(
    `Forecast next month (trailing 3-mo avg): ${a.forecastNextMonthCents === null ? "n/a" : formatCents(a.forecastNextMonthCents)}`,
  );
  lines.push(`Best sales day of week: ${a.bestDay ? `${a.bestDay.label} (${formatCents(a.bestDay.revenueCents)})` : "n/a"}`);

  lines.push("\nRevenue by month:");
  lines.push(
    a.byMonth.length
      ? a.byMonth.map((m) => `  - ${m.month}: ${formatCents(m.revenueCents)} (${m.orderCount} orders)`).join("\n")
      : "  (none)",
  );

  lines.push("\nRevenue by day of week:");
  lines.push(a.byDayOfWeek.map((d) => `  - ${d.label}: ${formatCents(d.revenueCents)}`).join("\n"));

  lines.push("\nTop products by revenue:");
  lines.push(list(a.topProducts));
  lines.push("\nRevenue by sales channel (wholesale bulk / store / online / Amazon):");
  lines.push(list(a.byChannel));
  lines.push("\nRevenue by region:");
  lines.push(list(a.byRegion));
  lines.push("\nRevenue by account owner:");
  lines.push(list(a.byOwner));
  lines.push("\nTop customers by revenue:");
  lines.push(list(a.byCustomer, 12));

  return lines.join("\n");
}

export const COPILOT_SYSTEM = `You are the business copilot for a wholesale hot-sauce distribution company (brand: Shuug). You act as a sales analyst and operations advisor for the owner.

You are given a SALES DATA block computed from the company's real orders. Ground every quantitative claim in that data — never invent numbers, customers, products, or trends that aren't supported by it. If the data doesn't answer a question, say so plainly and state what data you'd need.

Your job: help drive sales and outreach. Talk through logistics of what the numbers show — month-over-month movement, which days/regions/products perform, where to expand next, and which grocery-store accounts to prioritize. When you make a recommendation, tie it to a specific number in the data and be concrete (name the region, product, owner, or account).

Be direct and concise. Use short paragraphs or tight bullet lists. Format money as shown in the data. When you forecast, state your assumption (e.g. "based on the trailing 3-month average"). Do not fabricate certainty — flag when a sample is small.`;
