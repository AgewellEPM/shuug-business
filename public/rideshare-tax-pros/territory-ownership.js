(() => {
  'use strict';

  function node(tag, content, className) {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
  }

  function key(value) {
    return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bst\b/g, 'saint');
  }

  function geography(data) {
    const counties = new Map(data.counties.map(county => [county.id, county]));
    const places = new Map();
    for (const feature of data.features) {
      for (const id of feature.counties || []) {
        if (!counties.has(id)) continue;
        const identity = key(feature.name) + ':' + id;
        const previous = places.get(identity);
        if (!previous || feature.id.length < previous.feature.id.length) {
          places.set(identity, { name: feature.name, county: counties.get(id), feature });
        }
      }
    }
    return [...data.counties.map(county => ({ name: county.label, county })), ...places.values()]
      .map(place => ({ ...place, nameKey: key(place.name), countyKey: key(place.county.label) }));
  }

  function geographicMatches(index, query) {
    const terms = query.split(' ');
    return index.flatMap(place => {
      const name = place.nameKey, shortCounty = place.countyKey.replace(/ (county|parish|borough|planning region)$/, '');
      if (name === query || (!place.feature && shortCounty === query)) return [{ place, order: 0 }];
      if (name.startsWith(query)) return [{ place, order: 1 }];
      if (!terms.some(term => name.includes(term))) return [];
      const combined = place.feature ? name + ' ' + place.countyKey : name;
      return terms.every(term => combined.includes(term)) ? [{ place, order: 2 }] : [];
    }).sort((a, b) => a.order - b.order || a.place.name.localeCompare(b.place.name) ||
      a.place.county.label.localeCompare(b.place.county.label)).slice(0, 6).map(result => result.place);
  }

  function mount(panel, data, api, openPlace, refreshRoster) {
    const field = panel.querySelector('[data-territory-lookup]');
    const host = panel.querySelector('[data-territory-matches]');
    const index = geography(data);
    let timer, sequence = 0, last;

    function render(places, facilities, hasMore) {
      const list = node('ul', null, 'territory-lookup-list');
      for (const place of places) {
        const row = node('li', null, 'territory-lookup-row');
        const button = node('button', null, 'territory-lookup-place');
        button.type = 'button';
        button.append(node('strong', place.name));
        if (place.feature) button.append(node('small', place.county.label));
        button.onclick = () => openPlace(place);
        const name = place.county.lead?.name;
        const assignment = node('span', name ? 'Assigned to ' + name : 'Available · no county lead', 'territory-lookup-assignment');
        assignment.dataset.status = name ? 'assigned' : 'unassigned';
        row.append(button, assignment);
        list.append(row);
      }
      for (const facility of facilities) {
        const row = node('li', null, 'territory-lookup-row');
        const details = node('span');
        const location = [facility.address, [facility.city, facility.state].filter(Boolean).join(', ')].filter(Boolean);
        details.append(node('strong', facility.name), node('small', location.join(' · ')));
        const assignment = node('span', facility.status === 'assigned' ?
          'Assigned to ' + facility.assignee : 'Unassigned facility', 'territory-lookup-assignment');
        assignment.dataset.status = facility.status;
        row.append(details, assignment);
        list.append(row);
      }
      const summary = list.children.length
        ? hasMore ? 'Refine your search to see more facility matches.' : list.children.length + (list.children.length === 1 ? ' match' : ' matches')
        : 'No matching town, county, or saved facility in this state.';
      const status = node('p', summary);
      status.setAttribute('role', 'status');
      host.replaceChildren(status, list);
    }

    function search() {
      clearTimeout(timer);
      const request = ++sequence;
      const query = field.value.trim(), normalized = key(query);
      last = null;
      host.hidden = !query;
      if (!query) { host.replaceChildren(); return; }
      if (normalized.length < 2) {
        host.replaceChildren(node('p', 'Enter at least two letters or numbers.'));
        return;
      }
      const places = geographicMatches(index, normalized);
      const countyIds = [...new Set(places.map(place => place.county.id))];
      const status = node('p', 'Checking assignments…');
      status.setAttribute('role', 'status');
      host.replaceChildren(status);
      timer = setTimeout(async () => {
        try {
          const result = await api('territory-ownership', { state: data.state, query, countyIds });
          if (request !== sequence) return;
          const refreshed = new Map(result.counties.map(county => [county.id, county]));
          let rosterChanged = false;
          for (const id of countyIds) {
            const county = places.find(place => place.county.id === id).county;
            const current = refreshed.get(id);
            if (!current) continue;
            const revision = county.lead?.revision || 0, nextRevision = current.lead?.revision || 0;
            if (nextRevision > revision || (nextRevision === revision && current.canEdit !== county.canEdit)) {
              Object.assign(county, current);
              rosterChanged = true;
            }
          }
          if (rosterChanged) refreshRoster();
          last = [places, result.matches, result.hasMore];
          render(...last);
        } catch (error) {
          if (request !== sequence) return;
          status.textContent = error.message || 'Assignments could not be checked.';
        }
      }, 200);
    }

    field.value = '';
    field.addEventListener('input', search);
    return {
      refresh() { if (last) render(...last); },
      dispose() {
        sequence++;
        clearTimeout(timer);
        field.removeEventListener('input', search);
        field.value = '';
        host.hidden = true;
        host.replaceChildren();
      }
    };
  }

  window.SdrTerritoryOwnership = { mount };
})();
