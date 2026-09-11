import { randomUUID } from "node:crypto";
import { moduleById } from "../src/lib/sdk/registry";
import { listRecords, updateRecord } from "../src/lib/sdk/records";
import type { VinLookupReview } from "../src/lib/vehicles/model";
import type { ModuleRecord } from "../src/lib/sdk/types";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
/** Optional live read against NHTSA uses only the public example VIN already
 * embedded in our synthetic fixture. No real customer identity is transmitted. */
export async function vehicleVinHttpCheck(base: string, cookie: string, employeeCookie: string) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "VIN acceptance requires disposable fixture data.");
  const endpoint = base + "/api/vehicles/vin", vin = "1HGCM82633A004352";
  const request = (body?: unknown, token = cookie, origin = base) => fetch(endpoint, { method: body ? "POST" : "GET", headers: { Cookie: token, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const input = { vin, modelYear: 2003, recordId: null as string | null, consent: true };
  assert((await request({ action: "lookup", input }, employeeCookie)).status === 403, "Restricted employee shared a VIN with the provider."); assert((await request({ action: "lookup", input }, cookie, "https://foreign.test")).status === 403, "Foreign origin reached VIN lookup.");
  const read = await request(), data = await read.json() as { records: ModuleRecord[]; clients: { id: string; title: string }[] }; const existing = data.records.find(r => r.values.vin === vin); assert(existing && data.clients.length, "The synthetic vehicle/client fixture is unavailable."); input.recordId = existing.id;
  const lookedUp = await request({ action: "lookup", input }), result = await lookedUp.json() as { review?: VinLookupReview; error?: string }; assert(lookedUp.ok && result.review?.proof && result.review.result.canApply && result.review.result.make === "HONDA", result.error ?? "Live public-example VIN lookup did not return a clean result.");
  const review = result.review, details = { customer_id: data.clients[0].id, registration: "PRIVATE-FIXTURE-PLATE", odometer: 12345, fleet_id: "", notes: "Private synthetic note, never sent to NHTSA" }, ids = [randomUUID(), randomUUID()];
  const race = await Promise.all(ids.map(requestId => request({ action: "apply", input: { proof: review.proof, requestId, details, reviewed: true } })));
  assert(race.filter(r => r.ok).length === 1 && race.filter(r => r.status === 400).length === 1, "Competing VIN reviews overwrote a record.");
  assert((await request({ action: "apply", input: { proof: review.proof, requestId: ids[race.findIndex(r => r.ok)], details, reviewed: true } })).ok, "Exact VIN save retry failed.");
  const saved = listRecords("vehicles").find(r => r.id === existing.id)!; assert(saved.vinReviews?.length === 1 && saved.values.make === "HONDA", "The second process cannot read the applied provider evidence.");
  const second = await request({ action: "lookup", input }), secondData = await second.json(); assert(second.ok && secondData.review.proof, "Second VIN review failed.");
  updateRecord("vehicles", saved.id, moduleById("vehicles")!.fields, { ...saved.values, odometer: 50000 }); const stale = await request({ action: "apply", input: { proof: secondData.review.proof, requestId: randomUUID(), details, reviewed: true } }); assert(stale.status === 400 && (await stale.json()).error.includes("changed during review"), "A stale provider review overwrote a newer vehicle edit.");
  const page = await fetch(base + "/m/vehicles", { headers: { Cookie: cookie } }), html = await page.text(); assert(page.ok && html.includes("Look up and review a VIN") && html.includes("Saved VIN review history") && html.includes("HONDA"), "Installed vehicle page did not render VIN lookup and review evidence.");
  const template = await fetch(base + "/api/workspace/template", { headers: { Cookie: cookie } }), exported = await template.json(); assert(template.ok && exported.requiredModules.some((m: { id: string }) => m.id === "vehicles") && !JSON.stringify(exported).includes(vin) && !JSON.stringify(exported).includes("PRIVATE-FIXTURE-PLATE"), "Reusable mechanic template lost the vehicle capability or exposed client data.");
  console.log(JSON.stringify({ ok: true, vehicleVin: ["live NHTSA public-example decode", "employee/origin protection", "review → real client link → saved vehicle evidence", "competing review and retry protection", "cross-process stale-edit protection", "installed vehicle screen", "template retains capability and excludes vehicle data"], externalData: "Only the public example VIN 1HGCM82633A004352 and model year 2003 were sent to NHTSA" }));
}
