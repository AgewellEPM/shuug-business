import { readFileSync } from 'node:fs';
import { renderProspects } from './sales-prospects.mjs';
import { renderCareDemo } from './sales-demo.mjs';
import { renderCareCampaign } from './sales-care-campaign.mjs';
import { renderSupport, renderSupportSidebar } from './sales-support.mjs';
import { renderTraining } from './sales-training.mjs';
import { renderCertification } from './sales-certification.mjs';
import { renderMonthlyPrizes } from './sales-prizes.mjs';
import { renderTrainingDemo } from './sales-training-demo.mjs';
import { renderTrainingPipeline } from './sales-training-pipeline.mjs';
import { bookingOverview, bookingPanel } from './sales-booking.mjs';
import { renderSalesEmail } from './sales-email.mjs';
import { renderTeamChat } from './sales-chat.mjs';
import { renderSalesCoach } from './sales-coach.mjs';
import { renderToday } from './sales-today.mjs';
import { renderTerritoryHeader } from './sales-territory-dashboard.mjs';
import { renderPipelineWorkspace } from './sales-pipeline-workspace.mjs';
import { renderMission } from './sales-mission.mjs';
import { renderProducts } from './sales-products.mjs';

// Presentation adapted from the existing online TinkySDR cockpit, embedded by
// TinkySDRMac: TinkySpeak-Web/outreach.html and css/outreach.css. The existing
// GigTax forms/API remain the source of truth; no generic tenant key is exposed.
const icons = {
  demo: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
  chat: '<path d="M20 11.5a7 7 0 0 1-7 7H8l-5 3 1.3-5.1A7.4 7.4 0 0 1 3 12V9a6 6 0 0 1 6-6h5a6 6 0 0 1 6 6z"/><path d="M7.5 9h8m-8 4h5"/>',
  chatSend: '<path d="m3 4 18 8-18 8 3-8z"/><path d="M6 12h10"/>',
  nursing: '<path d="M3 18V8m0 8h18v4m0-4v-5h-9v5M5 11h4v3H5z"/><path d="M16 3v5m-2.5-2.5h5"/>',
  center: '<path d="m2 9 10-6 10 6M4 10v10h16V10M9 20v-5h6v5"/><path d="M7 11h1m3 0h2m3 0h1"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 10h18M7 15h4"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z"/>',
  mission: '<path d="M4 21V4m0 1c5-4 9 3 16-1v10c-7 4-11-3-16 1"/>',
  pipeline: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="14" rx="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  forecast: '<path d="M3 3v17h18M7 14l5-5 3 3 5-6m-5 0h5v5"/>',
  reports: '<path d="M4 20h16M7 16v-4m5 4V8m5 8V4" stroke-width="2.5"/>',
  revenue: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12m3-9H11a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  facilities: '<path d="M3 18V8m0 8h18v4m0-4v-5h-9v5M5 11h4v3H5z"/><path d="M16 3v5m-2.5-2.5h5"/>',
  territories: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
  discover: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5M10.5 8v5"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
  contracts: '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  locations: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  email: '<path d="M4 4h16l2 9v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6Zm-2 9h6l2 3h4l2-3h6"/>',
  contacts: '<rect x="4" y="3" width="17" height="18" rx="2"/><path d="M2 7h4M2 12h4M2 17h4"/><circle cx="13" cy="9" r="2"/><path d="M9 17v-1a4 4 0 0 1 8 0v1"/>',
  prospects: '<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M19 8v6m-3-3h6"/>',
  products: '<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  training: '<path d="m2 9 10-5 10 5-10 5-10-5Zm5 3v5a9 9 0 0 0 10 0v-5m4-2v7"/>',
  certification: '<circle cx="12" cy="9" r="6"/><path d="m9 14-2 7 5-3 5 3-2-7m-5-5 1.5 1.5L14 8"/>',
  resources: '<rect x="3" y="7" width="18" height="4" rx="1"/><path d="M5 11v10h14V11M12 7v14m0-14H7a2.5 2.5 0 1 1 2.5-2.5ZM12 7h5a2.5 2.5 0 1 0-2.5-2.5Z"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 1 1-10 0V3Zm0 2H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4m-5 2v7m-4 1h8"/>',
  support: '<path d="M3 13v-1a9 9 0 0 1 18 0v1m0 4v1a4 4 0 0 1-4 4h-3"/><rect x="2" y="11" width="4" height="7" rx="2"/><rect x="18" y="11" width="4" height="7" rx="2"/><rect x="10" y="20" width="5" height="3" rx="1.5" fill="currentColor"/>',
  campaigns: '<path d="M3 11h5l9-5v12l-9-4H3v-3Zm5 3 2 6m10-11 2-1m-2 7 2 1"/>',
};
const icon = name => `<svg class="sdr-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

const quickAction = (label, view, style, ownerOnly = false) => `<button type="button" class="sdr-overview-action ${style}" data-overview-action="${view}"${ownerOnly ? ' data-owner-only hidden' : ''}>${icon(view === 'research' ? 'discover' : view)}<span>${label}</span><span aria-hidden="true">›</span></button>`;

const facilityOverview = `
  <section class="sdr-card care-directory" aria-labelledby="care-directory-title">
    <div class="sdr-card-head"><div><h2 id="care-directory-title">Facility directory</h2><p>Choose a state and the facilities you want to reach.</p></div>
    <label class="care-state-field">State<select id="care-directory-state" data-states><option value="CT">CT</option></select></label></div>
    <div class="care-directory-options">
      <button type="button" data-browse-facility="nursing-home"><span class="care-directory-icon">${icon('nursing')}</span><span><strong>Nursing homes</strong><small>Medicare and Medicaid certified providers</small></span>${icon('arrow')}</button>
      <button type="button" data-browse-facility="senior-center"><span class="care-directory-icon">${icon('center')}</span><span><strong>Senior centers</strong><small>Community and senior activity centers</small></span>${icon('arrow')}</button>
    </div><p class="care-directory-note" id="care-directory-status" role="status"></p>
  </section>
  <section class="sdr-card care-accounts" aria-labelledby="care-accounts-title">
    <div class="sdr-card-head"><h2 id="care-accounts-title">Accounts to work</h2><button type="button" class="care-text-action" data-overview-action="pipeline">View pipeline ${icon('arrow')}</button></div>
    <div id="care-account-list"></div>
  </section>`;

function standaloneOverview(queue, careWorkspace) {
  return `<div class="sdr-overview-hero"><h2 id="sdr-greeting">Welcome back!</h2><p>Find businesses, build your pipeline, and close new partnerships.</p></div>
  <div class="sdr-overview-actions">${quickAction('Find businesses', 'research', 'green')}${quickAction('Add prospect', 'prospects', 'blue')}${quickAction('Open campaigns', 'campaigns', 'purple', !careWorkspace)}${quickAction('Create contract', 'contracts', 'orange')}</div>
  ${bookingOverview(icon)}
  <div class="sdr-overview-stats" id="sdr-overview-stats"></div>
  <section class="sdr-card sdr-category-research" id="sdr-category-research" aria-labelledby="sdr-category-title">
    <div class="sdr-card-head"><div><h2 id="sdr-category-title">Research a business type</h2><p>Find locations and published contacts across all 50 states and D.C.</p></div></div>
    <form class="sales-form sdr-category-form" id="sdr-category-form">
      <label>Business type<input required name="type" maxlength="80" placeholder="Senior center, nursing home, bakery…"></label>
      <label>City or ZIP<input required name="locality" maxlength="100" placeholder="Hartford or 06106"></label>
      <label>State<select required name="state" data-states><option value="CT">CT</option></select></label>
      <button type="submit" class="button primary">Research</button>
    </form>
    <p id="sdr-category-status" role="status" aria-live="polite"></p><div id="sdr-category-results"></div>
  </section>
  ${careWorkspace ? facilityOverview : ''}
  <div class="sdr-overview-grid"><div class="sdr-overview-column"><section class="sdr-card" id="sdr-onboarding"></section>${queue}</div>
  <div class="sdr-overview-column"><section class="sdr-card" id="sdr-overview-territory"></section><section class="sdr-card" id="sdr-overview-tasks"></section></div></div>`;
}

const workspaceTracker = `<div class="sdr-workspace-tracker"><div class="sdr-xp" title="10 XP per saved business, 20 per first contact, 30 per reply, and 40 per signed agreement"><div><strong id="sdr-xp-level">Level 1</strong><span id="sdr-xp-label">0 / 100 XP</span></div><progress id="sdr-xp-bar" aria-label="XP toward the next level" max="100" value="0"></progress></div>
<details id="sdr-earnings" hidden><summary><span>Earned to date</span><strong id="sdr-earning-amount">$0.00</strong></summary><div class="sdr-earnings-panel"><h2>Recorded earnings</h2><form id="sdr-earnings-form" class="sales-form"><label>Payment description<input name="label" maxlength="140" required></label><label>Amount received (USD)<input name="amount" inputmode="decimal" maxlength="12" placeholder="0.00" required></label><button class="button primary" type="submit">Record payment</button></form><div id="sdr-earnings-receipts"></div></div></details></div>`;
const sidebarProfile = `<button type="button" class="sdr-sidebar-profile" data-sdr-own-profile aria-label="Open My profile">
  <span class="sdr-sidebar-portrait" aria-hidden="true"><img alt="" width="42" height="42" hidden><span data-profile-initials></span></span>
  <span><strong data-profile-name></strong><small data-profile-role></small></span>
