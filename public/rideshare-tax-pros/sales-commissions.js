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
  function sampleHistory() {
    const today = new Date();
    const months = [300000, 425000, 620000, 802000, 1229000, 486000].map((cents, i) => ({
      month: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5 + i, 1)).toISOString().slice(0, 7),
      cents,
    }));
    // Use a fixed illustrative yearly total so the same example works in January.
    const rows = [
      ['Maple View Nursing Home · Setup and CRM', 125000],
      ['Riverbend Senior Living · Monthly CRM', 48000],
      ['Oakridge Care Center · Add-ons', 32000],
      ['Evergreen Health Services · Referral', 50000],
      ['Pine Grove Senior Center · CRM and setup', 231000],
    ].map(([label, cents], i) => ({
      label, cents, recordedAt: months.at(-1).month + '-' + String(Math.max(1, today.getUTCDate() - i)).padStart(2, '0'),
    }));
    return { months, yearCents: 3862000, total: rows.length, size: rows.length, rows };
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
    let request = 0, offset = 0, query = '', latest, currentMonthCents = 0, sampleActive = false;

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
      write('goal-note', goal ? money(currentMonthCents) + ' recorded this month' : 'No goal set');
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
      currentMonthCents = result.months.at(-1)?.cents || 0;
      write('year', money(result.yearCents));
      drawGoal();
      const max = Math.max(1, ...result.months.map(entry => entry.cents));
      find('trend').replaceChildren(...result.months.map(entry => {
        const bar = node('li');
        const label = monthLabel.format(new Date(entry.month + '-01T00:00:00Z'));
        const meter = node('meter');
        meter.max = max;
        meter.value = entry.cents;
        meter.setAttribute('aria-label', label + ': ' + money(entry.cents));
        bar.append(node('strong', money(entry.cents)), meter, node('span', label));
        return bar;
      }));
      write('trend-empty', result.months.some(entry => entry.cents > 0) ? '' : 'No payments recorded in this period.');
      const rows = find('receipts');
      rows.replaceChildren(...result.rows.map(item => {
        const row = node('tr');
        row.append(node('td', item.recordedAt.slice(0, 10)), node('td', item.label), node('td', money(item.cents)));
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
      write('total-note', 'Illustrative current earnings');
      write('pending', money(840000));
      write('pending-note', '5 sample deals · awaiting activation');
      termsList(find('breakdown'), [
        ['Software / CRM', money(243000)], ['Contracts / setup', money(97200)],
        ['Referrals', money(72900)], ['Bonuses / incentives', money(72900)],
      ]);
      const rates = node('dl');
      termsList(rates, [['TinkyTown CRM', '20% recurring'], ['Setup', '10%–25% one-time'], ['Add-ons', '15% one-time'], ['Referrals', '$250–$1,000 sample bonus']]);
      find('structure').replaceChildren(rates);
      write('incentives', '$2,500 · +5%  |  $5,000 · +10%  |  $10,000 · +15% sample bonus tiers');
      write('year-note', 'Illustrative year-to-date payments');
      write('trend-note', 'Sample payments over six months');
      write('ledger-title', 'Sample payments');
      write('payout-notice', 'Example next payout: ' + money(840000) + ' via bank transfer.');
      drawHistory(sampleHistory());
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
        find('search').hidden = find('controls').hidden = sampleActive;
        latest = data;
        if (sampleActive) { drawSample(); return; }
        if (wasSample) {
          currentMonthCents = 0;
          find('receipts').replaceChildren();
          find('trend').replaceChildren();
          write('year', '—');
          write('trend-empty', '');
          write('ledger-status', '');
        }
        write('year-note', 'Payments logged in the workspace');
        write('trend-note', 'Recorded payments over the last six months');
        write('ledger-title', 'Recorded earnings');
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
          find('ledger').removeAttribute('aria-busy');
          write('year', '—');
          write('trend-empty', 'Recorded payment history is available to the workspace owner.');
        }
      },
    };
  }
  window.SdrCommissions = { mount };
})();
