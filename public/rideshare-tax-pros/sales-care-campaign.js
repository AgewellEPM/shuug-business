(() => {
  'use strict';
  function mount() {
    const root = document.querySelector('[data-care-campaign]');
    if (!root) return null;
    const find = selector => root.querySelector(selector);
    const buttons = [...root.querySelectorAll('[data-cc-tab]')];
    const pane = button => document.getElementById(button.getAttribute('aria-controls'));
    const header = document.getElementById('sdr-header-search'), search = header.querySelector('input');
    const original = { label: search.getAttribute('aria-label'), placeholder: search.placeholder };
    const results = find('[data-cc-search-results]');
    let active = false, oldQuery = '', campaignQuery = '';

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
        }
      }
      if (active) {
        const params = new URLSearchParams(location.hash.slice(1));
        const id = params.get('view') === 'campaigns' && params.get('topic');
        select(buttons.find(button => button.dataset.ccTab === id) || buttons[0]);
      }
    }

    function addPilotActivity(form) {
      const kind = form.elements.kind, note = form.elements.note, submit = form.querySelector('button');
      const fields = document.getElementById('care-pilot-fields').content.firstElementChild.cloneNode(true);
      submit.before(fields);
      kind.add(new Option('Pilot plan', 'care_pilot'));
      kind.addEventListener('change', () => {
        const pilot = kind.value === 'care_pilot';
        fields.disabled = fields.hidden = !pilot;
        note.disabled = note.closest('label').hidden = pilot;
        submit.textContent = pilot ? 'Save pilot plan' : 'Save activity';
        if (pilot && !form.elements.requestId.value) form.elements.requestId.value = crypto.randomUUID();
      });
    }
    return { view, addPilotActivity };
  }
  window.SdrCareCampaign = { mount };
})();
