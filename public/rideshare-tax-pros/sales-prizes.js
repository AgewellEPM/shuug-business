(() => {
  'use strict';
  function mount({ api }) {
    const root = document.querySelector('.sdr-prizes');
    if (!root) return;
    const find = selector => root.querySelector(selector);
    const form = find('[data-prize-search]'), query = form.elements.query, clear = find('[data-prize-clear]');
    const rows = [...root.querySelectorAll('[data-prize-row]')], counters = [...root.querySelectorAll('[data-prize-count]')];
    const status = find('[data-prize-status]');
    let pending;

    function filter() {
      const words = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      for (const row of rows) {
        const text = row.textContent.toLocaleLowerCase();
        row.hidden = !words.every(word => text.includes(word));
      }
      clear.hidden = !words.length;
      find('[data-prize-empty]').hidden = rows.some(row => !row.hidden);
    }
    form.addEventListener('input', filter);
    form.addEventListener('submit', event => { event.preventDefault(); filter(); });
    clear.addEventListener('click', () => { query.value = ''; filter(); query.focus(); });

    function show() {
      if (pending) return pending;
      status.textContent = 'Loading monthly progress…';
      pending = api('monthly-prizes-read', { month: root.dataset.prizeMonth }).then(data => {
        const scope = data.scope === 'team' ? 'Team progress' : 'Your progress';
        const period = data.month === data.currentMonth ? 'this month' : 'for the listed month';
        find('[data-prize-scope]').textContent = scope + ' ' + period + '.';
        counters.forEach(counter => {
          const count = data[counter.dataset.prizeCount];
          counter.textContent = `${count} / ${counter.dataset.prizeTarget}`;
        });
        find('[data-prize-early]').textContent = `${data.signedBy10th} signed by the 10th`;
        status.textContent = '';
      }).catch(() => {
        status.textContent = 'Monthly progress could not be loaded.';
      }).finally(() => { pending = null; });
      return pending;
    }
    return { show };
  }
  window.SdrMonthlyPrizes = { mount };
})();
