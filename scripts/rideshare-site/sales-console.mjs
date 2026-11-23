import { readFileSync } from 'node:fs';

// Presentation adapted from the existing online TinkySDR cockpit, embedded by
// TinkySDRMac: TinkySpeak-Web/outreach.html and css/outreach.css. The existing
// GigTax forms/API remain the source of truth; no generic tenant key is exposed.
const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z"/>',
  pipeline: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="14" rx="1"/>',
  territories: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
  discover: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5M10.5 8v5"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
  contracts: '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  locations: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  contacts: '<rect x="4" y="3" width="17" height="18" rx="2"/><path d="M2 7h4M2 12h4M2 17h4"/><circle cx="13" cy="9" r="2"/><path d="M9 17v-1a4 4 0 0 1 8 0v1"/>',
  prospects: '<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M19 8v6m-3-3h6"/>',
  campaigns: '<path d="M3 11h5l9-5v12l-9-4H3v-3Zm5 3 2 6m10-11 2-1m-2 7 2 1"/>',
};
const icon = name => `<svg class="sdr-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

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

function territoryMap() {
  const original = readFileSync(new URL('../../public/rideshare-tax-pros/assets/us-national-vision.svg', import.meta.url), 'utf8');
  const states = [...original.matchAll(/<path\s+data-state="([A-Z]{2})"\s+d="([^"]+)"/g)];
  if (states.length !== 51 || new Set(states.map(match => match[1])).size !== 51) throw new Error('The territory map must contain all 50 states and DC.');
  const paths = states.map(([, state, geometry]) => {
    if (!/^[MmLlHhVvCcSsQqTtAaZz\d.,+\-\s]+$/.test(geometry)) throw new Error('Unexpected territory map geometry.');
    return `<path data-state="${state}" d="${geometry}" role="button" tabindex="0" aria-label="${state}: choose territory" aria-pressed="false"><title>${state}</title></path>`;
  }).join('');
  return `<svg data-sales-state-map viewBox="0 0 1000 650" role="group" aria-label="United States territory map, including Alaska and Hawaii">${paths}</svg>`;
}

const prospectsPanel = `<section data-tab-panel="prospects" hidden aria-label="Saved prospects">
  <div class="sdr-card">
    <div class="sdr-card-head"><h2>Saved prospects</h2><button id="sales-add-prospect" class="button primary" type="button">Add prospect</button></div>
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
  </div>
</section>`;

const campaignsPanel = `<section data-tab-panel="campaigns" data-owner-only hidden aria-label="Outreach campaigns">
  <div class="sdr-card">
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
  <div class="sdr-card"><h2>Collected prospects</h2><div id="sales-campaign-results" aria-live="polite"></div></div>
</section>`;

export function renderSalesConsole(page, { prospects = false } = {}) {
  const login = section(page.main, '<section id="sales-login"');
  const discover = section(page.main, '<section data-tab-panel="discover"');
  const team = section(page.main, '<section data-tab-panel="team"');
  const legacyPipeline = section(page.main, '<section data-tab-panel="pipeline"');
  const queue = section(legacyPipeline, '<section id="sales-followups"');
  const toolbarStart = legacyPipeline.indexOf('<div class="sales-toolbar">');
  const toolbarEnd = legacyPipeline.indexOf('<div class="sales-columns">');
  if (toolbarStart < 0 || toolbarEnd <= toolbarStart) throw new Error('The pipeline toolbar is missing.');
  const toolbar = legacyPipeline.slice(toolbarStart, toolbarEnd);
  const nav = [['home', 'Overview'], ['pipeline', 'Pipeline'], ['contacts', 'Owners & Rolodex'], ['contracts', 'Contracts'], ['locations', 'Signup locations'], ['mail', 'Senders'], ['territories', 'Territories'], ['discover', 'Find offices'], ['team', 'Sales team']];
  if (prospects) nav.splice(nav.length - 1, 0, ['prospects', 'Prospects'], ['campaigns', 'Campaigns']);
  const navButtons = nav.map(([name, label]) => `<button type="button" data-tab="${name}" aria-pressed="${name === 'home'}"${['team', 'campaigns'].includes(name) ? ' data-owner-only hidden' : ''}>${icon(name)}<span>${label}</span>${name === 'pipeline' ? '<span class="sdr-nav-count" id="sales-nav-count">0</span>' : ''}</button>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Office workspace | Gig Tax Pros</title><meta name="description" content="Private Gig Tax Pros office recruitment workspace."><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/sales.css"><link rel="stylesheet" href="/sales-console.css"><link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css"><link rel="stylesheet" href="/local-offices.css"><script src="/directory-admin.js" defer></script><script src="/sales-research.js" defer></script><script src="/sales-workflows.js" defer></script><script src="/sales-console.js" defer></script><script src="/sales-contacts.js" defer></script><script src="/sales-progress.js" defer></script><script src="/sales-contracts.js" defer></script><script src="/vendor/leaflet-1.9.4/leaflet.js" defer></script><script src="/local-contacts.js" defer></script><script src="/local-offices.js" defer></script><link rel="stylesheet" href="/territories.css"><script src="/territories.js" defer></script><script src="/sales.js" defer></script></head>
