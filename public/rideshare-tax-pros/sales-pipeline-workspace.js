(() => {
  'use strict';
  const groups = [
    { id: 'lead', label: 'Lead', stages: ['new', 'researching'] },
    { id: 'engaged', label: 'Contacted', stages: ['contacted', 'replied', 'waiting'] },
    { id: 'demo', label: 'Demo / Interest', stages: ['meeting', 'interested'] },
    { id: 'proposal', label: 'Proposal', stages: ['invited', 'contract_sent'] },
    { id: 'won', label: 'Won', stages: ['contract_signed', 'active'] },
  ];
  const closed = ['not_interested', 'do_not_contact'];
  const stageOf = office => office.pipeline?.stage || office.status;
  const date = (value, clock = false) => new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleString('en-US',
    clock ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' });
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  const node = (tag, value) => {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    return element;
  };
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const byTime = (a, b) => Date.parse(b.at) - Date.parse(a.at);

  function groupRows(rows) {
    const unknown = rows.filter(office => !groups.some(group => group.stages.includes(stageOf(office))));
    const grouped = groups.map(group => ({ ...group, rows: rows.filter(office => group.stages.includes(stageOf(office))) }));
    if (unknown.length) grouped.push({ id: 'closed', label: 'Closed / Other', rows: unknown });
    return grouped;
  }

  function mount({ listen, act, onSelect, onNavigate, onMode, onExport }) {
    const root = document.querySelector('.sdr-pipeline-workspace');
    if (!root) return null;
    const $ = selector => root.querySelector(selector);
    const $$ = selector => [...root.querySelectorAll(selector)];
    const panes = $$('[data-pipeline-part]'), navigation = $$('[data-pipeline-page][aria-pressed]');
    const map = $('.pipeline-map svg'), states = $$('.pipeline-map path[data-state]');
    let page = 'overview', rows = [], tasks = [], events = [];
    const visible = {
      list: ['board'], tasks: ['tasks'], forecast: ['forecast'], reports: ['analytics', 'activity'],
    };
    function empty(text) {
      const item = node('li', text);
      item.className = 'pipeline-empty';
      return item;
    }
    function items(host, records, limit, none) {
      host.replaceChildren(...(records.length ? records.slice(0, limit).map(record => {
        const item = node('li'), button = node('button');
        button.type = 'button';
        button.dataset.pipelineOffice = String(record.office.id);
        button.append(node('strong', record.label), node('small', [record.office.town, record.time].filter(Boolean).join(' · ')));
        item.append(button);
        return item;
      }) : [empty(none)]));
    }
    function renderFeed() {
      items($('[data-pipeline-tasks]'), tasks, page === 'tasks' ? tasks.length : 5, 'No next actions for these opportunities.');
      items($('[data-pipeline-events]'), events, page === 'reports' ? events.length : 5, 'Recorded activity appears here.');
    }
    function show(view) {
      page = view;
      root.dataset.pipelinePage = view;
      navigation.forEach(control => control.setAttribute('aria-pressed', String(control.dataset.pipelinePage === view)));
      panes.forEach(pane => { pane.hidden = view !== 'overview' && !visible[view].includes(pane.dataset.pipelinePart); });
      $('[data-pipeline-insights]').hidden = !['overview', 'reports', 'tasks'].includes(view);
      $('[data-pipeline-bottom]').hidden = !['overview', 'forecast'].includes(view);
      if (view === 'list' || view === 'overview') onMode(view === 'list' ? 'list' : 'board');
      renderFeed();
    }
    function stat(id, value) { $(`[data-pipeline-kpi="${id}"] dd`).textContent = value; }
    function render({ rows: visibleRows, data }) {
      rows = visibleRows;
      const ids = new Set(rows.map(office => String(office.id)));
      const contracts = (data.contracts || []).filter(contract => ids.has(String(contract.officeId)));
      const now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const won = rows.filter(office => office.pipeline?.converted || groups[4].stages.includes(stageOf(office)));
      const winsThisMonth = new Set(contracts.filter(contract => contract.signed && Date.parse(contract.signedAt) >= monthStart && Date.parse(contract.signedAt) <= now.getTime()).map(contract => String(contract.officeId)));
      const losses = rows.filter(office => !office.pipeline?.converted && stageOf(office) === 'not_interested').length;
      const pipeline = rows.filter(office => !office.pipeline?.converted && ![...closed, ...groups[4].stages].includes(stageOf(office)));
      const revenue = rows.length === data.offices.length ? data.revenue : null;
      stat('total', rows.length);
      stat('active', pipeline.length);
      stat('agreements', new Set(contracts.filter(contract => contract.status === 'awaiting_signature').map(contract => String(contract.officeId))).size);
      stat('won', winsThisMonth.size);
      stat('revenue', revenue?.signedOffices ? money(revenue.signedRevenueCents) : '—');
      stat('rate', won.length + losses ? `${Math.round(100 * won.length / (won.length + losses))}%` : '—');

      const count = $$('#sales-filter, #sales-stage-filter, #sales-attention-filter, #sales-facility-kind-filter')
        .filter(element => element.value.trim() && element.value !== 'all').length;
      const filterCount = $('[data-pipeline-filter-count]');
      filterCount.textContent = count;
      filterCount.hidden = !count;

      $('[data-pipeline-stage-mix]').replaceChildren(...groupRows(rows).map(group => {
        const item = node('li'), bar = node('progress');
        item.dataset.stage = group.id;
        bar.max = rows.length || 1;
        bar.value = group.rows.length;
        bar.setAttribute('aria-label', group.label);
        item.append(node('strong', group.label), node('span', group.rows.length), bar);
        return item;
      }));
      tasks = rows.filter(office => !closed.includes(stageOf(office)) && office.pipeline?.waitingOn !== 'none' && office.pipeline?.nextAction)
        .map(office => {
          const due = office.pipeline.nextDue;
          return { office, label: office.pipeline.nextAction, due, time: validTime(due) ? `Due ${date(due)}` : '' };
        }).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.office.town.localeCompare(b.office.town));
      $('[data-pipeline-task-count]').textContent = `(${tasks.length})`;
      events = rows.flatMap(office => [
        ['Agreement signed', office.pipeline?.contract?.signedAt],
        ['Reply recorded', office.pipeline?.lastReply?.at],
        ['Contact recorded', office.pipeline?.lastContact?.at],
        ['Opportunity saved', office.created_at],
      ].filter(([, at]) => validTime(at)).map(([label, at]) => ({ office, label, at, time: date(at, true) }))).sort(byTime);
      renderFeed();

      const counts = new Map();
      for (const office of rows) {
        if (office.state) counts.set(office.state, (counts.get(office.state) || 0) + 1);
      }
      for (const path of states) {
        const state = path.dataset.state, stateCount = counts.get(state) || 0;
        path.classList.toggle('has-opportunities', stateCount > 0);
        path.querySelector('title').textContent = `${state} · ${stateCount} ${stateCount === 1 ? 'opportunity' : 'opportunities'}`;
      }
      map.setAttribute('aria-label', counts.size
        ? `United States opportunity map. ${[...counts.entries()].sort().map(([state, count]) => `${state}: ${count}`).join(', ')}`
        : 'United States opportunity map. No saved locations.');
      $('[data-pipeline-map-summary]').textContent = `${plural(counts.size, 'state')} with saved opportunities`;

      const totals = [
        ['Signed agreements', contracts.filter(contract => contract.signed).length],
        ['Signed contract value', revenue?.signedOffices ? money(revenue.signedRevenueCents) : '—'],
      ];
      $('[data-pipeline-revenue]').replaceChildren(...totals.map(([label, value]) => {
        const item = node('div');
        item.append(node('dt', label), node('dd', value));
        return item;
      }));
      const months = Array.from({ length: 5 }, (_, index) => {
        const start = new Date(now.getFullYear(), now.getMonth() - 4 + index, 1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        return {
          label: start.toLocaleString('en-US', { month: 'short' }),
          count: contracts.filter(contract => contract.signed && Date.parse(contract.signedAt) >= start && Date.parse(contract.signedAt) < end).length,
        };
      });
      const max = Math.max(1, ...months.map(month => month.count));
      $('[data-pipeline-months]').replaceChildren(...months.map(month => {
        const item = node('li'), bar = node('progress');
        bar.max = max;
        bar.value = month.count;
        bar.setAttribute('aria-label', `${month.label} agreements signed`);
        item.append(node('strong', month.count), bar, node('span', month.label));
        return item;
      }));
    }

    listen(root, 'click', event => {
      const control = event.target.closest('button');
      if (!control) return;
      const view = control.dataset.pipelinePage || control.dataset.pipelineJump;
      if (view === 'calendar') return act(() => onNavigate('calendar'));
      if (view) {
        show(view);
        if (control.hasAttribute('data-pipeline-jump')) root.querySelector(`[data-pipeline-page="${view}"]`).focus();
      } else if (control.hasAttribute('data-pipeline-map')) act(() => onNavigate('territories'));
      else if (control.hasAttribute('data-pipeline-export')) act(() => onExport(rows));
      else if (control.hasAttribute('data-pipeline-add')) {
        act(() => {
          onNavigate('prospects');
          document.querySelector('[data-prospect-add]')?.click();
        });
      } else if (control.dataset.pipelineOffice) act(() => onSelect(control.dataset.pipelineOffice));
    });
    return { render, groupRows };
  }

  window.SdrPipelineWorkspace = { mount };
})();
