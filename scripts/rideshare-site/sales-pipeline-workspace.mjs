export function renderPipelineWorkspace({ icon, toolbar, map, seniorCare }) {
  const nav = [
    ['overview', 'pipeline', 'Pipeline overview'], ['list', 'prospects', 'Opportunities'],
    ['tasks', 'contracts', 'Tasks'], ['calendar', 'calendar', 'Calendar'],
    ['forecast', 'forecast', 'Forecast'], ['reports', 'reports', 'Reports'],
  ];
  const stats = [
    ['total', 'prospects', 'Total opportunities'], ['active', 'pipeline', 'Active pipeline'],
    ['agreements', 'contracts', 'Awaiting signature'], ['won', 'check', 'Won this month'],
    ['revenue', 'revenue', 'Signed contract value'], ['rate', 'forecast', 'Win rate'],
  ];
  return `<section data-tab-panel="pipeline" class="sdr-pipeline-workspace" hidden aria-labelledby="sales-pipeline-title">
  <header class="pipeline-hero">
    <div class="pipeline-hero-brand">${icon('pipeline')} <span>${seniorCare ? 'TinkyTown' : 'Gig Tax Pros'}</span></div>
    <h1 id="sales-pipeline-title">Pipeline</h1>
    <p>Track ${seniorCare ? 'facility partnerships' : 'sales opportunities'} from first contact to signed agreement.</p>
  </header>
  <nav class="pipeline-navigation" aria-label="Pipeline views">
    ${nav.map(([view, symbol, label]) => `<button type="button" data-pipeline-page="${view}"${view !== 'calendar' ? ` aria-pressed="${view === 'overview'}"` : ''}>${icon(symbol)}<span>${label}</span></button>`).join('')}
    <button type="button" data-pipeline-export>${icon('download')}<span>Export</span></button>
  </nav>
  <dl class="pipeline-kpis" aria-label="Pipeline metrics">
    ${stats.map(([name, symbol, label]) => `<div class="pipeline-kpi" data-pipeline-kpi="${name}">${icon(symbol)}<dt>${label}</dt><dd>—</dd></div>`).join('')}
  </dl>
  <section class="pipeline-card pipeline-sales" data-pipeline-part="board" aria-labelledby="sales-pipeline-board-title">
    <div class="pipeline-card-heading"><h2 id="sales-pipeline-board-title">${icon('pipeline')} Sales pipeline</h2>
      <div class="pipeline-board-actions">
        <div class="sdr-view-toggle" role="group" aria-label="Pipeline layout"><button type="button" data-pipeline-view="board" aria-pressed="true">Board</button><button type="button" data-pipeline-view="list" aria-pressed="false">List</button></div>
        <button class="button primary" type="button" data-pipeline-add>Add opportunity</button>
      </div>
    </div>
    <details class="pipeline-filters"><summary>Filters <span data-pipeline-filter-count hidden></span></summary>
      ${toolbar}
      <div id="sales-stage-strip" class="sdr-stage-strip" aria-label="Filter by stage"></div>
    </details>
    <div id="sales-pipeline-list" class="sdr-pipeline-layout" hidden><div id="sales-offices" class="sales-office-list"></div></div>
    <div id="sales-board" class="sdr-board"></div>
  </section>
  <div class="pipeline-insights" data-pipeline-insights>
    <section class="pipeline-card" data-pipeline-part="analytics" aria-labelledby="pipeline-analytics-title">
      <div class="pipeline-card-heading"><h2 id="pipeline-analytics-title">${icon('forecast')} Pipeline analytics</h2></div>
      <ul class="pipeline-stage-mix" data-pipeline-stage-mix aria-label="Current opportunities by stage"></ul>
    </section>
    <section class="pipeline-card" data-pipeline-part="activity" aria-labelledby="pipeline-activity-title">
      <div class="pipeline-card-heading"><h2 id="pipeline-activity-title">${icon('chat')} Activity feed</h2><button type="button" class="pipeline-link" data-pipeline-jump="reports">View reports ${icon('arrow')}</button></div>
      <ul class="pipeline-events" data-pipeline-events></ul>
    </section>
    <section class="pipeline-card" data-pipeline-part="tasks" aria-labelledby="pipeline-tasks-title">
      <div class="pipeline-card-heading"><h2 id="pipeline-tasks-title">${icon('contracts')} Next actions <span data-pipeline-task-count></span></h2></div>
      <ul class="pipeline-events" data-pipeline-tasks></ul>
    </section>
  </div>
  <div class="pipeline-bottom" data-pipeline-bottom>
    <section class="pipeline-card" data-pipeline-part="map" aria-labelledby="pipeline-map-title">
      <div class="pipeline-card-heading"><h2 id="pipeline-map-title">${icon('territories')} Opportunity map</h2><button type="button" class="pipeline-link" data-pipeline-map>View map ${icon('arrow')}</button></div>
      <div class="pipeline-map">${map}</div>
      <p data-pipeline-map-summary></p>
    </section>
    <section class="pipeline-card" data-pipeline-part="forecast" aria-labelledby="pipeline-forecast-title">
      <div class="pipeline-card-heading"><h2 id="pipeline-forecast-title">${icon('forecast')} Revenue forecast</h2></div>
      <dl class="pipeline-revenue" data-pipeline-revenue></dl>
      <p data-pipeline-forecast-state>Forecast unavailable. Opportunity amounts and close dates are needed for a revenue projection.</p>
      <h3 class="pipeline-chart-title">Agreements signed by month</h3>
      <ul class="pipeline-months" data-pipeline-months></ul>
    </section>
  </div>
</section>`;
}
