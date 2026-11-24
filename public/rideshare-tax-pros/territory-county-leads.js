(() => {
  'use strict';
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }

  async function headshot(file) {
    if (file.size > 16 * 1024 * 1024) throw Error('Choose a photo smaller than 16 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 112;
      const ctx = canvas.getContext('2d'), side = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 112, 112);
      ctx.drawImage(image, (image.naturalWidth - side)/2, (image.naturalHeight - side)/2, side, side, 0, 0, 112, 112);
      for (const quality of [.82, .65, .45]) {
        const encoded = canvas.toDataURL('image/jpeg', quality);
        if (encoded.length <= 13000) return encoded;
      }
      throw Error('Choose a smaller headshot.');
    } finally { URL.revokeObjectURL(url); }
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
    const editor = aside.querySelector('[data-county-editor]');
    const counties = [...data.counties].sort((a,b) => a.label.localeCompare(b.label));
    let current, active = true;
    editor.replaceChildren();
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
      show(true);
      editor.replaceChildren();
      renderList();
      const lead = county.lead;
      const title = el('strong', county.label);
      editor.append(title);
      if (!county.canEdit) { editor.append(el('p', lead?.name || 'Unassigned')); return; }
      const form = el('form', '', 'county-lead-form');
      const name = el('input'), photo = el('input'), removePhoto = el('input');
      name.value = lead?.name || ''; name.required = true; name.maxLength = 100; name.name = 'name';
      const member = el('select'); member.name = 'memberId'; member.required = !data.customLeads;
      member.append(new Option(data.customLeads ? 'Enter a name' : 'Choose a team member', ''));
      for (const person of data.leadMembers.filter(p => !p.counties || p.counties.includes(county.id))) {
        member.append(new Option(person.name, person.id));
      }
      member.value = lead?.memberId || '';
      const label = (text, input) => { const label = el('label', text); label.append(input); return label; };
      photo.type = 'file'; photo.name = 'photo'; photo.accept = 'image/*';
      const customName = label('Person running this county', name);
      function showName() { customName.hidden = !data.customLeads || !!member.value; name.disabled = customName.hidden; }
      member.onchange = showName;
      showName();
      form.append(label('Team member', member), customName, label('Headshot', photo));
      if (lead?.photo) {
        removePhoto.type = 'checkbox'; form.append(label('Remove headshot', removePhoto));
      }
      const save = el('button', 'Save lead', 'button primary'), clear = el('button', 'Clear lead', 'button secondary');
      clear.type = 'button'; clear.hidden = !lead?.name;
      const message = el('p'); message.setAttribute('role','status');
      form.append(save, clear, message);
      async function submit(clearing) {
        if (save.disabled) return;
        save.disabled = clear.disabled = true;
        try {
          const samePerson = member.value ? member.value === lead?.memberId : !lead?.memberId && name.value.trim() === lead?.name;
          let image = samePerson ? lead.photo : '';
          if (photo.files?.[0]) image = await headshot(photo.files[0]);
          if (clearing || removePhoto.checked) image = '';
          const result = await api('set-county-lead', {state:data.state, county:county.id, revision:lead?.revision || 0,
            name:clearing ? '' : name.value.trim(), memberId: member.value, photo:image, clear:clearing});
          county.lead = result.lead;
          if (!active) return;
          onAssignment();
          if (current === county) {
            select(county);
            editor.querySelector('[role=status]').textContent = clearing ? 'Lead cleared.' : 'County lead saved.';
          } else renderList();
        } catch (error) { message.textContent = error.message; }
        finally { save.disabled = clear.disabled = false; }
      }
      form.onsubmit = event => { event.preventDefault(); void submit(false); };
      clear.onclick = () => submit(true);
      editor.append(form);
    }
    renderList();
    return { select, refresh: renderList, dispose() {
      active = false;
      aside.hidden = true;
      toggle.onclick = null;
      list.replaceChildren(); editor.replaceChildren();
    } };
  }
  window.SdrCountyLeads = { mount };
})();
