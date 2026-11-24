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

  function mount({ api }) {
    const panel = document.querySelector('.sdr-commissions');
    if (!panel) return null;
    const find = key => panel.querySelector('[data-com-' + key + ']');
    const write = (key, text) => { find(key).textContent = text; };
    const goalForm = find('goal-form');
    const search = find('search');
    const goalKey = 'sdr.workspace.monthlyEarningsGoalCents';
    let request = 0, offset = 0, query = '', latest, currentMonthCents = 0;

    function readGoal() {
      try { return Number(localStorage.getItem(goalKey)) || 0; }
      catch { return 0; }
    }
    function drawGoal() {
      const goal = latest?.earnings ? readGoal() : 0;
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
      find('previous').disabled = offset === 0;
      find('next').disabled = offset + result.size >= result.total;
      write('ledger-status', result.total ? (offset + 1) + '–' + (offset + result.rows.length) + ' of ' + result.total : 'No payments match.');
      return result.size;
    }

    let pageSize = 10;
    async function load() {
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
      const popover = document.querySelector('#sdr-earnings');
      if (!popover || popover.hidden) return;
      popover.open = true;
      popover.querySelector('input').focus();
    });
    goalForm.addEventListener('submit', event => {
      event.preventDefault();
      const raw = goalForm.elements.goal.value.trim();
      if (raw && !/^\d{1,7}(?:\.\d{1,2})?$/.test(raw)) return write('goal-status', 'Enter a USD amount with up to two decimal places.');
      try { localStorage.setItem(goalKey, String(Math.round(Number(raw) * 100))); }
      catch { return write('goal-status', 'This browser could not save the goal.'); }
      drawGoal();
      write('goal-status', Number(raw) ? 'Monthly goal saved.' : 'Monthly goal cleared.');
    });

    return {
      show(data) {
        if (!data) return;
        latest = data;
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
