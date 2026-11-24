const glyphs = {
  home: '<path d="m3 10 9-7 9 7v10H4V10m5 10v-7h6v7"/>',
  catalog: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
  paths: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
  certificates: '<circle cx="12" cy="9" r="5"/><path d="m9 14-2 7 5-3 5 3-2-7"/>',
  live: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 10h18M8 15h4"/>',
  faqs: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.9 2.1c-1.1.7-1.4 1.2-1.4 2.4M12 17h.01"/>',
  playbooks: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
  demo: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
  plan: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
};
const icon = name => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`;
const art = name => `<img class="training-reference-icon" src="/training-art/${name}.png" alt="">`;

const metrics = [
  ['progress', 'progress', 'My Progress'],
  ['completed', 'complete', 'Courses Completed'],
  ['certificates', 'certificate', 'Certificates Earned'],
  ['time', 'time', 'Training Time'],
  ['milestone', 'milestone', 'Next Milestone'],
];

const menu = [
  ['home', 'Training Home'], ['catalog', 'Course Catalog'], ['paths', 'Learning Paths'],
  ['certificates', 'Certifications'], ['live', 'Live Training'], ['faqs', 'FAQs'], ['plan', 'My Plan'],
  ['playbooks', 'Field Playbooks'], ['demo', 'Demo Lab'],
];

const sections = [
  ['paths', 'paths', 'Learning Paths', 'View All Paths'],
  ['live', 'calendar', 'Upcoming Live Training', 'View Calendar'],
  ['catalog', 'catalog', 'Course Catalog', 'View All Courses'],
  ['certificates', 'certificates', 'My Certifications', 'View All'],
];

export function renderTraining() {
  return `<section class="sdr-training" data-tab-panel="training" aria-labelledby="training-title" hidden>
    <a class="training-link training-support-link" href="#view=support">← Back to Support</a>
    <header class="training-hero">${art('cap')}<div>
      <h1 id="training-title">Training Center</h1>
      <p>Learn the platform, master the sales process, and succeed with TinkyTown.</p>
    </div></header>
    <section class="training-metrics" aria-label="My training summary">${metrics.map(([name, glyph, label]) => `
      <div class="training-metric training-metric-${name}">${art(glyph)}<div><span>${label}</span>
        <strong data-training-metric="${name}">—</strong>
        ${name === 'progress' ? '<progress data-training-progress max="100" value="0" aria-label="Course completion"></progress>' : ''}
      </div></div>`).join('')}</section>
    <p data-training-status role="status" hidden></p>
    <div class="training-feature-grid">
      <nav class="training-hub training-card" aria-label="Training Hub">
        <h2>Training Hub</h2>
        ${menu.map(([name, label]) => `<button type="button" data-training-nav="${name}"${name === 'home' ? ' aria-current="page"' : ''}>${icon(name)}<span>${label}</span></button>`).join('')}
      </nav>
      <article class="training-feature training-card" aria-label="Featured course" data-training-feature></article>
      <section class="training-card training-content" data-training-content hidden aria-label="Training details"></section>
    </div>
    <div class="training-board-grid" data-training-home>
      ${sections.map(([name, glyph, title, action]) => `<section class="training-card training-board training-board-${name}" aria-labelledby="training-${name}-title">
        <header class="training-card-head"><h2 id="training-${name}-title">${icon(glyph)}${title}</h2>
          <button type="button" class="training-link" data-training-open="${name}">${action} ${icon('arrow')}</button>
        </header>
        <div data-training-home-section="${name}"></div>
      </section>`).join('')}
    </div>
  </section>`;
}
