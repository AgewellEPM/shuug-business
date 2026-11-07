(() => {
  const browser = document.querySelector('[data-feature-browser]');
  if (!browser) return;
  const search = browser.querySelector('[data-feature-query]');
  const clear = browser.querySelector('[data-feature-clear]');
  const groups = [...browser.querySelectorAll('[data-feature-group]')];
  const entries = [...browser.querySelectorAll('[data-feature-entry]')];
  const count = browser.querySelector('[data-feature-count]');
  const empty = browser.querySelector('[data-feature-empty]');
  function filter() {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    browser.classList.toggle('features-filtered', words.length > 0);
    for (const entry of entries) entry.hidden = !words.every(word => entry.dataset.featureSearch.toLowerCase().includes(word));
    for (const group of groups) group.hidden = ![...group.querySelectorAll('[data-feature-entry]')].some(entry => !entry.hidden);
    const visible = entries.filter(entry => !entry.hidden).length;
    count.textContent = `${visible} of ${entries.length} features${words.length ? ' match your search' : ' explained below'}`;
    empty.hidden = visible !== 0;
    clear.disabled = !words.length;
  }
  search.addEventListener('input', filter);
  clear.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  document.querySelector('.features-index nav')?.addEventListener('click', event => {
    if (!event.target.closest('a[href^="#"]')) return;
    search.value = ''; filter();
  });
  browser.querySelector('.features-search').hidden = false;
  filter();
})();