<body class="sales-console-page"><a class="sdr-skip" href="#sales-main">Skip to workspace</a><div class="sdr-ambient" aria-hidden="true"><i></i><i></i><i></i></div><div class="sales-console" data-sales-app>
<div id="sales-gate" class="sdr-gate"><div class="sdr-gate-brand"><img src="/assets/brand-mark.svg" width="42" height="42" alt=""><strong>Gig Tax Pros</strong></div>${login}<p id="sales-login-status" role="status" aria-live="polite"></p></div>
<div id="sales-workspace" class="sdr-layout" hidden><aside class="sdr-sidebar"><a class="sdr-brand" href="/" aria-label="Gig Tax Pros public website"><img src="/assets/brand-mark.svg" width="34" height="34" alt=""><span><strong>Gig Tax Pros</strong><small>OFFICE NETWORK</small></span></a><p class="sdr-sidebar-label">Workspace</p><nav class="sdr-nav sales-tabs" aria-label="Sales workspace">${navButtons}</nav><div class="sdr-sidebar-bottom"><span class="sdr-workspace-indicator">Private team workspace</span><a href="/">Open public website ↗</a></div></aside>
<div class="sdr-main" id="sales-main" tabindex="-1"><header class="sdr-topbar"><div><p class="eyebrow">Your office network</p><h1 id="sales-view-title">Overview</h1></div><div class="sdr-topbar-right"><div id="sales-revenue" hidden></div><div id="sales-identity" hidden><span class="sdr-user-avatar" aria-hidden="true">G</span><span id="sales-name"></span><button class="button secondary" id="sales-logout">Sign out</button></div></div></header><p id="sales-message" class="sales-message" role="status" aria-live="polite"></p><div class="sales-stats" id="sales-stats"></div>
<section data-tab-panel="home" aria-label="Workspace overview"><div id="sales-dashboard"></div>${queue}</section>
<section data-tab-panel="contacts" hidden aria-label="Owners and contact Rolodex"><div id="sales-rolodex"></div></section><section data-tab-panel="contracts" hidden aria-label="Office agreements and signatures"><div id="sales-contracts"></div></section><section data-tab-panel="locations" hidden aria-label="Signed office locations"><div id="sales-signup-locations"></div></section><section data-tab-panel="mail" hidden aria-label="Shared and agent email senders"><div id="sales-mailboxes"></div></section>
<section data-tab-panel="pipeline" hidden aria-label="Office pipeline"><div class="sdr-card-head"><div><h2>Your pipeline</h2><p>Every office, every next step.</p></div><div class="sdr-view-toggle" role="group" aria-label="Pipeline layout"><button type="button" data-pipeline-view="list" aria-pressed="true">List</button><button type="button" data-pipeline-view="board" aria-pressed="false">Board</button></div></div><div id="sales-stage-strip" class="sdr-stage-strip" aria-label="Filter by stage"></div>${toolbar}<div id="sales-pipeline-list" class="sdr-pipeline-layout"><div id="sales-offices" class="sales-office-list"></div></div><div id="sales-board" class="sdr-board" hidden></div></section>
<section data-tab-panel="territories" hidden aria-labelledby="sales-territory-title"><div class="sdr-card-head"><div><h2 id="sales-territory-title">Your territories</h2><p>Choose a state, drill into towns and cities, and assign sales coverage.</p></div><span class="sdr-count-label">50 states + DC</span></div><div class="sdr-card"><div id="sales-territory-map" class="sdr-map">${territoryMap()}</div><p class="sdr-map-caption">Census state boundaries. Counts show offices saved in your pipeline, not current service coverage.</p></div><div id="sales-territory-cities" class="sdr-territory-cities"></div><div id="sales-territory-cards" class="sdr-state-grid" aria-label="Choose a state territory"></div></section>
${discover}${prospects ? prospectsPanel + campaignsPanel : ''}${team}</div>
<button type="button" id="sales-detail-backdrop" class="sdr-detail-backdrop" aria-label="Close office workspace" tabindex="-1" hidden></button><aside id="sales-detail-drawer" class="sdr-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="sales-detail-title" hidden><header class="sdr-detail-heading"><div><p class="eyebrow">Office workspace</p><h2 id="sales-detail-title">Office details</h2></div><button type="button" id="sales-detail-close" class="sdr-icon-button" aria-label="Close office details">×</button></header><p id="sales-detail-status" role="status" aria-live="polite"></p><section id="sales-detail" class="sales-panel" aria-live="polite"><h2>Your next conversation</h2><p>Select an office to see its record.</p></section></aside></div></div></body></html>`;
}
