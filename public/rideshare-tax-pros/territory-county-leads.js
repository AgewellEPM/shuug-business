(() => {
  'use strict';
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }

  function avatar(lead) {
    if (lead?.photo) {
      const image = el('img', '', 'county-avatar');
      image.src = lead.photo;
      image.alt = '';
      return image;
    }
    const initials = (lead?.name || '').split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase();
    const badge = el('span', initials || '–', 'county-avatar');
    badge.setAttribute('aria-hidden', 'true');
    return badge;
  }

  function mount(panel, data, api, zoomCounty, onAssignment) {
    const aside = panel.querySelector('#territory-county-roster'), toggle = panel.querySelector('[data-map-roster]');
    const list = aside.querySelector('[data-county-list]');
    const editor = panel.querySelector('[data-county-editor]');
    const counties = [...data.counties].sort((a,b) => a.label.localeCompare(b.label));
    let current, editing, active = true;
    close();
    aside.hidden = toggle.getAttribute('aria-expanded') === 'false';
    const show = visible => { aside.hidden = !visible; toggle.setAttribute('aria-expanded', String(visible)); };
    toggle.onclick = () => show(aside.hidden);

    function renderList() {
      list.replaceChildren(...counties.map(county => {
        const row = el('button', '', 'county-lead-row');
        row.type = 'button'; row.dataset.countyRow = county.id;
        row.setAttribute('aria-pressed', String(current === county));
        const text = el('span');
        text.append(el('strong', county.label), el('small', county.lead?.name || 'Unassigned'));
        row.append(avatar(county.lead), text);
        row.onclick = () => { zoomCounty(county); select(county); };
        return row;
      }));
    }

    function select(county) {
      current = county;
      renderList();
    }

    function close(restoreFocus = false) {
      const previous = editing;
      editing = undefined;
      editor.hidden = true;
      editor.replaceChildren();
      if (restoreFocus && previous) panel.querySelector(`[data-county-assign="${previous.id}"]`)?.focus();
    }

    function edit(county) {
      if (!county.canEdit) return;
      close();
      select(county);
      editing = county;
      editor.hidden = false;
      const lead = county.lead;
      editor.append(el('h3', (lead?.name ? 'Change rep for ' : 'Assign ') + county.label));
      const form = el('form', '', 'county-lead-form');
      const name = el('input'), photo = el('input'), removePhoto = el('input');
      name.value = lead?.name || ''; name.required = true; name.maxLength = 100; name.name = 'name';
      const member = el('select'); member.name = 'memberId'; member.required = true;
      member.append(new Option('Choose a sales rep', ''));
      const members = data.leadMembers.filter(p => !p.counties || p.counties.includes(county.id));
      for (const person of members) {
        member.append(new Option(person.name, person.id));
      }
      if (data.customLeads) member.append(new Option('Enter a name manually', 'manual'));
      member.value = lead?.memberId || (lead?.name && data.customLeads ? 'manual' : '');
      const label = (text, input) => { const label = el('label', text); label.append(input); return label; };
      photo.type = 'file'; photo.name = 'photo'; photo.accept = 'image/*';
      const customName = label('Person running this county', name);
      const customPhoto = label('Headshot (optional)', photo);
      const remove = label('Remove headshot', removePhoto);
      removePhoto.type = 'checkbox';
      const profile = el('div', '', 'county-rep-preview');
      function showPerson() {
        const manual = member.value === 'manual';
        customName.hidden = name.disabled = !manual;
        customPhoto.hidden = photo.disabled = !manual;
        remove.hidden = !manual || !lead?.photo || Boolean(lead.memberId);
        const person = members.find(rep => rep.id === member.value);
        profile.hidden = !person;
        if (person) {
          const sameRep = lead?.memberId === person.id;
          const savedPhoto = sameRep ? lead.photo : '';
          const shown = { ...person, photo: sameRep && lead.profileRevision ? savedPhoto : person.photo || savedPhoto };
          profile.replaceChildren(avatar(shown), el('span', shown.photo ? 'Rep profile headshot' : 'No profile headshot yet'));
        }
      }
      member.onchange = showPerson;
      showPerson();
      form.append(label('Sales rep', member), profile, customName, customPhoto, remove);
      const actions = el('div', '', 'county-lead-actions');
      const save = el('button', 'Save assignment', 'button primary');
      const clear = el('button', 'Clear assignment', 'button secondary');
      const cancel = el('button', 'Cancel', 'button secondary');
      clear.type = cancel.type = 'button'; clear.hidden = !lead?.name;
      actions.append(save, clear, cancel);
      const message = el('p'); message.setAttribute('role','status');
      form.append(actions, message);
      cancel.onclick = () => close(true);
      async function submit(clearing) {
        if (save.disabled) return;
        save.disabled = clear.disabled = true;
        try {
          const memberId = member.value === 'manual' ? '' : member.value;
          const samePerson = memberId ? memberId === lead?.memberId : !lead?.memberId && name.value.trim() === lead?.name;
          let image = samePerson ? lead.photo : '';
          if (!memberId && photo.files?.[0]) image = await window.SdrHeadshots.encode(photo.files[0]);
          if (clearing || removePhoto.checked) image = '';
          const result = await api('set-county-lead', {state:data.state, county:county.id, revision:lead?.revision || 0,
            name:clearing ? '' : name.value.trim(), memberId, photo:image, clear:clearing});
          county.lead = result.lead;
          if (!active) return;
          onAssignment();
          renderList();
          if (editing === county && editor.contains(form)) close(true);
        } catch (error) { message.textContent = error.message; }
        finally { save.disabled = clear.disabled = false; }
      }
      form.onsubmit = event => { event.preventDefault(); void submit(false); };
      clear.onclick = () => submit(true);
      editor.append(form);
      member.focus({ preventScroll: true });
      editor.scrollIntoView?.({ block: 'nearest' });
    }
    renderList();
    return { select, edit, close, refresh: renderList, dispose() {
      active = false;
      aside.hidden = true;
      toggle.onclick = null;
      list.replaceChildren(); close();
    } };
  }
  window.SdrCountyLeads = { mount, avatar };
})();
