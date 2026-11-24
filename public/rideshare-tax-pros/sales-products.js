(() => {
  'use strict';

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

  function mountPricing(root, api) {
    const groups = {
      rate: [...root.querySelectorAll('[data-product-rate]')],
      commission: [...root.querySelectorAll('[data-product-commission]')],
    };
    const editor = root.querySelector('[data-product-owner]');
    const form = editor.querySelector('form');
    const fields = form.elements;
    const status = editor.querySelector('[data-product-pricing-status]');
    const submit = form.querySelector('button[type="submit"]');
    let revision, pending, saving = false, loaded = false;

    function showRates(rate, commission) {
      for (const entry of groups.rate) entry.textContent = rate;
      for (const entry of groups.commission) entry.textContent = commission;
    }

    function showRuleFields() {
      const configured = Boolean(fields.kind.value);
      for (const label of form.querySelectorAll('[data-product-rule]')) label.hidden = !configured;
      fields.amount.required = configured;
    }

    function render({ pricing, canEdit }) {
      loaded = true;
      const rule = pricing.commission;
      let payment = 'Pending owner approval';
      if (rule) {
        const frequency = rule.frequency === 'each' ? 'each paid month' : 'on the first paid month';
        const amount = usd.format(pricing.commissionCents / 100);
        const percentage = rule.kind === 'percent' ? ' (' + rule.value / 100 + '%)' : '';
        payment = amount + ' ' + frequency + percentage;
      }
      showRates(usd.format(pricing.rentalCents / 100) + ' / month', payment);
      editor.hidden = !canEdit;
      if (!canEdit) return;
      revision = pricing.revision;
      fields.rental.value = (pricing.rentalCents / 100).toFixed(2);
      fields.hardwareCost.value = pricing.hardwareCostCents === null ? '' : (pricing.hardwareCostCents / 100).toFixed(2);
      fields.kind.value = rule?.kind || '';
      fields.amount.value = rule ? (rule.value / 100).toFixed(2) : '';
      fields.frequency.value = rule?.frequency || 'first';
      showRuleFields();
    }

    function load() {
      pending ??= api('products-read').then(render).catch(() => {
        loaded = false;
        showRates('Pricing unavailable', 'Commission unavailable');
        editor.hidden = true;
        editor.open = false;
      }).finally(() => { pending = undefined; });
      return pending;
    }

    fields.kind.addEventListener('change', showRuleFields);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving || pending) return;
      submit.disabled = saving = true;
      status.textContent = 'Saving…';
      try {
        const values = Object.fromEntries(new FormData(form));
        render(await api('products-save', { revision, ...values }));
        status.textContent = 'Pricing saved.';
      } catch (error) {
        if (error.status === 409) await load();
        status.textContent = error.message;
      } finally {
        submit.disabled = saving = false;
      }
    });

    return reload => { if ((reload || !loaded) && !editor.open && !saving) void load(); };
  }

  function mount({ api }) {
    const root = document.querySelector('.sdr-products');
    if (!root) return;
    const refreshPricing = mountPricing(root, api);
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

    function show(section, reset = false, reloadPricing = false) {
      const active = tabs.find(link => link.dataset.productTab === section) || tabs[0];
      if (current !== active.dataset.productTab || reset) input.value = '';
      current = root.dataset.productSection = active.dataset.productTab;
      for (const link of tabs) {
        if (link === active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      refresh();
      refreshPricing(reloadPricing);
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
