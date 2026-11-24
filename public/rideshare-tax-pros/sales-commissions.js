(() => {
  'use strict';
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  const money = value => currency.format(value / 100);
  const valueOrDash = value => Number.isFinite(value) ? money(value) : '—';
  function node(tag, content) {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = content;
    return element;
  }

  const sampleGoal = 1000000;
  function sampleHistory(expanded) {
    const months = [162000, 312000, 406000, 612000, 822000, 1048000].map((cents, i) => ({
      month: '2026-' + String(6 + i).padStart(2, '0'), cents, projected: i === 5,
    }));
    const rows = [
      ['2026-11-23', 'Maple View Nursing Home', 'Setup + CRM', 125000, 'Earned'],
      ['2026-11-20', 'Riverbend Senior Living', 'CRM (Monthly)', 48000, 'Pending'],
      ['2026-11-18', 'Oakridge Care Center', 'Add-ons', 32000, 'Earned'],
      ['2026-11-15', 'Evergreen Health Services', 'Referral bonus', 50000, 'Earned'],
      ['2026-11-12', 'Pine Grove Senior Center', 'Setup + CRM', 279000, 'Earned'],
      ...(expanded ? [
        ['2026-10-30', 'Briarwood Assisted Living', 'CRM (Monthly)', 144000, 'Paid'],
        ['2026-10-24', 'Westfield Community Center', 'Setup', 187000, 'Paid'],
        ['2026-10-14', 'Meadowbrook Rehab', 'Setup + CRM', 230000, 'Paid'],
      ] : []),
    ].map(([recordedAt, label, type, cents, status]) => ({ label, type, cents, status, recordedAt }));
    return { months, yearCents: 3862000, currentMonthCents: 486000, total: rows.length, size: rows.length, rows };
  }

  function drawPlot(canvas, months) {
    if (!window.CanvasRenderingContext2D) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const dpi = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpi);
    canvas.height = Math.round(height * dpi);
    const ctx = canvas.getContext('2d');
    if (!ctx || !months.length) return;
    ctx.scale(dpi, dpi);
    const top = 12, bottom = height - 8;
    const step = width / months.length;
    const max = Math.ceil(Math.max(100000, ...months.map(month => month.cents)) / 200000) * 200000;
    const points = months.map(({ cents }, i) => [step * (i + 0.5), bottom - cents / max * (bottom - top)]);
    ctx.strokeStyle = '#d5e4fb';
    for (let i = 0; i < 5; i++) {
      const y = top + (bottom - top) * i / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, '#1987f96a');
    gradient.addColorStop(1, '#8ec5ff26');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(points[0][0], bottom);
    for (const point of points) ctx.lineTo(...point);
    ctx.lineTo(points.at(-1)[0], bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1253ec';
    ctx.lineWidth = 3;
    for (let i = 1; i < points.length; i++) {
      ctx.setLineDash(months[i].projected ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(...points[i - 1]);
      ctx.lineTo(...points[i]);
      ctx.stroke();
    }
    ctx.fillStyle = '#1253ec';
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(...point, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function mount({ api }) {
    const panel = document.querySelector('.sdr-commissions');
    if (!panel) return null;
    const find = key => panel.querySelector('[data-com-' + key + ']');
    const write = (key, text) => { find(key).textContent = text; };
    const goalForm = find('goal-form');
    const search = find('search');
    const goalKey = 'sdr.workspace.monthlyEarningsGoalCents';
    const sampleProfile = document.querySelector('[data-profile-sample]');
    const profileForm = document.getElementById('sales-team-profile');
    const profileProgress = document.querySelector('[data-team-profile-progress]');
    const openSampleProfile = document.querySelector('[data-profile-sample-open]');
    const samplePhoto = sampleProfile?.querySelector('[data-sample-photo]');
    const sampleName = sampleProfile?.querySelector('[data-sample-name]');
    const sampleHeader = document.querySelectorAll('[data-sample-xp], [data-sample-total], [data-sample-role]');
    const plot = find('plot');
    let request = 0, offset = 0, query = '', latest, currentMonthCents = 0, sampleActive = false, expanded = false, monthsOnChart = [];
    if (window.ResizeObserver) new ResizeObserver(() => drawPlot(plot, monthsOnChart)).observe(plot);

    function preview(data, view) {
      const params = new URLSearchParams(location.hash.slice(1));
      const requested = params.get('sample') === '1' && params.get('view') === view;
      const profile = requested && view === 'team' && params.get('section') === 'profile';
      const earnings = requested && view === 'commissions';
      const active = profile || earnings;
      document.body.toggleAttribute('data-sdr-sample', active);
      for (const status of sampleHeader) status.hidden = !active;
      if (sampleProfile) {
        sampleProfile.hidden = !profile;
        profileForm.hidden = profile;
        profileProgress.hidden = profile;
        openSampleProfile.hidden = profile;
      }
      if (profile && data && sampleName) {
        sampleName.textContent = data.repProfile?.name || data.user.name;
        const photo = data.repProfile?.photo;
        samplePhoto.hidden = !photo;
        if (photo) samplePhoto.src = photo;
        else samplePhoto.removeAttribute('src');
      }
      return earnings;
    }

    function readGoal() {
      try { return Number(localStorage.getItem(goalKey)) || 0; }
      catch { return 0; }
    }
    function drawGoal() {
      const goal = sampleActive ? sampleGoal : latest?.earnings ? readGoal() : 0;
      const progress = find('progress');
      write('goal', goal ? money(goal) : '—');
      const percent = goal ? Math.round(currentMonthCents / goal * 1000) / 10 + '%' : '';
      write('goal-note', goal && !sampleActive ? money(currentMonthCents) + ' recorded this month' : goal ? '' : 'No goal set');
      write('goal-percent', percent);
      progress.hidden = !goal;
      if (goal) {
        progress.max = goal;
        progress.value = Math.min(goal, currentMonthCents);
        progress.setAttribute('aria-valuetext', money(currentMonthCents) + ' recorded out of ' + money(goal));
      }
    }
    function termsList(host, rows) {
      host.replaceChildren(...rows.flatMap(([name, value]) => [node('dt', name), node('dd', value)]));
    }
    function drawSummary(data) {
      const earnings = data.earnings, commission = data.revenue?.commission;
      const total = earnings?.totalCents ?? commission?.earnedCents;
      write('total', valueOrDash(total));
      write('overview', valueOrDash(total));
      write('total-note', earnings ? earnings.count + (earnings.count === 1 ? ' recorded payment' : ' recorded payments') :
        commission ? 'Estimated from verified collections' : 'Workspace records are owner-only');
      write('pending', valueOrDash(commission?.pendingSignupCents));
      write('pending-note', commission ? 'Estimated from eligible unpaid agreements' : 'Commission tracking is not configured');
      termsList(find('breakdown'), commission ? [
        ['Signup', money(commission.signupEarnedCents)], ['Recurring', money(commission.residualEarnedCents)], ['Bonuses', money(commission.bonusEarnedCents)]
      ] : [['Recorded payments', valueOrDash(total)]]);
      const structure = find('structure');
      if (commission) {
        const list = node('dl');
        termsList(list, [['Per paid signup', money(commission.signupCents)],
          ['Monthly residual', money(commission.residualCents) + ' from month ' + commission.residualStartsMonth]]);
        structure.replaceChildren(list);
        write('incentives', money(commission.bonusCents) + ' at your first ' + commission.bonusOffices + ' paid signups.');
      } else {
        structure.replaceChildren(node('p', 'Commission rates are not configured for this workspace.'));
        write('incentives', 'No commission tiers or bonuses are configured.');
      }
      find('ledger').hidden = find('settings').hidden = !earnings;
    }

    function drawHistory(result) {
      const start = sampleActive ? 0 : offset;
      currentMonthCents = result.currentMonthCents ?? result.months.at(-1)?.cents ?? 0;
      write('year', money(result.yearCents));
      drawGoal();
      monthsOnChart = result.months;
      drawPlot(plot, monthsOnChart);
      find('trend').replaceChildren(...result.months.map(entry => {
        const item = node('li');
        const label = monthLabel.format(new Date(entry.month + '-01T00:00:00Z'));
        item.append(node('b', label), node('span', money(entry.cents) + (entry.projected ? ' projected' : '')));
        return item;
      }));
      write('trend-empty', result.months.some(entry => entry.cents > 0) ? '' : 'No payments recorded in this period.');
      find('receipts').replaceChildren(...result.rows.map(item => {
        const row = node('tr');
        row.append(node('td', item.recordedAt.slice(0, 10)), node('td', item.label));
        if (sampleActive) row.append(node('td', item.type));
        row.append(node('td', money(item.cents)));
        if (sampleActive) {
          const cell = node('td');
          const badge = node('span', item.status);
          badge.className = 'com-status';
          badge.dataset.status = item.status.toLowerCase();
          cell.append(badge);
          row.append(cell);
        }
        return row;
      }));
      find('previous').disabled = start === 0;
      find('next').disabled = start + result.size >= result.total;
      write('ledger-status', result.total ? (start + 1) + '–' + (start + result.rows.length) + ' of ' + result.total : 'No payments match.');
      return result.size;
    }

    function drawSample() {
      ++request;
      find('ledger').removeAttribute('aria-busy');
      find('ledger').hidden = false;
      find('settings').hidden = true;
      write('total', money(486000));
      write('overview', money(486000));
      write('total-note', '↑ +$1,275.00 this week');
      write('pending', money(840000));
      write('pending-note', '5 deals · awaiting activation');
      write('year-title', 'Paid to date (YTD)');
      write('year-note', '12 payouts');
      termsList(find('breakdown'), [
        ['Software / CRM', '$2,430.00 · 50%'], ['Contracts / Setup', '$972.00 · 20%'],
        ['Referrals', '$729.00 · 15%'], ['Bonuses / Incentives', '$729.00 · 15%'],
      ]);
      const rates = node('dl');
      termsList(rates, [
        ['TinkyTown CRM (monthly)', '20% recurring'], ['Office / Organization Setup', '10%–25% one-time'],
        ['Add-ons & Integrations', '15% one-time'], ['Referrals (New Rep or Office)', '$250–$1,000 bonus'],
        ['Monthly Performance Bonus', '$500–$5,000+'],
      ]);
      find('structure').replaceChildren(rates);
      write('incentives', '');
      write('trend-note', 'Your commission growth over time');
      write('ledger-title', 'Recent Commissions');
      write('ledger-note', 'Your latest earnings and deal status');
      drawHistory(sampleHistory(expanded));
      write('ledger-status', '');
    }

    let pageSize = 10;
    async function load() {
      if (sampleActive) return;
      const token = ++request;
      find('ledger').setAttribute('aria-busy', 'true');
      try {
        const result = await api('earnings-history', { offset, query });
        if (token !== request) return;
        if (!result.rows.length && offset > 0) {
          offset = Math.max(0, Math.floor((result.total - 1) / result.size) * result.size);
          return load();
        }
        pageSize = drawHistory(result);
      } catch (error) {
        if (token === request) write('ledger-status', error.message);
      } finally {
        if (token === request) find('ledger').removeAttribute('aria-busy');
      }
    }
    find('all-earnings').addEventListener('click', event => {
      if (!sampleActive) return;
      expanded = !expanded;
      event.currentTarget.setAttribute('aria-expanded', String(expanded));
      event.currentTarget.textContent = expanded ? 'Show recent earnings' : 'View all earnings →';
      drawSample();
    });
    search.addEventListener('submit', event => {
      event.preventDefault();
      query = search.elements.query.value.trim();
      offset = 0;
      void load();
    });
    find('previous').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); void load(); });
    find('next').addEventListener('click', () => { offset += pageSize; void load(); });
    find('record').addEventListener('click', () => {
      if (sampleActive) return;
      const popover = document.querySelector('#sdr-earnings');
      if (!popover || popover.hidden) return;
      popover.open = true;
      popover.querySelector('input').focus();
    });
    goalForm.addEventListener('submit', event => {
      event.preventDefault();
      if (sampleActive) return;
      const raw = goalForm.elements.goal.value.trim();
      if (raw && !/^\d{1,7}(?:\.\d{1,2})?$/.test(raw)) return write('goal-status', 'Enter a USD amount with up to two decimal places.');
      try { localStorage.setItem(goalKey, String(Math.round(Number(raw) * 100))); }
      catch { return write('goal-status', 'This browser could not save the goal.'); }
      drawGoal();
      write('goal-status', Number(raw) ? 'Monthly goal saved.' : 'Monthly goal cleared.');
    });

    return {
      preview,
      show(data, sample) {
        if (!data) return;
        const wasSample = sampleActive;
        sampleActive = Boolean(sample);
        find('sample-open').hidden = sampleActive;
        find('sample-banner').hidden = !sampleActive;
        panel.toggleAttribute('data-com-demo-mode', sampleActive);
        for (const key of ['tiers', 'projected', 'demo-payout', 'all-earnings']) find(key).hidden = !sampleActive;
        for (const column of panel.querySelectorAll('[data-com-demo-column]')) column.hidden = !sampleActive;
        for (const key of ['search', 'controls', 'payout-notice']) find(key).hidden = sampleActive;
        latest = data;
        if (sampleActive) { drawSample(); return; }
        if (wasSample) {
          currentMonthCents = 0;
          find('receipts').replaceChildren();
          find('trend').replaceChildren();
          monthsOnChart = [];
          drawPlot(plot, monthsOnChart);
          write('year', '—');
          write('trend-empty', '');
          write('ledger-status', '');
        }
        write('year-title', 'Recorded this year');
        write('year-note', 'Payments logged in the workspace');
        write('trend-note', 'Recorded payments over the last six months');
        write('ledger-title', 'Recorded earnings');
        write('ledger-note', 'Payments recorded by the workspace owner');
        write('payout-notice', 'Payout scheduling and payment methods are not configured in this workspace.');
        drawSummary(data);
        drawGoal();
        if (data.earnings) {
          const saved = readGoal();
          goalForm.elements.goal.value = saved ? (saved / 100).toFixed(2) : '';
          void load();
        } else {
          ++request;
          find('receipts').replaceChildren();
          find('trend').replaceChildren();
          monthsOnChart = [];
          drawPlot(plot, monthsOnChart);
          find('ledger').removeAttribute('aria-busy');
          write('year', '—');
          write('trend-empty', 'Recorded payment history is available to the workspace owner.');
        }
      },
    };
  }
  window.SdrCommissions = { mount };
})();