</button>`;

function section(markup, marker) {
  const start = markup.indexOf(marker);
  if (start < 0) throw new Error(`Missing private sales section: ${marker}`);
  const tags = /<\/?section\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0, match;
  while ((match = tags.exec(markup))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return markup.slice(start, tags.lastIndex);
  }
  throw new Error(`Unclosed private sales section: ${marker}`);
}

function territoryMap({ interactive = true } = {}) {
  const original = readFileSync(new URL('../../public/rideshare-tax-pros/assets/us-national-vision.svg', import.meta.url), 'utf8');
  const states = [...original.matchAll(/<path\s+data-state="([A-Z]{2})"\s+d="([^"]+)"/g)];
  if (states.length !== 51 || new Set(states.map(match => match[1])).size !== 51) throw new Error('The territory map must contain all 50 states and DC.');
  const paths = states.map(([, state, geometry]) => {
    if (!/^[MmLlHhVvCcSsQqTtAaZz\d.,+\-\s]+$/.test(geometry)) throw new Error('Unexpected territory map geometry.');
    const controls = interactive ? ` role="button" tabindex="0" aria-label="${state}: choose territory" aria-pressed="false"` : '';
    return `<path data-state="${state}" d="${geometry}"${controls}><title>${state}</title></path>`;
  }).join('');
  return interactive
    ? `<svg data-sales-state-map viewBox="0 0 1000 650" role="group" aria-label="United States territory map, including Alaska and Hawaii">${paths}</svg>`
    : `<svg viewBox="0 0 1000 650" role="img" aria-label="United States opportunity map">${paths}</svg>`;
}

const townMap = `<section id="territory-town-map" class="sdr-card territory-town-map" hidden aria-labelledby="town-map-title">
  <div class="sdr-card-head"><div><h2 id="town-map-title" tabindex="-1"></h2><p data-map-status role="status"></p></div><button type="button" class="button secondary" data-map-back>All states</button></div>
  <div class="town-map-tools" data-map-tools hidden>
    <label class="territory-lookup">Check territory availability<input type="search" data-territory-lookup maxlength="120" placeholder="Town, county, or facility"></label>
    <label>Jump to town<select data-map-town></select></label>
    <div class="town-map-actions">
      <button type="button" class="button secondary" data-map-streets>Show streets</button>
      <button type="button" class="button secondary" data-map-reset>Fit state</button>
      <button type="button" class="button secondary" data-map-roster aria-controls="territory-county-roster" aria-expanded="true">County leads</button>
      <label class="town-map-color-control"><input type="checkbox" data-map-colors checked>Map colors</label>
    </div>
  </div>
  <div class="territory-lookup-results" data-territory-matches hidden></div>
  <div class="town-map-layout"><div class="town-map-canvas" data-map-canvas hidden></div>
    <aside id="territory-county-roster" class="town-map-roster" aria-label="County leads" hidden>
      <h3>County leads</h3>
      <div data-county-list class="county-lead-list"></div>
    </aside></div>
  <section class="territory-map-selection" data-map-selection aria-label="Selected territory" aria-live="polite" hidden></section>
  <section id="territory-county-editor" class="territory-county-editor" data-county-editor aria-label="County assignment" hidden></section>
  <button type="button" class="button secondary" data-map-retry hidden>Retry map</button>
  <div class="town-map-caption" data-map-caption hidden>
    <span class="town-map-legend"><b aria-hidden="true">★</b> Capital <i aria-hidden="true"></i> City or town</span>
    <strong data-map-layer></strong><span role="status" data-map-tiles></span>
    <small>U.S. Census Bureau · Natural Earth · Cities adapted from <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>)</small>
  </div>
