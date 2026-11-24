(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  function svg(tag, attributes) {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }

  // Try several label positions at screen scale. County names stay inside their
  // areas where space permits. Town names can sit on either side of a dot.
  function labelLayout(map, scale) {
    const size = map.getSize(), occupied = new Set(), nodes = [];
    return { nodes, place(item, kind, action) {
      const { name, x, y } = item;
      const location = map.latLngToContainerPoint([-y, x]);
      const capital = kind === 'capital', county = kind === 'county';
      const text = county ? name.toUpperCase() : name;
      const font = capital ? 15 : county ? 11.5 : 12;
      const width = Math.max(16, text.length * font * (county ? 0.68 : 0.58)) + 4;
      const offset = width / 2 + (capital ? 10 : 6);
      const candidates = county ? [[0, 0], [0, -11], [0, 11]] :
        [[offset, -4], [-offset, -4], [0, -13], [0, 13]];
      for (const [dx, dy] of candidates) {
        const cx = location.x + dx, cy = location.y + dy;
        if (cx - width/2 < 1 || cx + width/2 >= size.x || cy < 7 || cy >= size.y - 7) continue;
        const cells = [];
        for (let col = Math.floor((cx - width/2)/7); col <= Math.floor((cx + width/2)/7); col++) {
          for (let row = Math.floor((cy - font/2)/5); row <= Math.floor((cy + font/2)/5); row++) cells.push(col + ',' + row);
        }
        if (cells.some(cell => occupied.has(cell))) continue;
        cells.forEach(cell => occupied.add(cell));
        const label = svg('text', { x: x + dx/scale, y: y + dy/scale, class: 'town-map-label label-' + kind,
          'font-size': font/scale, 'stroke-width': (county ? 1.2 : 2.5)/scale, ...action });
        label.textContent = text;
        nodes.push(label);
        return true;
      }
      return false;
    } };
  }

  function draw(panel, data, onSearch) {
    const L = window.L, canvas = panel.querySelector('[data-map-canvas]');
    const picker = panel.querySelector('[data-map-town]'), research = panel.querySelector('[data-map-research]');
    const reset = panel.querySelector('[data-map-reset]');
    const items = new Map(), bounds = ([left, top, right, bottom]) => L.latLngBounds([-bottom, left], [-top, right]);
    const extent = bounds(data.bounds), initial = bounds(data.fit);
    const crs = Object.create(L.CRS.Simple);
    crs.distance = (a, b) => L.CRS.Simple.distance(a, b) * data.metersPerUnit;
    const map = L.map(canvas, { crs, minZoom: -10, maxZoom: 4, zoomSnap: 0.25,
      attributionControl: false, zoomAnimation: false, maxBounds: extent.pad(0.3) });
    let selected, observer, atState = true;
    try {
      const [left, top, right, bottom] = data.frame;
      const drawing = svg('svg', { viewBox: [left, top, right - left, bottom - top].join(' '), 'aria-hidden': 'true' });
      drawing.append(svg('path', { class: 'town-map-water', d: data.water }),
        svg('path', { class: 'town-map-outline', d: data.outline }));
      const counties = new Map(), countyShapes = svg('g', {});
      for (const county of data.counties) {
        const path = svg('path', { class: 'town-map-county county-' + county.color, d: county.path, 'data-county': county.id });
        const title = svg('title', {});
        title.textContent = county.label;
        path.append(title);
        countyShapes.append(path);
        counties.set(county.id, county);
      }
      const shapes = svg('g', {}), markers = svg('g', {}), labels = svg('g', {});
      drawing.append(countyShapes, shapes, svg('path', { class: 'town-map-state-line', d: data.outline }), markers, labels);
      L.control.scale({ maxWidth: 95 }).addTo(map);
      const names = new Set(), duplicates = new Set();
      for (const feature of data.features) {
        if (names.has(feature.name)) duplicates.add(feature.name);
        names.add(feature.name);
        const path = svg('path', { class: 'town-map-area', d: feature.path, 'data-locality': feature.id });
        const title = svg('title', {});
        title.textContent = feature.label;
        path.append(title);
        shapes.append(path);
        items.set(feature.id, { feature, path, position: L.latLng(-feature.y, feature.x) });
      }
      const option = (value, text) => new Option(text, value);
      const ordered = [...data.features].sort((a, b) => a.name.localeCompare(b.name) || a.label.localeCompare(b.label));
      picker.replaceChildren(option('', 'Choose a town or city'), ...ordered.map(feature =>
        option(feature.id, duplicates.has(feature.name) ? feature.label : feature.name)));
      picker.disabled = !items.size;
      research.disabled = true;

      function annotate() {
        const zoom = map.getZoom(), scale = map.options.crs.scale(zoom);
        const stateZoom = map.getBoundsZoom(initial, false, L.point(28, 28));
        const detail = Boolean(selected) || zoom >= stateZoom + 0.75;
        const showTownBorders = detail || data.state === 'CT';
        shapes.setAttribute('display', showTownBorders ? 'inline' : 'none');
        drawing.dataset.detail = detail ? 'towns' : 'counties';
        const layout = labelLayout(map, scale), dots = [], landmarkNames = new Set();
        const viewport = map.getBounds().pad(0.04);
        const visible = item => viewport.contains([-item.y, item.x]);

        function dot(item, kind, action, radius) {
          const marker = svg('circle', { class: 'town-map-point point-' + kind, cx: item.x, cy: item.y, r: radius/scale, ...action });
          const title = svg('title', {});
          title.textContent = item.label || item.name;
          marker.append(title);
          dots.push(marker);
        }
        const places = data.landmarks.filter(visible);
        for (const place of places.filter(p => p.capital)) {
          const action = { 'data-landmark': place.name };
          const marker = svg('g', { class: 'town-map-capital', transform: `translate(${place.x} ${place.y}) scale(${1/scale})`, ...action });
          const title = svg('title', {});
          title.textContent = place.name + ' · Capital';
          marker.append(title, svg('circle', { r: 8 }), svg('path', { d: 'M0,-6.8 1.7,-2.1 6.5,-2.1 2.6,0.9 4,5.8 0,2.9 -4,5.8 -2.6,0.9 -6.5,-2.1 -1.7,-2.1Z' }));
          dots.push(marker);
          layout.place(place, 'capital', action);
          landmarkNames.add(place.name);
        }
        if (selected && visible(selected.feature) && !landmarkNames.has(selected.feature.name)) {
          layout.place(selected.feature, 'selected', { 'data-locality': selected.feature.id });
        }
        for (const county of data.counties) {
          if (visible(county)) layout.place(county, 'county', { 'data-county': county.id });
        }
        for (const place of places.filter(p => !p.capital)) {
          const action = { 'data-landmark': place.name };
          dot(place, 'city', action, 2.7);
          layout.place(place, 'city', action);
          landmarkNames.add(place.name);
        }
        if (detail || data.state === 'CT') {
          for (const {feature} of items.values()) {
            if (!visible(feature) || landmarkNames.has(feature.name)) continue;
            const action = { 'data-locality': feature.id };
            if (layout.place(feature, 'town', action)) dot(feature, 'town', action, 1.9);
          }
        }
        markers.replaceChildren(...dots);
        labels.replaceChildren(...layout.nodes);
      }

      function fitState() {
        selected?.path.classList.remove('is-selected');
        selected = null;
        picker.value = '';
        research.disabled = true;
        map.fitBounds(initial, { padding: [14, 14], animate: false });
        atState = true;
        annotate();
      }
      function select(id) {
        const item = items.get(id);
        if (!item) return fitState();
        selected?.path.classList.remove('is-selected');
        selected = item;
        selected.path.classList.add('is-selected');
        picker.value = id;
        research.disabled = false;
        map.fitBounds(bounds(item.feature.bounds), { padding: [32, 32], maxZoom: 3, animate: false });
        atState = false;
        annotate();
      }
      picker.onchange = () => select(picker.value);
      research.onclick = async () => {
        if (!selected) return;
        try { await onSearch({ state: data.state, city: selected.feature.name }); }
        catch (error) { panel.querySelector('[data-map-status]').textContent = error.message; }
      };
      reset.onclick = fitState;
      drawing.addEventListener('click', event => {
        if (map.dragging.moved()) return;
        const target = event.target.closest('[data-locality], [data-county], [data-landmark]');
        if (!target) return;
        if (target.dataset.locality) return select(target.dataset.locality);
        selected?.path.classList.remove('is-selected');
        selected = null;
        picker.value = '';
        research.disabled = true;
        if (target.dataset.county) {
          const county = counties.get(target.dataset.county);
          map.fitBounds(bounds(county.bounds), { padding: [20, 20], maxZoom: 2, animate: false });
          annotate();
          return;
        }
        const place = data.landmarks.find(p => p.name === target.dataset.landmark &&
          (!target.hasAttribute('cx') || p.x === Number(target.getAttribute('cx'))));
        if (!place) return;
        const nearest = [...items.values()].filter(({feature}) => feature.name === place.name)
          .sort((a, b) => Math.hypot(a.feature.x-place.x, a.feature.y-place.y) - Math.hypot(b.feature.x-place.x, b.feature.y-place.y))[0];
        if (nearest) select(nearest.feature.id);
        else map.setView([-place.y, place.x], Math.min(3, Math.max(map.getZoom(), map.getBoundsZoom(initial) + 3)));
      });
      fitState();
      L.svgOverlay(drawing, bounds(data.frame), { interactive: true }).addTo(map);
      map.on('movestart', () => { atState = false; });
      map.on('moveend', annotate);
      if (window.ResizeObserver) {
        observer = new ResizeObserver(() => {
          if (!canvas.clientWidth || !canvas.clientHeight) return;
          const refit = atState;
          map.invalidateSize({ pan: false });
          if (refit) fitState();
          else annotate();
        });
        observer.observe(canvas);
      }
      return () => {
        observer?.disconnect();
        picker.onchange = research.onclick = reset.onclick = null;
        map.remove();
      };
    } catch (error) {
      observer?.disconnect();
      map.remove();
      throw error;
    }
  }

  function mount({ api, onSearch, onBack }) {
    const panel = document.getElementById('territory-town-map');
    if (!panel) return null;
    const find = name => panel.querySelector('[data-map-' + name + ']');
    const heading = panel.querySelector('h2'), status = find('status'), retry = find('retry');
    const canvas = find('canvas'), tools = find('tools'), caption = find('caption');
    const nationalMap = document.getElementById('sales-territory-map').parentElement;
    const national = [nationalMap, nationalMap.previousElementSibling, document.getElementById('sales-territory-cards')];
    let sequence = 0, dispose;
    const colors = find('colors'), preference = 'sdr.territoryMap.colors';
    try { colors.checked = localStorage.getItem(preference) !== 'off'; } catch { /* Storage is optional. */ }
    function applyColors() { panel.classList.toggle('map-grayscale', !colors.checked); }
    applyColors();
    colors.onchange = () => {
      applyColors();
      try { localStorage.setItem(preference, colors.checked ? 'on' : 'off'); } catch { /* Keep this page's setting. */ }
    };

    function clear() {
      sequence++;
      dispose?.();
      dispose = null;
      panel.hidden = true;
      national.forEach(element => { element.hidden = false; });
    }
    find('back').onclick = onBack;
    async function open(region) {
      const request = ++sequence;
      dispose?.();
      dispose = null;
      national.forEach(element => { element.hidden = true; });
      panel.hidden = false;
      canvas.hidden = tools.hidden = caption.hidden = retry.hidden = true;
      const stateName = document.querySelector(`[data-territory-state="${region}"] strong`)?.textContent || region;
      heading.textContent = stateName + ' towns and cities';
      status.textContent = 'Loading town boundaries…';
      retry.onclick = () => open(region);
      try {
        const data = await api('territory-map', { state: region });
        if (request !== sequence) return;
        canvas.hidden = tools.hidden = caption.hidden = false;
        const total = new Set(data.features.map(feature => feature.name)).size;
        dispose = draw(panel, data, onSearch);
        status.textContent = total.toLocaleString() + (region === 'CT' ? ' towns' : total === 1 ? ' locality' : ' localities');
      } catch (error) {
        if (request !== sequence) return;
        canvas.hidden = tools.hidden = caption.hidden = true;
        status.textContent = 'Town boundaries could not load. ' + error.message;
        retry.hidden = false;
      }
    }
    return { clear, open, focus() {
      heading.focus({ preventScroll: true });
      panel.scrollIntoView?.({ block: 'start' });
    } };
  }

  window.SdrTerritoryTownMap = { mount };
})();
