import { HttpError, metadata, state, text, independenceVerified } from './model.mjs';
import { enrollmentEligibility } from './billing.mjs';

function phone(value) {
  const clean = text(value || '', 40);
  if (clean && (!/^\+?[\d () .-]+$/.test(clean) || !/^\d{7,15}$/.test(clean.replace(/\D/g, '')))) {
    throw new HttpError(400, 'Enter a public phone number with 7–15 digits.');
  }
  return clean;
}
function booking(value) {
  const clean = text(value || '', 1200);
  if (!clean) return '';
  let url; try { url = new URL(clean); } catch { throw new HttpError(400, 'Use an HTTPS appointment link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') ||
    url.port || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
    /\.(local|internal|localhost)$/.test(url.hostname)) throw new HttpError(400, 'Use a public HTTPS appointment link.');
  return url.href;
}
export function supportInput(input = {}) {
  const result = { phone: phone(input.phone), hours: text(input.hours || '', 240),
    available24x7: input.available24x7 === true, appointmentURL: booking(input.appointmentURL) };
  if (result.available24x7 && (!result.phone || input.coverageConfirmed !== true)) {
    throw new HttpError(400, 'Confirm that this phone line is staffed 24 hours a day, every day.');
  }
  return result;
}
export function listingInput(input = {}) {
  if (typeof input.enabled !== 'boolean') throw new HttpError(400, 'Choose whether this office appears in the app.');
  if (!input.enabled) return { enabled: false };
  if (input.publicDetailsConfirmed !== true) throw new HttpError(400, 'Confirm the public office details and map position before enabling the listing.');
  const coordinate = value => (typeof value === 'number' || (typeof value === 'string' && value.trim())) ? Number(value) : NaN;
  const latitude = coordinate(input.latitude), longitude = coordinate(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) {
    throw new HttpError(400, 'Enter the confirmed office latitude and longitude.');
  }
  const postalCode = text(input.postalCode || '', 10, true);
  if (!/^\d{5}(-\d{4})?$/.test(postalCode)) throw new HttpError(400, 'Enter a US ZIP code.');
  let exteriorImageURL;
  try { exteriorImageURL = booking(input.exteriorImageURL); }
  catch { throw new HttpError(400, 'Use a public HTTPS link to the office exterior photo.'); }
  return { enabled: true, name: text(input.name, 180, true), address: text(input.address, 300, true),
    city: text(input.city, 100, true), state: state(input.state), postalCode, latitude, longitude,
    exteriorImageURL, ...supportInput(input), updatedAt: new Date().toISOString() };
}

/** Project only approved public fields; never prospects, private contacts,
 * outreach history, owner emails or enrollment receipts. */
export async function publicDirectory(db) {
  const [rows, enrollments, savedSupport] = await Promise.all([db.list('offices'), db.list('enrollments'), db.support()]);
  const active = new Set(enrollments.filter(row => enrollmentEligibility(row).eligible).map(row => String(metadata(row).leadId)));
  const offices = [];
  for (const row of rows) {
    const info = metadata(row), listing = info.publicListing;
    if (row.status !== 'active' || !active.has(String(row.id)) || !independenceVerified(info) || !listing?.enabled) continue;
    try {
      const clean = listingInput({ ...listing, publicDetailsConfirmed: true, coverageConfirmed: true });
      const { enabled, updatedAt, ...fields } = clean;
      offices.push({ id: String(row.id), ...fields });
    } catch { /* Damaged or legacy listings remain private until corrected. */ }
  }
  let support = { phone: '', hours: '', available24x7: false, appointmentURL: '' };
  try { support = supportInput({ ...savedSupport, coverageConfirmed: true }); } catch { /* No guessed contact fallback. */ }
  offices.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { version: 1, updatedAt: new Date().toISOString(), support, offices };
}
