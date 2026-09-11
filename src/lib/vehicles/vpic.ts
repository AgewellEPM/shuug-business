import { z } from "zod";
import { boundedJson } from "../social/http";
import type { VinDecode } from "./model";
export const vinInput = z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Enter a complete 17-character VIN without I, O or Q. Older or incomplete identities can be entered manually.");
export const lookupInput = z.object({ vin: vinInput, modelYear: z.number().int().min(1980).max(2100).nullable(), recordId: z.uuid().nullable(), consent: z.literal(true) }).strict();
const clean = (v: unknown, max = 160) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
export async function decodeVin(raw: unknown): Promise<VinDecode> {
  const input = lookupInput.parse(raw), url = new URL(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${input.vin}`);
  url.searchParams.set("format", "json"); if (input.modelYear !== null) url.searchParams.set("modelyear", String(input.modelYear));
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("The VIN service could not be reached. Your vehicle records are unchanged. Try again or use manual entry."); }
  if (!response.ok) throw new Error(response.status === 429 ? "NHTSA is limiting VIN requests. Wait before trying again." : "The VIN service is temporarily unavailable. Your vehicle records are unchanged.");
  const payload = await boundedJson(response, 128000), rows = z.array(z.record(z.string(), z.unknown())).length(1).parse(payload.Results), row = rows[0];
  if (clean(row.VIN).toUpperCase() !== input.vin) throw new Error("The VIN service returned a different vehicle identity. No fields were applied.");
  const codes = clean(row.ErrorCode, 120).split(",").map(v => v.trim()).filter(Boolean), yearText = clean(row.ModelYear), year = /^\d{4}$/.test(yearText) && Number(yearText) >= 1980 && Number(yearText) <= 2100 ? Number(yearText) : null;
  const make = clean(row.Make), model = clean(row.Model), canApply = codes.length === 1 && codes[0] === "0" && Boolean(make && model && year) && (input.modelYear === null || input.modelYear === year);
  return { provider: "NHTSA vPIC", vin: input.vin, requestedYear: input.modelYear, decodedAt: new Date().toISOString(), make, model, year, manufacturer: clean(row.Manufacturer), bodyClass: clean(row.BodyClass), cylinders: clean(row.EngineCylinders, 40), displacementLitres: clean(row.DisplacementL, 40), fuel: clean(row.FuelTypePrimary), errorCodes: codes, message: clean(row.ErrorText, 1000) || "No decode status was supplied.", canApply };
}
