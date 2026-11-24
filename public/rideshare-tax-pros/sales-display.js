(() => {
  'use strict';
  const read = document.querySelector('[data-display-read]');
  const panel = read?.closest('.sdr-display');
  if (!panel) return;
  const root = document.documentElement;
  const size = panel.querySelector('[name="scale"]');
  const monochrome = panel.querySelector('[name="monochrome"]');
  const key = 'tinkytown.workspace.display.v1';
  let opener;

  // Scale authored font sizes in place, preserving selector order and media queries.
  // Relative em/percentage text already follows the scaled parent.
  const absoluteSize = /(?:\d*\.)?\d+(?:px|rem|vw|vh|pt)\b/;
  const scale = value => 'calc((' + value + ') * var(--sdr-text-scale, 1))';
  function scaleFonts(style) {
    const size = style.getPropertyValue('font-size');
    if (size.includes("--sdr-text-scale")) return;
    if (absoluteSize.test(size)) {
      style.setProperty('font-size', scale(size), style.getPropertyPriority('font-size'));
      return;
    }
    const shorthand = style.getPropertyValue('font');
    if (!shorthand.includes("--sdr-text-scale") && absoluteSize.test(shorthand)) {
      style.setProperty('font', shorthand.replace(absoluteSize, scale), style.getPropertyPriority('font'));
    }
  }
  function scaleRules(rules) {
    for (const rule of rules) {
      if (rule.selectorText && rule.style) scaleFonts(rule.style);
      if (rule.cssRules) scaleRules(rule.cssRules);
    }
  }
  function scaleLoadedStyles() {
    for (const sheet of document.styleSheets) {
      if (sheet.href && new URL(sheet.href).origin !== location.origin) continue;
      scaleRules(sheet.cssRules);
    }
  }
  window.addEventListener('load', scaleLoadedStyles, { once: true });
  const sizeLabel = size.closest('label');
  if (sizeLabel?.firstChild?.nodeType === Node.TEXT_NODE) sizeLabel.firstChild.textContent = 'Text size ';


  function reflow() {
    root.toggleAttribute('data-sdr-display-compact', Number(size.value) > 100 && window.innerWidth < Number(size.value) * 12);
  }
  function apply(save) {
    scaleLoadedStyles();
    root.dataset.sdrScale = size.value;
    root.toggleAttribute('data-sdr-monochrome', monochrome.checked);
    reflow();
    if (save) {
      try { localStorage.setItem(key, JSON.stringify({ size: size.value, monochrome: monochrome.checked })); }
      catch {}
    }
  }
  try {
    const prefs = JSON.parse(localStorage.getItem(key));
    if ([...size.options].some(option => option.value === prefs?.size)) size.value = prefs.size;
    monochrome.checked = prefs?.monochrome === true;
  } catch {}
  apply(false);
  window.addEventListener('resize', reflow);
  panel.addEventListener('change', () => apply(true));
  panel.querySelector('[data-display-reset]').addEventListener('click', () => {
    size.value = '100';
    monochrome.checked = false;
    apply(true);
  });
  document.querySelectorAll('[data-display-open]').forEach(button => button.addEventListener('click', () => {
    opener = button;
    panel.showModal();
    size.focus();
  }));
  panel.addEventListener('close', () => opener?.focus());

  const status = document.querySelector('[data-display-reading-status]');
  const workspace = document.getElementById('sales-workspace');
  const speech = window.speechSynthesis;
  const googleReviews = '.facility-maps-reviews';
  let active;
  let selected = '';

  function selectionText() {
    const selection = window.getSelection();
    if (!workspace?.contains(selection?.anchorNode) || !workspace.contains(selection.focusNode)) return '';
    const reviewPanels = [...workspace.querySelectorAll(googleReviews)];
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (reviewPanels.some(panel => range.intersectsNode(panel))) return '';
    }
    return selection.toString().trim();
  }

  function stop(message = '') {
    if (active) {
      active = null;
      speech.cancel();
    }
    read.setAttribute('aria-pressed', 'false');
    read.textContent = 'Read aloud';
    status.textContent = message;
  }

  function pageText() {
    const current = document.body.dataset.sdrView;
    const view = [...workspace.querySelectorAll('[data-tab-panel]')]
      .find(pane => pane.dataset.tabPanel === current && !pane.closest('[hidden]'));
    if (!view) return '';
    const reviewPanels = view.querySelectorAll(googleReviews + ':not([hidden])');
    reviewPanels.forEach(panel => { panel.hidden = true; });
    try { return view.innerText.trim(); }
    finally { reviewPanels.forEach(panel => { panel.hidden = false; }); }
  }

  document.querySelectorAll('[data-display-open]').forEach(button => {
    button.addEventListener('pointerdown', () => { selected = selectionText(); });
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') selected = selectionText();
    });
  });
  panel.addEventListener('close', () => { selected = ''; });
  read.addEventListener('click', () => {
    if (active) return stop('Reading stopped.');
    if (!speech || !window.SpeechSynthesisUtterance) return stop('Read aloud is unavailable in this browser.');
    const text = selected || pageText();
    selected = '';
    if (!text) return stop('There is no page text to read.');
    const words = text.split(/\s+/);
    const chunks = [];
    let chunk = '';
    for (const word of words) {
      if (chunk && chunk.length + word.length > 200) {
        chunks.push(chunk);
        chunk = '';
      }
      chunk += (chunk ? ' ' : '') + word;
    }
    if (chunk) chunks.push(chunk);
    const run = { index: 0 };
    active = run;
    read.setAttribute('aria-pressed', 'true');
    read.textContent = 'Stop reading';
    status.textContent = '';
    function next() {
      if (active !== run) return;
      if (run.index === chunks.length) return stop('Finished reading.');
      const utterance = new SpeechSynthesisUtterance(chunks[run.index++]);
      utterance.lang = root.lang || 'en';
      utterance.rate = 0.9;
      utterance.onend = next;
      utterance.onerror = () => { if (active === run) stop('Reading was interrupted.'); };
      try { speech.speak(utterance); }
      catch { stop('Read aloud is unavailable in this browser.'); }
    }
    next();
  });
  const navigation = new MutationObserver(records => {
    if (active && records.some(record => record.attributeName === 'data-sdr-view' ||
        record.target === workspace && workspace.hidden)) stop();
  });
  navigation.observe(document.body, { attributes: true, attributeFilter: ['data-sdr-view'] });
  if (workspace) navigation.observe(workspace, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('pagehide', () => { if (active) stop(); });
})();
