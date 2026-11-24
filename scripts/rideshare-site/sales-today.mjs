export function renderToday({ icon, hasCalendar = false }) {
  const filters = [
    ['all', 'All tasks'], ['follow-ups', 'Follow-ups'], ['meetings', 'Meetings'],
    ['outreach', 'Outreach'], ['pipeline', 'Pipeline'],
  ];
  const metrics = [
    ['totalProspects', 'Total prospects', 'blue'],
    ['inOutreach', 'In outreach', 'violet'],
    hasCalendar ? ['meetingsSet', 'Meetings set', 'gold'] : ['followUpsScheduled', 'Follow-ups scheduled', 'gold'],
    ['contractsPending', 'Contracts pending', 'green'],
  ];
  const scheduleAction = hasCalendar
    ? ['schedule-meeting', 'Schedule meeting', 'Open availability and booking links.', 'calendar']
    : ['schedule', 'Schedule follow-up', 'Set a date for your next conversation.', 'calendar'];
  const actions = [
    ['compose', 'Send email', 'Open the composer for a saved business.', 'mail'],
    scheduleAction,
    ['add-prospect', 'Add prospect', 'Save a business to your pipeline.', 'prospects'],
    ['proposal', 'Create proposal', 'Prepare an agreement for a business.', 'contracts'],
  ];
  const icons = ['mail', 'calendar', 'contacts', 'contracts', 'pipeline', 'discover', 'prospects', 'territories', 'arrow'];
  return `<section class="sdr-today" data-tab-panel="today" hidden aria-labelledby="today-plan-title">
    <header class="today-hero">
      <span class="today-hero-sun" aria-hidden="true">☀</span>
      <div><h2 data-today-greeting>Welcome back</h2><p>Here’s your personalized action plan for today.</p></div>
    </header>
    <div class="today-layout">
      <section class="today-card today-plan" aria-labelledby="today-plan-title">
        <header class="today-card-head today-plan-head">
          <div class="today-heading">${icon('calendar')}<div><h2 id="today-plan-title">Today’s Action Plan</h2><p>Tasks from your pipeline, follow-ups, and territory.</p></div></div>
          <div class="today-completion">
            <strong data-today-completed>0 of 0 completed</strong>
            <div><progress max="1" value="0" aria-label="Completed action plan tasks" data-today-progress></progress><span data-today-percent>0%</span></div>
          </div>
        </header>
        <div class="today-filters" data-today-filters role="group" aria-label="Filter action plan">
          ${filters.map(([key, label]) => `<button type="button" data-today-filter="${key}" aria-pressed="${key === 'all'}">${label} <span data-today-filter-count>(0)</span></button>`).join('')}
        </div>
        <p class="today-status" role="status" data-today-status></p>
        <ol class="today-tasks" data-today-tasks aria-label="Prioritized tasks"></ol>
        <p class="today-empty" data-today-tasks-empty hidden>No tasks waiting in this view.</p>
        <button type="button" class="today-task-action today-more" data-today-more hidden>Show more tasks</button>
      </section>
      <aside class="today-side" aria-label="Today’s workspace summaries">
        <section class="today-card" aria-labelledby="today-schedule-title">
          <header class="today-card-head">
            <div class="today-heading">${icon('calendar')}<h2 id="today-schedule-title">Today’s Schedule <span data-today-schedule-count></span></h2></div>
            <button type="button" class="today-text-button" data-today-schedule-link data-today-action="${hasCalendar ? 'calendar' : 'appointments'}">${hasCalendar ? 'View calendar' : 'View follow-ups'}</button>
          </header>
          <ul class="today-schedule" data-today-schedule></ul>
          <p class="today-empty" data-today-schedule-empty hidden>${hasCalendar ? 'No appointments or follow-ups scheduled for today.' : 'No follow-ups scheduled for today.'}</p>
        </section>
        <section class="today-card" aria-labelledby="today-pipeline-title">
          <header class="today-card-head">
            <div class="today-heading">${icon('pipeline')}<h2 id="today-pipeline-title">Pipeline at a Glance</h2></div>
            <button type="button" class="today-text-button" data-today-action="pipeline">View pipeline</button>
          </header>
          <dl class="today-metrics">
            ${metrics.map(([key, label, tone]) => `<div class="today-metric ${tone}"><dt>${label}</dt><dd data-today-metric="${key}">—</dd></div>`).join('')}
          </dl>
        </section>
        <section class="today-card" aria-labelledby="today-quick-title">
          <header class="today-card-head"><div class="today-heading">${icon('arrow')}<h2 id="today-quick-title">Quick Actions</h2></div></header>
          <div class="today-quick">
            ${actions.map(([key, label, detail, symbol]) => `<button type="button" data-today-action="${key}"${key === scheduleAction[0] ? ' data-today-schedule-action' : ''}>${icon(symbol)}<strong>${label}</strong><span>${detail}</span></button>`).join('')}
          </div>
          <div class="today-office-picker" data-today-office-picker hidden>
            <form class="sales-form" data-today-office-form>
              <label><span data-today-office-label>Choose a business</span><select name="office" required></select></label>
              <div class="sales-actions">
                <button type="submit" class="button primary">Continue</button>
                <button type="button" class="button secondary" data-today-office-cancel>Cancel</button>
              </div>
            </form>
            <div data-today-office-empty hidden>
              <p data-today-office-message>Save a business to your pipeline first.</p>
              <button type="button" class="button secondary" data-today-action="prospects">Open prospects</button>
              <button type="button" class="button secondary" data-today-office-cancel>Close</button>
            </div>
          </div>
        </section>
        <section class="today-card today-assistant" aria-labelledby="today-assistant-title">
          <header class="today-card-head"><div class="today-heading"><span class="today-sparkle" aria-hidden="true">✦</span><h2 id="today-assistant-title">Sales Assistant</h2></div></header>
          <div class="today-assistant-body">
            <h3>Today’s top recommendations</h3>
            <ul class="today-recommendations" data-today-recommendations></ul>
            <p class="today-empty" data-today-recommendations-empty hidden>No next actions waiting right now.</p>
            <button type="button" class="button today-recommend-button" data-today-refresh><span aria-hidden="true">✦</span> Refresh next actions</button>
            <p class="today-status" role="status" data-today-recommendation-status></p>
          </div>
        </section>
      </aside>
    </div>
    ${icons.map(name => `<template data-today-icon="${name}">${icon(name)}</template>`).join('')}
  </section>`;
}
