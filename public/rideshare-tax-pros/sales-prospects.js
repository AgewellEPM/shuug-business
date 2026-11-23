(() => {
  'use strict';
  const pageSize = 8;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const searchKey = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const statuses = {
    new: 'New', researching: 'Researching', contacted: 'Contacted', replied: 'Replied', waiting: 'Waiting',
    meeting: 'Meeting scheduled', interested: 'Interested', invited: 'Invited', contract_sent: 'Contract sent',
    contract_signed: 'Contract signed', active: 'Active', not_interested: 'Not interested', do_not_contact: 'Do not contact',
  };
  const types = Object.freeze({
    'nursing-home': 'Nursing home', 'senior-center': 'Senior community center', 'assisted-living': 'Assisted living',
    'independent-living': 'Independent living', 'long-term-care': 'Rehab / long-term care', other: 'Other business',
  });
  const ongoing = new Set(['researching', 'contacted', 'replied', 'waiting', 'meeting', 'interested', 'invited', 'contract_sent']);
  const contractStage = new Set(['invited', 'contract_sent', 'contract_signed', 'active']);
  const closed = new Set(['active', 'contract_signed', 'not_interested', 'do_not_contact']);
  const symbols = {
    business: '<path d="M4 21V7h6V3h10v18M2 21h20M8 11h1m-1 4h1m5-8h2m-2 4h2m-2 4h2m-3 6v-3h3v3"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
    date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 10h18m-12 5 2 2 4-4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  };
  const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
  const dateStyle = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const fullDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });
  const label = stage => statuses[stage] || 'New';
  const regionLabel = state => regionNames[state] || state;
  const regionNames = {
    AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DC:'District of Columbia',
    DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas',
    KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
    MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
    NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island',
    SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
    WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
  };
  function business(office) {
    let metadata;
    try { metadata = JSON.parse(office.notes || '{}') || {}; } catch { metadata = {}; }
    const stage = office.pipeline?.stage || office.status;
    const type = Object.hasOwn(types, metadata.facilityType) ? metadata.facilityType : 'other';
    return {
      id: String(office.id), name: office.town, location: [office.locality, office.state].filter(Boolean).join(', '),
      state: office.state, type, stage: Object.hasOwn(statuses, stage) ? stage : 'new', due: office.meeting_date || '',
      next: office.pipeline?.nextAction || '', office, metadata,
    };
  }
  function dateText(value, format = dateStyle) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const date = new Date(value + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? '' : format.format(date);
  }
  function stageBadge(record) {
    return `<span class="prospects-stage" data-stage="${record.stage}">${label(record.stage)}</span>`;
  }

  function mount({ api, refresh, onOpenOffice }) {
    const root = document.querySelector('.sdr-prospects');
    if (!root) return null;
    const $ = selector => root.querySelector(selector);
    const $$ = selector => [...root.querySelectorAll(selector)];
    const filter = $('#sales-business-prospect-filter');
    const editor = $('[data-prospect-editor]');
    const addForm = $('#sales-business-prospect-form');
    const detail = $('[data-prospect-detail]');
    const emptyDetail = detail.innerHTML;
    const editorStatus = $('[data-prospect-editor-status]');
    const linkedIn = $('#sales-linkedin-prospects');
    let workspace, records = [], visible = [], selected = '', view = 'list', index = 0, descending = false;
    let storageKey, detailRequest = 0, detailStale = true, saving = false;
    let stages = new Set();

    function writeStatus(target, message, error = false) {
      target.textContent = message;
      target.dataset.error = String(error);
    }
    function option(value, text) {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = text;
      return item;
    }
    function criteria() {
      return { query: filter.elements.query.value, type: filter.elements.type.value, state: filter.elements.state.value, stages: [...stages] };
    }
    function replaceOptions(select, first, entries, prior = select.value) {
      select.replaceChildren(option('', first), ...entries.map(([value, text]) => option(value, text)));
      if (entries.some(([value]) => value === prior)) select.value = prior;
    }
    function choosePane(name) {
      view = name;
      $$('[data-prospect-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.prospectView === name)));
      $$('[data-prospect-pane]').forEach(pane => { pane.hidden = pane.dataset.prospectPane !== name; });
      paintList();
    }
    function renderFilters(saved) {
      const typeCounts = new Map();
      const stageCounts = new Map();
      for (const row of records) {
        typeCounts.set(row.type, (typeCounts.get(row.type) || 0) + 1);
        stageCounts.set(row.stage, (stageCounts.get(row.stage) || 0) + 1);
      }
      replaceOptions(filter.elements.type, 'All types', Object.entries(types).filter(([value]) => !document.body.hasAttribute('data-care-crm') || ['nursing-home', 'senior-center'].includes(value)).map(([value, name]) =>
        [value, typeCounts.has(value) ? `${name} (${typeCounts.get(value)})` : name]), saved.type);
      const user = workspace.user;
      const areas = user.territory?.version === 1 ? user.territory.areas.map(area => area.state) :
        user.states?.length ? user.states : workspace.states;
      replaceOptions(filter.elements.state, 'All territories', [...areas].sort((a,b) => collator.compare(regionLabel(a), regionLabel(b)))
        .map(state => [state, regionLabel(state)]), saved.state);
      $('[data-prospect-stages]').innerHTML = [...new Set([...Object.keys(statuses).slice(0, 6), 'interested', ...stageCounts.keys(), ...stages])]
        .map(stage => `<label><input type="checkbox" name="stage" value="${stage}" ${stages.has(stage) ? 'checked' : ''}>
          <span class="prospects-stage-key" data-stage="${stage}"></span><span>${label(stage)} (${stageCounts.get(stage) || 0})</span></label>`).join('');
    }
    function stats() {
      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const values = { total: records.length, active: 0, due: 0, progress: 0, ready: 0 };
      for (const row of records) {
        if (row.stage === 'active') values.active++;
        if (row.due && row.due <= today && !closed.has(row.stage)) values.due++;
        if (ongoing.has(row.stage)) values.progress++;
        const info = row.metadata, check = info.independenceVerification;
        if (row.stage === 'interested' && workspace.terms && !info.primaryContactDoNotContact &&
            info.independence === 'independent' && check?.reviewed === true && check.finding === 'independent' &&
            check.sourceURL && check.note && check.checkedAt) values.ready++;
      }
      Object.entries(values).forEach(([key, value]) => { $(`[data-prospect-metric="${key}"]`).textContent = value.toLocaleString(); });
    }
    function updateList({ reset = false, detailChanged = false } = {}) {
      if (reset) index = 0;
      const { query, type, state } = criteria();
      const terms = searchKey(query).split(/\s+/).filter(Boolean);
      visible = records.filter(row => {
        if ((state && row.state !== state) || (type && row.type !== type) || (stages.size && !stages.has(row.stage))) return false;
        const { contact_name, contact_email, contact_phone } = row.office;
        const words = searchKey([row.name, row.location, types[row.type], contact_name, contact_email, contact_phone,
          row.metadata.address, row.office.pipeline?.lastContact?.note, row.next].join(' '));
        return terms.every(term => words.includes(term));
      }).sort((a, b) => (descending ? -1 : 1) * collator.compare(a.name, b.name) || collator.compare(a.location, b.location));
      if (!visible.some(row => row.id === selected)) {
        selected = visible[index * pageSize]?.id || visible[0]?.id || '';
        detailChanged = true;
      }
      if (detailChanged) {
        detailStale = true;
        if (!root.hidden) showDetails();
      }
      paintList();
    }
    function rowMarkup(row) {
      const date = dateText(row.due);
      const nextLabel = closed.has(row.stage) ? '—' : row.stage === 'new' ? 'Contact' : row.stage === 'replied' ? 'Review reply' : 'Follow up';
      return `<tr class="${row.id === selected ? 'is-selected' : ''}">
        <th scope="row"><button type="button" data-prospect-select="${escape(row.id)}" aria-pressed="${row.id === selected}"><strong>${escape(row.name)}</strong><small>${escape(row.location)}</small></button></th>
        <td><span class="prospects-type" title="${types[row.type]}">${icon('business')}<span class="prospects-type-label">${types[row.type]}</span></span></td>
        <td>${stageBadge(row)}</td>
        <td><span class="prospects-next" title="${escape(row.next)}">${date ? icon('date') + escape(date) : escape(nextLabel)}</span></td>
      </tr>`;
    }
    function paintList() {
      $('[data-prospect-count]').textContent = `(${visible.length.toLocaleString()})`;
      const pages = Math.ceil(visible.length / pageSize);
      index = Math.max(0, Math.min(index, pages - 1));
      const start = index * pageSize;
      const empty = $('[data-prospect-empty]');
      empty.hidden = visible.length > 0;
      empty.textContent = records.length ? 'No prospects match these filters.' : 'Your saved businesses will appear here. Add a prospect to get started.';
      if (view === 'list') $('[data-prospect-rows]').innerHTML = visible.slice(start, start + pageSize).map(rowMarkup).join('');
      if (view === 'map') paintMap();
      if (view === 'pipeline') paintBoard();
      $('[data-prospect-pages]').hidden = view !== 'list' || !visible.length;
      $('[data-prospect-prev]').disabled = index === 0;
      $('[data-prospect-next]').disabled = index + 1 >= pages;
      $('[data-prospect-range]').textContent = visible.length ?
        `Showing ${start + 1}–${Math.min(start + pageSize, visible.length)} of ${visible.length}` : '';
      const first = Math.max(0, Math.min(index - 1, pages - 3));
      $('[data-prospect-page-buttons]').innerHTML = Array.from({ length: Math.min(3, pages) }, (_, i) => {
        const number = first + i;
        return `<button type="button" data-prospect-page="${number}" aria-label="Page ${number + 1}" ${number === index ? 'aria-current="page"' : ''}>${number + 1}</button>`;
      }).join('');
    }
    function paintMap() {
      const counts = new Map();
      for (const row of visible) counts.set(row.state, (counts.get(row.state) || 0) + 1);
      $$('[data-prospect-pane="map"] path[data-state]').forEach(path => {
        const state = path.dataset.state, count = counts.get(state) || 0;
        path.classList.toggle('has-prospects', count > 0);
        path.setAttribute('tabindex', count ? '0' : '-1');
        path.setAttribute('aria-disabled', String(!count));
        path.setAttribute('aria-pressed', String(filter.elements.state.value === state));
        const name = `${regionLabel(state)} · ${count} ${count === 1 ? 'prospect' : 'prospects'}`;
        path.setAttribute('aria-label', name);
        path.querySelector('title').textContent = name;
      });
      $('[data-prospect-map-summary]').innerHTML = [...counts].sort(([a], [b]) => collator.compare(regionLabel(a), regionLabel(b)))
        .map(([state, count]) => `<button type="button" class="button secondary" data-prospect-region="${escape(state)}">${escape(regionLabel(state))} · ${count}</button>`).join('') ||
        '<p class="prospects-empty">No prospects match these territories.</p>';
    }
    function paintBoard() {
      const columns = [
        ['New', row => ['new', 'researching'].includes(row.stage)],
        ['In conversation', row => ['contacted', 'replied', 'waiting', 'meeting', 'interested'].includes(row.stage)],
        ['Contract', row => contractStage.has(row.stage)],
        ['Closed', row => ['not_interested', 'do_not_contact'].includes(row.stage)],
      ];
      $('[data-prospect-pane="pipeline"]').innerHTML = columns.map(([title, includes]) => {
        const rows = visible.filter(includes);
        return `<section><h4>${title} <small>${rows.length}</small></h4>${rows.map(row =>
          `<button type="button" data-prospect-select="${escape(row.id)}" aria-pressed="${row.id === selected}"><strong>${escape(row.name)}</strong><small>${label(row.stage)}</small></button>`).join('') ||
          '<p>No prospects</p>'}</section>`;
      }).join('');
    }
    function renderDetails(row) {
      const office = row.office, locked = contractStage.has(row.stage), paused = closed.has(row.stage);
      detail.innerHTML = `<header class="prospects-detail-head"><span>${icon('business')}</span>
        <div><h3>${escape(row.name)}</h3><p>${escape(row.location)}</p></div><button type="button" class="prospects-more" data-prospect-details-open aria-label="Open complete office record">···</button>
      </header>
      <div class="prospects-detail-body">
        <section><label>Status<select data-prospect-status ${locked ? 'disabled' : ''}>
          ${Object.entries(statuses).filter(([value]) => !contractStage.has(value) || value === row.stage)
            .map(([value, name]) => `<option value="${value}" ${value === row.stage ? 'selected' : ''}>${name}</option>`).join('')}
        </select></label></section>
        <section><h4>Office type</h4><p class="prospects-inline">${icon('business')}${types[row.type]}</p></section>
        <section><h4>Contact</h4><p class="prospects-inline">${icon('person')}<strong>${escape(office.contact_name || 'No contact saved')}</strong></p>
          ${office.contact_phone ? `<p>${escape(office.contact_phone)}</p>` : ''}${office.contact_email ? `<p class="prospects-inline">${icon('mail')}${escape(office.contact_email)}</p>` : ''}</section>
        <section><h4>Next action</h4><p class="prospects-inline">${icon('date')}<strong>${escape(row.due && !paused ? 'Follow up' : row.next || 'Review prospect')}</strong></p>
          ${dateText(row.due, fullDate) ? `<p>${escape(dateText(row.due, fullDate))}</p>` : ''}</section>
        <section class="prospects-detail-notes"><div class="prospects-card-head"><h4>Notes</h4><button type="button" class="prospects-text" data-prospect-action="note">Add note</button></div><p class="prospects-note" data-prospect-note>Loading latest note…</p></section>
        <div class="prospects-detail-actions">
          <button type="button" class="button primary" data-prospect-action="followup" ${paused ? 'disabled' : ''}>${icon('date')} Schedule follow-up</button>
          <button type="button" class="button secondary" data-prospect-action="email" ${paused || !office.contact_email ? 'disabled' : ''}>${icon('mail')} Draft email</button>
          <button type="button" class="button secondary" data-prospect-action="call">Log call</button>
        </div>
        <p class="prospects-muted" data-prospect-action-status role="status"></p>
        <div data-prospect-action-form></div>
      </div>`;
    }
    function showDetails() {
      detailStale = false;
      const request = ++detailRequest;
      const row = records.find(record => record.id === selected);
      if (!row) { detail.innerHTML = emptyDetail; return; }
      renderDetails(row);
      void api('office', { id: row.id }).then(result => {
        if (request !== detailRequest) return;
        const note = result.events.slice().reverse().map(event => {
          try { return JSON.parse(event.notes); } catch { return null; }
        }).find(event => ['note', 'call', 'meeting'].includes(event?.action) && typeof event.detail === 'string');
        $('[data-prospect-note]').textContent = note?.detail || row.office.pipeline?.lastContact?.note || 'No notes recorded.';
      }).catch(() => {
        if (request === detailRequest) $('[data-prospect-note]').textContent = 'Notes could not be loaded.';
      });
    }
    async function saveDetail(action, input, message) {
      if (saving) return;
      const id = selected, target = $('[data-prospect-action-status]');
      saving = true;
      try {
        await api(action, { id, ...input });
        await refresh();
        if (selected === id) writeStatus($('[data-prospect-action-status]'), message);
      } catch (error) {
        if (target?.isConnected) {
          writeStatus(target, error.message, true);
          if (input.stage) $('[data-prospect-status]').value = records.find(row => row.id === id)?.stage || '';
        }
      } finally { saving = false; }
    }
    function actionForm(kind) {
      const row = records.find(item => item.id === selected);
      if (!row) return;
      const wrap = $('[data-prospect-action-form]');
      const field = kind === 'followup'
        ? `<label>Follow-up date<input type="date" name="nextFollowup" value="${escape(row.due)}" required></label>`
        : `<label>${kind === 'call' ? 'Call notes' : 'Note'}<textarea name="note" rows="3" maxlength="3000" required></textarea></label>`;
      wrap.innerHTML = `<form class="sales-form">${field}<div class="prospects-editor-actions">
        <button type="submit" class="button primary">${kind === 'followup' ? 'Save follow-up' : kind === 'call' ? 'Save call' : 'Save note'}</button>
        <button type="button" class="button secondary">Cancel</button></div></form>`;
      const form = wrap.querySelector('form');
      form.querySelector('input,textarea').focus();
      form.querySelector('button[type=button]').onclick = () => { wrap.replaceChildren(); };
      form.onsubmit = event => {
        event.preventDefault();
        const input = Object.fromEntries(new FormData(form));
        if (kind === 'followup') void saveDetail('update-office', input, 'Follow-up scheduled.');
        else void saveDetail('activity', { ...input, kind }, kind === 'call' ? 'Call logged.' : 'Note saved.');
      };
    }
    function openOffice(email = false) {
      const id = selected;
      void onOpenOffice(id).then(() => {
        if (email) document.querySelector('#sales-detail .sales-compose-form input[name="subject"]')?.focus();
      }).catch(error => {
        const target = $('[data-prospect-action-status]');
        if (target) writeStatus(target, error.message, true);
      });
    }
    detail.addEventListener('change', event => {
      if (event.target.matches('[data-prospect-status]')) void saveDetail('update-office', { stage: event.target.value }, 'Status updated.');
    });
    detail.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-prospect-details-open') || button.dataset.prospectAction === 'email') openOffice(button.dataset.prospectAction === 'email');
      else if (button.dataset.prospectAction) actionForm(button.dataset.prospectAction);
    });
    function setRegion(region) {
      const path = $(`[data-prospect-pane="map"] path[data-state="${region}"]`);
      if (!path || path.getAttribute('aria-disabled') === 'true') return;
      filter.elements.state.value = region;
      updateList({ reset: true });
      choosePane('list');
    }
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.dataset.prospectSelect) {
        selected = button.dataset.prospectSelect;
        showDetails();
        paintList();
        const target = $$('[data-prospect-select]').find(item => item.dataset.prospectSelect === selected && !item.closest('[hidden]'));
        target?.focus();
        if (event.detail > 0) detail.scrollIntoView?.({ block: 'nearest' });
      }
      if (button?.dataset.prospectView) choosePane(button.dataset.prospectView);
      if (button?.dataset.prospectPage !== undefined) { index = Number(button.dataset.prospectPage); paintList(); }
      const region = button?.dataset.prospectRegion || event.target.closest('[data-prospect-pane="map"] path')?.dataset.state;
      if (region) setRegion(region);
    });
    $('[data-prospect-pane="map"]').addEventListener('keydown', event => {
      if (event.target.dataset.state && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setRegion(event.target.dataset.state); }
    });
    filter.addEventListener('submit', event => { event.preventDefault(); updateList({ reset: true }); });
    filter.addEventListener('input', event => {
      if (event.target.name === 'stage') stages = new Set([...filter.querySelectorAll('[name="stage"]:checked')].map(input => input.value));
      updateList({ reset: true });
    });
    const globalSearch = document.querySelector('#sdr-header-search');
    globalSearch?.addEventListener('submit', event => {
      if (root.hidden) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      filter.elements.query.value = globalSearch.querySelector('input').value;
      updateList({ reset: true });
      choosePane('list');
    }, true);
    $('[data-prospect-clear]').onclick = () => {
      filter.reset();
      filter.elements.type.value = filter.elements.state.value = '';
      stages.clear();
      try { localStorage.removeItem(storageKey); } catch {}
      renderFilters(criteria());
      updateList({ reset: true });
      writeStatus($('[data-prospect-filter-status]'), 'Filters cleared.');
    };
    $('[data-prospect-save-filter]').onclick = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(criteria()));
        writeStatus($('[data-prospect-filter-status]'), 'Filter saved on this device.');
      } catch { writeStatus($('[data-prospect-filter-status]'), 'This browser could not save the filter.', true); }
    };
    $('[data-prospect-sort]').onclick = event => {
      descending = !descending;
      event.currentTarget.closest('th').setAttribute('aria-sort', descending ? 'descending' : 'ascending');
      updateList({ reset: true });
    };
    $('[data-prospect-prev]').onclick = () => { index--; paintList(); };
    $('[data-prospect-next]').onclick = () => { index++; paintList(); };
    function closeEditor() {
      editor.hidden = true;
      $('[data-prospect-add]').focus();
    }
    $('[data-prospect-add]').onclick = () => {
      writeStatus(editorStatus, '');
      editor.hidden = false;
      editor.scrollIntoView?.({ block: 'nearest' });
      addForm.elements.namedItem('name').focus();
    };
    $('[data-prospect-cancel]').onclick = closeEditor;
    $('[data-prospect-linkedin]').onclick = () => {
      editor.hidden = true;
      linkedIn.open = true;
      $('#sales-add-prospect').click();
    };
    addForm.onsubmit = async event => {
      event.preventDefault();
      const button = addForm.querySelector('button[type=submit]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const { office, duplicate } = await api('create-office', Object.fromEntries(new FormData(addForm)));
        filter.elements.query.value = filter.elements.type.value = filter.elements.state.value = '';
        stages.clear();
        selected = String(office.id);
        index = 0;
        await refresh();
        addForm.reset();
        closeEditor();
        const position = visible.findIndex(item => item.id === selected);
        if (position >= 0) index = Math.floor(position / pageSize);
        choosePane('list');
        if (selected === String(office.id)) writeStatus($('[data-prospect-action-status]'), duplicate ? 'This prospect is already saved.' : 'Prospect saved.');
      } catch (error) { writeStatus(editorStatus, error.message, true); }
      finally { button.disabled = false; }
    };
    return {
      enter() { if (detailStale) showDetails(); },
      render(data) {
        workspace = data;
        records = data.offices.map(business);
        const key = `sdr-prospect-filter:${location.pathname}:${data.user.id}`;
        let saved = criteria();
        if (storageKey !== key) {
          storageKey = key;
          try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch { saved = {}; }
          filter.elements.query.value = typeof saved.query === 'string' ? saved.query.slice(0, 180) : '';
          stages = new Set(Array.isArray(saved.stages) ? saved.stages.filter(stage => Object.hasOwn(statuses, stage)) : []);
        }
        renderFilters(saved);
        stats();
        updateList({ detailChanged: true });
      },
    };
  }
  window.SdrProspects = { mount };
})();
