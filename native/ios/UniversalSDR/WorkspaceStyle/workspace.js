(function (css) {
  'use strict';
  const shell = document.querySelector('body[data-standalone-sdr] #sales-workspace');
  if (!shell || location.pathname !== '/sales') return;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }

  function icon(tab) {
    const svg = shell.querySelector(`[data-tab="${tab}"] .sdr-icon`)?.cloneNode(true);
    svg?.setAttribute('aria-hidden', 'true');
    return svg;
  }

  function banner(tab, title, description) {
    const header = element('header', 'ipad-page-hero');
    const symbol = icon(tab);
    if (symbol) header.append(symbol);
    const copy = element('div', 'ipad-hero-copy');
    copy.append(element('h1', '', title), element('p', '', description));
    header.append(copy);
    return header;
  }

  function tile(label, detail, tone, tab, action) {
    const control = element(typeof action === 'string' ? 'a' : 'button', `ipad-studio-tile ${tone}`);
    if (typeof action === 'string') control.href = action;
    else {
      control.type = 'button';
      control.addEventListener('click', action);
    }
    const badge = element('span', 'ipad-tile-badge');
    const symbol = icon(tab);
    if (symbol) badge.append(symbol);
    const copy = element('span', 'ipad-tile-copy');
    copy.append(element('strong', '', label), element('small', '', detail));
    control.append(badge, copy, element('span', 'ipad-tile-arrow', '›'));
    control.lastElementChild.setAttribute('aria-hidden', 'true');
    return control;
  }

  function jump(target) {
    return () => target.scrollIntoView({ block: 'start' });
  }

  const prospects = shell.querySelector('[data-tab-panel="prospects"]');
  const results = prospects?.querySelector('#sales-prospect-results');
  const count = prospects?.querySelector('#sales-prospect-count');
  const editor = prospects?.querySelector('#sales-prospect-editor');
  const research = prospects?.querySelector('#sales-linkedin-search');
  const pipeline = shell.querySelector('[data-tab="pipeline"]');
  if (prospects && results && count && editor && research && pipeline) {
    const list = results.closest('.sdr-card');
    const search = research.closest('.sdr-card');
    const tools = element('div', 'ipad-studio-tools ipad-prospect-tools');
    const metric = element('div', 'ipad-prospect-metric');
    const visibleCount = element('strong', '', '—');
    const caption = element('span', '', 'Visible prospects');
    metric.append(visibleCount, caption);
    const updateCount = () => {
      const text = count.textContent.trim();
      visibleCount.textContent = text.match(/^\d+/)?.[0] || (/^no /i.test(text) ? '0' : '—');
    };
    new MutationObserver(updateCount).observe(count, { childList: true, characterData: true, subtree: true });
    updateCount();
    tools.append(metric,
      tile('LinkedIn search', 'Find people or companies', 'purple', 'prospects', jump(search)),
      tile('Pipeline', 'See businesses and follow-ups', 'green', 'pipeline', () => pipeline.click()));
    const content = element('div', 'ipad-page-content ipad-prospects-content');
    const details = element('div', 'ipad-page-secondary');
    list.classList.add('ipad-prospect-list');
    details.append(editor, search);
    content.append(list, details);
    prospects.prepend(banner('prospects', 'Prospects', 'Build your prospect list and find the right people to contact.'), tools, content);
    prospects.dataset.ipadPage = 'prospects';
  }

  const campaigns = shell.querySelector('[data-tab-panel="campaigns"]');
  const form = campaigns?.querySelector('#sales-campaign-form');
  const leads = campaigns?.querySelector('#sales-campaign-results');
  if (campaigns && form && leads) {
    const settings = form.closest('.sdr-card');
    const collected = leads.closest('.sdr-card');
    const tools = element('nav', 'ipad-studio-tools ipad-campaign-tools');
    tools.setAttribute('aria-label', 'Campaign tools');
    tools.append(
      tile('Campaign setup', 'Audience and messaging', 'blue', 'campaigns', jump(settings)),
      tile('Collected prospects', 'Review leads and drafts', 'green', 'prospects', jump(collected)),
      tile('Demo', 'Show a customer demo', 'purple', 'pipeline', 'sdr-ipad://demo'),
      tile('Sales materials', 'Open documentation or a PDF', 'gold', 'contracts', 'sdr-ipad://docs'));
    const content = element('div', 'ipad-page-content ipad-campaign-content');
    settings.classList.add('ipad-campaign-settings');
    collected.classList.add('ipad-campaign-collected');
    content.append(settings, collected);
    campaigns.prepend(banner('campaigns', 'Campaigns', 'Plan outreach, prepare drafts, and review the prospects you collect.'), tools, content);
    campaigns.dataset.ipadPage = 'campaigns';
  }

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  document.body.dataset.sdrIpad = '';
})
