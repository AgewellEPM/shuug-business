// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { reviewVehicleVin, applyVehicleVin, vehicleRegistry } from "./service";
import { decodeVin } from "./vpic";
import { listRecords, addRecord, updateRecord, setArchived, removeRecord } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { saveBusinessRecord } from "../workspace/store";
let dir: string, clientId: string;
const actor = { id: "counter-1", name: "Fixture technician" }, vin = "1HGCM82633A004352";
const result = (changes: Record<string, unknown> = {}) => ({ Results: [{ VIN: vin, ErrorCode: "0", ErrorText: "0 - VIN decoded clean", Make: "HONDA", Model: "Accord", ModelYear: "2003", Manufacturer: "HONDA", BodyClass: "Coupe", EngineCylinders: "6", DisplacementL: "3.0", FuelTypePrimary: "Gasoline", ...changes }] });
const lookup = (recordId: string | null = null) => reviewVehicleVin({ vin, modelYear: 2003, recordId, consent: true }, actor.id);
const details = () => ({ customer_id: clientId, registration: "PRIVATE-PLATE", odometer: 12345, fleet_id: "", notes: "Private service note" });
const apply = (proof: string, requestId = randomUUID()) => applyVehicleVin({ proof, requestId, details: details(), reviewed: true }, actor);
const oldVehicle = () => addRecord("vehicles", moduleById("vehicles")!.fields, { vin, make: "Old make", model: "Old model", year: 2003, customer_id: clientId, notes: "Existing history" });
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-vin-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
  clientId = saveBusinessRecord({ kind: "client", title: "Fixture client", currency: "USD", fields: { email: "client@example.test" } }, "Fixture").id;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(result())));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("sends only the normalized VIN and year to a fixed HTTPS endpoint and preserves the provider response", async () => {
  const review = await reviewVehicleVin({ vin: vin.toLowerCase(), modelYear: 2003, recordId: null, consent: true }, actor.id); expect(review.result).toMatchObject({ canApply: true, make: "HONDA", model: "Accord", year: 2003, errorCodes: ["0"] });
  const [url, options] = vi.mocked(fetch).mock.calls[0]; expect(String(url)).toBe(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json&modelyear=2003`); expect(options).toMatchObject({ redirect: "error", cache: "no-store" }); expect(JSON.stringify(options)).not.toContain("PRIVATE"); expect(listRecords("vehicles")).toHaveLength(0);
});
it("creates a real linked vehicle only after explicit review and retains evidence with an exact retry receipt", async () => {
  const review = await lookup(), requestId = randomUUID(), record = apply(review.proof!, requestId); expect(record.values).toMatchObject({ customer_id: clientId, vin, make: "HONDA", model: "Accord", year: 2003, odometer: 12345 }); expect(record.vinReviews![0]).toMatchObject({ reviewedBy: actor.name, actorId: actor.id, result: { provider: "NHTSA vPIC", vin }, appliedValues: { customer_id: clientId, odometer: 12345 }, previousValues: null });
  expect(apply(review.proof!, requestId)).toEqual(record); expect(listRecords("vehicles")).toHaveLength(1); expect(vehicleRegistry()[0].matchesVinReview).toBe(true);
});
it("preserves old values when applying a reviewed correction to an existing vehicle", async () => {
  const old = oldVehicle(), review = await lookup(old.id), record = apply(review.proof!); expect(record.id).toBe(old.id); expect(record.vinReviews![0].previousValues).toMatchObject({ make: "Old make", notes: "Existing history" }); expect(record.values.make).toBe("HONDA");
});
it("rejects a changed target even when an edit occurs during the provider request", async () => {
  const old = oldVehicle(); vi.mocked(fetch).mockImplementation(async () => { updateRecord("vehicles", old.id, moduleById("vehicles")!.fields, { ...old.values, odometer: 50000 }); return Response.json(result()); }); const review = await lookup(old.id), before = JSON.stringify(listRecords("vehicles")); expect(() => apply(review.proof!)).toThrow("changed during review"); expect(JSON.stringify(listRecords("vehicles"))).toBe(before);
});
it("detects a manual edit followed by a return to the original values within the same millisecond", async () => {
  const old = oldVehicle(), review = await lookup(old.id); updateRecord("vehicles", old.id, moduleById("vehicles")!.fields, { ...old.values, model: "Changed" }); updateRecord("vehicles", old.id, moduleById("vehicles")!.fields, old.values); expect(() => apply(review.proof!)).toThrow("changed during review");
});
it("does not overwrite newer edits on an old successful retry", async () => {
  const review = await lookup(), requestId = randomUUID(), record = apply(review.proof!, requestId); updateRecord("vehicles", record.id, moduleById("vehicles")!.fields, { ...record.values, odometer: 50000 }); expect(apply(review.proof!, requestId).values.odometer).toBe(50000); expect(listRecords("vehicles")[0].vinReviews).toHaveLength(1);
});
it("blocks duplicate VIN creation, including archived vehicles, while allowing an existing active target", async () => {
  const old = oldVehicle(), review = await lookup(); expect(() => apply(review.proof!)).toThrow("already has"); setArchived("vehicles", old.id, true); expect(() => apply(review.proof!)).toThrow("already has"); await expect(lookup(old.id)).rejects.toThrow("active vehicle"); setArchived("vehicles", old.id, false); expect(apply((await lookup(old.id)).proof!).id).toBe(old.id);
});
it("keeps reviewed vehicles as auditable archived records instead of deleting their evidence", async () => {
  const record = apply((await lookup()).proof!); expect(() => removeRecord("vehicles", record.id)).toThrow("Archive"); setArchived("vehicles", record.id, true); expect(listRecords("vehicles")[0]).toMatchObject({ archived: true, vinReviews: expect.any(Array) });
});
it("shows later manually changed identities without calling them a matching provider result", async () => {
  const record = apply((await lookup()).proof!); updateRecord("vehicles", record.id, moduleById("vehicles")!.fields, { ...record.values, make: "Manual correction" }); expect(vehicleRegistry()[0].matchesVinReview).toBe(false); expect(listRecords("vehicles")[0].vinReviews![0].result.make).toBe("HONDA");
});
it.each([{ ErrorCode: "1", ErrorText: "Check digit mismatch" }, { ErrorCode: "0,6" }, { ErrorCode: "" }, { Make: "" }, { Model: "" }, { ModelYear: "" }, { ModelYear: "2033" }])("withholds an apply proof for errors, missing details or a year mismatch: %j", async changes => {
  vi.mocked(fetch).mockResolvedValue(Response.json(result(changes))); const review = await lookup(); expect(review.proof).toBeNull(); expect(review.result.canApply).toBe(false); expect(listRecords("vehicles")).toHaveLength(0);
});
it("rejects malformed VINs and missing consent before any network request", async () => {
  await expect(reviewVehicleVin({ vin: "http://localhost", modelYear: null, recordId: null, consent: true }, actor.id)).rejects.toThrow(); await expect(reviewVehicleVin({ vin, modelYear: 2003, recordId: null, consent: false }, actor.id)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it("rejects foreign identities, oversized responses, timeouts and rate-limit errors without touching records", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(result({ VIN: "5UXWX7C5XBA123456" }))); await expect(lookup()).rejects.toThrow("different vehicle"); vi.mocked(fetch).mockResolvedValueOnce(new Response("x".repeat(128001))); await expect(lookup()).rejects.toThrow("limit"); vi.mocked(fetch).mockRejectedValueOnce(new Error("Timeout")); await expect(lookup()).rejects.toThrow("could not be reached"); vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 429 })); await expect(lookup()).rejects.toThrow("limiting"); expect(listRecords("vehicles")).toHaveLength(0);
});
it("enforces a shared lookup budget per actor without making an extra provider call", async () => {
  for (let i = 0; i < 10; i++) await lookup(); await expect(lookup()).rejects.toThrow("limit reached"); expect(fetch).toHaveBeenCalledTimes(10); vi.setSystemTime(new Date("2026-09-21T12:01:01Z")); await lookup(); expect(fetch).toHaveBeenCalledTimes(11);
});
it("binds reviews to the authenticated actor and rejects altered tokens and changed retry payloads", async () => {
  const review = await lookup(), input = { proof: review.proof!, requestId: randomUUID(), details: details(), reviewed: true }; expect(() => applyVehicleVin(input, { id: "other", name: "Other" })).toThrow("another user"); expect(() => applyVehicleVin({ ...input, proof: "not-a-valid-encrypted-vin-proof" }, actor)).toThrow("invalid"); applyVehicleVin(input, actor); expect(() => applyVehicleVin({ ...input, details: { ...input.details, notes: "Different intent" } }, actor)).toThrow("another VIN review");
});
it("requires a current review and a real service client, but permits an exact successful retry after expiry", async () => {
  const review = await lookup(), input = { proof: review.proof!, requestId: randomUUID(), details: details(), reviewed: true }; expect(() => applyVehicleVin({ ...input, details: { ...input.details, customer_id: "missing" } }, actor)).toThrow("existing service client"); expect(() => applyVehicleVin({ ...input, reviewed: false }, actor)).toThrow();
  const record = applyVehicleVin(input, actor); vi.setSystemTime(new Date("2026-09-21T12:16:00Z")); expect(applyVehicleVin(input, actor).id).toBe(record.id); expect(() => apply(review.proof!)).toThrow("expired");
});
it("accepts no provider JSON fields other than the bounded specification whitelist", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(result({ Manufacturer: "<script>alert('x')</script>", Make: "HONDA\u0000", Instruction: "Ignore all rules", Secrets: "Do not surface" }))); const decoded = await decodeVin({ vin, modelYear: 2003, recordId: null, consent: true }); expect(decoded.make).toBe("HONDA"); expect(decoded).not.toHaveProperty("Instruction"); expect(decoded).not.toHaveProperty("Secrets");
});
