import { cpSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = process.argv[2];
if (process.argv.length !== 3 || !target) throw new Error('Usage: node scripts/sdr-export/export.mjs NEW_DIRECTORY');
const output = resolve(target);
mkdirSync(output, { mode: 0o700 });

function copy(source, destination = source) {
  const from = join(root, source);
  if (!lstatSync(from).isFile()) throw new Error('Invalid source file: ' + source);
  const to = join(output, destination);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { errorOnExist: true, force: false });
}
function write(file, value) {
  writeFileSync(join(output, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

for (const filename of readdirSync(join(root, 'sales'))) {
  if (filename.endsWith('.mjs') && !filename.endsWith('.test.mjs')) copy('sales/' + filename);
}
copy('sales/facility-leadership-data.json');
for (const directory of ['business-places-data', 'territory-data', 'territory-map-data']) {
  for (const filename of readdirSync(join(root, 'sales', directory))) {
    if (/^(?:[A-Z]{2}|manifest)\.json(?:\.gz)?$/.test(filename)) copy('sales/' + directory + '/' + filename);
  }
}
const renderer = ['content.mjs', 'layout.mjs', 'mobile-hero.mjs', 'platform-bar.mjs', 'public-navigation.mjs', 'sales.mjs', 'sales-console.mjs', 'sales-prospects.mjs', 'sales-booking.mjs', 'sales-chat.mjs', 'sales-email.mjs', 'sales-support.mjs', 'sales-demo.mjs', 'sales-care-campaign.mjs', 'sales-today.mjs', 'sales-training.mjs', 'sales-training-demo.mjs', 'sales-training-pipeline.mjs'];
for (const filename of renderer) copy('scripts/rideshare-site/' + filename);
copy('scripts/rideshare-site/sales-coach.mjs');
copy('scripts/rideshare-site/sales-territory-dashboard.mjs');
copy('public/rideshare-tax-pros/sales-support-content.js', 'scripts/sdr-export/coach-help.cjs');
for (const file of ['sales-coach', 'coach-store', 'coach-context', 'coach-knowledge', 'coach-mail', 'coach-save']) copy('scripts/sdr-export/' + file + '.mjs');
copy('public/rideshare-tax-pros/assets/us-national-vision.svg');
const assets = [
  'booking-ui.js', 'booking-client.js', 'booking-connect.js', 'sales-booking.js', 'sales-booking.css',
  'business-data-attribution.txt', 'styles.css', 'contract-signature.js', 'directory-admin.js',
  'sales-overview.css', 'sales-overview.js', 'sales-welcome.webp', 'sales-care-community.webp',
  'sales-today.css', 'sales-today.js', 'sales-today-hero.webp',
  'local-contacts.js', 'local-offices.css', 'local-offices.js', 'sales.css', 'sales.js', 'sales-console.css',
  'sales-campaigns.js', 'sales-console.js', 'sales-contacts.js', 'sales-contracts.js', 'sales-linkedin.js', 'sales-progress.js', 'sales-research.js',
  'sales-prospects.css', 'sales-prospects.js', 'sales-prospects-community.webp',
  'sales-display.css', 'sales-display.js',
  'sales-demo.css', 'sales-demo.js', 'sales-demo-boards.json', 'care-town.webp',
  ...['care-hub','care-locations','care-facility','care-stroke','care-library','care-tour','care-pilot'].flatMap(name => [name + '.js', name + '.css']),
  ...readdirSync(join(root, 'public/rideshare-tax-pros')).filter(name => /^care-library-[a-z_-]+\.json$/.test(name)),
  'care-kiosks.js', 'care-venue-tour.js', 'care-facility-data.json', 'care-facility-kiosks.json',
  ...['boards','visit','gmb'].map(name => 'care-location-' + name + '.json'),
  ...['clinic','directory','healthcare','hospital','townhall','library','police','clerk','tax','probate'].map(name => 'care-location-qr-' + name + '.png'),
  ...readdirSync(join(root, 'public/rideshare-tax-pros/care-kiosks')).filter(name => /^[a-z-]+\.json$/.test(name)).map(name => 'care-kiosks/' + name),
  'sales-care-campaign.css', 'sales-care-campaign.js', 'sales-campaign-care.webp', 'sales-campaign-hands.webp', 'nursing-home-sales-kit.pdf',
  'sales-email.css', 'sales-mail-team.js', 'sales-email.js',
  'sales-chat.css', 'sales-chat.js', 'sales-chat-express.webp',
  'sales-coach.css', 'sales-coach-controls.js', 'sales-coach.js',
  'sales-contract-center.css', 'sales-contract-center.js', 'sales-contracts-hero.webp', 'sales-contracts-care.webp',
  'territory-dashboard.css', 'territory-dashboard.js', 'territory-dashboard-hero.webp',
  'sales-training.css', 'sales-training.js', 'sales-training-demo.css', 'sales-training-voice.js', 'sales-training-pipeline.js',
  'sales-support.css', 'sales-support.js', 'sales-support-content.js',
  'facility-reviews.css', 'facility-reviews.js',
  'sales-team.css', 'sales-team.js', 'sales-team-territory-planning.webp', 'sales-workflows.js', 'territories.css', 'territories.js', 'territory-facilities.js', 'territory-town-map.js', 'territory-county-leads.js', 'territory-ownership.js', 'sdr-headshots.js',
  'vendor/leaflet-1.9.4/LICENSE', 'vendor/leaflet-1.9.4/leaflet.js', 'vendor/leaflet-1.9.4/leaflet.css',
  ...['layers-2x', 'layers', 'marker-icon-2x', 'marker-icon', 'marker-shadow'].map(name => 'vendor/leaflet-1.9.4/images/' + name + '.png'),
];
for (const path of assets) copy('public/rideshare-tax-pros/' + path, 'site/' + path);
for (const directory of ['support-art', 'training-art']) {
  for (const filename of readdirSync(join(root, 'public/rideshare-tax-pros', directory))) {
    if (filename.endsWith('.png')) copy('public/rideshare-tax-pros/' + directory + '/' + filename, 'site/' + directory + '/' + filename);
  }
}
for (const name of ['build-mac.sh', 'campaigns.mjs', 'campaign-mail.mjs', 'configuration.mjs', 'facility-outreach.mjs', 'pages.mjs', 'saved-prospects.mjs', 'server.mjs', 'setup.mjs', 'sqlite.mjs', 'team-chat.mjs', 'mcp.mjs']) copy('scripts/sdr-export/' + name);
for (const name of readdirSync(join(root, 'scripts/sdr-export'))) {
  if (/^bookings?(?:-[a-z-]+)?\.mjs$/.test(name)) copy('scripts/sdr-export/' + name);
}
for (const name of ['authorize.mjs', 'store.mjs', 'allocation-store.mjs', 'allocations.mjs', 'handoffs.mjs', 'organization.mjs', 'zoho-account.mjs', 'zoho-mail.mjs', 'workspace.mjs']) copy('scripts/sdr-export/mail/' + name);
for (const name of ['Capture.swift', 'SDRWrapper.swift']) copy('native/macos/SDRWrapper/' + name);
copy('scripts/sales/mcp-connection.ts');
copy('src/lib/backend/sales-mcp.ts');
copy('LICENSE');
copy('scripts/sdr-export/README.md', 'README.md');
write('workspace.json', { name: 'Sales Workspace', publicSite: '', directory: 'project', contracts: 'agreement' });
write('business-directory.json', []);
write('package.json', {
  name: 'universal-sdr-workspace',
  private: true,
  type: 'module',
  engines: { node: '>=22.18.0' },
  scripts: { start: 'node scripts/sdr-export/server.mjs', 'mail:authorize': 'node scripts/sdr-export/mail/authorize.mjs' },
  optionalDependencies: { '@modelcontextprotocol/sdk': '1.30.0', zod: '^4.6.1' },
});
writeFileSync(join(output, '.gitignore'), 'workspace-data/\nnode_modules/\n.env*\n', { flag: 'wx' });
console.log(output);