</section>`;

const standaloneFacilities = `<section data-tab-panel="facilities" aria-labelledby="sales-facilities-title" hidden>
  <div class="sdr-card territory-facilities" id="sales-territory-facilities">
  <div class="sdr-card-head"><h2 id="sales-facilities-title" data-facility-title>Facility directory</h2>
    <label class="care-state-field">State<select data-facility-state data-states></select></label>
  </div>
  <div class="territory-facility-categories" role="group" aria-label="Facility type">
    <button type="button" class="button secondary" data-facility-category="nursing-home" aria-pressed="true" aria-controls="sales-facility-results">Nursing homes</button>
    <button type="button" class="button secondary" data-facility-category="senior-center" aria-pressed="false" aria-controls="sales-facility-results">Senior community centers</button>
  </div>
  <form class="territory-facility-search" data-facility-search role="search" aria-label="Search state facilities">
    <label>Facility name, city, or ZIP<input type="search" data-facility-query maxlength="100" placeholder="Search this state"></label>
    <button type="submit" class="button secondary">Search</button>
  </form>
  <p class="territory-facility-coverage" data-facility-coverage hidden></p>
  <div class="territory-facility-sources" data-facility-sources hidden></div>
  <ul class="territory-facility-issues" data-facility-issues hidden></ul>
  <div class="territory-facility-status"><p role="status" aria-atomic="true" data-facility-status></p><button type="button" class="button secondary" data-facility-retry hidden>Retry</button></div>
  <ul class="territory-facility-results" id="sales-facility-results" data-facility-results hidden></ul>
  <nav class="territory-facility-pages" aria-label="Facility results pages" data-facility-pages hidden>
    <button type="button" class="button secondary" data-facility-previous disabled>Previous facilities</button>
    <button type="button" class="button secondary" data-facility-next disabled>Next facilities</button>
  </nav>
  </div>
