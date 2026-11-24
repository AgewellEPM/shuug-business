(() => {
  'use strict';
  function mount({ api, getOffices, refresh, openOffice }) {
    const root = document.querySelector('[data-care-campaign]');
    if (!root) return null;
    const find = selector => root.querySelector(selector);
    const buttons = [...root.querySelectorAll('[data-cc-tab]')];
    const pane = button => document.getElementById(button.getAttribute('aria-controls'));
    const header = document.getElementById('sdr-header-search'), search = header.querySelector('input');
    const original = { label: search.getAttribute('aria-label'), placeholder: search.placeholder };
    const results = find('[data-cc-search-results]');
    const dialog = find('[data-cc-dialog]'), form = find('[data-cc-pilot]'), fields = form.elements;
    const newFacility = find('[data-cc-new]'), close = find('[data-cc-close]'), open = find('[data-cc-open-office]');
    const message = find('[data-cc-pilot-status]');
    let active = false, oldQuery = '', campaignQuery = '', saving = false, requestId, savedOffice;

    function select(button, focus = false) {
      for (const other of buttons) {
        const selected = button === other;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
        pane(other).hidden = !selected;
      }
      if (focus) button.focus();
    }
    function choose(button) {
      const hash = '#view=campaigns&topic=' + button.dataset.ccTab;
      if (location.hash !== hash) history.pushState(null, '', hash);
      select(button, true);
      results.hidden = true;
    }
    for (const [i, button] of buttons.entries()) {
      button.addEventListener('click', () => choose(button));
      button.addEventListener('keydown', event => {
        const next = { ArrowRight: (i + 1) % buttons.length, ArrowLeft: (i + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 };
        if (!Object.hasOwn(next, event.key)) return;
        event.preventDefault();
        choose(buttons[next[event.key]]);
      });
    }
    const index = buttons.map(button => ({
      button,
      text: [button.textContent, ...[...pane(button).querySelectorAll('h3,h4,p,li,a')].map(el => el.textContent)].join(' ').toLowerCase(),
    }));
    function searchTopics() {
      const query = search.value.trim();
      results.replaceChildren();
      results.hidden = !query;
      if (!query) return;
      const terms = query.toLowerCase().split(/\s+/);
      const matches = index.filter(item => terms.every(term => item.text.includes(term)));
      const heading = document.createElement('h2');
      heading.textContent = matches.length ? 'Matching campaign topics' : 'No matching campaign topics';
      results.append(heading);
      for (const { button } of matches) {
        const link = document.createElement('button');
        link.type = 'button'; link.textContent = button.textContent;
        link.addEventListener('click', () => choose(button));
        results.append(link);
      }
    }
    header.addEventListener('submit', event => {
      if (!active) return;
      event.preventDefault(); event.stopImmediatePropagation();
      searchTopics();
      if (!results.hidden) results.scrollIntoView?.({ block: 'nearest' });
    }, true);
    search.addEventListener('input', () => { if (active) searchTopics(); });
    function view(name) {
      const entering = name === 'campaigns';
      if (entering !== active) {
        active = entering;
        if (active) {
          oldQuery = search.value;
          search.value = campaignQuery;
          search.placeholder = 'Search nursing home campaigns, materials, or sales guides…';
          search.setAttribute('aria-label', search.placeholder.slice(0, -1));
          searchTopics();
        } else {
          campaignQuery = search.value; search.value = oldQuery;
          search.placeholder = original.placeholder; search.setAttribute('aria-label', original.label);
          if (dialog.open) dialog.close();
        }
      }
      if (active) {
        const params = new URLSearchParams(location.hash.slice(1));
        const id = params.get('view') === 'campaigns' && params.get('topic');
        select(buttons.find(button => button.dataset.ccTab === id) || buttons[0]);
      }
    }

    function facilityFields() {
      newFacility.disabled = newFacility.hidden = fields.office.value !== 'new';
    }
    fields.office.addEventListener('change', facilityFields);
    for (const trigger of root.querySelectorAll('[data-cc-start]')) trigger.addEventListener('click', () => {
      if (dialog.open || saving) return;
      form.reset(); form.hidden = false; open.hidden = true;
      savedOffice = null; requestId = crypto.randomUUID(); message.textContent = '';
      const offices = [...getOffices()].sort((a, b) => a.town.localeCompare(b.town));
      const options = offices.map(o => new Option([o.town, o.locality, o.state].filter(Boolean).join(' · '), String(o.id)));
      fields.office.replaceChildren(new Option('Choose a facility', ''), ...options, new Option('Add a new facility…', 'new'));
      if (!offices.length) fields.office.value = 'new';
      facilityFields();
      dialog.showModal();
      (fields.office.value === 'new' ? fields.namedItem('name') : fields.office).focus();
    });
    close.addEventListener('click', () => { if (!saving) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    open.addEventListener('click', () => {
      if (!savedOffice) return;
      dialog.close();
      openOffice(savedOffice);
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving || !form.reportValidity()) return;
      saving = true;
      const submit = form.querySelector('[type=submit]');
      submit.disabled = close.disabled = true;
      message.textContent = 'Saving pilot…';
      const input = Object.fromEntries(new FormData(form));
      try {
        let id = input.office;
        if (id === 'new') {
          const { office } = await api('create-office', { name: input.name, address: input.address, city: input.city, state: input.state, facilityType: 'nursing-home' });
          id = String(office.id);
          if (![...fields.office.options].some(option => option.value === id)) fields.office.add(new Option(office.town, id), 1);
          fields.office.value = id; facilityFields();
        }
        await api('start-care-pilot', { id, requestId, unit: input.unit, start: input.start, coordinator: input.coordinator, goal: input.goal });
        savedOffice = id;
        form.hidden = true; open.hidden = false;
        message.textContent = 'Pilot saved in the facility’s history.';
        open.focus();
        try { await refresh(); } catch { message.textContent += ' Reopen the record to load the latest details.'; }
      } catch (error) {
        message.textContent = error.message || 'The pilot could not be saved. Try again.';
      } finally {
        saving = false; submit.disabled = close.disabled = false;
      }
    });
    return { view };
  }
  window.SdrCareCampaign = { mount };
})();
