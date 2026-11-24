const drawings = {
  pin: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 1a9 9 0 0 0-9 9c0 6 9 14 9 14s9-8 9-14a9 9 0 0 0-9-9Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>',
  check: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m7 12 3.3 3.5L17 8.8" stroke="white"/>',
  target: '<path d="M20.5 12a8.5 8.5 0 1 1-7.4-8.4M16.5 12a4.5 4.5 0 1 1-4.5-4.5M12 12l7.5-7.5M16 5l3-3v3h3l-3 3h-3z"/>',
  offices: '<rect x="5" y="2.5" width="14" height="19" rx="1.7"/><path d="M3 21.5h18M9 6.5h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1m-4 7v-4h2v4"/>',
  trend: '<path d="m2 18 6.5-6.5 4 4L22 6m-6 0h6v6"/>',
};
const metrics = [
  ['total', 'Territories', 'territories', 'blue'], ['active', 'Active territories', 'check', 'green'],
  ['reps', 'Assigned reps', 'team', 'violet'], ['coverage', 'Town coverage', 'target', 'amber'],
  ['offices', 'Saved offices', 'offices', 'blue'], ['month', 'New this month', 'trend', 'green'],
];

export function renderTerritoryHeader(sharedIcon) {
  const icon = name => drawings[name] ? `<svg class="sdr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[name]}</svg>` : sharedIcon(name);
  return `<div class="td-header">
    <header class="sdr-territory-hero td-hero"><div class="td-hero-content">
      <div class="sdr-territory-hero-title">${icon('pin')}<div><h2 id="sales-territory-title">Territories</h2>
      <p>Explore sales territories, rep assignments, and coverage across your team.</p></div></div>
      <label class="sdr-territory-state-field"><span>State</span><select id="sales-territory-state"><option value="">All states</option></select></label>
    </div></header>
    <div class="td-metrics" aria-label="Territory totals">${metrics.map(([key, label, glyph, color]) =>
      `<div class="td-metric td-tint-${color}">${icon(glyph)}<div><span>${label}</span><strong data-td-metric="${key}">—</strong></div></div>`).join('')}</div>
    <div class="td-status" role="status" aria-live="polite"><span data-td-status></span><button type="button" data-td-retry hidden>Try again</button></div>
  </div>`;
}