</section>`;

const linkedInProspects = `  <div class="sdr-card">
    <div class="sdr-card-head"><h2>Saved prospects</h2><button id="sales-add-prospect" class="button primary" type="button">Add LinkedIn prospect</button></div>
    <form id="sales-filter-prospects" class="sales-form">
      <label>Find a saved prospect<input name="query" type="search" maxlength="140" placeholder="Name, company, role, location, or notes"></label>
      <label class="sales-check"><input name="archived" type="checkbox">Show archived</label>
      <div class="sales-actions"><button class="button secondary" type="submit">Search saved prospects</button></div>
    </form>
    <p id="sales-prospect-count" role="status" aria-live="polite"></p>
    <div id="sales-prospect-results"></div>
    <div id="sales-prospect-pagination" class="sales-actions" hidden>
      <button id="sales-prospect-previous" class="button secondary" type="button">Previous</button>
      <button id="sales-prospect-next" class="button secondary" type="button">Next</button>
    </div>
  </div>
  <section id="sales-prospect-editor" class="sdr-card" hidden aria-labelledby="sales-prospect-editor-title">
    <div class="sdr-card-head"><h3 id="sales-prospect-editor-title">Add prospect</h3></div>
    <form id="sales-save-prospect" class="sales-form">
      <label>LinkedIn profile or company URL<input name="sourceURL" type="url" maxlength="1200" required></label>
      <label>Person or company name<input name="name" maxlength="140" required></label>
      <label>Job title<input name="title" maxlength="160"></label>
      <label>Company<input name="company" maxlength="180"></label>
      <label>Location<input name="locality" maxlength="140"></label>
      <label>Notes<textarea name="note" rows="3" maxlength="2000"></textarea></label>
      <div class="sales-actions">
        <button class="button primary" type="submit">Save prospect</button>
        <button id="sales-cancel-prospect" class="button secondary" type="button">Cancel</button>
      </div>
    </form>
  </section>
  <div class="sdr-card">
    <div class="sdr-card-head"><div><h2>Find prospects on LinkedIn</h2><p>Sign into your LinkedIn account to search. Copy a profile URL to add it here.</p></div>
      <a class="button secondary" href="https://www.linkedin.com/feed/" target="_blank" rel="noopener noreferrer">Open LinkedIn ↗</a>
    </div>
    <form id="sales-linkedin-search" class="sales-form">
      <label>Search terms<input name="keywords" type="search" maxlength="240" required placeholder="Sales managers in Connecticut"></label>
      <div class="sales-actions">
        <button class="button primary" type="submit" name="kind" value="people">Search people ↗</button>
        <button class="button secondary" type="submit" name="kind" value="companies">Search companies ↗</button>
      </div>
    </form>
  </div>`;

const outreachCampaigns = `<div class="sdr-card">
    <div class="sdr-card-head"><h2>Campaign settings</h2><button id="sales-new-campaign" type="button" class="button secondary">New campaign</button></div>
    <label>Campaign <select id="sales-campaign-picker"><option value="">New campaign</option></select></label>
    <form id="sales-campaign-form" class="sales-form">
      <label>Campaign name<input name="campaignName" maxlength="120" required></label>
      <label>Your company<input name="business" maxlength="140" required></label>
      <label>What you offer<textarea name="offer" rows="3" maxlength="650" required></textarea></label>
      <label>What you want the prospect to do<input name="nextStep" maxlength="280" required placeholder="Reply to schedule a 15-minute call"></label>
      <label>Prospect keywords<input name="keywords" maxlength="100" required placeholder="Roofing companies"></label>
      <label>City<input name="city" maxlength="100" required></label>
      <label>State<select name="state" data-states required><option value="CT">CT</option></select></label>
      <label>Search source<select name="source"><option value="registry">Connecticut business registry</option><option value="directory">Project business directory</option><option value="saved">Saved LinkedIn prospects</option></select></label>
      <label>Maximum prospects per run<input name="limit" type="number" min="1" max="20" value="5" required></label>
      <label>Repeat every (minutes, 0 for manual)<input name="interval" type="number" min="0" max="10080" value="0" required></label>
      <label>Email mode<select name="mode"><option value="draft">Prepare drafts</option><option value="send">Research and send automatically</option></select></label>
      <label>Approved shared sender<select name="senderId"><option value="">Choose a sender</option></select></label>
      <label>Business mailing address for automatic email<input name="postalAddress" maxlength="240"></label>
      <div class="sales-actions">
        <button type="submit" class="button primary">Save campaign</button>
        <button id="sales-run-campaign" type="button" class="button secondary" disabled>Run now</button>
        <button id="sales-pause-campaign" type="button" class="button secondary" disabled>Pause schedule</button>
      </div>
    </form>
    <p id="sales-campaign-connection" role="status"></p>
  </div>
  <div class="sdr-card"><h2>Collected prospects</h2><div id="sales-campaign-results" aria-live="polite"></div></div>`;
const campaignsPanel = `<section data-tab-panel="campaigns" data-owner-only hidden aria-label="Outreach campaigns">${outreachCampaigns}</section>`;

function teamNavigation(careWorkspace) {
  const groups = [
    ['Meetings', [['calendar', 'Calendar'], ...(careWorkspace ? [['demo', 'Demo']] : [])]],
    ['Communication', [['chat', 'Team chat'], ['mail', 'Senders']]],
    ['Coverage & contacts', [['territories', 'Territories'], ['locations', 'Signup locations'], ['contacts', 'Owners & Rolodex']]],
  ];
  return `<nav class="sdr-team-tools" aria-label="Sales team tools" data-team-tools>
    ${groups.map(([title, tools]) => `<section><h3>${title}</h3><div>${tools.map(([name, label]) =>
      `<button type="button" data-tab="${name}" aria-pressed="false"${name === 'territories' ? ' id="sales-team-territories"' : ''}>${icon(name)}<span>${label}</span></button>`).join('')}</div></section>`).join('')}
  </nav>`;
}

function standaloneTeam(legacyTeam, careWorkspace) {
  const terms = section(legacyTeam, '<section id="sales-enrollment-terms"')
    .replace('<section id="sales-enrollment-terms">', '<section id="sales-enrollment-terms" class="sdr-team-setting-content" data-owner-only hidden>')
    .replace('<h3>Enrollment terms</h3>', '');
  const tabs = [['roster', 'Team roster'], ['profile', 'My profile'], ['invite', 'Invitations'], ['settings', 'Workspace settings']];
  return `<section class="sdr-team-workspace" data-tab-panel="team" aria-labelledby="sales-team-title" hidden>
    <header class="sdr-team-hero">
      <div class="sdr-team-hero-main">
        <div class="sdr-team-hero-title"><h2 id="sales-team-title">Sales team</h2><p>Reporting structure, agent profiles, and territory assignments</p></div>
        <div class="sdr-team-hero-actions">
          <button type="button" class="button primary" id="sales-team-add-rep">${icon('prospects')} Add sales agent</button>
        </div>
      </div>
      <img class="sdr-team-hero-art" src="/sales-team-territory-planning.webp" alt="" width="1000" height="500">
    </header>
    ${teamNavigation(careWorkspace)}
    <div class="sdr-team-surface">
      <div class="sdr-team-tabs" role="tablist" aria-label="Sales team workspace">
        ${tabs.map(([key, label], index) => `<button type="button" role="tab" id="sales-team-tab-${key}" data-team-view="${key}" aria-controls="sales-team-pane-${key}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}"${key === 'settings' ? ' data-owner-only hidden' : ''}>${label}</button>`).join('')}
      </div>
      <p id="sales-team-status" role="status" aria-live="polite"></p>
      <section class="sdr-team-pane sdr-team-roster" id="sales-team-pane-roster" role="tabpanel" aria-labelledby="sales-team-tab-roster" tabindex="0">
        <div class="sdr-team-pane-head"><div><h3>Reporting structure</h3><p id="sales-team-scope"></p></div><button type="button" id="sales-reload-team" class="button secondary">Refresh team</button></div>
        <div id="sales-team"></div>
      </section>
      <section class="sdr-team-pane sdr-team-profile" id="sales-team-pane-profile" role="tabpanel" aria-labelledby="sales-team-tab-profile" tabindex="0" hidden>
        <div class="sdr-team-pane-head"><div><h3>My profile</h3><div data-team-profile-progress></div><p>Your profile details are visible to teammates who can view your roster profile.</p></div></div>
        <form id="sales-team-profile" class="sales-form">
          <div class="sdr-team-profile-fields">
            <label class="sdr-team-profile-name">Name<input name="name" autocomplete="name" maxlength="140" disabled></label>
            <label>Work email<input name="email" type="email" autocomplete="email" maxlength="240" disabled></label>
            <label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="40" disabled></label>
          </div>
          <label>Display title<input name="displayTitle" autocomplete="organization-title" maxlength="100" aria-describedby="sales-profile-title-help" disabled>
            <small id="sales-profile-title-help">Appears under your name in the sidebar. Leave it blank to show your account role.</small>
          </label>
          <label>Bio<textarea name="bio" rows="3" maxlength="800" disabled></textarea></label>
          <div class="sdr-team-profile-photo">
            <img data-team-profile-preview alt="Headshot preview" width="64" height="64" hidden>
            <label>Headshot<input name="headshot" type="file" accept="image/*" disabled></label>
            <button type="button" class="button secondary" data-team-profile-remove hidden>Remove headshot</button>
          </div>
          <div class="sales-actions">
            <button type="submit" class="button primary" disabled>Save profile</button>
            <button type="button" class="button secondary" data-team-profile-reload hidden>Reload profile</button>
          </div>
          <p id="sales-team-profile-status" role="status" aria-live="polite"></p>
        </form>
      </section>
      <section class="sdr-team-pane" id="sales-team-pane-invite" role="tabpanel" aria-labelledby="sales-team-tab-invite" tabindex="0" hidden>
        <div class="sdr-team-pane-head"><div><h3>Add a sales agent</h3><p>Share the sign-in page and access code privately.</p></div></div>
        <form id="sales-create-agent" class="sales-form">
          <label>Name<input name="name" autocomplete="off" maxlength="140" required></label>
          <label>Business email<input name="email" type="email" autocomplete="off" maxlength="200" required></label>
          <label data-owner-only hidden>Reports to<select name="parentId"></select></label>
          <div><label>Territory states<input name="states" aria-describedby="sales-team-territory-hint" placeholder="CT, MA, NY"></label><p class="field-hint" id="sales-team-territory-hint">Leave blank to inherit the manager’s states and towns.</p></div>
          <button type="submit" class="button primary" disabled>Create access code</button>
        </form>
        <div id="sales-agent-code" hidden>
          <p>Share this code privately while it’s displayed here.</p><code class="sales-secret" id="sales-agent-code-value"></code>
          <div class="sales-actions">
            <button type="button" class="button secondary" id="sales-copy-team-code">Copy code</button>
            <button type="button" class="button secondary" id="sales-copy-team-link">Copy sign-in link</button>
            <button type="button" class="button secondary" id="sales-dismiss-team-code">Dismiss</button>
          </div>
        </div>
        <div data-owner-only hidden data-team-identity-portal>
          <p>For shared sign-in, link a staff account to its sales agent ID.</p>
          <button type="button" class="button secondary" id="sales-copy-login-link">Copy shared sign-in link</button>
        </div>
      </section>
      <section class="sdr-team-pane sdr-team-settings" id="sales-team-pane-settings" role="tabpanel" aria-labelledby="sales-team-tab-settings" tabindex="0" hidden>
        <div class="sdr-team-pane-head"><h3>Workspace settings</h3></div>
        <details class="sdr-team-setting">
          <summary>Town access</summary>
          <label>State <select id="sales-town-access-state" aria-controls="sales-territory-cities"></select></label>
          <div id="sales-territory-cities" hidden></div>
        </details>
        <details class="sdr-team-setting">
          <summary>Enrollment terms</summary>
          ${terms}
        </details>
        <details class="sdr-team-setting">
          <summary>Public app contact details</summary>
          <div class="sdr-team-setting-content" data-team-app-help></div>
        </details>
      </section>
    </div>
    <dialog class="sdr-team-member-dialog" data-team-member-profile aria-labelledby="sales-team-member-profile-title">
      <header class="sdr-team-member-dialog-heading">
        <div>
          <h3 id="sales-team-member-profile-title" data-team-member-profile-title>Sales agent profile</h3>
          <div data-team-member-profile-progress></div>
        </div>
        <button type="button" class="button secondary" data-team-member-profile-close autofocus>Close</button>
      </header>
      <p data-team-member-profile-status role="status"></p>
      <div data-team-member-profile-content hidden></div>
    </dialog>
  </section>`;
}

export function renderSalesConsole(page, { prospects = false, careWorkspace = false } = {}) {
  const login = section(page.main, '<section id="sales-login"');
  const discover = section(page.main, '<section data-tab-panel="discover"');
  const team = section(page.main, '<section data-tab-panel="team"');
  const legacyPipeline = section(page.main, '<section data-tab-panel="pipeline"');
  const queue = section(legacyPipeline, '<section id="sales-followups"');
  const toolbarStart = legacyPipeline.indexOf('<div class="sales-toolbar">');
  const toolbarEnd = legacyPipeline.indexOf('<div class="sales-columns">');
  if (toolbarStart < 0 || toolbarEnd <= toolbarStart) throw new Error('The pipeline toolbar is missing.');
  let toolbar = legacyPipeline.slice(toolbarStart, toolbarEnd);
  if (careWorkspace) {
    toolbar = toolbar.replace('<label>Waiting on', '<label>Facility type<select id="sales-facility-kind-filter" data-facility-kind-filter><option value="">All businesses and facilities</option><option value="facility">Facilities only</option><option value="nursing-home">Nursing homes</option><option value="senior-center">Senior centers</option><option value="assisted-living">Assisted living</option><option value="independent-living">Independent living</option><option value="long-term-care">Rehab / long-term care</option><option value="unclassified">Other businesses</option></select></label><label>Waiting on')
      .replace('Office, city or contact', 'Business, facility, city or contact').replace('Anyone / all offices', 'Anyone / all accounts').replace('Office reply', 'Facility reply');
  }
  const sidebarNav = prospects
    ? [['today', 'Today’s Plan'], ['home', 'Overview'], ...(careWorkspace ? [['mission', 'Mission']] : []), ['prospects', 'Prospects'], ['campaigns', 'Campaigns'], ['pipeline', 'Pipeline'],
      ...(careWorkspace ? [['demo', 'Demo'], ['products', 'Products']] : []), ['contracts', 'Contracts'], ['team', 'Sales team'], ['email', 'Mailbox'],
      ...(careWorkspace ? [['resources', 'Resources']] : []), ['training', 'Training'], ['certification', 'Certification'], ['support', 'Support']]
    : [['home', 'Overview'], ['pipeline', 'Pipeline'], ['contacts', 'Owners & Rolodex'], ['contracts', 'Contracts'], ['locations', 'Signup locations'],
      ['mail', 'Senders'], ['territories', 'Territories'], ['discover', 'Find offices'], ['team', 'Sales team']];
  const navButtons = sidebarNav.map(([name, label]) => {
    const button = `<button type="button" data-tab="${name}" aria-pressed="${name === (prospects ? 'today' : 'home')}"${(name === 'campaigns' && !careWorkspace) || (name === 'team' && !prospects) ? ' data-owner-only hidden' : ''}>${icon(name === 'today' ? 'calendar' : name)}<span>${label}</span>${name === 'pipeline' ? '<span class="sdr-nav-count" id="sales-nav-count">0</span>' : ''}</button>`;
    if (name !== 'team' || !prospects) return button;
    return `<div class="sdr-team-sidebar-group">${button}
      <div class="sdr-team-sidebar-child" hidden>
        <select id="sales-team-sidebar-section" aria-label="Sales team section"></select>
      </div>
    </div>`;
  }).join('');
  const signOut = '<button type="button" class="button secondary" id="sales-logout">Sign out</button>';
  const searchTarget = 'businesses';
  const standaloneHeader = `<header class="sdr-topbar">
    <form id="sdr-header-search" role="search">${icon('discover')}<input aria-label="Search saved ${searchTarget}, contacts, or locations" type="search" placeholder="Search ${searchTarget}, contacts, or locations…" maxlength="180"></form>
    <div class="sdr-topbar-right">${workspaceTracker}<div id="sales-revenue" hidden></div>${signOut}</div>
  </header>`;
  const hostedHeader = `<header class="sdr-topbar"><div><p class="eyebrow">Your office network</p><h1 id="sales-view-title">Overview</h1></div><div class="sdr-topbar-right"><div id="sales-revenue" hidden></div><div id="sales-identity" hidden><span class="sdr-user-avatar" aria-hidden="true">G</span><span id="sales-name"></span>${signOut}</div></div></header>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Office workspace | Gig Tax Pros</title><meta name="description" content="Private Gig Tax Pros office recruitment workspace."><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/sales.css"><link rel="stylesheet" href="/sales-console.css"><link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css"><link rel="stylesheet" href="/local-offices.css"><script src="/directory-admin.js" defer></script><script src="/sales-research.js" defer></script><script src="/sales-workflows.js" defer></script><script src="/sales-console.js" defer></script><script src="/sales-contacts.js" defer></script><script src="/sales-progress.js" defer></script><script src="/sales-contracts.js" defer></script><script src="/vendor/leaflet-1.9.4/leaflet.js" defer></script><script src="/local-contacts.js" defer></script><script src="/local-offices.js" defer></script><link rel="stylesheet" href="/territories.css"><script src="/territories.js" defer></script><script src="/sales.js" defer></script></head>
