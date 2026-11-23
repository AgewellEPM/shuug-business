(() => {
  'use strict';

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function sourceLink(href, label) {
    try {
      const url = new URL(href);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      const link = node('a', label);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    } catch { return null; }
  }

  function facilityRow(facility) {
    const row = node('li', null, 'territory-facility-result');
    row.append(node('strong', facility.name));
    const locality = [facility.city, facility.state].filter(Boolean).join(', ');
    const address = [facility.address, [locality, facility.zip].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    if (address) row.append(node('p', address));
    if (facility.phone || facility.email) row.append(node('p', [facility.phone, facility.email].filter(Boolean).join(' · ')));
    const links = [sourceLink(facility.sourceURL, facility.sourceName || 'Facility record'), sourceLink(facility.website, 'Facility website')].filter(Boolean);
    if (links.length) {
      const actions = node('div', null, 'territory-facility-sources');
      actions.append(...links);
      row.append(actions);
    }
    return row;
  }

  function mount({ api, onBack }) {
    const panel = document.getElementById('sales-territory-facilities');
    if (!panel) return null;
    const find = name => panel.querySelector(`[data-facility-${name}]`);
    const title = find('title'), form = find('search'), field = find('query'), results = find('results');
    const status = find('status'), coverage = find('coverage'), sources = find('sources'), issues = find('issues'), retry = find('retry');
    const pages = find('pages'), previous = find('previous'), next = find('next');
    const categories = [...panel.querySelectorAll('[data-facility-category]')];
    let state = '', stateName = '', category = 'nursing-home', query = '', offset = 0, sequence = 0, report;

    function paint(page) {
      const rows = page?.results || [];
      results.replaceChildren(...rows.map(facilityRow));
      results.hidden = rows.length === 0;
      coverage.textContent = page?.coverage || '';
      coverage.hidden = !coverage.textContent;
      const links = (page?.sources || []).map(source => sourceLink(source.url, source.name)).filter(Boolean);
      sources.replaceChildren(...links);
      sources.hidden = links.length === 0;
      const notices = (page?.issues || []).map(issue => typeof issue === 'string' ? issue : issue?.message).filter(Boolean);
      issues.replaceChildren(...notices.map(message => node('li', message)));
      issues.hidden = notices.length === 0;
      pages.hidden = !page?.offset && !page?.hasMore;
      previous.disabled = !page?.offset;
      next.disabled = !page?.hasMore;
    }

    async function load(pageOffset = 0) {
      if (!state) return;
      const request = ++sequence;
      offset = pageOffset;
      report = undefined;
      paint();
      results.setAttribute('aria-busy', 'true');
      status.textContent = `Loading facilities for ${stateName}…`;
      status.dataset.error = 'false';
      retry.hidden = true;
      try {
        const page = await api('territory-facilities', { state, category, query, offset });
        if (request !== sequence) return;
        report = page;
        paint(page);
        status.textContent = page.results.length
          ? `Showing ${(page.offset + 1).toLocaleString()}–${(page.offset + page.results.length).toLocaleString()} of ${page.total.toLocaleString()} facilities.`
          : query ? 'No listed facilities match this search.' : 'No facilities found in the available sources.';
      } catch (error) {
        if (request !== sequence) return;
        status.textContent = error.message || 'Facilities could not be loaded.';
        status.dataset.error = 'true';
        retry.hidden = false;
      } finally {
        if (request === sequence) results.removeAttribute('aria-busy');
      }
    }

    find('back').addEventListener('click', onBack);
    for (const button of categories) button.addEventListener('click', () => {
      const selected = button.dataset.facilityCategory;
      if (selected === category) return;
      category = selected;
      categories.forEach(control => control.setAttribute('aria-pressed', String(control === button)));
      void load();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      query = field.value.trim();
      void load();
    });
    previous.addEventListener('click', () => { if (report?.offset) void load(Math.max(0, report.offset - report.limit)); });
    next.addEventListener('click', () => { if (report?.hasMore) void load(report.offset + report.limit); });
    retry.addEventListener('click', () => void load(offset));

    return {
      selectState(region) {
        if (state === region) return panel;
        state = region;
        stateName = document.querySelector(`[data-territory-state="${region}"] strong`)?.textContent || region;
        field.value = query = '';
        title.textContent = `${stateName} facilities`;
        panel.hidden = false;
        void load();
        return panel;
      },
      clear() {
        sequence++;
        state = '';
        panel.hidden = true;
      },
    };
  }

  window.SdrTerritoryFacilities = { mount };
})();
