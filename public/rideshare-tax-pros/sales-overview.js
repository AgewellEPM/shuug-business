(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = String(value);
    if (className) element.className = className;
    return element;
  }
  function sourceLink(url, label) {
    try {
      const value = new URL(url);
      if (!['http:', 'https:'].includes(value.protocol)) return null;
      const anchor = node('a', label);
      anchor.href = value.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      return anchor;
    } catch { return null; }
  }
  function control(label, action, className = 'button secondary') {
    const button = node('button', label, className);
    button.type = 'button';
    button.addEventListener('click', () => action(button));
    return button;
  }
  function navigationIcon(view) {
    return document.querySelector('.sdr-nav [data-tab="' + view + '"] svg')?.cloneNode(true) || node('span');
  }

  function mount({ api, onNavigate, onOpenOffice, onBrowseFacilities, facilityType, refresh, status }) {
    const form = $('#sdr-category-form');
    if (!form) return null;
    const care = Boolean(form.closest('[data-senior-care]'));
    const directoryState = $('#care-directory-state');
    const researchStatus = $('#sdr-category-status'), resultList = $('#sdr-category-results');
    const report = (message, error = false) => {
      researchStatus.textContent = message;
      researchStatus.dataset.error = String(error);
    };
    const researchFocus = () => {
      onNavigate('home');
      if (care) $('#sdr-category-research').open = true;
      form.elements.type.focus();
      $('#sdr-category-research').scrollIntoView?.({ block: 'nearest' });
    };
    const prospectFocus = () => { onNavigate('prospects'); $('[data-prospect-add], #sales-add-prospect')?.click(); };
    const followups = () => {
      onNavigate('home');
      $('#sales-followups').scrollIntoView?.({ block: 'center' });
    };
    const pipeline = (stage = '', kind = '') => {
      onNavigate('pipeline');
      const filter = $('#sales-stage-filter');
      const facilityFilter = $('#sales-facility-kind-filter');
      if (facilityFilter) facilityFilter.value = kind;
      filter.value = stage;
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const openCarePipeline = (kind = '') => {
      $('#sales-filter').value = '';
      $('#sales-attention-filter').value = '';
      pipeline('', kind);
    };
    const actions = { pipeline: () => openCarePipeline(), research: researchFocus, prospects: prospectFocus, campaigns: () => onNavigate('campaigns'),
      contracts: () => onNavigate('contracts'), calendar: () => onNavigate('calendar') };
    for (const button of document.querySelectorAll('[data-overview-action]')) {
      button.addEventListener('click', actions[button.dataset.overviewAction]);
    }
    for (const button of document.querySelectorAll('[data-browse-facility]')) {
      button.addEventListener('click', () => {
        const state = directoryState.value;
        if (state) onBrowseFacilities({ state, category: button.dataset.browseFacility });
      });
    }
    function renderResearch(research) {
      resultList.replaceChildren();
      if (!research) return;
      const { type, state, locality, companies, total, issues } = research;
      report(companies.length ? `${companies.length} of ${total} matches researched · ${type} · ${locality}, ${state}.` :
        issues.length ? 'The available sources returned no matches.' : `No published matches for ${type} in ${locality}, ${state}.`);
      for (const issue of issues) resultList.append(node('p', issue, 'sdr-source-note'));
      if (companies.some(company => company.sourceName === 'OpenStreetMap')) {
        const credit = sourceLink('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors');
        credit.className = 'sdr-source-note';
        resultList.append(credit);
      }
      const grid = node('div', undefined, 'sdr-category-results-grid');
      for (const company of companies) {
        const card = node('article', undefined, 'sdr-category-result');
        card.append(node('h3', company.name), node('p', [company.address, company.city, company.state, company.zip].filter(Boolean).join(', ')));
        if (company.phone) card.append(node('p', company.phone));
        if (company.email) card.append(node('p', company.email));
        const links = node('div', undefined, 'sdr-category-links');
        for (const link of [sourceLink(company.sourceURL, company.sourceName), sourceLink(company.website, 'Business website')].filter(Boolean)) links.append(link);
        card.append(links);
        if (company.roles.length || company.facts.length) {
          const details = node('details');
          details.append(node('summary', 'Published contacts and roles'));
          for (const item of [...company.roles, ...company.facts]) {
            const row = node('p', [item.name || item.value, item.role].filter(Boolean).join(' · '));
            const link = sourceLink(item.sourceURL, ' Source');
            if (link) row.append(link);
            details.append(row);
          }
          card.append(details);
        }
        for (const warning of company.warnings) card.append(node('small', warning));
        if (company.address && company.city) card.append(control('Save to Pipeline', async button => {
          button.disabled = true;
          try {
            const result = await api('business-research-save', { runId: research.id, companyId: company.id });
            await refresh();
            button.textContent = result.duplicate ? 'Already in Pipeline' : 'Saved to Pipeline';
            const open = control('Open business', () => { onNavigate('pipeline'); return onOpenOffice(result.office.id).catch(error => status(error.message, true)); });
            button.replaceWith(open);
            report(company.name + ' is in your pipeline.');
          } catch (error) {
            report(error.message, true);
            button.disabled = false;
          }
        }));
        grid.append(card);
      }
      resultList.append(grid);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      report('Finding businesses and checking published sources…');
      resultList.setAttribute('aria-busy', 'true');
      try {
        const { research } = await api('business-research', Object.fromEntries(new FormData(form)));
        renderResearch(research);
      } catch (error) { report(error.message, true); }
      finally {
        resultList.removeAttribute('aria-busy');
        button.disabled = false;
      }
    });

    const earnings = $('#sdr-earnings');
    const earningsForm = $('#sdr-earnings-form');
    let requestId;
    function renderEarnings(value) {
      earnings.hidden = !value;
      if (!value) return;
      $('#sdr-earning-amount').textContent = money.format(value.totalCents / 100);
      const receipts = $('#sdr-earnings-receipts');
      receipts.replaceChildren();
      if (!value.count) receipts.append(node('p', 'No payments recorded yet.'));
      if (value.count > value.recent.length) receipts.append(node('h3', 'Recent payments'));
      for (const item of value.recent) {
        const row = node('div', undefined, 'sdr-receipt');
        row.append(node('span', item.label + ' · ' + money.format(item.cents / 100)), control('Void', async button => {
          if (!window.confirm('Remove this payment from your earnings total?')) return;
          button.disabled = true;
          try { await api('void-earnings', { id: item.id }); await refresh(); }
          catch (error) { status(error.message, true); button.disabled = false; }
        }));
        receipts.append(row);
      }
    }
    earningsForm.addEventListener('input', () => { requestId = undefined; });
    earningsForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = earningsForm.querySelector('button');
      button.disabled = true;
      requestId ||= crypto.randomUUID();
      try {
        await api('record-earnings', { ...Object.fromEntries(new FormData(earningsForm)), requestId });
        earningsForm.reset();
        requestId = undefined;
        await refresh();
        status('Payment recorded.');
      } catch (error) { status(error.message, true); }
      finally { button.disabled = false; }
    });

    function renderTerritory(offices) {
      if (care) return;
      const host = $('#sdr-overview-territory');
      const states = new Set(offices.map(office => office.state));
      const cities = new Set(offices.filter(office => office.locality).map(office => office.state + ':' + office.locality.toLowerCase()));
      const region = form.elements.state.value;
      const map = $('#sales-territory-map svg');
      const path = map?.querySelector('[data-state="' + region + '"]')?.cloneNode(true);
      host.replaceChildren(node('h2', 'Your Territory'), node('p', `${states.size} states and ${cities.size} cities in your pipeline.`));
      if (path) {
        const svg = document.createElementNS(map.namespaceURI, 'svg');
        svg.setAttribute('viewBox', map.getAttribute('viewBox'));
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('sdr-overview-map');
        path.removeAttribute('role');
        path.removeAttribute('tabindex');
        svg.append(path);
        host.append(svg);
        if (typeof path.getBBox === 'function' && host.getClientRects().length) {
          const { x, y, width, height } = path.getBBox();
          if (width > 0 && height > 0) svg.setAttribute('viewBox', [x - 3, y - 3, width + 6, height + 6].join(' '));
        }
      }
      host.append(control('Open Territory Map', () => onNavigate('territories'), 'button primary'));
    }

    function renderCareAccounts(accounts) {
      const list = $('#care-account-list');
      const open = accounts.filter(office => !['active', 'not_interested', 'do_not_contact', 'contract_signed'].includes(office.pipeline?.stage || office.status));
      open.sort((a, b) => (a.meeting_date || '9999').localeCompare(b.meeting_date || '9999') ||
        String(a.town).localeCompare(String(b.town)));
      if (!open.length) {
        const empty = node('div', undefined, 'care-accounts-empty');
        empty.append(navigationIcon('pipeline'), node('strong', 'No open facility accounts'),
          node('p', 'Save a facility from the directory to start tracking contacts and follow-ups.'));
        list.replaceChildren(empty);
        return;
      }
      list.replaceChildren(...open.slice(0, 5).map(office => {
        const row = control(undefined, () => {
          openCarePipeline();
          return onOpenOffice(office.id).catch(error => status(error.message, true));
        }, 'care-account-row');
        const details = node('span');
        const type = facilityType(office) === 'nursing-home' ? 'Nursing home' : 'Senior center';
        details.append(node('strong', office.town), node('small', [type, office.locality, office.state].filter(Boolean).join(' · ')));
        const next = node('span', undefined, 'care-account-next');
        const stage = String(office.pipeline?.stage || office.status || 'new').replace(/_/g, ' ');
        next.append(node('span', stage.charAt(0).toUpperCase() + stage.slice(1)), node('small', office.meeting_date ? 'Follow up ' + office.meeting_date.slice(0, 10) : 'No follow-up date'));
        row.append(details, next);
        return row;
      }));
    }

    let loaded = false, currentOffices = [];
    form.elements.state.addEventListener('change', () => renderTerritory(currentOffices));
    return {
      render(data) {
        const next = data.nextBooking, label = $('#bk-overview-next');
        if (label) label.textContent = next ? 'Next up · ' + next.title + ' with ' + next.client + ' · ' + window.TinkyBooking.when(next.start, next.zone) :
          'View your schedule and share your booking page.';
        if (!loaded) {
          loaded = true;
          void api('business-research-last').then(({ research }) => {
            if (!research || form.querySelector('button').disabled) return;
            if (care && ![...form.elements.type.options].some(option => option.value === research.type)) return;
            if (care ? Boolean(form.elements.locality.value) : Boolean(form.elements.type.value)) return;
            for (const key of ['type', 'locality', 'state']) form.elements[key].value = research[key];
            renderTerritory(currentOffices);
            renderResearch(research);
          }).catch(error => report(error.message, true));
        }
        const now = new Date(), hour = now.getHours();
        if (!care) $('#sdr-greeting').textContent = hour < 12 ? 'Good morning!' : hour < 17 ? 'Good afternoon!' : 'Good evening!';
        const offices = data.offices;
        currentOffices = offices;
        const started = offices.some(office => office.pipeline?.lastContact);
        const signed = offices.filter(office => office.pipeline?.converted).length;
        const scheduled = offices.filter(office => office.meeting_date).length;
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const accounts = care ? offices.filter(office => ['nursing-home', 'senior-center'].includes(facilityType(office))) : offices;
        const due = accounts.filter(office => office.meeting_date && office.meeting_date <= today && !['active', 'not_interested', 'do_not_contact'].includes(office.status));
        if (data.progress) {
          const { level, xpIntoLevel, xpPerLevel } = data.progress;
          $('#sdr-xp-level').textContent = 'Level ' + level;
          $('#sdr-xp-bar').max = xpPerLevel;
          $('#sdr-xp-bar').value = xpIntoLevel;
          $('#sdr-xp-label').textContent = xpIntoLevel + ' / ' + xpPerLevel + ' XP';
        }
        renderEarnings(data.earnings);
        const stats = care ? [
          ['Nursing homes saved', accounts.filter(office => facilityType(office) === 'nursing-home').length, 'pipeline', () => openCarePipeline('nursing-home'), 'green'],
          ['Senior centers saved', accounts.filter(office => facilityType(office) === 'senior-center').length, 'territories', () => openCarePipeline('senior-center'), 'blue'],
          ['Follow-ups due', due.length, 'contacts', followups, 'purple'],
          ['Agreements signed', accounts.filter(office => office.pipeline?.converted).length, 'contracts', actions.contracts, 'blue'],
        ] : [
          ['Saved Businesses', offices.length, 'pipeline', pipeline, 'green'],
          ['Follow-ups Due', due.length, 'territories', followups, 'blue'],
          ['Interested', offices.filter(office => office.status === 'interested').length, 'prospects', () => pipeline('interested'), 'purple'],
          ['Signed Agreements', signed, 'contracts', actions.contracts, 'blue'],
        ];
        $('#sdr-overview-stats').replaceChildren(...stats.map(([label, count, icon, action, color]) => {
          const card = control(undefined, () => action(), 'sdr-card sdr-overview-stat ' + color);
          const value = node('span');
          value.append(node('span', label), node('strong', count));
          card.append(navigationIcon(icon), value);
          return card;
        }));
        if (care) {
          const noTerritory = !directoryState.value;
          document.querySelectorAll('[data-browse-facility]').forEach(button => { button.disabled = noTerritory; });
          $('#care-directory-status').textContent = noTerritory ? 'Ask your sales team manager to assign a territory to browse facilities.' : '';
          renderCareAccounts(accounts);
          return;
        }
        const steps = [
          ['Find your first business', 'Research a business type in your area.', 'Find Businesses', researchFocus, Boolean(resultList.querySelector('article') || offices.length)],
          ['Add a prospect', 'Save a result to your pipeline.', 'Open Pipeline', pipeline, Boolean(offices.length)],
          ['Send an introduction', 'Open a saved business to record outreach.', 'Open Pipeline', pipeline, Boolean(started)],
          ['Schedule a follow-up', 'Give your next conversation a date.', 'View Follow-ups', followups, Boolean(scheduled)],
        ];
        const setup = $('#sdr-onboarding');
        const heading = node('div', undefined, 'sdr-card-head');
        heading.append(node('h2', 'Get Started'), node('span', steps.filter(step => step[4]).length + ' of 4 complete'));
        const rows = node('ol', undefined, 'sdr-setup-list');
        steps.forEach(([title, description, action, run, complete], index) => {
          const row = node('li');
          const step = node('span', complete ? '✓' : index + 1, 'sdr-setup-step');
          step.setAttribute('aria-label', complete ? 'Complete' : 'Step ' + (index + 1));
          const text = node('div');
          text.append(node('strong', title), node('p', description));
          row.append(step, text, control(action, () => run()));
          rows.append(row);
        });
        setup.replaceChildren(heading, rows);
        renderTerritory(offices);
        const tasks = $('#sdr-overview-tasks');
        tasks.replaceChildren(node('h2', 'Today’s Tasks'));
        if (!due.length) tasks.append(node('p', 'No follow-ups due today.'));
        for (const office of due.slice(0, 3)) tasks.append(control(office.town, () => {
          onNavigate('pipeline');
          return onOpenOffice(office.id).catch(error => status(error.message, true));
        }));
        if (due.length) tasks.append(control('View follow-up queue', followups));
      },
    };
  }

  window.SdrOverview = { mount };
})();
