import { escapeHtml } from "../auth/forms";
import { automotiveSmsConsentText, automotiveSmsConsentVersion } from "./model";

export function automotiveFormFields(businessName: string): string {
  return `<fieldset><legend>Vehicle details (optional)</legend><p>Tell us what you know. The shop will verify the vehicle and discuss the work with you.</p><label>Model year<input name="vehicleYear" type="number" min="1886" max="2100" step="1" inputmode="numeric"></label><label>Make<input name="vehicleMake" maxlength="80" autocomplete="off"></label><label>Model<input name="vehicleModel" maxlength="100" autocomplete="off"></label><label>VIN (optional)<input name="vehicleVin" minlength="17" maxlength="17" autocomplete="off" autocapitalize="characters"></label><label>Registration or plate<input name="vehiclePlate" maxlength="40" autocomplete="off"></label><label>Odometer reading<input name="vehicleOdometer" type="number" min="0" max="10000000" step="1" inputmode="numeric"></label></fieldset><label>Preferred service date (optional)<input name="requestedDate" type="date"></label><p>A preferred date is a request. The shop must confirm availability and any estimate or repair authorization separately.</p><fieldset><legend>Optional service texts from ${escapeHtml(businessName)}</legend><input type="hidden" name="smsConsentVersion" value="${automotiveSmsConsentVersion}"><label><input type="checkbox" name="smsConsent" value="yes"> ${escapeHtml(automotiveSmsConsentText)}</label></fieldset>`;
}

/** Preserve absence for optional fields so blank HTML controls do not turn into
 * made-up vehicle identities or zero odometer readings. Validation runs in the
 * same native submission schema used by non-HTTP callers. */
export function automotiveFormValues(values: URLSearchParams) {
  const text = (key: string) => values.get(key)?.trim() || undefined;
  const integer = (key: string) => { const value = text(key); return value === undefined ? undefined : /^\d+$/.test(value) ? Number(value) : NaN; };
  const vehicle = { year: integer("vehicleYear"), make: text("vehicleMake"), model: text("vehicleModel"), vin: text("vehicleVin"), plate: text("vehiclePlate"), odometer: integer("vehicleOdometer") };
  return { ...(Object.values(vehicle).some(value => value !== undefined) ? { vehicle } : {}), ...(text("requestedDate") ? { requestedDate: text("requestedDate") } : {}),
    smsConsent: values.get("smsConsent") === "yes", ...(text("smsConsentVersion") ? { smsConsentVersion: text("smsConsentVersion") } : {}) };
}
