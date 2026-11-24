(() => {
  'use strict';
  const tags = {
    overview: 'program sales representative overview', training: 'classes curriculum courses lessons healthcare ada practice',
    certificates: 'certification certificates awards recognition badges completion', earnings: 'earnings bonuses rewards commissions payments',
    practical: 'observed practical field visit sign off role play coaching owner score readiness',
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
      const practical = element('li'), link = element('a', 'Observed sales practical');
      link.href = '#view=certification&section=practical';
      practical.dataset.earned = String(Boolean(record.field.review?.passed));
      const result = record.field.review?.passed ? 'Passed ' + date.format(new Date(record.field.review.reviewedAt))
        : record.field.review ? 'Retry with coaching' : record.field.ready ? 'Ready for observation' : 'In training';
      practical.append(link, element('small', result));
      find('[data-cert-awards]').append(practical);
      enroll.disabled = saving || !paths.length;
    }
    const fieldForm = find('[data-field-form]'), fieldLoad = find('[data-field-load]');
    const fieldStatus = find('[data-field-status]');
    let candidates = [], fieldBusy = false;
    function standingText(standing) {
      if (standing.review?.passed) return 'Passed the observed sales practical.';
      if (standing.review) return 'Retry the observed visit after practicing the skills below.';
      if (standing.ready) return 'Ready to schedule the observed visit with the workspace owner.';
      const remaining = standing.remaining.map(id => record.catalog.courses.find(course => course.id === id)?.title || id);
      if (!standing.scenarioPassed) remaining.push('Pass one Pipeline Practice case');
      return 'Before the observed visit, complete the following — ' + remaining.join(' · ');
    }
    function feedbackText(review) {
      if (!review) return '';
      const missed = record.catalog.fieldRubric.filter(row => !review.checked.includes(row.id)).map(row => row.label);
      return [date.format(new Date(review.reviewedAt)), review.note, ...missed].join(' · ');
    }
    function renderField() {
      const { field, catalog } = record;
      find('[data-field-standing]').textContent = standingText(field);
      callout(find('[data-field-feedback]'), feedbackText(field.review));
      find('[data-field-rubric]').replaceChildren(...catalog.fieldRubric.map(row => element('li', row.label)));
      find('[data-field-owner]').hidden = !field.canReview;
    }
    function selectRep() {
      const rep = candidates.find(item => item.id === fieldForm.elements.rep.value);
      const fieldset = fieldForm.querySelector('fieldset');
      fieldset.disabled = !rep?.ready || Boolean(rep?.review?.passed) || fieldBusy;
      find('[data-field-rep-state]').textContent = rep ? standingText(rep) : 'Select the rep you observed.';
      fieldForm.elements.note.value = rep?.review?.note || '';
      find('[data-field-checks]').replaceChildren(...record.catalog.fieldRubric.map(row => {
        const label = element('label'), input = element('input');
        input.type = 'checkbox'; input.name = 'skill'; input.value = row.id;
        // A retry scores a fresh performance.
        input.checked = Boolean(rep?.review?.passed && rep.review.checked.includes(row.id));
        label.append(input, ' ' + row.label);
        return label;
      }));
      if (rep && !rep.review?.passed) fieldForm.elements.note.value = '';
      if (rep?.review && !rep.review.passed) find('[data-field-rep-state]').textContent += ' Previous review: ' + feedbackText(rep.review);
    }
    fieldLoad.addEventListener('click', async () => {
      if (fieldBusy) return;
      fieldBusy = fieldLoad.disabled = true;
      fieldForm.hidden = true;
      callout(fieldStatus, 'Loading reps…');
      try {
        ({ candidates } = await api('training-field-candidates'));
        const picker = fieldForm.elements.rep;
        picker.replaceChildren(new Option('Choose the rep you observed', ''), ...candidates.map(rep => new Option(rep.name, rep.id)));
        fieldForm.hidden = !candidates.length;
        selectRep();
        callout(fieldStatus, candidates.length ? '' : 'No active sales reps to review.');
      } catch (error) { callout(fieldStatus, error.message); }
      finally { fieldBusy = fieldLoad.disabled = false; }
    });
    fieldForm.elements.rep.addEventListener('change', () => { callout(fieldStatus, ''); selectRep(); });
    fieldForm.addEventListener('submit', async event => {
      event.preventDefault();
      const rep = candidates.find(item => item.id === fieldForm.elements.rep.value);
      if (fieldBusy || !rep?.ready || rep.review?.passed) return;
      const checked = [...fieldForm.querySelectorAll('input:checked')].map(input => input.value);
      const fieldset = fieldForm.querySelector('fieldset');
      fieldBusy = fieldLoad.disabled = fieldForm.elements.rep.disabled = fieldset.disabled = true;
      try {
        const { review } = await api('training-field-review', { repId: rep.id, checked, revision: rep.review?.revision || 0, note: fieldForm.elements.note.value });
        rep.review = review;
        callout(fieldStatus, rep.name + (review.passed ? ' passed the observed practical.' : ' has coaching feedback for a retry.'));
        fieldBusy = false;
        selectRep();
      } catch (error) {
        callout(fieldStatus, error.message);
        fieldset.disabled = false;
      } finally { fieldBusy = fieldLoad.disabled = fieldForm.elements.rep.disabled = false; }
    });
    function load() {
      if (loading) return loading;
      if (!record) callout(status, 'Loading certification progress…');
      loading = api('training-progress').then(next => {
        record = next;
        callout(status, '');
        renderTraining();
        renderField();
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
        const pending = record.field.remaining;
        const add = pending.filter(id => !record.progress.plan.includes(id));
        if (add.length) {
          const { progress } = await api('training-update', { planChanges: { add } });
          record.progress = progress;
          await onPlanSaved?.();
        }
        renderTraining();
        callout(enrollStatus, '');
        if (!root.hidden) location.hash = pending.length ? trainingLink('', pending[0]).hash : '#view=certification&section=practical';
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
