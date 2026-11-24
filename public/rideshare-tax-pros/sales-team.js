(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function element(tag, text = '', className = '') {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function territoryLabel({ territory, states }) {
    if (territory?.version === 1) return territory.areas.map(({ state, cities }) =>
      state + (cities === null ? ' (whole state)' : ` (${cities.length} ${cities.length === 1 ? 'town' : 'towns'})`)).join(', ') || 'No territory assigned';
    return states?.length ? states.join(', ') : 'Nationwide';
  }

  function mountProfile(api) {
    const form = $('sales-team-profile');
    if (!form) return null;
    const bio = form.elements.bio, headshot = form.elements.headshot;
    const preview = form.querySelector('[data-team-profile-preview]');
    const remove = form.querySelector('[data-team-profile-remove]');
    const reload = form.querySelector('[data-team-profile-reload]');
    const submit = form.querySelector('button[type="submit"]');
    const status = $('sales-team-profile-status');
    let identity, saved, photo = '', busy = false, sequence = 0;

    function message(text, error = false) {
      status.textContent = text;
      status.dataset.error = String(error);
    }

    function controls() {
      bio.disabled = headshot.disabled = remove.disabled = submit.disabled = !saved || busy;
      reload.disabled = busy;
    }

    function showPhoto(next) {
      photo = next;
      preview.hidden = remove.hidden = !photo;
      if (photo) preview.src = photo;
      else preview.removeAttribute('src');
    }

    function show(profile) {
      saved = profile;
      bio.value = profile.bio;
      headshot.value = '';
      showPhoto(profile.photo);
    }

    async function work(action, success, options = {}) {
      const request = ++sequence;
      busy = true;
      reload.hidden = true;
      message(options.pending || '');
      controls();
      try {
        const result = await action();
        if (request === sequence) success(result);
      } catch (error) {
        if (request === sequence) {
          message(error.message, true);
          reload.hidden = !(options.loading || error.status === 409);
        }
      } finally {
        if (request === sequence) {
          busy = false;
          controls();
        }
      }
    }

    function load() {
      return work(() => api('sales-team-profile'), ({ profile }) => {
        show(profile);
        message('');
      }, { loading: true, pending: 'Loading your profile…' });
    }

    headshot.addEventListener('change', () => {
      const file = headshot.files?.[0];
      if (!file || busy) return;
      headshot.value = '';
      void work(() => window.SdrHeadshots.encode(file), showPhoto);
    });
    remove.addEventListener('click', () => {
      showPhoto('');
      message('');
    });
    reload.addEventListener('click', load);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!saved || busy) return;
      void work(() => api('set-sales-team-profile', { bio: bio.value, photo, revision: saved.revision }),
        ({ profile }) => { show(profile); message('Profile saved.'); }, { pending: 'Saving your profile…' });
    });
    return {
      refresh(user) {
        if (user.id === identity) return;
        identity = user.id;
        saved = undefined;
        form.reset();
        showPhoto('');
        void load();
      },
    };
  }

  function mount({ api, refreshWorkspace }) {
    const form = $('sales-create-agent'), roster = $('sales-team'), status = $('sales-team-status');
    if (!form || !roster || !status) return null;
    const manager = form.elements.parentId, submit = form.querySelector('button[type="submit"]');
    const profile = mountProfile(api);
    const reload = $('sales-reload-team'), secret = $('sales-agent-code'), code = $('sales-agent-code-value');
    let owner = false, ready = false, busy = false, sequence = 0;

    const tablist = roster.closest('.sdr-team-surface').querySelector('[role="tablist"]');
    const tabs = [...tablist.querySelectorAll('[data-team-view]')];
    let current = 'roster';

    function view(key, focus = false) {
      if (key === 'settings' && !owner) key = 'roster';
      const next = tabs.find(control => control.dataset.teamView === key);
      if (!next) return;
      current = key;
      for (const control of tabs) {
        const active = control === next;
        control.setAttribute('aria-selected', String(active));
        control.tabIndex = active ? 0 : -1;
        $(control.getAttribute('aria-controls')).hidden = !active;
      }
      if (focus) next.focus();
    }
    tablist.addEventListener('click', event => {
      const control = event.target.closest('[data-team-view]');
      if (control && !control.hidden) view(control.dataset.teamView);
    });
    tablist.addEventListener('keydown', event => {
      const available = tabs.filter(control => !control.hidden);
      const index = available.indexOf(event.target);
      if (index < 0) return;
      const last = available.length - 1;
      const target = { ArrowLeft: index ? index - 1 : last, ArrowRight: index === last ? 0 : index + 1, Home: 0, End: last }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      view(available[target].dataset.teamView, true);
    });

    function message(text, error = false) {
      status.textContent = text;
      status.dataset.error = String(error);
    }

    function updateControls() {
      submit.disabled = !ready || busy;
      reload.disabled = busy;
      for (const button of roster.querySelectorAll('[data-team-revoke]')) button.disabled = busy;
    }

    async function command(work) {
      if (busy) return;
      busy = true;
      updateControls();
      try { await work(); }
      catch (error) { message(error.message, true); }
      finally {
        busy = false;
        updateControls();
      }
    }

    function revokeButton(member) {
      const button = element('button', 'Revoke access', 'button secondary');
      button.type = 'button';
      button.dataset.teamRevoke = member.id;
      button.setAttribute('aria-label', `Revoke access for ${member.name} and their team`);
      button.addEventListener('click', () => {
        if (!window.confirm(`Revoke ${member.name}’s access? This ends access and active sessions for them and the team below them. Existing office assignments are retained.`)) return;
        return command(async () => {
          await api('sales-team-revoke', { id: member.id });
          message('Access revoked for this member and their team.');
          await refreshWorkspace();
        });
      });
      return button;
    }

    function memberRow(member, rootId) {
      const item = element('li');
      item.dataset.teamMember = member.id;
      const row = element('div', '', 'sdr-team-member');
      const content = element('div', '', 'sdr-team-member-content');
      const title = element('div', '', 'sdr-team-member-title');
      const coverage = element('div', '', 'sdr-team-member-coverage');
      const state = element('span', member.active ? 'Active' : 'Access ended', 'sdr-team-member-state');
      state.dataset.active = String(member.active);
      title.append(element('strong', member.name));
      if (member.id === rootId) title.append(element('span', 'You', 'sdr-team-member-self'));
      content.append(title);
      if (member.email) content.append(element('p', member.email));
      coverage.append(element('p', territoryLabel(member)));
      if (member.marketSegments?.length) {
        const segments = element('div', '', 'sdr-team-member-markets');
        segments.setAttribute('role', 'group');
        segments.setAttribute('aria-label', 'Assigned facility segments');
        for (const { id, label, count } of member.marketSegments) {
          const segment = element('span', label + ' · ' + count.toLocaleString());
          segment.dataset.teamMarket = id;
          segments.append(segment);
        }
        coverage.append(segments);
      } else if (member.active && Array.isArray(member.marketSegments)) {
        coverage.append(element('p', 'No classified facilities assigned'));
      }
      if (owner && member.id !== rootId) content.append(element('p', `Agent ID ${member.id}`));
      const access = element('div', '', 'sdr-team-member-access');
      access.append(state);
      if (member.canRevoke) access.append(revokeButton(member));
      row.append(content, coverage, access);
      item.append(row);
      return item;
    }

    function render({ members, rootId }) {
      const rows = new Map(members.map(member => [member.id, memberRow(member, rootId)]));
      const groups = new Map();
      const tree = element('ul', '', 'sdr-team-tree');
      tree.setAttribute('aria-label', 'Sales team reporting structure');
      for (const member of members) {
        const item = rows.get(member.id), parent = rows.get(member.parentId);
        if (!parent) { tree.append(item); continue; }
        if (!groups.has(member.parentId)) {
          const reports = element('ul');
          groups.set(member.parentId, reports);
          parent.append(reports);
        }
        groups.get(member.parentId).append(item);
      }
      roster.replaceChildren(tree);
      const selected = manager.value;
      const activeManagers = members.filter(member => member.active);
      manager.replaceChildren(...activeManagers.map(member => {
        const option = element('option', member.id === rootId ? `${member.name} (you)` : member.name);
        option.value = member.id;
        return option;
      }));
      manager.value = activeManagers.some(member => member.id === selected) ? selected : rootId;
    }

    async function refresh(user) {
      owner = user.role === 'owner';
      view(current);
      if (user.id != null) profile?.refresh(user);
      $('sales-team-scope').textContent = owner ? 'See who reports to whom across the workspace.' : 'See your direct reports and the teams they build.';
      const request = ++sequence;
      roster.setAttribute('aria-busy', 'true');
      if (!ready) roster.textContent = 'Loading your sales team…';
      try {
        const team = await api('sales-team-read');
        if (request !== sequence) return;
        render(team);
        ready = true;
      } catch (error) {
        if (request !== sequence) return;
        if (!ready) roster.textContent = 'Sales team could not load.';
        message(error.message, true);
      } finally {
        if (request === sequence) {
          roster.removeAttribute('aria-busy');
          updateControls();
        }
      }
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!ready) return;
      void command(async () => {
        const { name, email, states, parentId } = Object.fromEntries(new FormData(form));
        const input = { name, email, states: states.toUpperCase().split(/[\s,]+/).filter(Boolean) };
        if (owner && parentId) input.parentId = parentId;
        const result = await api('sales-team-invite', input);
        code.textContent = result.code;
        secret.hidden = false;
        form.reset();
        manager.value = parentId;
        message('Access code created. Share it privately with the new team member.');
        await refreshWorkspace();
      });
    });
    $('sales-copy-team-code').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code.textContent); message('Access code copied.'); }
      catch {
        const range = document.createRange(), selection = window.getSelection();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
        message('Access code selected. Copy it to share privately.');
      }
    });
    $('sales-copy-team-link').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.origin + '/sales'); message('Sign-in link copied.'); }
      catch { message('Copy this workspace’s address from your browser to share the sign-in link.'); }
    });
    $('sales-dismiss-team-code').addEventListener('click', () => {
      secret.hidden = true;
      code.textContent = '';
      message('');
      submit.focus();
    });
    reload.addEventListener('click', () => {
      message('');
      void refresh({ role: owner ? 'owner' : 'agent' });
    });
    return { refresh, view };
  }
  window.SdrSalesTeam = { mount };
})();
