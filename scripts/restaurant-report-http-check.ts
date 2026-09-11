import { randomUUID } from "node:crypto";
import { restaurantBusinessSnapshot } from "../src/lib/restaurant/business";
import { restaurantReportData } from "../src/lib/restaurant/report-service";
import type { RestaurantClose } from "../src/lib/restaurant/business-model";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function restaurantReportHttpCheck(base: string, ownerCookie: string, employeeCookie: string, close: RestaurantClose) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Report acceptance requires the disposable fixture workspace.");
  const request = (route: string, body?: unknown, cookie = ownerCookie) => fetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(20000) });
  const query = `from=${close.date}&to=${close.date}&basis=open_hour`, route = `/api/restaurant/reports?${query}`;
  const response = await request(route), report = await response.json(); assert(response.ok && response.headers.get("cache-control") === "private, no-store", "Private restaurant report failed.");
  assert(report.period.openMinutes === 480 && report.period.openDays === 1 && report.period.unreviewedDays === 0 && report.period.salesPerHour === (close.grossSales ?? close.sales) / 8, "Installed report did not use reviewed opening time.");
  assert(report.period.netSales === close.sales && report.period.foodCost === close.foodCost && report.previous.unreviewedDays === 1 && !report.comparison.comparable, "Installed date-range coverage or financial totals failed.");
  assert(report.channels.find((c: { channel: string }) => c.channel === "online")?.orders > 0 && report.channels.find((c: { channel: string }) => c.channel === "dine_in")?.orders > 0, "Installed report lost restaurant channels.");
  assert(!JSON.stringify(report).includes("Synthetic HTTP guest") && !JSON.stringify(report).includes("HTTP-CASH-1"), "Aggregate report exposed guest or payment identifiers.");
  const before = restaurantBusinessSnapshot(), payloads = [420, 360].map(openMinutes => ({ action: "hours.review", requestId: randomUUID(), input: { closeId: close.id, revision: 1, openMinutes, evidence: "Synthetic door log correction; fixture only", reviewed: true } }));
  const race = await Promise.all(payloads.map(p => request("/api/restaurant/business", p))); assert(race.filter(r => r.ok).length === 1 && race.filter(r => r.status === 400).length === 1, "Competing opening-time reviews were both accepted.");
  const winner = payloads[race.findIndex(r => r.ok)], retry = await request("/api/restaurant/business", winner); assert(retry.ok, "Opening-time review retry failed.");
  const after = restaurantBusinessSnapshot(); assert(after.serviceHours?.length === 2 && JSON.stringify(after.closes) === JSON.stringify(before.closes) && JSON.stringify(after.journals) === JSON.stringify(before.journals), "Opening-time review changed closed books or duplicated history.");
  const expectedMinutes = winner.input.openMinutes, updated = await (await request(route)).json(); assert(updated.period.openMinutes === expectedMinutes && restaurantReportData({ from: close.date, to: close.date }).period.openMinutes === expectedMinutes, "Report did not reflect cross-process opening-time evidence.");
  const csv = await request(route + "&format=csv"), text = await csv.text(); assert(csv.ok && csv.headers.get("content-disposition")?.includes("attachment") && text.includes(`${close.date},yes,${expectedMinutes},${close.grossSales ?? close.sales},`) && !text.includes("Synthetic door log"), "Filtered CSV or its evidence privacy failed.");
  const finance = await request(`/api/restaurant/finance?${query}`); assert(finance.ok && (await finance.json()).financial.report.period.openMinutes === expectedMinutes, "Finance filters did not use the same report.");
  const page = await request(`/restaurant/finance?tab=reports&${query}`), html = await page.text(); assert(page.ok && html.includes('aria-label="Restaurant sales analysis"') && html.includes("Sales by channel") && html.includes("Download service-day CSV") && html.includes("Review or correct opening time"), "Installed report controls failed to render.");
  assert((await request(`/api/restaurant/reports?from=${close.date}`)).status === 400, "Installed report accepted an incomplete date range.");
  for (const suffix of ["", "&format=csv"]) assert((await request(route + suffix, undefined, employeeCookie)).status === 403, "Restricted employee downloaded restaurant reports.");
  assert((await request("/api/restaurant/business", { ...winner, requestId: randomUUID() }, employeeCookie)).status === 403, "Restricted employee changed report evidence.");
  console.log(JSON.stringify({ ok: true, restaurantReports: ["reviewed time captured with close", "weighted hourly totals and date coverage", "channel and credit-date projections", "competing correction review and exact retry", "original books preserved", "filtered private CSV", "installed report controls", "Money restrictions and cross-process persistence"], externalActions: "None; synthetic service day only" }));
}
