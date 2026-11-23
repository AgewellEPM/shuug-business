(() => {
  'use strict';
  function searchURL(kind, keywords) {
    const category = kind === 'companies' ? 'companies' : 'people';
    const url = new URL(`https://www.linkedin.com/search/results/${category}/`);
    url.searchParams.set('keywords', keywords);
    return url.href;
  }

  const form = document.querySelector('#sales-linkedin-search');
  if (!form) return;
  const keywords = form.elements.keywords;
  keywords.addEventListener('input', () => keywords.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = keywords.value.trim();
    if (!query) {
      keywords.setCustomValidity('Enter a role, company, industry, or location.');
      keywords.reportValidity();
      return;
    }
    window.open(searchURL(event.submitter?.value, query), '_blank', 'noopener,noreferrer');
  });

  function action(label, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = label;
    button.addEventListener('click', callback);
    return button;
  }

  function external(label, url) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = 'button secondary';
    anchor.textContent = label;
    return anchor;
  }

  function lookupURL(record) {
    const query = [...new Set([record.name, record.company, record.title, record.locality].filter(Boolean))];
    const url = new URL('https://www.google.com/search');
    url.searchParams.set('q', query.join(' ') + ' -site:linkedin.com');
    return url.href;
  }

  function mount({ api, status }) {
    const byId = id => document.getElementById(id);
    const results = byId('sales-prospect-results'), count = byId('sales-prospect-count');
    const filter = byId('sales-filter-prospects'), editor = byId('sales-prospect-editor');
    const edit = byId('sales-save-prospect'), add = byId('sales-add-prospect');
    const pagination = byId('sales-prospect-pagination'), previous = byId('sales-prospect-previous'), next = byId('sales-prospect-next');
    let editing, offset = 0, request = 0;

    function editProspect(record) {
      editing = record;
      edit.reset();
      edit.elements.sourceURL.readOnly = Boolean(record);
      if (record) for (const [key, field] of Object.entries({ sourceURL: 'sourceURL', name: 'name', title: 'title', company: 'company', locality: 'locality', note: 'note' })) {
        edit.elements[field].value = record[key] || '';
      }
      byId('sales-prospect-editor-title').textContent = record ? 'Edit prospect' : 'Add prospect';
      editor.hidden = false;
      editor.scrollIntoView?.({ block: 'nearest' });
      (record ? edit.elements.name : edit.elements.sourceURL).focus();
    }

    function closeEditor() {
      editing = null;
      editor.hidden = true;
      edit.reset();
      add.focus();
    }

    function cardFor(record) {
      const card = document.createElement('article');
      card.className = 'sales-result';
      const name = document.createElement('h3');
      name.textContent = record.name;
      const summary = document.createElement('p');
      summary.textContent = [record.title, record.company, record.locality].filter(Boolean).join(' · ') || (record.type === 'company' ? 'Company' : 'Person');
      card.append(name, summary);
      if (record.note) {
        const note = document.createElement('p');
        note.textContent = record.note;
        card.append(note);
      }
      const actions = document.createElement('div');
      actions.className = 'sales-actions';
      actions.append(external('Open LinkedIn ↗', record.sourceURL), external('Search the public web ↗', lookupURL(record)),
        action('Edit', () => editProspect(record)),
        action(record.archived ? 'Restore' : 'Archive', async event => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await api('update-prospect', { id: record.id, expectedRevision: record.revision, archived: !record.archived });
            status(record.archived ? 'Prospect restored.' : 'Prospect archived.');
            await refresh();
          } catch (error) { status(error.message, true); }
          finally { button.disabled = false; }
        }));
      card.append(actions);
      return card;
    }

    async function refresh() {
      const current = ++request;
      try {
        const criteria = { query: filter.elements.query.value, archived: filter.elements.archived.checked };
        const data = await api('list-prospects', { ...criteria, offset });
        if (current !== request) return;
        if (offset && data.total <= offset) { offset = 0; return refresh(); }
        results.replaceChildren(...data.records.map(cardFor));
        count.textContent = data.total ? `${data.total} ${criteria.archived ? 'archived' : 'saved'} ${data.total === 1 ? 'prospect' : 'prospects'}`
          : criteria.query ? 'No matching prospects.' : criteria.archived ? 'No archived prospects.' : 'No saved prospects yet.';
        pagination.hidden = offset === 0 && !data.hasMore;
        previous.disabled = offset === 0;
        next.disabled = !data.hasMore;
      } catch (error) {
        if (current === request) status(error.message, true);
      }
    }

    filter.addEventListener('submit', event => { event.preventDefault(); offset = 0; void refresh(); });
    filter.elements.archived.addEventListener('change', () => { offset = 0; void refresh(); });
    previous.addEventListener('click', () => { offset = Math.max(offset - 50, 0); void refresh(); });
    next.addEventListener('click', () => { offset += 50; void refresh(); });
    add.addEventListener('click', () => editProspect());
    byId('sales-cancel-prospect').addEventListener('click', closeEditor);
    edit.addEventListener('submit', async event => {
      event.preventDefault();
      const button = edit.querySelector('button[type=submit]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const input = Object.fromEntries(new FormData(edit));
        const result = editing
          ? await api('update-prospect', { ...input, id: editing.id, expectedRevision: editing.revision })
          : await api('save-prospect', input);
        closeEditor();
        filter.elements.query.value = '';
        filter.elements.archived.checked = result.record.archived;
        offset = 0;
        status(result.existing ? 'This prospect is already saved.' : 'Prospect saved.');
        await refresh();
      } catch (error) { status(error.message, true); }
      finally { button.disabled = false; }
    });
    return { refresh };
  }

  window.SdrLinkedIn = {
    mount,
    office(office, links) {
      if (!links || !office.town) return;
      const query = [office.town, office.locality, office.state].filter(Boolean).join(' ').slice(0, 240);
      const anchor = document.createElement('a');
      anchor.href = searchURL('people', query);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = 'Find people on LinkedIn ↗';
      links.append(anchor);
    },
  };
})();
