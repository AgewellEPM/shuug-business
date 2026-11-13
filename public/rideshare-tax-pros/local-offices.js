(() => {
  'use strict';
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const address = row => [row.address, row.city, row.state, row.zip].filter(Boolean).join(', ');
  const link = (url, label) => `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`;
  const sourceNotes = record => `${record.sourceNote?`<p>${e(record.sourceNote)}</p>`:''}${record.attribution?`<p>${e(record.attribution)} ${record.licenseURL?link(record.licenseURL,'Data license'):''}</p>`:''}`;
  const matchNames = { registry_record:'Selected registry record', name_and_address:'Name and address match', name_only:'Name matches · address not confirmed', related_name:'Related business name · confirm address and relationship', address_only:'Address matches · name differs', possible:'Possible match · review carefully' };
  window.GigTaxLocalOffices = {
    mount({ api, status, onPrepare }) {
      const form = document.querySelector('#sales-discover'); if (!form) return;
      const host = document.createElement('section'); host.id = 'sales-local-explorer'; host.hidden = true; form.after(host);
      host.innerHTML = `<div class="local-map-heading"><div><h3>Local tax offices</h3><p data-local-summary role="status" aria-live="polite"></p></div><button type="button" class="button secondary" data-map-fit>Show all locations</button></div><div class="local-map-filters"><label>Filter offices<input type="search" data-local-filter placeholder="Name, street, city or directory contact"></label><label>Source<select data-local-source><option value="">All public sources</option><option value="irs">IRS providers</option><option value="state_registry">State business records</option></select></label><label class="sales-check"><input type="checkbox" data-local-chains checked>Include national chains</label></div><div id="sales-discovery-map" class="local-office-map" role="region" aria-label="Local tax and accounting office locations"></div><p class="local-map-progress" data-map-progress role="status" aria-live="polite"></p><button type="button" class="button secondary" data-map-retry hidden>Retry address mapping</button><p class="local-map-coverage" data-local-coverage></p><div class="local-office-grid"><section aria-labelledby="local-office-list-title"><h4 id="local-office-list-title">Offices found</h4><div class="local-office-list" data-local-list></div></section><section class="local-business-panel" data-local-business aria-label="Business and ownership research" aria-live="polite"><h4>Business & ownership</h4><p>Select a map pin or office to compare legal business records and listed principals.</p></section></div>`;
      let data, selected, sequence = 0, lookupSequence = 0, map, markers, userAdjusted = false, geocoding = false;
      const positions = new Map(), checked = new Set(), pinFor = new Map();
      const $ = selector => host.querySelector(selector);
      const visible = () => (data?.results || []).filter(row => (!($('[data-local-filter]').value.trim()) || [row.name, address(row), row.contact].join(' ').toLowerCase().includes($('[data-local-filter]').value.trim().toLowerCase())) && (!$('[data-local-source]').value || ($('[data-local-source]').value === 'irs' ? row.sourceKind === 'irs' : row.sourceKind !== 'irs' || Boolean(row.registryId))) && ($('[data-local-chains]').checked || !row.chain));
      function fit() { if (!map) return; const points = visible().map(row => positions.get(row.candidateId)).filter(Boolean); if (points.length) map.fitBounds(points.map(point => [point.lat, point.lng]), { padding:[28,28], maxZoom:15, animate:false }); }
      function initMap() {
        if (map || !window.L) return;
        map = window.L.map($('#sales-discovery-map'), { scrollWheelZoom:false, minZoom:3, maxZoom:19, zoomAnimation:false, fadeAnimation:false });
        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, referrerPolicy:'origin', updateWhenIdle:true, keepBuffer:1,
          attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>' }).addTo(map);
        markers = window.L.layerGroup().addTo(map); map.setView([39.5,-98.4],4);
        $('#sales-discovery-map').addEventListener('pointerdown', () => { userAdjusted = true; });
        $('#sales-discovery-map').addEventListener('keydown', () => { userAdjusted = true; });
        map.on('dragstart', () => { userAdjusted = true; });
      }
      function paint() {
        if (!data) return;
        const rows = visible(), mapped = rows.filter(row => positions.has(row.candidateId));
        $('[data-local-summary]').textContent = `${data.city}, ${data.state} · ${data.total} found · ${rows.length} shown · ${mapped.length} mapped${data.truncated ? ' · source limit reached' : ''}`;
        $('[data-local-list]').innerHTML = rows.map(row => `<button type="button" class="local-office-item ${row.candidateId === selected ? 'is-selected' : ''}" data-local-office="${e(row.candidateId)}" aria-pressed="${row.candidateId === selected}"><strong>${e(row.name)}</strong><span>${e(address(row))}</span><small>${row.sourceKind === 'irs' ? 'IRS e-file provider' : 'Registered tax/accounting business'}${row.registryId && row.sourceKind === 'irs' ? ' + state registry' : ''}${row.chain ? ' · chain name' : ''} · ${positions.has(row.candidateId) ? 'On map' : checked.has(row.candidateId) ? 'Address not matched' : 'Mapping address…'}</small>${row.contact ? `<small>Directory contact: ${e(row.contact)}</small>` : ''}</button>`).join('') || '<p>No offices match these filters.</p>';
        host.querySelectorAll('[data-local-office]').forEach(button => button.onclick = () => select(button.dataset.localOffice));
        $('#sales-discovery-map').hidden = !data.results.length;
        if (!data.results.length) { markers?.clearLayers(); return; }
        initMap();
        if (!map) { $('#sales-discovery-map').textContent = 'The interactive map could not load. All results and business research remain available below.'; return; }
        markers.clearLayers(); pinFor.clear();
        const groups = new Map();
        for (const row of mapped) { const point = positions.get(row.candidateId), key = `${point.lat.toFixed(5)}|${point.lng.toFixed(5)}`; if (!groups.has(key)) groups.set(key, { point, rows:[] }); groups.get(key).rows.push(row); }
        for (const { point, rows:group } of groups.values()) {
          const marker = window.L.marker([point.lat,point.lng], { title:group.map(row => row.name).join(' · '), keyboard:true,
            icon:window.L.divIcon({ className:`local-map-pin ${group.some(row => row.candidateId === selected) ? 'is-selected' : ''}`, html:`<span>${group.length > 1 ? group.length : ''}</span>`, iconSize:[28,28], iconAnchor:[14,14] }) }).addTo(markers);
          const popup = document.createElement('div'); popup.className = 'local-pin-popup';
          for (const row of group) { const button = document.createElement('button'); button.type = 'button'; button.textContent = row.name; button.onclick = () => select(row.candidateId); popup.append(button); pinFor.set(row.candidateId, marker); }
          const precision = document.createElement('small'); precision.textContent = `${point.source} · ${point.precision}`; popup.append(precision); marker.bindPopup(popup);
          marker.on('click', () => { if (group.length === 1) select(group[0].candidateId, false); });
        }
        map.invalidateSize({ animate:false }); if (!userAdjusted) fit();
      }
      async function select(id, pan = true) {
        const candidate = data.results.find(row => row.candidateId === id); if (!candidate) return;
        selected = id; const request = ++lookupSequence; paint();
        const point = positions.get(id); if (map && point && pan) { userAdjusted = true; map.panTo([point.lat,point.lng], { animate:false }); pinFor.get(id)?.openPopup(); }
        const panel = $('[data-local-business]');
        panel.innerHTML = `<h4>${e(candidate.name)}</h4><p>${e(address(candidate))}</p><p>${candidate.sourceKind !== 'irs' ? 'Registered business address; storefront status needs checking.' : 'IRS directory location; current operating status needs checking.'}</p><p>${candidate.phone ? `Business phone: ${e(candidate.phone)}<br>` : ''}${candidate.contact ? `Directory contact: ${e(candidate.contact)} · role unverified` : ''}</p><div class="sales-actions"><button type="button" class="button secondary" data-local-prepare>Prepare office record</button>${link('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(candidate.name+' '+address(candidate)), 'Open location')}${link(candidate.sourceURL || candidate.url, 'Public source')}</div><div data-local-contact-research></div><div data-business-results><p>Cross-referencing the business registry…</p></div>`;
        panel.querySelector('[data-local-prepare]').onclick = () => onPrepare(candidate);
        const research = row => window.GigTaxLocalContacts?.mount({host:panel.querySelector('[data-local-contact-research]'),candidate:row.researchCandidate?{...row.researchCandidate,contact:row.contact || '',contactRole:row.contactRole || 'unverified',researchToken:row.researchToken,researchContextNote:row.researchContextNote}:row,api,status,onPrepare});
        research(candidate);
        try {
          const report = await api('lookup-business', { candidateToken:candidate.candidateToken });
          if (request !== lookupSequence || selected !== id) return;
          const target = panel.querySelector('[data-business-results]');
          target.innerHTML = `<p class="local-owner-note">${e(report.message)}</p><div class="sales-actions">${(report.links || []).map(item=>link(item.url,item.label)).join('')}</div>${(report.matches || []).map((record,index) => `<article class="local-registry-record"><span class="sdr-contact-badge">${e(matchNames[record.match])}</span><h5>${e(record.legalName)}</h5><p>${e(address(record))}</p>${record.addressKind?`<p>${e(record.addressKind)}</p>`:''}<p>${e(record.businessType)} · ${e(record.status)} · Business ID ${e(record.businessId)}</p>${record.email ? `<p>Published business email: ${e(record.email)}</p>` : ''}${sourceNotes(record)}<h6>Listed principals</h6>${record.principals?.length ? `<ul>${record.principals.map((person,personIndex) => `<li><strong>${e(person.name)}</strong><span>${e(person.role)}</span> ${link(person.sourceURL,'Principal source')}<button type="button" class="button secondary" data-research-principal="${index}:${personIndex}">Find business contacts</button></li>`).join('')}</ul>` : `<p>${e(record.principalIssue || report.coverage?.principalCoverage || 'No principals were returned for this record.')}</p>`}<p>Ownership remains unconfirmed until the role and business match are reviewed.</p>${record.registeredAgents?.length?`<details><summary>Registered agents — not owner findings</summary>${record.registeredAgents.map(person=>`<p>${e(person.name)} · ${e(person.role)} ${link(person.sourceURL,'Source')}</p>`).join('')}</details>`:''}${link(record.sourceURL,'Business registry source')}<button type="button" class="button secondary" data-research-business="${index}">Find business contacts</button><button type="button" class="button secondary" data-use-business="${index}">Prepare this registered business</button></article>`).join('')}`;
          target.querySelectorAll('[data-research-business]').forEach(button => button.onclick = () => { research(report.matches[Number(button.dataset.researchBusiness)]); panel.scrollTop=0; });
          target.querySelectorAll('[data-research-principal]').forEach(button => button.onclick = () => { const [index,personIndex]=button.dataset.researchPrincipal.split(':').map(Number),record=report.matches[index],person=record.principals[personIndex]; research({...record,contact:person.name,contactRole:person.role,researchToken:person.researchToken}); panel.scrollTop=0; });
          target.querySelectorAll('[data-use-business]').forEach(button => button.onclick = () => { const record = report.matches[Number(button.dataset.useBusiness)], same = ['registry_record','name_and_address'].includes(record.match); onPrepare({ ...record, contact:same ? candidate.contact : '', phone:same ? candidate.phone : '', url:record.sourceURL }); });
        } catch (error) { if (request === lookupSequence) panel.querySelector('[data-business-results]').textContent = error.message + ' Select this office again to retry. The public source and office form remain available.'; }
      }
      async function mapAddresses(current) {
        if (geocoding) return; geocoding = true; $('[data-map-retry]').hidden = true; let cursor = 0, failures = 0;
        const queue = data.results.filter(row => !positions.has(row.candidateId) && !checked.has(row.candidateId));
        const progress = () => { if (current === sequence) $('[data-map-progress]').textContent = `Mapped ${positions.size} of ${data.results.length} public addresses${failures ? ` · ${failures} addresses could not be checked` : ''}. Address locations are estimates.`; };
        try {
          await Promise.all([0,1].map(async () => {
            while (cursor < queue.length && current === sequence) {
              const batch = queue.slice(cursor, cursor += 10);
              try {
                const response = await api('map-geocode', { candidateTokens:batch.map(row => row.candidateToken) }); if (current !== sequence) return;
                for (const result of response.results) { checked.add(result.candidateId); if (result.location) positions.set(result.candidateId,result.location); }
              } catch { if (current === sequence) failures += batch.length; }
              if (current === sequence) { paint(); progress(); }
            }
          }));
        } finally { if (current === sequence) { geocoding = false; progress(); $('[data-map-retry]').hidden = !failures; } }
      }
      $('[data-local-filter]').oninput = paint; $('[data-local-source]').onchange = paint; $('[data-local-chains]').onchange = paint;
      $('[data-map-fit]').onclick = () => { userAdjusted = false; fit(); };
      $('[data-map-retry]').onclick = () => mapAddresses(sequence);
      return {
        async search(input) {
          const current = ++sequence; lookupSequence++; selected = undefined; geocoding = false;
          status('Finding local offices and cross-referencing public business registrations…');
          const result = await api('search-local', input); if (current !== sequence) return;
          data = result; positions.clear(); checked.clear(); userAdjusted = false; host.hidden = false;
          for (const row of data.results) if (row.location) { positions.set(row.candidateId,row.location); checked.add(row.candidateId); }
          if (data.correction) form.elements.city.value = data.city;
          $('[data-local-business]').innerHTML = '<h4>Business & ownership</h4><p>Select an office to compare its name and address with legal business records and listed principals.</p>';
          $('[data-local-coverage]').textContent = [data.coverage,...(data.issues || []),data.registryCoverage?.note || ''].filter(Boolean).join(' ');
          const oldResults = document.querySelector('#sales-results'), pagination = document.querySelector('#sales-pagination'); if (oldResults) oldResults.hidden = true; if (pagination) pagination.hidden = true;
          paint(); status(data.message); void mapAddresses(current);
        },
        visible() { if (map) setTimeout(() => { map.invalidateSize({ animate:false }); if (!userAdjusted) fit(); },0); },
      };
    },
  };
})();
