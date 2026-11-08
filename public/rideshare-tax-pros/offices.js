'use strict';
(() => {
  const form = document.querySelector('#office-search');
  if (!form) return;
  const query = document.querySelector('#office-query');
  const state = document.querySelector('#office-state');
  const results = document.querySelector('#office-results');
  const status = document.querySelector('#office-status');
  const empty = document.querySelector('#office-empty');
  const error = document.querySelector('#office-error');
  const support = document.querySelector('#office-support');
  const retry = document.querySelector('#office-retry');
  let directory = null;
  let loading = false;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const link = (label, href) => { const node = element('a', label); node.href = href; return node; };
  const phoneURL = value => typeof value === 'string' && /^\+?[\d ().-]{7,40}$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, '')) ? `tel:${value.replace(/[^+\d]/g, '')}` : null;

  function card(office) {
    const article = element('article', null, 'office-card');
    article.append(element('h3', office.name));
    const address = element('address');
    address.append(document.createTextNode(office.address), document.createElement('br'), document.createTextNode(`${office.city}, ${office.state} ${office.postalCode}`));
    article.append(address);
    if (office.hours) article.append(element('p', office.hours));
    const actions = element('div', null, 'office-card-links');
    const directions = new URL('https://maps.apple.com/');
    directions.searchParams.set('daddr', `${office.address}, ${office.city}, ${office.state} ${office.postalCode}`);
    actions.append(link('Get Directions ↗', directions.href));
    const phone = phoneURL(office.phone);
    if (phone) actions.append(link(`Call ${office.phone}`, phone));
    const appointment = window.rtpLinks.publicHttpsUrl(office.appointmentURL);
    if (appointment) actions.append(link('Book an Appointment ↗', appointment));
    article.append(actions);
    return article;
  }
  function render() {
    if (!directory) return;
    const words = normalize(query.value).trim().split(/\s+/).filter(Boolean);
    const offices = directory.offices.filter(office => {
      const haystack = normalize([office.name, office.address, office.city, office.state, office.postalCode].join(' '));
      return (!state.value || office.state === state.value) && words.every(word => haystack.includes(word));
    });
    results.replaceChildren(...offices.map(card));
    results.setAttribute('aria-busy', 'false');
    const filtered = Boolean(words.length || state.value);
    status.textContent = `${offices.length} participating office${offices.length === 1 ? '' : 's'}${filtered ? ' matching your search' : ' listed'}`;
    empty.hidden = offices.length !== 0;
    document.querySelector('#office-empty-title').textContent = directory.offices.length ? 'No offices match this search.' : 'Our local network is growing.';
    document.querySelector('#office-empty-description').textContent = directory.offices.length
      ? 'Try another city or ZIP code, select a different state, or clear your search to see all participating offices.'
      : 'New participating offices will appear here when their location and availability are confirmed. You can get your records ready now.';
    support.replaceChildren();
    const info = directory.support || {};
    const phone = phoneURL(info.phone);
    const appointment = window.rtpLinks.publicHttpsUrl(info.appointmentURL);
    support.hidden = !phone && !appointment;
    if (!support.hidden) {
      support.append(element('h3', 'Need help with your next step?'));
      if (info.hours) support.append(element('p', info.hours));
      if (phone) support.append(link(`Call ${info.phone}`, phone));
      if (appointment) support.append(link('View Appointment Options ↗', appointment));
    }
  }
  async function load() {
    if (loading) return;
    loading = true; retry.disabled = true;
    error.hidden = true; empty.hidden = true;
    results.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading participating offices…';
    try {
      const response = await fetch('/api/offices', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Directory unavailable');
      const data = await response.json();
      if (data?.version !== 1 || !Array.isArray(data.offices) || data.offices.some(office => !office || ['name', 'address', 'city', 'state', 'postalCode'].some(key => typeof office[key] !== 'string'))) throw new Error('Invalid directory');
      directory = data; render();
    } catch {
      directory = null;
      results.replaceChildren(); support.replaceChildren(); support.hidden = true;
      results.setAttribute('aria-busy', 'false');
      status.textContent = 'Office availability could not be loaded.';
      error.hidden = false;
    } finally { loading = false; retry.disabled = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  query.addEventListener('input', render);
  state.addEventListener('change', render);
  document.querySelector('#office-clear').addEventListener('click', () => { form.reset(); render(); query.focus(); });
  retry.addEventListener('click', load);
  load();
})();
