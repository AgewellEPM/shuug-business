(() => {
  'use strict';

  function mount() {
    const root = document.querySelector('.sdr-products');
    if (!root) return;
    const search = root.querySelector('[data-product-search]');
    const clear = search.querySelector('[data-product-clear]');
    const input = search.elements.query;
    const results = root.querySelector('[data-product-results]');
    const count = results.querySelector('[data-product-search-count]');
    const matches = [...results.querySelectorAll('[data-product-result]')];
    const tabs = [...root.querySelectorAll('[data-product-tab]')];
    const panes = [...root.querySelectorAll('[data-product-pane]')];
    const devices = [...root.querySelectorAll('[data-product-device]')];
    const promos = [...root.querySelectorAll('[data-product-overview-only]')];
    const dialog = root.querySelector('[data-product-dialog]');
    const title = dialog.querySelector('h2');
    const packages = new Map([...dialog.querySelectorAll('[data-product-package-detail]')].map(panel =>
      [panel.dataset.productPackageDetail, panel]));
    let current = 'overview', opener;

    function refresh() {
      const terms = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const searching = terms.length > 0;
      results.hidden = clear.hidden = !searching;
      for (const pane of panes) pane.hidden = searching || !pane.dataset.productPane.split(' ').includes(current);
      for (const device of devices) device.hidden = current !== 'overview' && device.dataset.productDevice !== current;
      for (const promo of promos) promo.hidden = current !== 'overview';
      if (!searching) return;
      let total = 0;
      for (const result of matches) {
        const text = (result.textContent + ' ' + result.dataset.productResult).toLocaleLowerCase();
        result.hidden = !terms.every(term => text.includes(term));
        if (!result.hidden) total++;
      }
      count.textContent = total ? `${total} ${total === 1 ? 'match' : 'matches'}` : 'No products or packages match your search.';
    }

    function show(section, reset = false) {
      const active = tabs.find(link => link.dataset.productTab === section) || tabs[0];
      if (current !== active.dataset.productTab || reset) input.value = '';
      current = root.dataset.productSection = active.dataset.productTab;
      for (const link of tabs) {
        if (link === active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      refresh();
    }

    search.addEventListener('input', refresh);
    search.addEventListener('submit', event => {
      event.preventDefault();
      refresh();
    });
    clear.addEventListener('click', () => {
      input.value = '';
      refresh();
      input.focus();
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-product-package-open]');
      if (button) {
        const details = packages.get(button.dataset.productPackageOpen);
        if (!details) return;
        opener = button;
        title.textContent = details.dataset.productPackageName;
        for (const panel of packages.values()) panel.hidden = panel !== details;
        if (!dialog.open) dialog.showModal();
        return;
      }
      const link = event.target.closest('a');
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (link.hasAttribute('data-product-dialog-quote')) {
        dialog.close();
        return;
      }
      if (link.hasAttribute('data-product-tab') || link.hasAttribute('data-product-result-link')) {
        const section = new URLSearchParams(link.hash.slice(1)).get('section');
        show(section, true);
      }
    });
    dialog.addEventListener('close', () => opener?.focus());
    return { show, packageName: key => packages.get(key)?.dataset.productPackageName };
  }

  window.SdrProducts = { mount };
})();
