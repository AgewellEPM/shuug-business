'use strict';
(() => {
  const destinations = { filing: ['Tax preparation', '/tax-preparation'], records: ['Mileage & expense records', '/mileage-and-expenses'], quarterly: ['Quarterly tax support', '/quarterly-taxes'], books: ['Year-round bookkeeping', '/bookkeeping'], unsure: ['Explore your service options', '/services'] };
  const platformNames = { uber: 'Uber / Uber Eats', lyft: 'Lyft', other: 'Other gig work' };
  const yearName = value => ({ earlier: 'Earlier or multiple tax years', unsure: 'Tax year to discuss' })[value] || value;
  const planner = document.querySelector('[data-plan]');
  if (planner) planner.addEventListener('click', () => {
    const year = document.querySelector('#plan-year');
    const error = document.querySelector('#planner-error');
    if (!year.value) { error.textContent = 'Choose a tax year, or select “I’m not sure yet.”'; error.hidden = false; year.setAttribute('aria-invalid', 'true'); year.focus(); return; }
    error.hidden = true; year.removeAttribute('aria-invalid');
    const need = document.querySelector('input[name="need"]:checked')?.value || 'unsure';
    const platforms = [...document.querySelectorAll('input[name="platform"]:checked')].map(input => input.value).filter(value => platformNames[value]);
    const selected = destinations[need] || destinations.unsure;
    document.querySelector('#plan-result-title').textContent = selected[0];
    document.querySelector('#plan-summary').textContent = `${yearName(year.value)} · ${platforms.length ? platforms.map(value => platformNames[value]).join(', ') : 'Platforms to discuss'}. Start with the record checklist, then confirm the actual service scope with your preparer.`;
    const fragment = new URLSearchParams({ year: year.value, need, platforms: platforms.join(',') });
    document.querySelector('#plan-checklist').href = `/document-checklist#${fragment}`;
    document.querySelector('#plan-service').href = selected[1];
    const result = document.querySelector('#plan-result'); result.hidden = false; result.focus();
  });

  const recordInputs = [...document.querySelectorAll('[data-record-item]')];
  if (recordInputs.length) {
    const params = new URLSearchParams(location.hash.slice(1, 300));
    const platforms = (params.get('platforms') || '').split(',').filter(value => platformNames[value]);
    const year = params.get('year') || '';
    const validYear = /^(20\d{2}|earlier|unsure)$/.test(year) ? yearName(year) : '';
    const need = params.get('need');
    for (const item of document.querySelectorAll('.record-item')) item.hidden = Boolean(platforms.length && item.dataset.platform !== 'all' && !platforms.includes(item.dataset.platform));
    if (validYear || platforms.length) document.querySelector('#checklist-context').textContent = `${validYear || 'Your preparation checklist'}${platforms.length ? ` · ${platforms.map(value => platformNames[value]).join(', ')}` : ''}${destinations[need] ? ` · ${destinations[need][0]}` : ''}. Mark the categories you have ready to discuss.`;
    const visible = () => recordInputs.filter(input => !input.closest('.record-item').hidden);
    const refresh = () => {
      const inputs = visible(); const checked = inputs.filter(input => input.checked).length;
      document.querySelector('#checklist-count').textContent = `${checked} of ${inputs.length} record items marked ready`;
      const progress = document.querySelector('#checklist-progress'); progress.max = Math.max(inputs.length, 1); progress.value = checked;
    };
    recordInputs.forEach(input => input.addEventListener('change', refresh)); refresh();
    document.querySelector('[data-reset]').addEventListener('click', () => { recordInputs.forEach(input => { input.checked = false; }); refresh(); });
    document.querySelector('[data-print]').addEventListener('click', () => window.print());
    document.querySelector('[data-download]').addEventListener('click', () => {
      const lines = ['RIDESHARE TAX PROS — PREPARATION CHECKLIST', document.querySelector('#checklist-context').textContent, '', ...visible().map(input => `${input.checked ? '[Ready]' : '[To review]'} ${input.closest('.record-item').querySelector('span').textContent}`), '', 'An organization aid, not a tax calculation or a submission to the firm.', 'https://rideshare-tax-pros.vercel.app/document-checklist'];
      const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'rideshare-tax-preparation-checklist.txt'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  for (const library of document.querySelectorAll('[data-search-library]')) {
    const search = library.querySelector('[data-search-input]'); const category = library.querySelector('[data-search-category]');
    const entries = [...library.querySelectorAll('[data-search-card]')];
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'clear-search'; clear.dataset.clearSearch = '';
    clear.textContent = category ? 'Clear filters' : 'Clear search';
    library.querySelector('.search-controls').append(clear);
    const filter = () => {
      const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let count = 0;
      for (const entry of entries) {
        entry.hidden = !words.every(word => entry.dataset.searchText.toLowerCase().includes(word)) || Boolean(category && category.value !== 'all' && entry.dataset.category !== category.value);
        if (!entry.hidden) count++;
      }
      const noun = category ? 'question' : 'resource';
      library.querySelector('[data-search-count]').textContent = `${count} ${noun}${count === 1 ? '' : 's'} found`;
      library.querySelector('[data-search-empty]').hidden = count !== 0;
      clear.disabled = !search.value && (!category || category.value === 'all');
    };
    clear.addEventListener('click', () => { search.value = ''; if (category) category.value = 'all'; filter(); search.focus(); });
    search.addEventListener('input', filter); category?.addEventListener('change', filter); filter();
  }

  const portal = document.querySelector('#client-access-links');
  if (portal) Promise.resolve(window.rtpSiteConfig || {}).then(config => {
    const safe = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } };
    const workspace = safe(config.workspaceUrl); const external = safe(config.drakePortalUrl);
    for (const [label, href] of [['Open Shuug client workspace', workspace], ['External filing portal', external]]) {
      if (!href) continue;
      const link = document.createElement('a'); link.className = `button ${href === workspace ? 'primary' : 'secondary'}`; link.href = href; link.textContent = `${label} ↗`; portal.append(link);
    }
    if (workspace) {
      document.querySelector('#client-access-title').textContent = 'Open your client workspace.';
      document.querySelector('#client-access-description').textContent = 'Continue to the firm’s configured Shuug sign-in. Your account and permissions are managed there.';
    }
  });
})();
