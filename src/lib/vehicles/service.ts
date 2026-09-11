import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { sealSecret, openSecret } from "../connections/vault";
import { listRecords, changeModuleRecords } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { validateValues } from "../features/model";
import { listBusinessRecords } from "../workspace/store";
import { persistentState } from "../workspace/state";
import type { ModuleRecord } from "../sdk/types";
import type { VinDecode, VinLookupReview, VinReviewEvidence } from "./model";
import { decodeVin, lookupInput } from "./vpic";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
function must(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
const rates = persistentState<Record<string, { at: number; count: number }>>("vehicle-vin-rates", () => ({}));
function reserveLookup(actor: string) {
  rates.change(state => { const now = Date.now(); for (const key of Object.keys(state)) if (now - state[key].at >= 60000) delete state[key]; const key = hash(actor), bucket = state[key] ?? { at: now, count: 0 }; must(bucket.count < 10 && Object.values(state).reduce((n, b) => n + b.count, 0) < 60, "VIN lookup limit reached. Wait a minute before trying again."); bucket.count++; state[key] = bucket; });
}
interface Proof { purpose: "vehicle-vin"; actor: string; issued: number; recordId: string | null; recordHash: string | null; result: VinDecode }
export async function reviewVehicleVin(raw: unknown, actorId: string): Promise<VinLookupReview> {
  const input = lookupInput.parse(raw), target = input.recordId ? listRecords("vehicles").find(r => r.id === input.recordId) : undefined;
  must(!input.recordId || target && !target.archived, "Choose an active vehicle record, or start a new vehicle.");
  reserveLookup(actorId); const result = await decodeVin(input);
  const proof: Proof = { purpose: "vehicle-vin", actor: actorId, issued: Date.now(), recordId: target?.id ?? null, recordHash: target ? hash(target) : null, result };
  return { result, proof: result.canApply ? Buffer.from(sealSecret(JSON.stringify(proof))).toString("base64url") : null, target: target ? { id: target.id, values: target.values } : null };
}
const identity = z.object({ customer_id: z.string().trim().min(1).max(200), registration: z.string().trim().max(100), odometer: z.number().int().min(0).max(10_000_000).nullable(), fleet_id: z.string().trim().max(200), notes: z.string().max(5000) }).strict();
export const vinApplyInput = z.object({ requestId: z.uuid(), proof: z.string().min(20).max(16000), details: identity, reviewed: z.literal(true) }).strict();
function readProof(token: string, actorId: string): Proof {
  let proof: Proof; try { proof = JSON.parse(openSecret(Buffer.from(token, "base64url").toString())) as Proof; } catch { throw new Error("This VIN review is invalid. Look up the VIN again."); }
  must(proof.purpose === "vehicle-vin" && proof.actor === actorId && proof.result?.canApply, "This VIN review belongs to another user or cannot be applied."); return proof;
}
export function applyVehicleVin(raw: unknown, actor: { id: string; name: string }) {
  const input = vinApplyInput.parse(raw), proof = readProof(input.proof, actor.id), requestHash = hash({ ...input, actorId: actor.id }), fields = moduleById("vehicles")!.fields;
  const clients = vehicleClientOptions();
  return changeModuleRecords("vehicles", records => {
    for (const record of records) { const old = record.vinReviews?.find(r => r.requestId === input.requestId); if (old) { must(old.requestHash === requestHash, "This request ID was already used for another VIN review."); return record; } }
    must(Date.now() >= proof.issued && Date.now() - proof.issued <= 15 * 60000, "This VIN review expired. Look it up again before applying it.");
    const old = proof.recordId ? records.find(r => r.id === proof.recordId) : undefined;
    must(!proof.recordId || old && !old.archived && hash(old) === proof.recordHash, "This vehicle changed during review. Reload and look up the VIN again.");
    must(!records.some(r => r.id !== old?.id && String(r.values.vin ?? "").trim().toUpperCase() === proof.result.vin), "This VIN already has a vehicle record, including archived records. Select that record instead of creating a duplicate.");
    must(old || records.length < 5000, "The vehicle registry has reached its record limit."); must((old?.vinReviews?.length ?? 0) < 100, "This vehicle has reached its VIN review history limit.");
    must(clients.some(c => c.id === input.details.customer_id), "Choose an existing service client for this vehicle.");
    const values = validateValues(fields, { ...input.details, odometer: input.details.odometer ?? "", vin: proof.result.vin, make: proof.result.make, model: proof.result.model, year: proof.result.year });
    const at = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString();
    const evidence: VinReviewEvidence = { id: randomUUID(), requestId: input.requestId, requestHash, reviewedAt: at, reviewedBy: actor.name, actorId: actor.id, result: proof.result, appliedValues: values, previousValues: old?.values ?? null };
    const record: ModuleRecord = { id: old?.id ?? randomUUID(), values, archived: false, createdAt: old?.createdAt ?? at, updatedAt: at, vinReviews: [...(old?.vinReviews ?? []), evidence] };
    if (old) records[records.findIndex(r => r.id === old.id)] = record; else records.push(record); return record;
  });
}
export function vehicleVinReviewMatches(record: ModuleRecord) { const review = record.vinReviews?.at(-1)?.result; return !!review && String(record.values.vin ?? "").trim().toUpperCase() === review.vin && record.values.make === review.make && record.values.model === review.model && record.values.year === review.year; }
export function vehicleRegistry() { return listRecords("vehicles").map(r => ({ ...r, matchesVinReview: vehicleVinReviewMatches(r) })); }

export function vehicleClientOptions() { return listBusinessRecords(["client"]).filter(c => c.status !== "archived").map(c => ({ id: c.id, title: c.title })); }
