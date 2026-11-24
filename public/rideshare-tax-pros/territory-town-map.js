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
  function labelLayout(map, scale, latLng) {
    const size = map.getSize(), occupied = new Set(), nodes = [];
    return { nodes, place(item, kind, action) {
      const { name, x, y } = item;
      const location = map.latLngToContainerPoint(latLng(x, y));
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

  function draw(panel, data, onSearch, api, focus) {
    const L = window.L, canvas = panel.querySelector('[data-map-canvas]');
    const picker = panel.querySelector('[data-map-town]'), research = panel.querySelector('[data-map-research]');
    const reset = panel.querySelector('[data-map-reset]');
    const items = new Map(), streetsButton = panel.querySelector('[data-map-streets]');
    const mode = panel.querySelector('[data-map-layer]'), tileStatus = panel.querySelector('[data-map-tiles]');
    const latLng = (x, y) => L.CRS.EPSG3857.unproject(L.point(data.origin[0] + x * data.metersPerUnit, data.origin[1] - y * data.metersPerUnit));
    const bounds = ([left, top, right, bottom]) => L.latLngBounds(latLng(left, top), latLng(right, bottom));
    const extent = bounds(data.bounds), initial = bounds(data.fit);
    const map = L.map(canvas, { minZoom: 2, maxZoom: 19, zoomSnap: 0.25, zoomAnimation: false,
      fadeAnimation: false, maxBounds: extent.pad(0.35) });
    map.attributionControl.setPrefix(false);
    const roads = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, referrerPolicy: 'origin', updateWhenIdle: true, keepBuffer: 1,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
    });
    roads.on('loading', () => { tileStatus.textContent = 'Loading streets…'; });
    roads.on('tileerror', () => { tileStatus.textContent = 'Some streets could not load. Check your connection or zoom out for the local map.'; });
    roads.on('load', () => {
      if (!roads.getContainer()?.querySelector('img:not(.leaflet-tile-loaded)')) tileStatus.textContent = '';
    });
    const stateZoom = () => map.getBoundsZoom(initial, false, L.point(28, 28));
    const streetZoom = () => Math.min(15, Math.max(12, Math.ceil(stateZoom() + 2)));
    const streetLines = new Map();
    function updateStreetLines() {
      const viewport = map.getBounds(), draw = map.hasLayer(roads) && map.getZoom() < 16 && L.Browser.svg;
      for (const feature of data.features) {
        const existing = streetLines.get(feature.id);
        if (!draw || !viewport.intersects(bounds(feature.bounds))) {
          if (existing) { existing.remove(); streetLines.delete(feature.id); }
          continue;
        }
        if (existing) continue;
        const rings = Array.from(feature.path.matchAll(/M([^Z]+)Z/g), match => {
          const points = match[1].split(' ').map(pair => latLng(...pair.split(',').map(Number)));
          return [...points, points[0]];
        });
        const line = L.polyline(rings, { color: '#4d6e73', opacity: .7, weight: 1.5, dashArray: '4 3', interactive: false }).addTo(map);
        streetLines.set(feature.id, line);
      }
    }
    let selected, observer, atlas, roster, atState = true;
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
      const localAreas = svg('g', { class: 'town-map-districts' });
      for (const [index, area] of data.subdivisions.entries()) {
        const path = svg('path', { class: 'town-map-district district-' + index % 5, d: area.path, 'data-district': area.id });
        const title = svg('title', {}); title.textContent = area.label; path.append(title);
        localAreas.append(path);
      }
      drawing.append(countyShapes, localAreas, shapes, svg('path', { class: 'town-map-state-line', d: data.outline }), markers, labels);
      L.control.scale({ maxWidth: 95 }).addTo(map);
      const names = new Set(), duplicates = new Set();
      for (const feature of data.features) {
        if (names.has(feature.name)) duplicates.add(feature.name);
        names.add(feature.name);
        const path = svg('path', { class: 'town-map-area local-' + Number(feature.id.slice(-4)) % 7, d: feature.path, 'data-locality': feature.id });
        const title = svg('title', {});
        title.textContent = feature.label;
        path.append(title);
        shapes.append(path);
        items.set(feature.id, { feature, path, position: latLng(feature.x, feature.y) });
      }
      const option = (value, text) => new Option(text, value);
      const ordered = [...data.features].sort((a, b) => a.name.localeCompare(b.name) || a.label.localeCompare(b.label));
      picker.replaceChildren(option('', 'Choose a town or city'), ...ordered.map(feature =>
        option(feature.id, duplicates.has(feature.name) ? feature.label : feature.name)));
      picker.disabled = !items.size;
      research.disabled = true;

      function annotate() {
        const zoom = map.getZoom(), street = zoom >= streetZoom();
        const detail = zoom >= stateZoom() + 0.65;
        drawing.dataset.detail = street ? 'streets' : detail ? 'towns' : 'counties';
        canvas.dataset.layer = drawing.dataset.detail;
        mode.textContent = street ? 'Streets' : detail ? 'Town limits and local subdivisions' : 'County boundaries';
        streetsButton.disabled = street && zoom >= 16;
        if (street) {
          if (atlas && map.hasLayer(atlas)) atlas.remove();
          if (!map.hasLayer(roads)) roads.addTo(map);
          updateStreetLines();
          return;
        }
        if (map.hasLayer(roads)) { roads.remove(); updateStreetLines(); }
        tileStatus.textContent = '';
        if (atlas && !map.hasLayer(atlas)) atlas.addTo(map);
        countyShapes.setAttribute('display', detail ? 'none' : 'inline');
        shapes.setAttribute('display', detail ? 'inline' : 'none');
        localAreas.setAttribute('display', detail ? 'inline' : 'none');
        const scale = map.options.crs.scale(zoom) * data.metersPerUnit / 40075016.68557849;
        const layout = labelLayout(map, scale, latLng), dots = [], landmarkNames = new Set();
        const viewport = map.getBounds().pad(0.04);
        const visible = item => viewport.contains(latLng(item.x, item.y));

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
          if (!detail && visible(county)) layout.place(county, 'county', { 'data-county': county.id });
        }
        for (const place of places.filter(p => !p.capital)) {
          const action = { 'data-landmark': place.name };
          dot(place, 'city', action, 2.7);
          layout.place(place, 'city', action);
          landmarkNames.add(place.name);
        }
        if (detail) {
          for (const {feature} of items.values()) {
            if (!visible(feature) || landmarkNames.has(feature.name)) continue;
            const action = { 'data-locality': feature.id };
            if (layout.place(feature, 'town', action)) dot(feature, 'town', action, 1.9);
          }
        }
        if (detail) {
          for (const area of data.subdivisions) {
            if (visible(area)) layout.place({ ...area, name: area.label }, 'district', { 'data-district': area.id });
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
        map.fitBounds(bounds(item.feature.bounds), { padding: [32, 32], maxZoom: streetZoom() - 1, animate: false });
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
      streetsButton.onclick = () => map.setView(selected ? selected.position : map.getCenter(), Math.max(16, map.getZoom()), { animate: false });
      function zoomCounty(county) {
        selected?.path.classList.remove('is-selected');
        selected = null;
        picker.value = '';
        research.disabled = true;
        const target = bounds(county.bounds);
        const fit = map.getBoundsZoom(target, false, L.point(40, 40));
        map.setView(target.getCenter(), Math.min(streetZoom() - 1, Math.max(stateZoom() + 1, fit)), {animate:false});
        annotate();
      }
      roster = window.SdrCountyLeads.mount(panel, data, api, zoomCounty);
      drawing.addEventListener('click', event => {
        if (map.dragging.moved()) return;
        const target = event.target.closest('[data-locality], [data-county], [data-landmark], [data-district]');
        if (!target) return;
        if (target.dataset.locality) return select(target.dataset.locality);
        selected?.path.classList.remove('is-selected');
        selected = null;
        picker.value = '';
        research.disabled = true;
        if (target.dataset.district) {
          const district = data.subdivisions.find(area => area.id === target.dataset.district);
          if (district) map.fitBounds(bounds(district.bounds), { padding: [16, 16], maxZoom: 14 });
          return;
        }
        if (target.dataset.county) {
          const county = counties.get(target.dataset.county);
          zoomCounty(county);
          roster.select(county);
          return;
        }
        const place = data.landmarks.find(p => p.name === target.dataset.landmark &&
          (!target.hasAttribute('cx') || p.x === Number(target.getAttribute('cx'))));
        if (!place) return;
        const nearest = [...items.values()].filter(({feature}) => feature.name === place.name)
          .sort((a, b) => Math.hypot(a.feature.x-place.x, a.feature.y-place.y) - Math.hypot(b.feature.x-place.x, b.feature.y-place.y))[0];
        if (nearest) select(nearest.feature.id);
        else map.setView(latLng(place.x, place.y), Math.max(map.getZoom(), 14));
      });
      atlas = L.svgOverlay(drawing, bounds(data.frame), { interactive: true });
      fitState();
      map.on('movestart', () => { atState = false; });
      map.on('moveend', annotate);
      if (items.has(focus?.place)) {
        select(focus.place);
        if (focus.streets) streetsButton.onclick();
      }
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
        roster?.dispose();
        picker.onchange = research.onclick = reset.onclick = streetsButton.onclick = null;
        map.remove();
      };
    } catch (error) {
      observer?.disconnect();
        roster?.dispose();
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
    async function open(region, focus) {
      const request = ++sequence;
      dispose?.();
      dispose = null;
      national.forEach(element => { element.hidden = true; });
      panel.hidden = false;
      canvas.hidden = tools.hidden = caption.hidden = retry.hidden = true;
      const stateName = document.querySelector(`[data-territory-state="${region}"] strong`)?.textContent || region;
      heading.textContent = stateName + ' towns and cities';
      status.textContent = 'Loading town boundaries…';
      retry.onclick = () => open(region, focus);
      try {
        const data = await api('territory-map', { state: region });
        if (request !== sequence) return;
        canvas.hidden = tools.hidden = caption.hidden = false;
        const total = new Set(data.features.map(feature => feature.name)).size;
        dispose = draw(panel, data, onSearch, api, focus);
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
