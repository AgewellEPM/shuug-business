import { readFileSync } from 'node:fs';
import { z } from 'zod';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const label = maximum => z.string().trim().min(1).max(maximum).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Use public address text without control characters.');
export const officeLocationsSchema = z.array(z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/).max(64),
  name: label(120),
  operatorName: label(160).optional(),
  independentlyOwned: z.literal(true),
  confirmed: z.literal(true),
  address: z.object({ line1: label(160), line2: label(160).optional(), city: label(100),
    region: label(100).optional(), postalCode: label(24).optional(), country: label(100) }).strict(),
  // The interactive provider uses Web Mercator; offices outside its display
  // range need a different map provider rather than a misleading pinned map.
  latitude: z.number().finite().min(-85).max(85),
  longitude: z.number().finite().min(-180).max(180),
}).strict()).max(100).refine(offices => new Set(offices.map(office => office.id)).size === offices.length, 'Office IDs must be unique.');

export function validateOfficeLocations(value) { return officeLocationsSchema.parse(value); }
export function loadOfficeLocations() {
  const bytes = readFileSync(new URL('../../public/rideshare-tax-pros/office-locations.json', import.meta.url));
  if (bytes.length > 262_144) throw new Error('Public office configuration exceeds its size limit.');
  return validateOfficeLocations(JSON.parse(bytes.toString('utf8')));
}
export function officeMapURLs(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -85 || latitude > 85 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Invalid public office map coordinates.');
  const number = value => Number(value.toFixed(6)).toString();
  const lat = number(latitude), lon = number(longitude);
  const link = new URL('https://www.openstreetmap.org/');
  link.searchParams.set('mlat', lat); link.searchParams.set('mlon', lon);
  link.hash = `map=16/${lat}/${lon}`;
  const embed = new URL('https://www.openstreetmap.org/export/embed.html');
  embed.searchParams.set('bbox', [Math.max(-180, longitude - .016), Math.max(-85.051128, latitude - .008),
    Math.min(180, longitude + .016), Math.min(85.051128, latitude + .008)].map(number).join(','));
  embed.searchParams.set('layer', 'mapnik'); embed.searchParams.set('marker', `${lat},${lon}`);
  return { link: link.href, embed: embed.href };
}
function officeCard(office) {
  const { address } = office, urls = officeMapURLs(office.latitude, office.longitude);
  const locality = [address.city, address.region].filter(Boolean).join(', ') + (address.postalCode ? ` ${address.postalCode}` : '');
  return `<li><article class="office-card" data-office-id="${escape(office.id)}" data-office-name="${escape(office.name)}" data-office-latitude="${office.latitude}" data-office-longitude="${office.longitude}" aria-labelledby="office-${escape(office.id)}"><h4 id="office-${escape(office.id)}">${escape(office.name)}</h4><p class="office-operator">Independently owned and operated${office.operatorName ? ` by ${escape(office.operatorName)}` : ''}</p><address><span>${escape(address.line1)}</span>${address.line2 ? `<span>${escape(address.line2)}</span>` : ''}<span>${escape(locality)}</span><span>${escape(address.country)}</span></address><a class="text-link" href="${escape(urls.link)}" target="_blank" rel="noopener noreferrer">Open ${escape(office.name)} in OpenStreetMap <span aria-hidden="true">↗</span></a></article></li>`;
}
export function renderCoverageVision() {
  return `<div class="coverage-vision" data-coverage-vision><div class="coverage-vision-copy"><p class="eyebrow">ONE BRAND. LOCAL OWNERSHIP.</p><h2 id="office-locations-title">Our goal:<br><em>national brand recognition.</em></h2><p class="coverage-vision-promise">Local service across the country.</p><p>Our vision brings independently owned local offices together under one Gig Tax Pros umbrella, growing community by community.</p><p class="coverage-vision-note">Nationwide reach is our goal. Current service availability depends on confirmed local offices.</p></div><figure class="coverage-vision-map" aria-describedby="coverage-vision-caption"><div class="coverage-map-topline"><span>GIG TAX PROS</span><span class="coverage-vision-tag">NATIONWIDE VISION</span></div><img src="/assets/us-national-vision.svg" width="1000" height="650" alt="United States map, including Alaska and Hawaii, illuminated in Gig Tax Pros purple and magenta to illustrate our nationwide brand goal."><figcaption id="coverage-vision-caption"><span class="coverage-legend-line" aria-hidden="true"></span><span><strong>Expansion goal</strong> · This illustration does not show current service coverage or office locations.</span></figcaption></figure></div>`;
}
export function renderOfficeMap(value = loadOfficeLocations()) {
  const offices = validateOfficeLocations(value);
  const vision = renderCoverageVision();
  const heading = `<div class="office-heading"><h3>Confirmed local offices</h3><p>Each local office is independently owned and operated. Confirm services, appointments and engagement terms with the office you choose.</p></div>`;
  if (!offices.length) return `<section class="content-section office-section" id="office-locations" aria-labelledby="office-locations-title" data-office-map>${vision}<div class="office-empty office-pending"><div><h3>Office locations are being confirmed.</h3><p>No office addresses are published yet. Confirmed locations and their local operators will appear here.</p></div><a class="text-link" href="/contact">View contact availability <span aria-hidden="true">↗</span></a></div></section>`;
  const first = offices[0], firstURL = officeMapURLs(first.latitude, first.longitude).link;
  return `<section class="content-section office-section" id="office-locations" aria-labelledby="office-locations-title" data-office-map>${vision}${heading}<div class="office-grid"><div class="office-directory"><h3>Office addresses</h3><ul class="office-list">${offices.map(officeCard).join('')}</ul></div><div class="office-map-panel"><div class="office-map-controls" data-office-controls hidden><label for="office-map-select">Choose an office</label><select id="office-map-select" data-office-select aria-describedby="office-map-privacy">${offices.map(office => `<option value="${escape(office.id)}">${escape(office.name)} · ${escape(office.address.city)}</option>`).join('')}</select><div class="office-map-actions"><button class="button primary" type="button" data-office-load aria-controls="office-map-canvas">Load selected office’s map</button><button class="button secondary" type="button" data-office-hide hidden>Close map</button></div></div><div class="office-map-canvas" id="office-map-canvas" data-office-canvas><p data-office-placeholder>The map stays off until you choose to load it. You can always use the office addresses and external map links.</p></div><p class="office-map-privacy" id="office-map-privacy">Loading a map connects your browser to OpenStreetMap, which receives technical request information such as your IP address and this public site’s origin. Your device location is not requested.</p><p class="office-map-status" data-office-status role="status" aria-live="polite"></p><a class="text-link" data-office-map-link href="${escape(firstURL)}" target="_blank" rel="noopener noreferrer">Open ${escape(first.name)} in OpenStreetMap <span aria-hidden="true">↗</span></a><p class="office-map-attribution">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></p><noscript><p>Use the address list and each office’s OpenStreetMap link. Interactive controls need JavaScript.</p></noscript></div></div></section>`;
}
