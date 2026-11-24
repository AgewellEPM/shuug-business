// The map and town controls are shared with the existing territory workflow.
const drawings = {
  pin: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 1a9 9 0 0 0-9 9c0 6 9 14 9 14s9-8 9-14a9 9 0 0 0-9-9Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>',
  check: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m7 12 3.3 3.5L17 8.8" stroke="white"/>',
  target: '<path d="M20.5 12a8.5 8.5 0 1 1-7.4-8.4M16.5 12a4.5 4.5 0 1 1-4.5-4.5M12 12l7.5-7.5M16 5l3-3v3h3l-3 3h-3z"/>',
  offices: '<rect x="5" y="2.5" width="14" height="19" rx="1.7"/><path d="M3 21.5h18M9 6.5h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1m-4 7v-4h2v4"/>',
  trend: '<path d="m2 18 6.5-6.5 4 4L22 6m-6 0h6v6"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r=".9"/><circle cx="3" cy="12" r=".9"/><circle cx="3" cy="19" r=".9"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
};
const metrics = [
  ['total', 'Territories', 'territories', 'blue'], ['active', 'Active territories', 'check', 'green'],
  ['reps', 'Assigned reps', 'team', 'violet'], ['coverage', 'Town coverage', 'target', 'amber'],
  ['offices', 'Saved offices', 'offices', 'blue'], ['month', 'New this month', 'trend', 'green'],
];
const tools = [
  ['map', 'Territory map', 'territories'], ['list', 'Territory list', 'list'], ['assignments', 'Assignments', 'team'],
  ['coverage', 'Coverage', 'target'], ['performance', 'Performance', 'trend'], ['assign', 'Assign a rep', 'plus'],
];
const stats = [
  ['lead', 'Assigned reps', 'team'], ['prospects', 'Pipeline prospects', 'discover'],
  ['signed', 'Signed contracts', 'contracts'], ['followups', 'Scheduled follow-ups', 'calendar'], ['offices', 'Saved offices', 'offices'],
];
const statuses = [['covered', 'Assigned'], ['working', 'In progress'], ['available', 'Unassigned']];
function ring(large) {
  const slices = large ? statuses.map(([key]) => key) : ['covered'];
  return `<div class="td-ring ${large ? 'td-ring-large' : ''}"><svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="td-ring-track" cx="50" cy="50" r="42"/>
    ${slices.map(key => `<circle class="td-ring-${key}" data-td-arc="${key}" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 50 50)"/>`).join('')}
    </svg><div><strong data-td-ring-value>—</strong>${large ? '<small>Towns</small>' : ''}</div></div>`;
}
export function renderTerritoryDashboard(nationalMap, townMap, sharedIcon) {
  const icon = name => drawings[name] ? `<svg class="sdr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[name]}</svg>` : sharedIcon(name);
  return `<section data-tab-panel="territories" data-territory-dashboard hidden aria-labelledby="sales-territory-title">
    <header class="sdr-territory-hero td-hero"><div class="td-hero-content">
      <div class="sdr-territory-hero-title">${icon('pin')}<div><h2 id="sales-territory-title">Territories</h2>
      <p>Explore sales territories, rep assignments, and coverage across your team.</p></div></div>
      <label class="sdr-territory-state-field"><span>State</span><select id="sales-territory-state"><option value="">All states</option></select></label>
    </div></header>
    <div class="td-metrics" aria-label="Territory totals">${metrics.map(([key, label, glyph, color]) =>
      `<div class="td-metric td-tint-${color}">${icon(glyph)}<div><span>${label}</span><strong data-td-metric="${key}">—</strong></div></div>`).join('')}</div>
    <div class="td-status" role="status" aria-live="polite"><span data-td-status></span><button type="button" data-td-retry hidden>Try again</button></div>
    <div class="td-workspace">
      <nav class="td-card td-tools" aria-label="Territory tools"><h3>Territory tools</h3><div>${tools.map(([id, label, glyph]) =>
        `<button type="button" data-td-tool="${id}"${id === 'assign' ? ' hidden' : ''} aria-pressed="${id === 'map'}">${icon(glyph)}<span>${label}</span></button>`).join('')}</div></nav>
      <div class="td-center"><div data-td-map>
        <div class="sdr-card td-national" id="sales-territory-national">
          <div class="td-map-heading"><h3>United States</h3><span data-td-map-count></span></div>
          <div id="sales-territory-map" class="sdr-map">${nationalMap}</div>
          <p class="td-map-key">State shading shows the number of saved offices.</p>
          <details><summary>Choose a state</summary><div id="sales-territory-cards" class="sdr-state-grid" aria-label="Choose a state territory"></div></details>
        </div>${townMap}
      </div><section class="td-card td-browser" data-td-browser hidden aria-labelledby="td-browser-title">
        <h3 id="td-browser-title" tabindex="-1">Territory list</h3><label>Find a territory<input type="search" data-td-search placeholder="Search by name"></label>
        <div class="td-browser-list" data-td-list></div></section></div>
      <aside class="td-card td-detail" data-td-detail aria-labelledby="td-detail-title">
        <div class="td-detail-heading">${icon('pin')}<div><h3 id="td-detail-title" tabindex="-1">All states</h3><p data-td-detail-sub></p></div></div>
        <div class="td-detail-coverage">${ring(false)}<div><strong>Town coverage</strong><small data-td-detail-coverage>Loading…</small></div></div>
        <dl>${stats.map(([key, label, glyph]) => `<div><dt>${icon(glyph)}${label}</dt><dd data-td-stat="${key}">—</dd></div>`).join('')}</dl>
        <button type="button" class="td-primary" data-td-manage hidden></button>
      </aside>
    </div>
    <div class="td-reports">
      <section class="td-card td-performance" data-td-performance tabindex="-1" aria-labelledby="td-performance-title">
        <div class="td-section-head"><h3 id="td-performance-title">${icon('territories')}Territory performance</h3>
          <button type="button" class="td-link" data-td-view-all aria-controls="td-performance-table" aria-expanded="false"><span>View all territories</span> ${icon('arrow')}</button></div>
        <div class="td-table-wrap"><table id="td-performance-table"><thead><tr><th>Territory</th><th>Towns</th><th>Assigned reps</th><th>Prospects</th><th>Contracts</th><th>Coverage</th><th title="Change in new offices compared with the same period last month">Office trend</th></tr></thead>
          <tbody data-td-table></tbody></table></div><p class="td-note" data-td-performance-note hidden></p>
      </section>
      <section class="td-card td-coverage" data-td-coverage tabindex="-1" aria-labelledby="td-coverage-title">
        <div class="td-section-head"><h3 id="td-coverage-title">${icon('target')}Coverage by status</h3></div>
        <div class="td-distribution">${ring(true)}<dl>${statuses.map(([key, label]) =>
          `<div><dt><i class="td-dot td-dot-${key}" aria-hidden="true"></i>${label}</dt><dd data-td-bucket="${key}">—</dd></div>`).join('')}</dl></div>
        <p class="td-note">Assigned towns have a county lead. In-progress towns have an active account or prospect and an open lead assignment.</p>
      </section>
    </div>
  </section>`;
}