<body class="sales-console-page"><a class="sdr-skip" href="#sales-main">Skip to workspace</a><div class="sdr-ambient" aria-hidden="true"><i></i><i></i><i></i></div><div class="sales-console" data-sales-app>
<div id="sales-gate" class="sdr-gate"><div class="sdr-gate-brand"><img src="/assets/brand-mark.svg" width="42" height="42" alt=""><strong>Gig Tax Pros</strong></div>${login}<p id="sales-login-status" role="status" aria-live="polite"></p></div>
<div id="sales-workspace" class="sdr-layout" hidden><aside class="sdr-sidebar"><a class="sdr-brand" href="/" aria-label="Gig Tax Pros public website"><img src="/assets/brand-mark.svg" width="34" height="34" alt="">${prospects ? '<span class="sdr-brand-mark" aria-hidden="true">🚂</span><span><strong>TinkyTown</strong><small>By AgeWell Alliance</small></span>' : '<span><strong>Gig Tax Pros</strong><small>OFFICE NETWORK</small></span>'}</a>${prospects ? sidebarProfile : ''}<p class="sdr-sidebar-label">Workspace</p><nav class="sdr-nav sales-tabs" aria-label="Sales workspace">${navButtons}</nav><div class="sdr-sidebar-bottom">${prospects ? renderSupportSidebar() : ''}<span class="sdr-workspace-indicator">${prospects ? 'Workspace online' : 'Private team workspace'}</span><a href="/">Open public website ↗</a></div></aside>
<div class="sdr-main" id="sales-main" tabindex="-1">${prospects ? standaloneHeader : hostedHeader}<p id="sales-message" class="sales-message" role="status" aria-live="polite"></p><div class="sales-stats" id="sales-stats"></div>
${prospects ? renderToday({ icon, hasCalendar: true }) : ''}
<section data-tab-panel="home" aria-label="Workspace overview"${prospects ? ' hidden' : ''}>${prospects ? standaloneOverview(queue, careWorkspace) : '<div id="sales-dashboard"></div>' + queue}</section>
${prospects && careWorkspace ? renderMission(icon) : ''}
<section data-tab-panel="contracts" hidden aria-label="Office agreements and signatures"><div id="sales-contracts"></div></section>
${prospects ? renderPipelineWorkspace({ icon, toolbar, map: territoryMap({ interactive: false }) }) : `<section data-tab-panel="pipeline" hidden aria-label="Office pipeline"><div class="sdr-card-head"><div><h2>Your pipeline</h2><p>Manage business and facility contacts, sales stages, and next steps.</p></div><div class="sdr-view-toggle" role="group" aria-label="Pipeline layout"><button type="button" data-pipeline-view="list" aria-pressed="true">List</button><button type="button" data-pipeline-view="board" aria-pressed="false">Board</button></div></div><div id="sales-stage-strip" class="sdr-stage-strip" aria-label="Filter by stage"></div>${toolbar}<div id="sales-pipeline-list" class="sdr-pipeline-layout"><div id="sales-offices" class="sales-office-list"></div></div><div id="sales-board" class="sdr-board" hidden></div></section>`}
${careWorkspace ? standaloneFacilities : ''}
${prospects && careWorkspace ? renderProducts(icon) : ''}
${prospects && careWorkspace ? renderMonthlyPrizes(icon) : ''}
${prospects ? renderCertification(icon) : ''}
${discover}${prospects ? renderProspects({ icon, map: territoryMap(), linkedIn: linkedInProspects }) + (careWorkspace ? renderCareCampaign(outreachCampaigns) : campaignsPanel) + renderTraining() + renderTrainingDemo({ careWorkspace }) + renderTrainingPipeline() + renderSupport() : team}
${prospects ? renderSalesEmail(icon) : ''}
${prospects ? `<div class="sdr-team-group" data-team-workspace hidden>
  <button type="button" class="sdr-team-return" data-team-return hidden>${icon('arrow')} Sales team</button>
  ${standaloneTeam(team, careWorkspace)}` : ''}
