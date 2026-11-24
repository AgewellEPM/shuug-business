(() => {
  'use strict';
  const panel = document.querySelector('[data-tab-panel="demo"]');
  if (!panel) return;
  const part = name => panel.querySelector('[data-care-' + name + ']');
  const workspace = document.getElementById('sales-workspace');
  const home = part('home'), stage = part('stage'), surface = part('mount');
  const strokeHost = part('stroke'), guide = part('guide');
  const names = new Map([...home.querySelectorAll('[data-care-launch]')].map(link =>
    [link.dataset.careLaunch, link.querySelector('strong').textContent]));
  const facility = { hospital: 'hospital', 'nursing-home': 'nursing', 'senior-center': null };
  const stations = { townhall: 'townhall', library: 'townhall', police: 'townhall', clinic: 'clinic', directory: 'directory' };
  const modes = {
    hospital: [['', 'Rooms & services'], ['counter', 'Front desk kiosk'], ['clinic', 'Medical office']],
    'nursing-home': [['', 'Rooms & services'], ['counter', 'Front desk kiosk'], ['assisted', 'Assisted living']],
    'senior-center': [['', 'Rooms & services'], ['counter', 'Visitor conversation']],
    stroke: [['', 'Bedside tools'], ['boards', 'Communication boards']],
  };
  let signature, cleanup, stroke, lastLaunch, wasVisible = false;

  function stop() {
    cleanup?.();
    cleanup = null;
    stroke?.deactivate();
    window.speechSynthesis?.cancel();
    surface.replaceChildren();
  }

  function chrome(venue, mode, present) {
    if (present) {
      document.body.dataset.carePresent = 'true';
      stage.setAttribute('role', 'dialog');
      stage.setAttribute('aria-modal', 'true');
    } else {
      delete document.body.dataset.carePresent;
      stage.removeAttribute('role');
      stage.removeAttribute('aria-modal');
    }
    part('present').textContent = present ? 'Exit presentation' : 'Present kiosk';
    part('present').setAttribute('aria-pressed', String(present));
    const links = modes[venue] || [];
    const nav = part('modes');
    nav.hidden = !links.length;
    nav.replaceChildren(...links.map(([value, label]) => {
      const link = document.createElement('a');
      const args = new URLSearchParams({ view: 'demo', venue });
      if (value) args.set('mode', value);
      if (present) args.set('present', '1');
      link.href = '#' + args;
      link.textContent = label;
      if (mode === value) link.setAttribute('aria-current', 'page');
      return link;
    }));
  }

  function render() {
    if (workspace.hidden || panel.hidden) {
      if (wasVisible) stop();
      if (workspace.hidden && stroke) {
        stroke.destroy();
        stroke = null;
      }
      wasVisible = false;
      signature = null;
      delete document.body.dataset.carePresent;
      return;
    }
    wasVisible = true;
    const args = new URLSearchParams(location.hash.slice(1));
    const requested = args.get('view') === 'demo' && args.get('venue');
    let venue = names.has(requested) ? requested : '';
    // Reps can still open a previously saved guided scenario.
    if (!venue && args.get('view') === 'demo' && ['hospital', 'stroke'].includes(args.get('product'))) venue = 'guide';
    const mode = args.get('mode') || '';
    home.hidden = Boolean(venue);
    stage.hidden = !venue;
    part('place').textContent = names.get(venue) || 'Communication boards';
    panel.setAttribute('aria-labelledby', venue ? 'care-stage-title' : 'sales-demo-title');
    chrome(venue, mode, Boolean(venue && args.get('present') === '1'));

    const next = [venue, mode, args.get('place'), args.get('board'), args.get('room')].join('|');
    if (next === signature) return;
    stop();
    signature = next;
    guide.hidden = true;
    strokeHost.hidden = true;
    surface.hidden = false;
    if (!venue) {
      if (lastLaunch) home.querySelector('[data-care-launch="' + lastLaunch + '"]')?.focus({ preventScroll: true });
      return;
    }
    if (names.has(venue)) lastLaunch = venue;
    if (venue === 'guide' || (venue === 'stroke' && mode === 'boards')) {
      surface.hidden = true;
      guide.hidden = false;
      if (venue === 'stroke') guide.querySelector('[data-demo-product="stroke"]').click();
    } else if (venue === 'stroke') {
      surface.hidden = true;
      strokeHost.hidden = false;
      stroke ||= window.CareStroke.mount(strokeHost);
    } else if (Object.hasOwn(facility, venue) && !mode) {
      window.CareFacility.mount(surface, venue, args.get('room'));
      cleanup = () => window.CareFacility.unmount(surface);
    } else if (['home', 'school', 'restaurants', 'boards'].includes(venue)) {
      window.CareLibrary.mount(surface, venue === 'boards' ? 'library' : venue);
      cleanup = () => window.CareLibrary.unmount(surface);
    } else if (venue === 'senior-center') {
      args.set('place', 'senior');
      cleanup = window.CareKiosks.mount(surface, 'community', args);
    } else if (Object.hasOwn(facility, venue) || Object.hasOwn(stations, venue)) {
      const id = stations[venue] || (['clinic', 'assisted'].includes(mode) ? mode : facility[venue]);
      const board = ['library', 'police'].includes(venue) ? 'civic_' + venue : undefined;
      window.CareLocations.mount(surface, id, board);
      cleanup = () => window.CareLocations.unmount(surface);
    } else {
      cleanup = window.CareKiosks.mount(surface, venue, args);
    }
    part('return').focus({ preventScroll: true });
  }

  part('present').addEventListener('click', () => {
    const args = new URLSearchParams(location.hash.slice(1));
    const present = args.get('present') !== '1';
    if (present) args.set('present', '1');
    else args.delete('present');
    // Only change the surrounding workspace. Keep the current room and conversation mounted.
    window.history.replaceState(null, '', '#' + args);
    chrome(args.get('venue') || 'guide', args.get('mode') || '', present);
  });
  stage.addEventListener('keydown', event => {
    if (!document.body.dataset.carePresent || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      part('present').click();
    } else if (event.key === 'Tab') {
      const available = [...stage.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select,textarea,summary,audio[controls]')]
        .filter(node => node.getClientRects().length);
      const first = available[0], last = available.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  panel.addEventListener('care:stroke-message', event => {
    stroke ||= window.CareStroke.mount(strokeHost);
    stroke.recordMessage(event.detail, 'Communication board');
  });
  document.querySelector('[data-tab="demo"]')?.addEventListener('click', () => {
    if (location.hash !== '#view=demo') window.history.replaceState(null, '', '#view=demo');
    render();
  });
  const observer = new MutationObserver(() => {
    if (wasVisible !== (!panel.hidden && !workspace.hidden) || (workspace.hidden && stroke)) render();
  });
  for (const node of [panel, workspace]) observer.observe(node, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('hashchange', render);
  window.addEventListener('pagehide', () => { stop(); wasVisible = false; signature = null; });
  window.addEventListener('pageshow', event => { if (event.persisted) render(); });
  render();
})();
