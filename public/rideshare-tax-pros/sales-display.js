(() => {
  'use strict';
  const panel = document.querySelector('.sdr-display');
  if (!panel) return;
  const root = document.documentElement;
  const size = panel.querySelector('[name="scale"]');
  const monochrome = panel.querySelector('[name="monochrome"]');
  const key = 'tinkytown.workspace.display.v1';
  let opener;

  function reflow() {
    root.toggleAttribute('data-sdr-display-compact', Number(size.value) > 100 && window.innerWidth < Number(size.value) * 12);
  }
  function apply(save) {
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
})();
