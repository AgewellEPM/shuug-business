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

  function boundaryRings(path) {
    return Array.from(path.matchAll(/M([^Z]+)Z/g), match =>
      match[1].split(' ').map(pair => pair.split(',').map(Number)));
  }

  function boundaryHit(boundary, x, y) {
    const [left, top, right, bottom] = boundary.bounds;
    if (x < left || x > right || y < top || y > bottom) return false;
    let inside = false;
    for (const ring of boundaryRings(boundary.path)) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[j];
        if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
      }
    }
    return inside;
  }

  function neighborBackdrop(map, states, atlasPoint, latLng) {
    if (!states?.length) return null;
    const L = window.L, pane = 'territory-context';
    map.createPane(pane);
    const drawing = svg('svg', { 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    const names = svg('g', { class: 'town-map-context-names' });
    for (const state of states) {
      const [x, y] = state.offset;
      drawing.append(svg('path', { class: 'town-map-neighbor', 'data-context-state': state.state, d: state.path,
        transform: `translate(${x} ${y}) scale(${state.scale})` }));
    }
    drawing.append(names);
    let layer;
    return { hide() { layer?.remove(); }, draw(scale, showNames) {
      // Keep the SVG near screen size even for small territories bordering
      // large states. Its paths stay in the same Mercator space as the atlas.
      const frame = map.getBounds().pad(.55);
      const [left, top] = atlasPoint(frame.getNorthWest()), [right, bottom] = atlasPoint(frame.getSouthEast());
      drawing.setAttribute('viewBox', [left, top, right-left, bottom-top].join(' '));
      if (!layer) layer = L.svgOverlay(drawing, frame, { pane, interactive: false, className: 'town-map-backdrop' });
      else layer.setBounds(frame);
      if (!map.hasLayer(layer)) layer.addTo(map);
      names.replaceChildren();
      if (!showNames) return;
      const size = map.getSize();
      for (const state of states) {
        for (const text of [state.name.toUpperCase(), state.state]) {
          const half = text.length * 3.9 + 3;
          const anchor = state.anchors.find(([x,y,r]) => {
            if (r * scale < Math.hypot(half, 7)) return false;
            const p = map.latLngToContainerPoint(latLng(x,y));
            return p.x > half && p.x < size.x-half && p.y > 12 && p.y < size.y-12;
          });
          if (!anchor) continue;
          const [x,y] = anchor, label = svg('text', { x, y, 'font-size': 11/scale });
          label.textContent = text;
          names.append(label);
          break;
        }
      }
    } };
  }

  function selectionStatus(panel, state, api, refreshAssignments, editCounty) {
    const host = panel.querySelector('[data-map-selection]');
    let current, revision = 0;
    function render() {
      if (!current) return;
      const heading = document.createElement('strong');
      heading.textContent = current.name;
      host.replaceChildren(heading);
      if (current.pending || current.unconfirmed) {
        const status = document.createElement('span');
        status.textContent = current.pending ? 'Checking sales rep…' : 'Could not confirm the current assignment.';
        host.append(status);
        return;
      }
      for (const county of current.counties) {
        const row = document.createElement('div');
        row.className = 'territory-selection-county';
        const text = document.createElement('span');
        const rep = county.lead?.name ? 'Sales rep · ' + county.lead.name : 'No sales rep currently assigned';
        text.textContent = current.name === county.label ? rep : county.label + ' · ' + rep;
        if (county.lead?.name) row.append(window.SdrCountyLeads.avatar(county.lead));
        row.append(text);
        if (county.canEdit) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'button secondary';
          button.dataset.countyAssign = county.id;
          button.textContent = county.lead?.name ? 'Change rep' : 'Assign county';
          button.setAttribute('aria-controls', 'territory-county-editor');
          button.setAttribute('aria-label', button.textContent + ' for ' + county.label);
          button.onclick = () => editCounty(county);
          row.append(button);
        }
        if (county.marketCoverage?.length) {
          const coverage = document.createElement('ul');
          coverage.className = 'territory-market-coverage';
          coverage.setAttribute('aria-label', 'Assigned facilities by market');
          for (const market of county.marketCoverage) {
            const segment = document.createElement('li');
            segment.textContent = market.label + ' · ' + market.rep + ' (' + market.count + ')';
            coverage.append(segment);
          }
          row.append(coverage);
        }
        host.append(row);
      }
      if (!current.counties.length) host.append('County assignment unavailable for this region.');
    }
    function clear() {
      revision++;
      current = undefined;
      host.hidden = true;
      host.replaceChildren();
    }
    async function show(name, counties, reveal) {
      const request = ++revision;
      current = { name, counties, pending: counties.length > 0 };
      host.hidden = false;
      render();
      if (!counties.length) return;
      try {
        const result = await api('territory-ownership', { state, countyIds: counties.map(county => county.id) });
        if (request !== revision) return;
        refreshAssignments(counties, result.counties);
        current.pending = false;
        render();
        if (reveal) host.scrollIntoView?.({ block: 'nearest' });
      } catch {
        if (request !== revision) return;
        current.pending = false;
        current.unconfirmed = true;
        render();
      }
    }
    return {show, clear, render};
  }

  function draw(panel, data, api, focus, onAssignment) {
    const L = window.L, canvas = panel.querySelector('[data-map-canvas]');
    const picker = panel.querySelector('[data-map-town]');
    const reset = panel.querySelector('[data-map-reset]');
    const items = new Map(), streetsButton = panel.querySelector('[data-map-streets]');
    const mode = panel.querySelector('[data-map-layer]'), tileStatus = panel.querySelector('[data-map-tiles]');
    const latLng = (x, y) => L.CRS.EPSG3857.unproject(L.point(data.origin[0] + x * data.metersPerUnit, data.origin[1] - y * data.metersPerUnit));
    const bounds = ([left, top, right, bottom]) => L.latLngBounds(latLng(left, top), latLng(right, bottom));
    const extent = bounds(data.bounds), initial = bounds(data.fit);
    const atlasPoint = location => {
      const projected = L.CRS.EPSG3857.project(location);
      return [(projected.x - data.origin[0]) / data.metersPerUnit, (data.origin[1] - projected.y) / data.metersPerUnit];
    };
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
        const rings = boundaryRings(feature.path).map(ring => [...ring, ring[0]].map(point => latLng(...point)));
        const line = L.polyline(rings, { color: '#4d6e73', opacity: .7, weight: 1.5, dashArray: '4 3', interactive: false }).addTo(map);
        streetLines.set(feature.id, line);
      }
    }
    let selected, observer, atlas, roster, ownership, atState = true;
    const selection = selectionStatus(panel, data.state, api, (counties, updates) => {
      if (window.SdrTerritoryOwnership.applyCountyAssignments(counties, updates)) {
        roster.refresh();
        ownership.refresh();
        onAssignment?.();
      }
    }, county => roster.edit(county));
    function showAssignment(name, counties, reveal = true) {
      roster.close();
      void selection.show(name, counties, reveal);
    }
    try {
      const [left, top, right, bottom] = data.frame;
      const drawing = svg('svg', { viewBox: [left, top, right - left, bottom - top].join(' '), 'aria-hidden': 'true' });
      const backdrop = neighborBackdrop(map, data.context, atlasPoint, latLng);
      const shadow = svg('path', { class: 'town-map-state-shadow', d: data.outline });
      drawing.append(svg('path', { class: 'town-map-water', d: data.water }), shadow,
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

      function annotate() {
        const zoom = map.getZoom(), street = zoom >= streetZoom();
        const detail = zoom >= stateZoom() + 0.65;
        drawing.dataset.detail = street ? 'streets' : detail ? 'towns' : 'counties';
        canvas.dataset.layer = drawing.dataset.detail;
        mode.textContent = street ? 'Streets' : detail ? 'Town limits and local subdivisions' : 'County boundaries';
        streetsButton.disabled = street && zoom >= 16;
        if (street) {
          backdrop?.hide();
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
        shadow.setAttribute('transform', `translate(${1.1/scale} ${2.4/scale})`);
        backdrop?.draw(scale, !detail);
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
        selection.clear();
        roster?.close();
        selected?.path.classList.remove('is-selected');
        selected = null;
        picker.value = '';
          map.fitBounds(initial, { padding: [14, 14], animate: false });
        atState = true;
        annotate();
      }
      function select(id, countyId, reveal = true) {
        const item = items.get(id);
        if (!item) return fitState();
        selected?.path.classList.remove('is-selected');
        selected = item;
        selected.path.classList.add('is-selected');
        picker.value = id;
        const areas = (countyId ? [countyId] : item.feature.counties).map(county => counties.get(county)).filter(Boolean);
        showAssignment(item.feature.name, areas, reveal);
        map.fitBounds(bounds(item.feature.bounds), { padding: [32, 32], maxZoom: streetZoom() - 1, animate: false });
        atState = false;
        annotate();
      }
      picker.onchange = () => select(picker.value);
      reset.onclick = fitState;
      streetsButton.onclick = () => map.setView(selected ? selected.position : map.getCenter(), Math.max(16, map.getZoom()), { animate: false });
      function zoomCounty(county) {
        showAssignment(county.label, [county]);
        selected?.path.classList.remove('is-selected');
        selected = null;
        picker.value = '';
          const target = bounds(county.bounds);
        const fit = map.getBoundsZoom(target, false, L.point(40, 40));
        map.setView(target.getCenter(), Math.min(streetZoom() - 1, Math.max(stateZoom() + 1, fit)), {animate:false});
        annotate();
      }
      roster = window.SdrCountyLeads.mount(panel, data, api, zoomCounty, () => {
        selection.render();
        ownership?.refresh();
        onAssignment?.();
      });
      ownership = window.SdrTerritoryOwnership.mount(panel, data, api, place => {
        if (place.feature) select(place.feature.id, place.county.id);
        else zoomCounty(place.county);
        roster.select(place.county);
      }, () => { roster.refresh(); onAssignment?.(); });
      drawing.addEventListener('click', event => {
        if (map.dragging.moved()) return;
        const target = event.target.closest('[data-locality], [data-county], [data-landmark], [data-district]');
        if (!target) return;
        if (target.dataset.locality) return select(target.dataset.locality);
        selected?.path.classList.remove('is-selected');
        selected = null;
        picker.value = '';
          if (target.dataset.district) {
          const district = data.subdivisions.find(area => area.id === target.dataset.district);
          if (district) {
            const county = counties.get(district.id.slice(0, 5));
            showAssignment(district.label, county ? [county] : []);
            map.fitBounds(bounds(district.bounds), { padding: [16, 16], maxZoom: 14 });
          }
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
        else {
          const county = data.counties.find(area => boundaryHit(area, place.x, place.y));
          showAssignment(place.name, county ? [county] : []);
          map.setView(latLng(place.x, place.y), Math.max(map.getZoom(), 14));
        }
      });
      atlas = L.svgOverlay(drawing, bounds(data.frame), { interactive: true });
      fitState();
      map.on('movestart', () => { atState = false; });
      map.on('moveend', annotate);
      map.on('click', event => {
        if (!map.hasLayer(roads) || event.originalEvent?.target?.closest?.('[data-locality], [data-county], [data-landmark], [data-district]')) return;
        const point = atlasPoint(event.latlng);
        const county = data.counties.find(area => boundaryHit(area, ...point));
        if (!county) { selection.clear(); roster.close(); return; }
        const town = data.features.findLast(feature => feature.counties.includes(county.id) && boundaryHit(feature, ...point));
        showAssignment(town?.name || county.label, [county]);
      });
      if (items.has(focus?.place)) {
        select(focus.place, undefined, false);
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
        selection.clear();
        ownership?.dispose();
        roster?.dispose();
        picker.onchange = reset.onclick = streetsButton.onclick = null;
        map.remove();
      };
    } catch (error) {
      observer?.disconnect();
      selection.clear();
      ownership?.dispose();
      roster?.dispose();
      map.remove();
      throw error;
    }
  }

  function mount({ api, onBack, onAssignment }) {
    const panel = document.getElementById('territory-town-map');
    if (!panel) return null;
    const find = name => panel.querySelector('[data-map-' + name + ']');
    const heading = panel.querySelector('h2'), status = find('status'), retry = find('retry');
    const canvas = find('canvas'), tools = find('tools'), caption = find('caption');
    const nationalMap = document.getElementById('sales-territory-national');
    const hero = document.querySelector('.sdr-territory-hero');
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
      nationalMap.hidden = false;
    }
    find('back').onclick = onBack;
    async function open(region, focus) {
      const request = ++sequence;
      dispose?.();
      dispose = null;
      nationalMap.hidden = true;
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
        dispose = draw(panel, data, api, focus, onAssignment);
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
      (hero || panel).scrollIntoView?.({ block: 'start' });
    } };
  }

  window.SdrTerritoryTownMap = { mount };
})();
