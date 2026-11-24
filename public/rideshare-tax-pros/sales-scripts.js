(() => {
  'use strict';
  const channelNames = { phone: 'Phone Call', email: 'Email', demo: 'In-Person / Demo', voicemail: 'Voicemail' };
  const versionNames = { script: 'Script', email: 'Email Version', voicemail: 'Voicemail', talking: 'Talking Points', objections: 'Objections', followup: 'Follow-Up' };
  const token = /\{\{([A-Za-z]+)\}\}/g;
  const number = new Intl.NumberFormat('en-US');

  function element(tag, text, name) {
    const node = document.createElement(tag);
    if (name) node.className = name;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function scriptParagraphs(value, tab) {
    return value.split(/\n\s*\n/).filter(Boolean).map(paragraph => {
      const [first, ...lines] = paragraph.trim().split('\n');
      if (tab === 'email' || tab === 'voicemail' || !lines.length || first.length > 75) {
        return element('p', paragraph.trim(), 'scripts-paragraph');
      }
      const section = element('section', undefined, 'scripts-script-step');
      section.append(element('h3', first.replace(/^[#*]+\s*/, '')));
      if (lines.every(line => /^\s*[-•]\s/.test(line))) {
        const list = element('ul');
        list.append(...lines.map(line => element('li', line.replace(/^\s*[-•]\s*/, ''))));
        section.append(list);
      } else section.append(element('p', lines.join('\n')));
      return section;
    });
  }

  function mount({ api, onCompose, onFollowUp }) {
    const root = document.querySelector('.sdr-sales-scripts');
    if (!root) return;
    const find = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    const action = name => find('[data-scripts-action="' + name + '"]');
    const fields = all('[data-scripts-value]'), search = all('[data-scripts-search]');
    const tabs = all('[data-scripts-version]'), panel = find('#scripts-version-panel'), desktop = find('[data-scripts-workspace]');
    const title = find('#scripts-selected-title'), categories = find('[data-scripts-categories]');
    const editorDialog = find('[data-scripts-dialog]'), editor = find('[data-scripts-editor]');
    const copyDialog = find('[data-scripts-copy-dialog]'), personalize = find('[data-scripts-personalize]');
    const builder = find('[data-scripts-builder]'), buildButton = builder.querySelector('button');
    let userId, epoch = 0, load, record, selectedId, category, draft, version = 'script', searchText = '';
    let saving = false, building = false, editShared = false, editVersion, editTarget;
    const searchCollapsed = new Set();

    const selected = () => draft || record?.scripts.find(script => script.id === selectedId);
    const status = (message, error = false) => {
      const node = find('[data-scripts-status]');
      node.textContent = message; node.hidden = !message; node.dataset.error = String(error);
    };
    const editorStatus = message => { find('[data-scripts-dialog-status]').textContent = message; };
    const normalized = value => value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').trim();
    const setStat = (name, value) => { find('[data-scripts-stat="' + name + '"]').textContent = value; };
    const keyField = key => fields.find(field => field.dataset.scriptsValue === key);
    function substitute(value) {
      return value.replace(token, (whole, key) => keyField(key)?.value.trim() || whole);
    }
    function requireValues(value) {
      const variables = [...value.matchAll(token)];
      if (!variables.length) return true;
      const missing = variables.map(match => keyField(match[1])).find(Boolean);
      if (!missing) {
        status('This email has an unrecognized variable. Edit the script to replace it before opening an email draft.', true);
        return false;
      }
      personalize.open = true;
      missing.focus();
      status('Fill in ' + missing.labels[0].textContent.toLowerCase() + ' to prepare this draft.', true);
      return false;
    }

    function choose(script, focus) {
      selectedId = script.id; draft = null; category = script.category;
      setVersion('script');
      renderLibrary();
      if (focus) title.focus();
    }
    function matching() {
      const terms = normalized(searchText).split(/\s+/).filter(Boolean);
      if (!terms.length) return record.scripts;
      return record.scripts.filter(script => {
        const searchable = normalized([script.title, script.category, script.description, ...Object.values(script.versions)].join(' '));
        return terms.every(term => searchable.includes(term));
      });
    }
    function renderLibrary() {
      const filtered = matching(), keys = record.categories || [];
      const groups = [...new Set([...keys, ...filtered.map(script => script.category)])];
      const listed = groups.flatMap(group => {
        const scripts = filtered.filter(script => script.category === group);
        if (!scripts.length) return [];
        const li = element('li'), button = element('button', undefined, 'scripts-category');
        const count = element('small', String(scripts.length));
        const mark = element('span', '›', 'scripts-category-arrow');
        mark.setAttribute('aria-hidden', 'true');
        const list = element('ul', undefined, 'scripts-catalog-items');
        const searching = Boolean(searchText.trim());
        const expanded = searching ? !searchCollapsed.has(group) : category === group;
        const id = 'scripts-category-' + groups.indexOf(group);
        list.id = id; list.hidden = !expanded;
        button.type = 'button'; button.dataset.scriptsCategory = group;
        button.setAttribute('aria-expanded', String(expanded)); button.setAttribute('aria-controls', id);
        button.append(element('span', group), count, mark);
        button.addEventListener('click', () => {
          if (searching) {
            if (expanded) searchCollapsed.add(group);
            else searchCollapsed.delete(group);
          } else category = expanded ? '' : group;
          renderLibrary();
          all('[data-scripts-category]').find(item => item.dataset.scriptsCategory === group)?.focus();
        });
        for (const script of scripts) {
          const entry = element('li'), select = element('button', script.title, 'scripts-select');
          select.type = 'button';
          if (!draft && script.id === selectedId) select.setAttribute('aria-current', 'true');
          select.addEventListener('click', () => choose(script, true));
          entry.append(select); list.append(entry);
        }
        li.append(button, list); return [li];
      });
      categories.replaceChildren(...listed);
      find('[data-scripts-empty]').hidden = listed.length > 0;
    }

    function renderContent() {
      const script = selected();
      desktop.hidden = !script;
      if (!script) return;
      title.textContent = script.title;
      find('[data-scripts-description]').textContent = [script.category, script.description].filter(Boolean).join(' · ');
      find('[data-scripts-kind]').textContent = draft ? 'Unsaved draft' : script.shared ? 'Team script' : script.custom ? 'My script' : 'Library';
      const isPrimary = Boolean(script.id && script.id === record.primaryId);
      action('primary').setAttribute('aria-pressed', String(isPrimary));
      action('primary').querySelector('span').textContent = isPrimary ? 'Primary Script' : 'Set as Primary';
      action('primary').disabled = saving || !script.id || isPrimary;
      action('email').disabled = saving || !onCompose;
      action('followup').disabled = saving || !onFollowUp;
      action('save').disabled = action('share').disabled = saving;
      action('copy').querySelector('span').textContent = 'Copy ' + versionNames[version];
      find('[data-scripts-selected-uses]').textContent = number.format(record.useByScript?.[script.id] || 0);
      find('[data-scripts-channels]').replaceChildren(...Object.entries(channelNames).map(([channel, label]) => {
        const li = element('li'), supported = script.channels.includes(channel);
        const tick = element('span', supported ? '✓' : '–');
        tick.setAttribute('aria-hidden', 'true'); tick.dataset.available = String(supported);
        if (!supported) li.setAttribute('aria-label', label + ' unavailable for this script');
        li.append(tick, element('span', label)); return li;
      }));
      const content = substitute(script.versions[version] || '');
      const subject = version === 'email' && script.emailSubject ? element('p', 'Subject: ' + substitute(script.emailSubject), 'scripts-subject') : null;
      panel.replaceChildren(...[subject, ...scriptParagraphs(content, version)].filter(Boolean));
    }
    function setVersion(next, focus = false) {
      version = next;
      for (const tab of tabs) {
        const active = tab.dataset.scriptsVersion === next;
        tab.tabIndex = active ? 0 : -1;
        tab.setAttribute('aria-selected', String(active));
        if (active && focus) tab.focus();
      }
      panel.setAttribute('aria-labelledby', 'scripts-tab-' + next);
      renderContent();
    }
    function apply(next, preferred) {
      record = next;
      if (preferred) { selectedId = preferred; draft = null; }
      if (!record.scripts.some(script => script.id === selectedId)) selectedId = record.primaryId || record.scripts[0]?.id;
      if (category === undefined || preferred) category = selected()?.category;
      setStat('library', number.format(record.scripts.length));
      setStat('uses', number.format(record.uses));
      setStat('custom', number.format(record.customCount));
      setStat('top', record.scripts.find(script => script.id === record.topScriptId)?.title || 'No uses yet');
      renderLibrary(); renderContent();
    }
    function rememberUse(script, channel) {
      if (!script.id) return;
      const session = epoch;
      return api('sales-scripts-use', { id: script.id, channel }).then(next => {
        if (session === epoch) apply(next);
      }).catch(() => {
        if (session === epoch) status('The action completed, but its usage could not be recorded.', true);
      });
    }

    function show(user) {
      if (user.id !== userId) {
        reset(); userId = user.id;
        keyField('YourName').value = user.name || '';
        keyField('Product').value = 'TinkyTown';
      }
      if (load) return load;
      const session = epoch;
      if (!record) status('Loading sales scripts…');
      load = api('sales-scripts-read').then(next => {
        if (epoch === session) { apply(next); status(''); }
      }).catch(error => {
        if (epoch === session) status(error.message || 'The script library is unavailable.', true);
      }).finally(() => { if (epoch === session) load = null; });
      return load;
    }
    function reset() {
      epoch++; userId = record = load = selectedId = category = draft = editTarget = undefined;
      saving = building = false; version = 'script'; searchText = ''; searchCollapsed.clear();
      desktop.hidden = true; status('');
      categories.replaceChildren(); find('[data-scripts-empty]').hidden = true;
      for (const input of [...fields, ...search]) input.value = '';
      builder.reset(); editor.reset(); buildButton.disabled = false;
      copyDialog.querySelector('textarea').value = '';
      if (editorDialog.open) editorDialog.close();
      if (copyDialog.open) copyDialog.close();
      for (const key of ['library','top','uses','custom']) setStat(key, '—');
      setVersion('script');
    }

    for (const input of search) {
      input.form.addEventListener('submit', event => event.preventDefault());
      input.addEventListener('input', () => {
        searchText = input.value;
        searchCollapsed.clear();
        for (const other of search) if (other !== input) other.value = searchText;
        if (!record) return;
        renderLibrary();
        const count = matching().length;
        status(searchText.trim() ? count + (count === 1 ? ' matching script.' : ' matching scripts.') : '');
      });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => setVersion(tab.dataset.scriptsVersion));
      tab.addEventListener('keydown', event => {
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        setVersion(tabs[(next + tabs.length) % tabs.length].dataset.scriptsVersion, true);
      });
    });
    for (const field of fields) field.addEventListener('input', renderContent);
    for (const chip of all('[data-scripts-variable]')) {
      chip.addEventListener('click', () => { personalize.open = true; keyField(chip.dataset.scriptsVariable)?.focus(); });
    }
    for (const close of all('[data-scripts-close]')) close.addEventListener('click', () => close.closest('dialog').close());
    action('copy').addEventListener('click', async () => {
      const script = selected();
      if (!script) return;
      const value = [...(version === 'email' && script.emailSubject ? ['Subject: ' + script.emailSubject] : []), script.versions[version]].map(substitute).join('\n\n');
      try {
        await navigator.clipboard.writeText(value);
        status('Copied ' + versionNames[version].toLowerCase() + '.');
        await rememberUse(script, 'copy');
      } catch {
        const input = copyDialog.querySelector('textarea'); input.value = value;
        copyDialog.showModal(); input.focus(); input.select();
      }
    });
    action('email').addEventListener('click', async () => {
      const script = selected();
      if (!script) return;
      const subject = substitute(script.emailSubject || script.title), body = substitute(script.versions.email);
      if (!requireValues(subject + '\n' + body)) return;
      try {
        await onCompose({ subject, body });
        await rememberUse(script, 'email');
      } catch (error) { status(error.message || 'The email draft could not be opened.', true); }
    });
    action('followup').addEventListener('click', async () => {
      const script = selected();
      if (!script) return;
      try {
        await onFollowUp({ title: script.title, note: substitute(script.versions.followup) });
        await rememberUse(script, 'followup');
      } catch (error) { status(error.message || 'The follow-up form could not be opened.', true); }
    });
    action('primary').addEventListener('click', async () => {
      const script = selected();
      if (saving || !script?.id) return;
      const session = epoch;
      saving = true; renderContent();
      try {
        const next = await api('sales-scripts-primary', { id: script.id });
        if (session === epoch) { apply(next); status('Primary script updated.'); }
      } catch (error) {
        if (session === epoch) status(error.message || 'The primary script could not be saved.', true);
      } finally { if (session === epoch) { saving = false; renderContent(); } }
    });
    function openEditor(shared) {
      const script = selected();
      if (!script || saving) return;
      const updateShared = Boolean(script.editable && script.shared);
      editTarget = script; editShared = shared || updateShared; editVersion = version;
      find('#scripts-dialog-title').textContent = updateShared ? 'Update Shared Script' : shared ? 'Share with Team' : 'Save to Library';
      find('[data-scripts-dialog-summary]').textContent = editShared ? 'All active sales reps will be able to use this version.' : 'Save your own editable version of this script.';
      find('[data-scripts-dialog-submit]').textContent = updateShared ? 'Update Shared Script' : shared ? 'Share Script' : 'Save Script';
      find('[data-scripts-dialog-format]').textContent = versionNames[version];
      editor.elements.title.value = script.title;
      editor.elements.subject.value = script.emailSubject || script.title;
      editor.elements.version.value = script.versions[version] || '';
      editorStatus('');
      editorDialog.showModal(); editor.elements.title.focus();
    }
    action('save').addEventListener('click', () => openEditor(false));
    action('share').addEventListener('click', () => openEditor(true));
    editor.addEventListener('submit', async event => {
      event.preventDefault();
      if (!editTarget || saving) return;
      const { id, category, description, versions, channels } = editTarget;
      const script = { ...(id ? { id } : {}), title: editor.elements.title.value.trim(), category, description,
        emailSubject: editor.elements.subject.value.trim(), channels,
        versions: { ...versions, [editVersion]: editor.elements.version.value.trim() } };
      const session = epoch, submit = editor.querySelector('[type=submit]');
      saving = submit.disabled = true; editorStatus('Saving…'); renderContent();
      try {
        const next = await api('sales-scripts-save', { script, ...(editShared ? { shared: true } : {}) });
        if (session !== epoch) return;
        apply(next, next.savedId); editorDialog.close();
        status(editShared ? 'Script shared with the sales team.' : 'Script saved to your library.');
        title.focus();
      } catch (error) {
        if (session === epoch) editorStatus(error.message || 'Your script could not be saved.');
      } finally {
        submit.disabled = false;
        if (session === epoch) { saving = false; renderContent(); }
      }
    });
    builder.addEventListener('submit', async event => {
      event.preventDefault();
      const prompt = builder.elements.prompt.value.trim();
      if (!prompt || !record || building) return;
      const session = epoch;
      building = buildButton.disabled = true; status('Preparing your script…');
      try {
        const next = await api('sales-scripts-build', { prompt, category: category || selected()?.category });
        if (session !== epoch) return;
        draft = next.script;
        setVersion('script'); renderLibrary();
        status(next.generated ? 'Draft generated. You can edit it before saving.' : 'Draft prepared from a library template. You can edit it before saving.');
        title.focus();
      } catch (error) {
        if (session === epoch) status(error.message || 'A script could not be generated.', true);
      } finally {
        if (session === epoch) building = buildButton.disabled = false;
      }
    });
    return { show, reset };
  }
  window.SdrSalesScripts = { mount };
})();
