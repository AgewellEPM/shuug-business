(() => {
  'use strict';
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
  const usd = cents => currency.format(cents / 100);

  const offers = new Map([
    ['facility-rental', 'TinkySpeak facility hardware rental'],
    ['healthcare', 'TinkyTown Healthcare'],
  ]);

  function mount({ api }) {
    const root = document.querySelector('.sdr-products');
    if (!root) return;
    const find = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    const form = find('[data-product-form]');
    const status = find('[data-product-status]');
    const editor = find('.product-edit');
    const submit = form.querySelector('button[type="submit"]');
    let revision, pending;

    function ruleFields() {
      const active = Boolean(form.elements.kind.value);
      for (const label of all('[data-product-rule]')) label.hidden = !active;
      form.elements.amount.required = active;
    }

    function showPricing({ pricing, canEdit }) {
      revision = pricing.revision;
      for (const label of all('[data-product-price]')) label.textContent = usd(pricing.rentalCents) + ' / month';
      let commission = 'Awaiting approval';
      if (pricing.commission) {
        commission = usd(pricing.commissionCents) + (pricing.commission.frequency === 'each' ? ' each paid month' : ' on the first paid month');
        if (pricing.commission.kind === 'percent') commission += ' (' + (pricing.commission.value / 100) + '%)';
      }
      for (const label of all('[data-product-commission]')) label.textContent = commission;
      for (const owner of all('[data-product-owner]')) owner.hidden = !canEdit;
      if (!canEdit) return;
      find('[data-product-cost]').textContent = pricing.hardwareCostCents === null ? 'Awaiting entry' : usd(pricing.hardwareCostCents);
      form.elements.rental.value = (pricing.rentalCents / 100).toFixed(2);
      form.elements.hardwareCost.value = pricing.hardwareCostCents === null ? '' : (pricing.hardwareCostCents / 100).toFixed(2);
      form.elements.kind.value = pricing.commission?.kind || '';
      form.elements.amount.value = pricing.commission ? (pricing.commission.value / 100).toFixed(2) : '';
      form.elements.frequency.value = pricing.commission?.frequency || 'first';
      ruleFields();
    }

    function load() {
      if (pending) return pending;
      status.textContent = '';
      pending = api('products-read').then(showPricing).catch(() => {
        status.textContent = 'Pricing is unavailable. Choose Pricing & commission to try again.';
        for (const label of all('[data-product-price]')) label.textContent = 'Pricing unavailable';
        for (const label of all('[data-product-commission]')) label.textContent = 'Unavailable';
        for (const owner of all('[data-product-owner]')) owner.hidden = true;
        editor.open = false;
      }).finally(() => { pending = undefined; });
      return pending;
    }

    function show(section) {
      const view = ['pricing', 'compare'].includes(section) ? section : 'overview';
      for (const tab of all('[data-product-view]')) {
        if (tab.dataset.productView === view) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      }
      for (const panel of all('[data-product-panel]')) panel.hidden = panel.dataset.productPanel !== view;
      if (!editor.open) void load();
    }
    form.elements.kind.addEventListener('change', ruleFields);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled || pending) return;
      submit.disabled = true;
      status.textContent = 'Saving…';
      try {
        showPricing(await api('products-save', { revision, ...Object.fromEntries(new FormData(form)) }));
        status.textContent = 'Pricing saved.';
      } catch (error) {
        if (error.status === 409) {
          editor.open = false;
          await load();
        }
        status.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    return { show, offerName: id => offers.get(id) };
  }

  window.SdrProducts = { mount };
})();
