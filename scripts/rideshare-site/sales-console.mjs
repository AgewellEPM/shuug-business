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

export function renderSalesConsole(page) {
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
  const navButtons = nav.map(([name, label]) => `<button type="button" data-tab="${name}" aria-pressed="${name === 'home'}"${name === 'team' ? ' data-owner-only hidden' : ''}>${icon(name)}<span>${label}</span>${name === 'pipeline' ? '<span class="sdr-nav-count" id="sales-nav-count">0</span>' : ''}</button>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Office workspace | Gig Tax Pros</title><meta name="description" content="Private Gig Tax Pros office recruitment workspace."><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/sales.css"><link rel="stylesheet" href="/sales-console.css"><link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css"><link rel="stylesheet" href="/local-offices.css"><script src="/directory-admin.js" defer></script><script src="/sales-research.js" defer></script><script src="/sales-workflows.js" defer></script><script src="/sales-console.js" defer></script><script src="/sales-contacts.js" defer></script><script src="/sales-progress.js" defer></script><script src="/sales-contracts.js" defer></script><script src="/vendor/leaflet-1.9.4/leaflet.js" defer></script><script src="/local-contacts.js" defer></script><script src="/local-offices.js" defer></script><script src="/sales.js" defer></script></head>
<body class="sales-console-page"><a class="sdr-skip" href="#sales-main">Skip to workspace</a><div class="sdr-ambient" aria-hidden="true"><i></i><i></i><i></i></div><div class="sales-console" data-sales-app>
<div id="sales-gate" class="sdr-gate"><div class="sdr-gate-brand"><img src="/assets/brand-mark.svg" width="42" height="42" alt=""><strong>Gig Tax Pros</strong><span>Office growth workspace</span></div>${login}<p id="sales-login-status" role="status" aria-live="polite"></p><p class="sdr-gate-note">Private access for your sales team.</p></div>
<div id="sales-workspace" class="sdr-layout" hidden><aside class="sdr-sidebar"><a class="sdr-brand" href="/" aria-label="Gig Tax Pros public website"><img src="/assets/brand-mark.svg" width="34" height="34" alt=""><span><strong>Gig Tax Pros</strong><small>OFFICE NETWORK</small></span></a><p class="sdr-sidebar-label">Workspace</p><nav class="sdr-nav sales-tabs" aria-label="Sales workspace">${navButtons}</nav><div class="sdr-sidebar-bottom"><span class="sdr-workspace-indicator">Private team workspace</span><a href="/">Open public website ↗</a></div></aside>
<div class="sdr-main" id="sales-main" tabindex="-1"><header class="sdr-topbar"><div><p class="eyebrow">Your office network</p><h1 id="sales-view-title">Overview</h1></div><div class="sdr-topbar-right"><div id="sales-revenue" hidden></div><div id="sales-identity" hidden><span class="sdr-user-avatar" aria-hidden="true">G</span><span id="sales-name"></span><button class="button secondary" id="sales-logout">Sign out</button></div></div></header><p id="sales-message" class="sales-message" role="status" aria-live="polite"></p><div class="sales-stats" id="sales-stats"></div>
<section data-tab-panel="home" aria-label="Workspace overview"><div id="sales-dashboard"></div>${queue}</section>
<section data-tab-panel="contacts" hidden aria-label="Owners and contact Rolodex"><div id="sales-rolodex"></div></section><section data-tab-panel="contracts" hidden aria-label="Office agreements and signatures"><div id="sales-contracts"></div></section><section data-tab-panel="locations" hidden aria-label="Signed office locations"><div id="sales-signup-locations"></div></section><section data-tab-panel="mail" hidden aria-label="Shared and agent email senders"><div id="sales-mailboxes"></div></section>
<section data-tab-panel="pipeline" hidden aria-label="Office pipeline"><div class="sdr-card-head"><div><h2>Your pipeline</h2><p>Every office, every next step.</p></div><div class="sdr-view-toggle" role="group" aria-label="Pipeline layout"><button type="button" data-pipeline-view="list" aria-pressed="true">List</button><button type="button" data-pipeline-view="board" aria-pressed="false">Board</button></div></div><div id="sales-stage-strip" class="sdr-stage-strip" aria-label="Filter by stage"></div>${toolbar}<div id="sales-pipeline-list" class="sdr-pipeline-layout"><div id="sales-offices" class="sales-office-list"></div></div><div id="sales-board" class="sdr-board" hidden></div></section>
<section data-tab-panel="territories" hidden aria-labelledby="sales-territory-title"><div class="sdr-card-head"><div><h2 id="sales-territory-title">Your territories</h2><p>Choose a state to find the next independent office.</p></div><span class="sdr-count-label">50 states + DC</span></div><div class="sdr-card"><div id="sales-territory-map" class="sdr-map">${territoryMap()}</div><p class="sdr-map-caption">Census state boundaries. Counts show offices saved in your pipeline, not current service coverage.</p></div><div id="sales-territory-cities" class="sdr-territory-cities"></div><div id="sales-territory-cards" class="sdr-state-grid" aria-label="Choose a state territory"></div></section>
${discover}${team}</div>
<button type="button" id="sales-detail-backdrop" class="sdr-detail-backdrop" aria-label="Close office workspace" tabindex="-1" hidden></button><aside id="sales-detail-drawer" class="sdr-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="sales-detail-title" hidden><header class="sdr-detail-heading"><div><p class="eyebrow">Office workspace</p><h2 id="sales-detail-title">Office details</h2></div><button type="button" id="sales-detail-close" class="sdr-icon-button" aria-label="Close office details">×</button></header><p id="sales-detail-status" role="status" aria-live="polite"></p><section id="sales-detail" class="sales-panel" aria-live="polite"><h2>Your next conversation</h2><p>Select an office to see its record.</p></section></aside></div></div></body></html>`;
}
