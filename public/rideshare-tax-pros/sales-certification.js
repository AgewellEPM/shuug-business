(() => {
  'use strict';
  const tags = {
    overview: 'program sales representative overview', training: 'classes curriculum courses lessons healthcare ada practice',
    certificates: 'certification certificates awards recognition badges completion', earnings: 'earnings bonuses rewards commissions payments',
    requirements: 'steps requirements quiz knowledge checks assessment', apply: 'apply enroll register join start my plan',
  };
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function pairs(host, values) {
    host.replaceChildren(...values.map(([name, value]) => {
      const row = element('div');
      row.append(element('dt', name), element('dd', value));
      return row;
    }));
  }

  function mount({ api, onPlanSaved }) {
    const root = document.querySelector('.sdr-certification');
    if (!root) return;
    const find = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    const tabs = all('[data-cert-tab]'), parts = all('[data-cert-part]'), groups = all('[data-cert-group]');
    const search = find('[data-cert-search]'), query = search.elements.query, matches = all('[data-cert-result]');
    const results = find('[data-cert-results]'), clear = find('[data-cert-clear]');
    const enroll = find('[data-cert-enroll]'), enrollStatus = find('[data-cert-enroll-status]');
    const status = find('[data-cert-status]');
    let current = 'overview', record, loading, saving = false;

    function display() {
      const words = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const searching = words.length > 0;
      results.hidden = clear.hidden = !searching;
      parts.forEach(part => { part.hidden = searching || !part.dataset.certPart.split(' ').includes(current); });
      groups.forEach(group => { group.hidden = [...group.children].every(child => child.hidden); });
      if (!searching) return;
      for (const match of matches) {
        const indexed = tags[match.dataset.certResult];
        match.hidden = !words.every(word => indexed.includes(word));
      }
      const count = matches.filter(match => !match.hidden).length;
      find('[data-cert-match-count]').textContent = count ? `${count} ${count === 1 ? 'match' : 'matches'}` : 'No program topics match your search.';
    }
    function select(section, reset = false) {
      const active = tabs.find(tab => tab.dataset.certTab === section) || tabs[0];
      if (reset || current !== active.dataset.certTab) query.value = '';
      current = root.dataset.certSection = active.dataset.certTab;
      tabs.forEach(tab => {
        if (tab === active) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      });
      display();
    }
    function callout(node, text) { node.textContent = text; node.hidden = !text; }

    function requirements() {
      const { catalog, progress } = record;
      return catalog.certificates.map(certificate => {
        const path = catalog.paths.find(item => item.id === certificate.pathId);
        const required = path?.courseIds || [];
        const completed = required.filter(id => progress.completed[id]);
        const earned = required.length > 0 && completed.length === required.length;
        return {
          certificate, required, completed, earned,
          earnedAt: earned ? completed.map(id => progress.completed[id]).sort().at(-1) : null,
        };
      });
    }
    function trainingLink(label, course) {
      const anchor = element('a', label);
      anchor.className = 'cert-text-link';
      anchor.href = course ? '#view=training&course=' + encodeURIComponent(course) : '#view=training&section=certificates';
      return anchor;
    }
    function renderTraining() {
      const { catalog, progress } = record, paths = requirements();
      const intro = element('li');
      const onboarding = catalog.featuredCourseId;
      const started = progress.completed[onboarding] ? 'Complete' : progress.currentCourseId === onboarding || progress.sections[onboarding] ? 'In progress' : 'Ready to begin';
      intro.append(element('strong', 'Sales Onboarding'), element('span', started), trainingLink('Open onboarding', onboarding));
      find('[data-cert-paths]').replaceChildren(intro, ...paths.map(path => {
        const card = element('li'), meter = element('progress');
        meter.max = path.required.length || 1;
        meter.value = path.completed.length;
        meter.setAttribute('aria-label', path.certificate.title + ' completion');
        card.dataset.earned = String(path.earned);
        card.append(element('strong', path.certificate.title), element('span', `${path.completed.length} of ${path.required.length} courses`), meter,
          trainingLink(path.earned ? 'View certificate' : 'Open next course', path.required.find(id => !progress.completed[id])));
        return card;
      }));
      pairs(find('[data-cert-progress]'), [
        ['Courses completed', catalog.courses.filter(course => progress.completed[course.id]).length],
        ['Courses in My Plan', progress.plan.length],
        ['Certificates earned', paths.filter(path => path.earned).length],
      ]);
      find('[data-cert-awards]').replaceChildren(...paths.map(path => {
        const row = element('li'), title = element('strong', path.certificate.title);
        row.dataset.earned = String(path.earned);
        const when = new Date(path.earnedAt);
        const label = path.earned && Number.isFinite(when.getTime()) ? 'Earned ' + date.format(when) : path.earned ? 'Earned' : 'In training';
        row.append(title, element('small', label));
        return row;
      }));
      enroll.disabled = saving || !paths.length;
    }
    function load() {
      if (loading) return loading;
      if (!record) callout(status, 'Loading certification progress…');
      loading = api('training-progress').then(next => {
        record = next;
        callout(status, '');
        renderTraining();
      }).catch(error => callout(status, error.message || 'Certification progress is unavailable.'))
        .finally(() => { loading = null; });
      return loading;
    }

    async function begin() {
      if (!record || saving) return;
      const core = requirements().find(path => path.certificate.id === 'tinkytown-sales');
      if (!core) return;
      saving = enroll.disabled = true;
      callout(enrollStatus, 'Opening your training…');
      try {
        const pending = core.required.filter(id => !record.progress.completed[id]);
        const add = pending.filter(id => !record.progress.plan.includes(id));
        if (add.length) {
          const { progress } = await api('training-update', { planChanges: { add } });
          record.progress = progress;
          await onPlanSaved?.();
        }
        renderTraining();
        callout(enrollStatus, '');
        if (!root.hidden) location.hash = trainingLink('', pending[0]).hash;
      } catch (error) {
        callout(enrollStatus, error.message || 'The learning plan could not be updated.');
      } finally {
        saving = enroll.disabled = false;
      }
    }
    function renderEarnings(data) {
      const ledger = data?.earnings, commission = data?.revenue?.commission, values = [];
      const amount = cents => money.format(cents / 100);
      if (ledger) values.push(['Recorded workspace earnings', amount(ledger.totalCents)], ['Payments recorded', ledger.count]);
      if (commission) values.push(['Estimated commissions earned', amount(commission.earnedCents)],
        ['Per verified paid signup', amount(commission.signupCents)], [`Bonus at ${commission.bonusOffices} paid signups`, amount(commission.bonusCents)]);
      pairs(find('[data-cert-earnings]'), values);
      find('[data-cert-earnings-note]').textContent = commission ? 'Commission estimates use verified collections.'
        : ledger ? 'Totals come from the workspace earnings ledger.' : 'Earnings and bonus terms are provided by your workspace owner.';
    }
    search.addEventListener('input', display);
    search.addEventListener('submit', event => { event.preventDefault(); display(); });
    clear.addEventListener('click', () => { query.value = ''; display(); query.focus(); });
    enroll.addEventListener('click', () => void begin());
    root.addEventListener('click', event => {
      const link = event.target.closest('[data-cert-tab], [data-cert-result] a');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      select(new URLSearchParams(link.hash.slice(1)).get('section'), true);
    });
    return { show(section) { select(section); return load(); }, renderEarnings };
  }
  window.SdrCertification = { mount };
})();
