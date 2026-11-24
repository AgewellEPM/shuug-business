(() => {
  'use strict';
  const format = new Intl.NumberFormat('en-US');

  function mount(api) {
    const panel = document.querySelector('[data-territory-dashboard]');
    if (!panel) return null;
    const cells = panel.querySelectorAll('[data-td-metric]');
    const status = panel.querySelector('[data-td-status]'), retry = panel.querySelector('[data-td-retry]');
    let state, generation = 0, dirty = true, queued = false, loaded = false;

    function render(report) {
      const totals = report?.total;
      const values = { total: report?.rows.length, active: report?.active, reps: totals?.repCount,
        coverage: totals?.coverage, offices: totals?.offices, month: totals?.added };
      for (const cell of cells) {
        const metric = cell.dataset.tdMetric, value = values[metric];
        cell.textContent = value == null ? '—' : format.format(value) + (metric === 'coverage' ? '%' : '');
      }
    }
    async function refresh() {
      const request = ++generation;
      status.textContent = loaded ? '' : 'Loading territory totals…';
      retry.hidden = true;
      try {
        const report = await api('territory-dashboard', { state });
        if (request !== generation) return;
        render(report);
        loaded = true;
        status.textContent = '';
      } catch (error) {
        if (request !== generation) return;
        status.textContent = error.message || 'Territory totals could not load.';
        retry.hidden = false;
      }
    }
    function reset() {
      generation++;
      state = undefined;
      dirty = true; loaded = false;
      status.textContent = ''; retry.hidden = true;
      render();
    }
    function show(region, force = false) {
      if (state !== region) { reset(); state = region; }
      if (force) dirty = true;
      if (queued || !dirty || panel.hidden) return;
      queued = true;
      // Navigation can open Territories and select a state in the same turn.
      queueMicrotask(() => {
        queued = false;
        if (panel.hidden || !dirty) return;
        dirty = false;
        void refresh();
      });
    }
    retry.onclick = () => show(state, true);
    return { show, reset };
  }
  window.SdrTerritoryDashboard = { mount };
})();