${careWorkspace ? renderCareDemo() : ''}
${prospects ? bookingPanel() : ''}
<section data-tab-panel="contacts" hidden aria-label="Owners and contact Rolodex"><div id="sales-rolodex"></div></section><section data-tab-panel="locations" hidden aria-label="Signed office locations"><div id="sales-signup-locations"></div></section>
<section data-tab-panel="mail" hidden aria-label="Email senders">${prospects ? '<div id="sales-rep-email-settings"></div>' : ''}<div id="sales-mailboxes"></div></section>
<section data-tab-panel="territories"${prospects ? ' data-territory-dashboard' : ''} hidden aria-labelledby="sales-territory-title">
${prospects ? renderTerritoryHeader(icon) : '<div class="sdr-card-head"><div><h2 id="sales-territory-title">Your territories</h2><p>Choose a state, drill into towns and cities, and assign sales coverage.</p></div><span class="sdr-count-label">50 states + DC</span></div>'}
<div class="sdr-card"${prospects ? ' id="sales-territory-national"' : ''}>${prospects ? `<details><summary>Choose a state</summary><div id="sales-territory-cards" class="sdr-state-grid" aria-label="Choose a state territory"></div></details>` : ''}<div id="sales-territory-map" class="sdr-map">${territoryMap()}</div><p class="sdr-map-caption">Census state boundaries. Counts show offices saved in your pipeline, not current service coverage.</p></div>${prospects ? townMap : '<div id="sales-territory-cities" class="sdr-territory-cities"></div><div id="sales-territory-cards" class="sdr-state-grid" aria-label="Choose a state territory"></div>'}</section>
${prospects ? renderTeamChat(icon) + '</div>' : ''}</div>
<button type="button" id="sales-detail-backdrop" class="sdr-detail-backdrop" aria-label="Close office workspace" tabindex="-1" hidden></button><aside id="sales-detail-drawer" class="sdr-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="sales-detail-title" hidden><header class="sdr-detail-heading"><div><p class="eyebrow">Office workspace</p><h2 id="sales-detail-title">Office details</h2></div><button type="button" id="sales-detail-close" class="sdr-icon-button" aria-label="Close office details">×</button></header><p id="sales-detail-status" role="status" aria-live="polite"></p><section id="sales-detail" class="sales-panel" aria-live="polite"><h2>Your next conversation</h2><p>Select an office to see its record.</p></section></aside>${prospects ? renderSalesCoach(icon) : ''}</div></div></body></html>`;
}
