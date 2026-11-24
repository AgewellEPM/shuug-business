(() => {
  'use strict';
  const fmt = new Intl.NumberFormat('en-US');
  const count = value => value == null ? '—' : fmt.format(value);
  const pct = value => value == null ? '—' : value + '%';
  const reps = row => row.lead || (row.repCount ? count(row.repCount) + ' reps' : 'Unassigned');
  const statuses = ['covered', 'working', 'available'];
  const titles = { list: 'Territory list', assignments: 'Rep assignments', assign: 'Assign a rep' };
  function element(tag, text, cls) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  function ring(host, values, label) {
    let offset = 0;
    for (const arc of host.querySelectorAll('[data-td-arc]')) {
      const portion = values?.towns ? 100 * values[arc.dataset.tdArc] / values.towns : 0;
      arc.setAttribute('stroke-dasharray', portion + ' ' + (100 - portion));
      arc.setAttribute('stroke-dashoffset', String(-offset));
      offset += portion;
    }
    host.querySelector('[data-td-ring-value]').textContent = label;
  }
  function mount(api) {
    const root = document.querySelector('[data-territory-dashboard]');
    if (!root) return null;
    const $ = selector => root.querySelector(selector);
    const field = key => $('[data-td-' + key + ']');
    const picker = root.querySelector('#sales-territory-state');
    const status = field('status'), retry = field('retry'), browser = field('browser'), search = field('search');
    const detail = field('detail'), coverage = field('coverage'), manage = field('manage');
    let state, report, bridge, selection = '', place = '', tool = 'map', owner = false, generation = 0;
    let ordered = [], index = new Map(), queued = false, dirty = true, allRows = false, openStateTool;
    const selected = () => index.get(selection) || report?.total;
    const scopeName = () => state ? (picker.options[picker.selectedIndex]?.text || state) : 'All states';
    function setText(key, value) { field(key).textContent = value; }
    function focusSection(section) {
      section.focus({ preventScroll: true });
      section.scrollIntoView?.({ behavior: 'auto', block: 'nearest' });
    }
    function chooseState(code) {
      const option = [...picker.options].find(item => item.value === code && !item.disabled);
      if (!option) return;
      picker.value = code;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function renderTools() {
      const mayAssign = state ? Boolean(bridge?.canAssign) : owner && Boolean(report?.rows.length);
      $('[data-td-tool="assign"]').hidden = !mayAssign;
      for (const btn of root.querySelectorAll('[data-td-tool]')) btn.setAttribute('aria-pressed', String(btn.dataset.tdTool === tool));
      field('map').hidden = Boolean(titles[tool]);
      browser.hidden = !field('map').hidden;
    }
    function renderDetail() {
      const row = selected(), local = index.has(selection);
      $('#td-detail-title').textContent = row?.label || row?.name || scopeName();
      const sub = [];
      if (row) {
        sub.push(count(row.towns) + (row.towns === 1 ? ' town' : ' towns'));
        if (local && state) sub.push(place && place !== row.label && place !== row.name ? place : scopeName());
        else if (local) sub.push(row.id);
        else if (report.rows.length) sub.push(count(report.rows.length) + (state ? ' areas' : ' state territories'));
      }
      setText('detail-sub', sub.join(' · '));
      ring(detail, row, pct(row?.coverage));
      setText('detail-coverage', row ? count(row.covered) + ' of ' + count(row.towns) + ' towns assigned' : 'Loading…');
      for (const cell of detail.querySelectorAll('[data-td-stat]')) {
        const key = cell.dataset.tdStat;
        cell.textContent = !row ? '—' : key === 'lead' ? reps(row) : count(row[key]);
      }
      manage.hidden = !report?.rows.length;
      manage.disabled = Boolean(state && local && !bridge);
      if (!state) manage.textContent = local ? 'Open state map' : 'Choose a state';
      else if (!local) manage.textContent = 'Explore territories';
      else manage.textContent = bridge?.canEdit(selection) ? 'Manage assignment' : 'View on map';
    }
    function renderCoverage() {
      const total = report?.total;
      ring(coverage, total, count(total?.towns));
      for (const key of statuses) {
        const value = total?.[key], percent = total?.towns ? Math.round(100 * value / total.towns) : 0;
        $('[data-td-bucket="' + key + '"]').textContent = value == null ? '—' : count(value) + ' · ' + pct(percent);
      }
    }
    function viewRow(id, edit = false) {
      if (!index.has(id)) return;
      if (!state) {
        openStateTool = { id, tool: ['assign', 'assignments'].includes(tool) ? tool : 'map' };
        return chooseState(id);
      }
      if (!bridge) return;
      useTool('map');
      bridge.selectCounty(id, edit);
    }
    function updateHighlight() {
      for (const item of root.querySelectorAll('[data-td-row]')) item.setAttribute('aria-pressed', String(item.dataset.tdRow === selection));
    }
    function renderPerformance() {
      const body = field('table');
      const expand = field('view-all');
      expand.hidden = ordered.length <= 5;
      expand.setAttribute('aria-expanded', String(allRows));
      expand.querySelector('span').textContent = allRows ? 'Show top five' : 'View all territories';
      body.replaceChildren(...(allRows ? ordered : ordered.slice(0, 5)).map(row => {
        const tr = element('tr'), name = element('th'), link = element('button', row.name);
        link.type = 'button'; link.dataset.tdRow = row.id; link.title = row.label || row.name;
        link.setAttribute('aria-pressed', String(selection === row.id));
        name.scope = 'row'; name.append(link); tr.append(name);
        for (const value of [count(row.towns), reps(row), count(row.prospects), count(row.signed)]) tr.append(element('td', value));
        const coverageCell = element('td');
        coverageCell.append(element('span', pct(row.coverage), row.covered ? 'td-percent has-coverage' : 'td-percent'));
        const trend = element('td', (row.trend > 0 ? '+' : '') + count(row.trend), row.trend > 0 ? 'td-positive' : row.trend < 0 ? 'td-negative' : '');
        trend.title = count(row.added) + ' new offices this month compared with ' + count(row.added - row.trend) + ' at the same point last month';
        tr.append(coverageCell, trend);
        return tr;
      }));
      let note = '';
      if (report && !ordered.length) note = 'No territories are assigned to your account.';
      else if (report?.unmappedOffices) {
        const n = report.unmappedOffices;
        note = count(n) + (n === 1 ? ' saved office is' : ' saved offices are') + ' included only in the state total because the address does not identify a single county.';
      }
      setText('performance-note', note); field('performance-note').hidden = !note;
    }
    function renderList() {
      if (!titles[tool]) return;
      $('#td-browser-title').textContent = titles[tool];
      const query = search.value.trim().toLocaleLowerCase();
      const rows = ordered.filter(row => (!query || [row.label || row.name, row.id, row.lead].some(value => value.toLocaleLowerCase().includes(query))) &&
        (tool !== 'assign' || !state || bridge?.canEdit(row.id)));
      const entries = rows.map(row => {
        const item = element('button', null, 'td-list-row'), text = element('span');
        item.type = 'button'; item.dataset.tdOpen = row.id;
        text.append(element('strong', row.label || row.name), element('small', tool === 'list' ? count(row.towns) + ' towns · ' + count(row.offices) + ' saved offices' : reps(row)));
        item.append(text, element('span', tool === 'assign' && state ? 'Assign rep' : state ? 'View on map' : 'Open state', 'td-row-action'));
        item.disabled = Boolean(state && !bridge);
        return item;
      });
      field('list').replaceChildren(...(entries.length ? entries : [element('p', !report ? 'Loading territories…' : 'No matching territories.')]));
    }
    function render() {
      const total = report?.total;
      const metrics = { total: report?.rows.length, active: report?.active, reps: total?.repCount, offices: total?.offices, month: total?.added };
      for (const metric of root.querySelectorAll('[data-td-metric]')) {
        const key = metric.dataset.tdMetric;
        metric.textContent = key === 'coverage' ? pct(total?.coverage) : count(metrics[key]);
      }
      setText('map-count', !state && report ? count(report.rows.length) + ' state territories' : '');
      renderTools(); renderDetail(); renderCoverage(); renderPerformance(); renderList();
    }
    function useTool(next, focus = false) {
      tool = next;
      search.value = '';
      renderTools(); renderList();
      if (focus && titles[next]) focusSection($('#td-browser-title'));
      else if (focus && ['coverage', 'performance'].includes(next)) focusSection(field(next));
    }
    async function refresh() {
      const request = ++generation, region = state;
      status.textContent = report ? '' : 'Loading territory totals…'; retry.hidden = true;
      try {
        const response = await api('territory-dashboard', { state: region || '' });
        if (generation !== request) return;
        report = response;
        ordered = [...response.rows].sort((a, b) => b.covered - a.covered || b.offices - a.offices || a.name.localeCompare(b.name));
        index = new Map(ordered.map(row => [row.id, row]));
        status.textContent = ''; render();
      } catch (error) {
        if (generation !== request) return;
        status.textContent = error.message || 'Territory totals could not load.'; retry.hidden = false;
      }
    }
    function show(region, force = false) {
      if (region !== state) {
        state = region; report = bridge = null; selection = place = ''; ordered = []; index = new Map();
        tool = openStateTool?.id === region ? openStateTool.tool : 'map';
        openStateTool = null; allRows = false; search.value = ''; generation++; dirty = true; render();
      }
      if (force) dirty = true;
      if (root.hidden || queued || !dirty) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (!root.hidden && dirty) { dirty = false; void refresh(); } });
    }
    root.addEventListener('click', event => {
      const control = event.target.closest('button');
      if (!control) return;
      if (control.dataset.tdTool) useTool(control.dataset.tdTool, true);
      else if (control.hasAttribute('data-td-retry')) show(state, true);
      else if (control.hasAttribute('data-td-view-all')) { allRows = !allRows; renderPerformance(); }
      else if (control.dataset.tdOpen) viewRow(control.dataset.tdOpen, tool === 'assign');
      else if (control.dataset.tdRow) {
        selection = control.dataset.tdRow; place = '';
        renderDetail(); updateHighlight(); focusSection($('#td-detail-title'));
      } else if (control === manage) {
        if (index.has(selection)) viewRow(selection, Boolean(state && bridge?.canEdit(selection)));
        else useTool('list', true);
      }
    });
    search.oninput = renderList;
    return { show, reset() { generation++; state = undefined; report = bridge = null; index.clear(); ordered = []; dirty = true; },
      setUser(user) { owner = user.role === 'owner'; },
      setMap(map) { bridge = map; renderTools(); renderDetail(); renderList(); },
      selected(counties, name) {
        // The map's ownership inspector handles multi-county places. A single
        // county selection can also drive the county-level performance detail.
        selection = counties.length === 1 ? counties[0].id : ''; place = name || '';
        renderDetail(); updateHighlight();
      } };
  }
  window.SdrTerritoryDashboard = { mount };
})();
