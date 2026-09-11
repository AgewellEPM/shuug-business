/* Native WordPress UI. All privileged requests go through the WordPress server. */
(() => {
  'use strict';
  const el = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text !== null && text !== undefined) node.textContent = String(text);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, String(value));
    }
    return node;
  };
  const append = (parent, ...children) => { children.filter(Boolean).forEach(child => parent.append(child)); return parent; };
  const label = (text, input) => append(el('label', text), input);
  const input = (name, value = '', type = 'text', required = false) => el('input', null, { name, value, type, required });
  const select = (name, options, value) => {
    const node = el('select', null, { name });
    options.forEach(option => node.append(el('option', option.label ?? option, { value: option.value ?? option })));
    if (value !== undefined) node.value = value;
    return node;
  };
  const button = (text, action, className = '') => el('button', text, { type: 'button', className, onClick: action });
  const pretty = text => String(text).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const identifier = () => crypto.randomUUID();
  const profileOptions = profiles => [{ value: 'all', label: 'All enabled profiles' }, ...profiles.map(value => ({ value, label: pretty(value) }))];
  const taskStatuses = ['todo', 'in_progress', 'review', 'done'];
  const submit = (form, text, action) => {
    const control = el('button', text, { type: 'submit', className: 'shuug-primary' }); form.append(control);
    form.addEventListener('submit', async event => { event.preventDefault(); control.disabled = true; try { await action(new FormData(form)); } finally { control.disabled = false; } });
    return form;
  };
  function mount(root) {
    const config = JSON.parse(root.dataset.shuugConfig);
    let workspace, tab = 'work', selectedModule = '', editRecord = null, recordRequest = identifier(), offset = 0;
    let thread = null, roadmap = null, notes = [], planning = { threads: [], roadmaps: [] };
    let status, body, busy = false;
    function notice(message, error = false) { status.textContent = message; status.className = error ? 'shuug-message shuug-error' : 'shuug-message'; status.hidden = !message; }
    async function call(operation, data = {}) {
      const response = await fetch(config.endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce }, body: JSON.stringify({ operation, input: data }) });
      const result = await response.json();
      if (!response.ok) { const error = new Error(result.message ?? result.error ?? 'Could not complete this request.'); error.status = response.status; throw error; }
      return result.data;
    }
    async function perform(action) {
      if (busy) return; busy = true; root.setAttribute('aria-busy', 'true'); notice('Working…');
      try { await action(); notice('Saved.'); }
      catch (error) { notice(error.message || 'Connection interrupted. Check your saved work before retrying.', true); }
      finally { busy = false; root.removeAttribute('aria-busy'); }
    }
    function frame() {
      root.replaceChildren();
      const heading = el('header', null, { className: 'shuug-header' });
      append(heading, append(el('div'), el('h2', workspace?.branding.businessName ?? 'Business workspace'), el('p', workspace ? `${workspace.user.name} · ${workspace.user.role}` : 'Connect your business account')));
      if (workspace) {
        const full = button('Open full application', async () => {
          const popup = window.open('', '_blank'); if (popup) popup.opener = null;
          try { const result = await call('session.launch'); if (new URL(result.url).origin !== new URL(workspace.backendUrl).origin) throw new Error('Unexpected application address.'); if (popup) popup.location.href = result.url; else window.location.assign(result.url); }
          catch (error) { if (popup) popup.close(); notice(error.message, true); }
        });
        append(heading, append(el('div', null, { className: 'shuug-actions' }), full, button('Refresh workspace', () => perform(load)), button('Disconnect account', () => perform(async () => { await call('session.logout'); workspace = null; thread = null; roadmap = null; login(); }))));
      }
      append(heading, el('a', 'Sign out of WordPress', { href: config.logoutUrl }));
      status = el('p', '', { className: 'shuug-message', role: 'status', hidden: true });
      append(root, heading, status);
      if (workspace) {
        if (/^#[a-f0-9]{6}$/i.test(workspace.branding.primaryColor)) root.style.setProperty('--shuug-primary', workspace.branding.primaryColor);
        const nav = el('nav', null, { 'aria-label': 'Business workspace sections', className: 'shuug-tabs' });
        const tabs = [['work', 'My work'], ['notes', 'Notes'], ['planning', 'My roadmap'], ['records', 'Business records']];
        if (workspace.editable.includes('team')) tabs.push(['team', 'Team tasks']);
        if (workspace.user.isOwner && config.administrator) tabs.push(['employees', 'Employee accounts'], ['branding', 'Branding & profiles']);
        tabs.push(['account', 'My account']);
        tabs.forEach(([key, text]) => { const control = button(text, () => navigate(key)); control.setAttribute('aria-current', key === tab ? 'page' : 'false'); nav.append(control); }); root.append(nav);
      }
      body = el('div', null, { className: 'shuug-content' }); root.append(body);
    }
    function login(message = '') {
      frame();
      if (!config.configured) { body.append(el('p', 'A WordPress administrator must set the backend address under Business → Connection.')); return; }
      append(body, el('p', `Backend: ${config.backendUrl ?? ''}`), el('p', 'Use the individual business account created by your workspace owner. Your WordPress password and business password may be different.'));
      const form = el('form', null, { className: 'shuug-card shuug-login-form' });
      const email = input('email', '', 'email', true), password = input('password', '', 'password', true);
      email.autocomplete = 'username'; password.autocomplete = 'current-password'; password.maxLength = 200;
      append(form, label('Business email', email), label('Business password', password));
      if (config.administrator) {
        const owner = input('owner', 'yes', 'checkbox'); owner.addEventListener('change', () => { email.required = !owner.checked; email.disabled = owner.checked; if (owner.checked) email.value = ''; });
        form.append(label('Connect as the workspace owner', owner));
      }
      submit(form, 'Connect account', async values => perform(async () => {
        await call('session.login', { email: values.get('owner') ? '' : values.get('email'), password: values.get('password') }); password.value = ''; await load();
      }));
      append(body, form, el('p', 'Forgot your business password? Ask the workspace owner for a new password setup link.'));
      if (message) notice(message, true);
    }
    async function load() { workspace = await call('workspace'); selectedModule ||= workspace.modules[0]?.href.split('/').pop() ?? ''; await navigate(tab); }
    async function navigate(next) {
      tab = next; frame(); notice('Loading…');
      try {
        if (tab === 'work') await work(false);
        if (tab === 'team') await work(true);
        if (tab === 'notes') await noteView();
        if (tab === 'planning') await planView();
        if (tab === 'records') await records();
        if (tab === 'employees') await employees();
        if (tab === 'branding') branding();
        if (tab === 'account') account();
        notice('');
      } catch (error) { notice(error.message, true); if (error.status === 401) { workspace = null; login(error.message); } }
    }
    async function work(team, body = root.querySelector('.shuug-content')) {
      const state = await call(team ? 'team.tasks' : 'me');
      append(body, el('h3', team ? 'Shared team assignments' : 'Assigned to me'), el('p', `${state.tasks.filter(t => t.status !== 'done').length} open assignments`));
      const list = el('div', null, { className: 'shuug-list' }); body.append(list);
      state.tasks.forEach(task => {
        const statusSelect = select('status', taskStatuses.map(value => ({ value, label: pretty(value) })), task.status); statusSelect.setAttribute('aria-label', `Status for ${task.title}`);
        statusSelect.addEventListener('change', () => perform(async () => { await call(team ? 'team.task.assign' : 'task.status', { id: task.id, status: statusSelect.value }); await navigate(tab); }));
        const card = append(el('article', null, { className: 'shuug-card shuug-row' }), append(el('div'), el('h4', task.title), el('p', `${pretty(task.priority)} priority${task.dueDate ? ` · Due ${task.dueDate}` : ''}${task.goal ? ` · ${task.goal}` : ''}`)), label('Status', statusSelect));
        if (/^Website request [a-f0-9-]{36}$/.test(task.goal ?? '')) card.append(el('p', 'Open the full application to view this assigned request’s contact details.'));
        if (team) { const assignee = select('assigneeId', [{ value: '', label: 'Unassigned' }, ...state.members.map(m => ({ value: m.id, label: m.name }))], task.assigneeId ?? ''); assignee.addEventListener('change', () => perform(async () => { await call('team.task.assign', { id: task.id, assigneeId: assignee.value || null }); await navigate(tab); })); card.append(label('Assign to', assignee)); }
        list.append(card);
      });
      if (!state.tasks.length) list.append(el('p', 'No assignments yet. Create one below.'));
      const form = el('form', null, { className: 'shuug-card shuug-form' });
      append(form, el('h3', team ? 'Assign work' : 'Add my task'), label('Task', input('title', '', 'text', true)), label('Due date', input('dueDate', '', 'date')), label('Priority', select('priority', ['low', 'medium', 'high'], 'medium')), label('Goal', input('goal')));
      if (team) form.append(label('Assign to', select('assigneeId', [{ value: '', label: 'Unassigned' }, ...state.members.map(m => ({ value: m.id, label: m.name }))])));
      submit(form, 'Save task', values => perform(async () => { await call(team ? 'team.task.save' : 'task.save', { title: values.get('title'), priority: values.get('priority'), dueDate: values.get('dueDate') || null, goal: values.get('goal') || null, ...(team ? { assigneeId: values.get('assigneeId') || null } : {}) }); await navigate(tab); })); body.append(form);
    }
    function noteEditor(note = null) {
      const form = el('form', null, { className: 'shuug-card shuug-form' }), text = el('textarea', null, { name: 'body', value: note?.body ?? '', rows: 7, required: true, maxLength: 12000 });
      append(form, el('h3', note ? 'Edit my note' : 'New private note'), label('Title', input('title', note?.title ?? '', 'text', true)), label('Profile', select('profile', profileOptions(workspace.branding.organizationTypes), note?.profile ?? 'all')), label('Note', text));
      submit(form, 'Save note', values => perform(async () => { await call('note.save', { note: { author: workspace.user.name, title: values.get('title'), body: values.get('body'), profile: values.get('profile'), scope: note?.scope ?? 'internal', pageKey: note?.pageKey ?? 'internal', pageLabel: note?.pageLabel ?? 'Internal' }, ...(note ? { previous: { id: note.id, revision: note.revision } } : {}) }); await navigate('notes'); }));
      body.prepend(form); form.querySelector('input').focus();
    }
    async function noteView(body = root.querySelector('.shuug-content')) {
      notes = await call('notes'); body.append(button('New note', () => noteEditor(), 'shuug-primary'));
      for (const note of notes) {
        const card = append(el('article', null, { className: 'shuug-card' }), el('h3', note.title || note.pageLabel), el('p', `${note.author} · ${note.visibility === 'team' ? 'Team' : 'Private'}`), el('p', note.body, { className: 'shuug-pre' }));
        if (note.ownerId === workspace.user.id || (!note.ownerId && workspace.user.isOwner)) card.append(button('Edit note', () => noteEditor(note)));
        card.append(button('Discuss with AI', () => { thread = { noteIds: [note.id], profile: note.profile, goal: note.title, jobRole: '', messages: [] }; navigate('planning'); })); body.append(card);
      }
      if (!notes.length) body.append(el('p', 'Capture your first note, then turn it into a work plan.'));
    }
    function planEditor(plan, previous = null, noteIds = [], profile = 'all') {
      const form = el('form', null, { className: 'shuug-card shuug-form' });
      append(form, el('h3', previous ? 'Edit saved roadmap' : 'Review and save roadmap'), label('Title', input('title', plan.title, 'text', true)), label('Outcome', el('textarea', null, { name: 'outcome', value: plan.outcome, required: true })));
      const steps = el('div'); form.append(steps);
      function addStep(step = { title: '', detail: '', milestone: '', due: '', status: 'todo' }) {
        const group = append(el('fieldset'), el('legend', 'Next step'), label('Step', input('title', step.title, 'text', true)), label('Details', el('textarea', null, { name: 'detail', value: step.detail })), label('Milestone', input('milestone', step.milestone)), label('Due', input('due', step.due, 'date')), label('Status', select('status', ['todo', 'in_progress', 'done'], step.status)));
        group.append(button('Remove step', () => { if (steps.children.length > 1) group.remove(); })); steps.append(group);
      }
      plan.steps.forEach(addStep); form.append(button('Add step', () => { if (steps.children.length < 20) addStep(); }));
      submit(form, 'Save roadmap', values => perform(async () => {
        const savedSteps = [...steps.children].map(group => Object.fromEntries([...group.querySelectorAll('input,textarea,select')].map(field => [field.name, field.value])));
        await call('planning.save', { ...(previous ? { id: previous.id, revision: previous.revision } : {}), profile, noteIds, plan: { title: values.get('title'), outcome: values.get('outcome'), steps: savedSteps } }); roadmap = null; await navigate('planning');
      })); body.append(form);
    }
    async function planView(body = root.querySelector('.shuug-content')) {
      [notes, planning] = await Promise.all([call('notes'), call('planning')]);
      const chooser = select('conversation', [{ value: '', label: 'New conversation' }, ...planning.threads.map(t => ({ value: t.id, label: t.goal || 'Planning conversation' }))], thread?.id ?? '');
      chooser.addEventListener('change', () => { thread = planning.threads.find(t => t.id === chooser.value) ?? null; roadmap = null; navigate('planning'); }); body.append(label('Conversation', chooser));
      const form = el('form', null, { className: 'shuug-card shuug-form' });
      append(form, label('What do you need to accomplish?', input('goal', thread?.goal ?? '', 'text', true)), label('Your job / responsibilities', input('jobRole', thread?.jobRole ?? workspace.user.role)), label('Profile', select('profile', profileOptions(workspace.branding.organizationTypes), thread?.profile ?? 'all')));
      const sources = append(el('fieldset'), el('legend', 'Notes the AI may read'));
      notes.forEach(note => { const box = input('noteIds', note.id, 'checkbox'); box.checked = thread?.noteIds?.includes(note.id) ?? false; if (thread?.id) box.disabled = true; sources.append(label(note.title || note.pageLabel, box)); }); form.append(sources);
      if (thread?.id) form.elements.profile.disabled = true;
      (thread?.messages ?? []).forEach(message => body.append(append(el('article', null, { className: 'shuug-card' }), el('strong', message.role === 'user' ? 'You' : 'Assistant'), el('p', message.content, { className: 'shuug-pre' }))));
      form.append(label('Message', el('textarea', null, { name: 'message', rows: 4, required: true, maxLength: 4000 })));
      submit(form, 'Discuss with AI', values => perform(async () => { const result = await call('planning.chat', { ...(thread?.id ? { id: thread.id, revision: thread.revision } : {}), goal: values.get('goal'), jobRole: values.get('jobRole'), profile: thread?.id ? thread.profile : values.get('profile'), noteIds: thread?.id ? thread.noteIds : values.getAll('noteIds'), message: values.get('message') }); thread = result.thread; await navigate('planning'); })); body.append(form);
      if (thread?.draft) planEditor(thread.draft, null, thread.noteIds, thread.profile);
      body.append(button('Create a manual roadmap', () => planEditor({ title: '', outcome: '', steps: [{ title: '', detail: '', milestone: '', due: '', status: 'todo' }] })));
      planning.roadmaps.forEach(item => body.append(append(el('article', null, { className: 'shuug-card shuug-row' }), append(el('div'), el('h3', item.plan.title), el('p', `${item.plan.steps.filter(s => s.status === 'done').length} / ${item.plan.steps.length} steps complete`)), button('Edit roadmap', () => { roadmap = item; navigate('planning'); }))));
      if (roadmap) planEditor(roadmap.plan, roadmap, roadmap.noteIds, roadmap.profile);
    }
    function recordEditor(definition, record, references) {
      const form = el('form', null, { className: 'shuug-card shuug-form' });
      append(form, el('h3', `${record ? 'Edit' : 'New'} ${definition.label}`), label('Title', input('recordTitle', record?.title ?? '', 'text', true)), label('Currency (three-letter code)', input('currency', record?.currency ?? 'USD', 'text', true)));
      for (const field of definition.fields) {
        const value = record?.fields[field.key]; let control;
        if (field.type === 'select') control = select(field.key, [...(!field.required ? [{ value: '', label: 'Not set' }] : []), ...field.options.map(value => ({ value, label: pretty(value) }))], value);
        else if (field.type === 'ref') control = select(field.key, [{ value: '', label: 'Select a linked record' }, ...references.filter(r => field.kinds.includes(r.kind)).map(r => ({ value: r.id, label: r.title }))], value);
        else if (field.type === 'long') control = el('textarea', null, { name: field.key, value: value ?? '', rows: 4, maxLength: 12000 });
        else if (field.type === 'boolean') { control = input(field.key, 'true', 'checkbox'); control.checked = value === true; }
        else if (field.type === 'datetime') { const date = value ? new Date(value) : null; const local = date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''; control = input(field.key, local, 'datetime-local'); }
        else control = input(field.key, field.type === 'money' && typeof value === 'number' ? (value / 100).toFixed(2) : value ?? '', ['number', 'money'].includes(field.type) ? 'number' : ['date', 'email'].includes(field.type) ? field.type : 'text');
        if (['number', 'money'].includes(field.type)) { control.min = '0'; control.step = field.type === 'money' ? '0.01' : '1'; }
        control.required = field.required && field.type !== 'boolean'; form.append(label(field.label, control));
      }
      submit(form, 'Save record', values => perform(async () => {
        const fields = {};
        for (const field of definition.fields) {
          const value = values.get(field.key);
          if (field.type === 'boolean') fields[field.key] = value === 'true';
          else if (value !== '' && value !== null) {
            if (field.type === 'money') { if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(`Enter ${field.label} with at most two decimal places.`); fields[field.key] = Math.round(Number(value) * 100); }
            else if (field.type === 'number') fields[field.key] = Number(value);
            else if (field.type === 'datetime') fields[field.key] = new Date(value).toISOString();
            else fields[field.key] = value;
          }
        }
        await call('record.save', { ...(record ? { id: record.id, revision: record.revision } : { requestId: recordRequest }), kind: definition.kind, title: values.get('recordTitle'), currency: values.get('currency').toUpperCase(), fields }); editRecord = null; recordRequest = identifier(); await navigate('records');
      }));
      form.append(button('Cancel', () => { editRecord = null; navigate('records'); })); body.append(form);
    }
    async function records(body = root.querySelector('.shuug-content')) {
      if (!workspace.modules.length) { body.append(el('p', 'No specialist modules are enabled for your profiles and role. Your owner can enable service or nonprofit tools in Branding & profiles. Use Open full application for the other business sections available to your role.')); return; }
      const picker = select('module', workspace.modules.map(m => ({ value: m.href.split('/').pop(), label: `${m.group} · ${m.label}` })), selectedModule);
      picker.addEventListener('change', () => { selectedModule = picker.value; offset = 0; editRecord = null; navigate('records'); }); body.append(label('Business section', picker));
      const selectedSection = workspace.modules.find(m => m.href.endsWith('/' + selectedModule));
      const response = await call('records', { module: selectedModule, offset });
      // Alias modules include the same record contracts as their main section.
      const definitions = workspace.definitions.filter(d => selectedSection.kinds.includes(d.kind));
      append(body, el('h3', selectedSection.label), el('p', selectedSection.description ?? ''));
      if (workspace.editable.includes(selectedSection.section)) definitions.forEach(d => body.append(button(`New ${d.label}`, () => { editRecord = { kind: d.kind }; recordRequest = identifier(); navigate('records'); })));
      if (editRecord) { const def = definitions.find(d => d.kind === editRecord.kind); if (def) recordEditor(def, editRecord.id ? editRecord : null, response.references); }
      for (const record of response.records) {
        const def = definitions.find(d => d.kind === record.kind); if (!def) continue;
        const card = append(el('article', null, { className: 'shuug-card' }), el('h4', record.title), el('p', `${def.label} · ${pretty(record.status)} · Revision ${record.revision}`));
        const details = el('dl');
        Object.entries(record.fields).forEach(([key, value]) => { const field = def.fields.find(f => f.key === key); let text = value; if (field?.type === 'money') text = `${record.currency} ${(Number(value) / 100).toFixed(2)}`; if (field?.type === 'ref') text = response.references.find(r => r.id === value)?.title ?? 'Linked record'; append(details, el('dt', field?.label ?? pretty(key)), el('dd', text)); }); card.append(details);
        if (record.computed) Object.entries(record.computed).filter(([, value]) => typeof value !== 'object').forEach(([key, value]) => append(details, el('dt', pretty(key)), el('dd', value)));
        if (workspace.editable.includes(def.section)) {
          card.append(button('Edit', () => { editRecord = record; navigate('records'); }));
          (def.transitions[record.status] ?? []).forEach(target => card.append(button(`Mark ${pretty(target)}`, () => perform(async () => { await call('record.transition', { id: record.id, revision: record.revision, target, commandId: identifier() }); await navigate('records'); }))));
        }
        card.append(button('History', () => perform(async () => { const history = await call('record.history', { id: record.id }); const section = append(el('div'), el('h4', 'Record history')); history.forEach(item => section.append(el('p', `${item.at} · ${item.actor} · ${item.action}`))); card.append(section); })));
        body.append(card);
      }
      if (!response.total) body.append(el('p', 'No records here yet. Create one above.'));
      if (offset > 0) body.append(button('Previous records', () => { offset = Math.max(0, offset - 100); navigate('records'); }));
      if (response.nextOffset !== null) body.append(button('More records', () => { offset = response.nextOffset; navigate('records'); }));
    }
    async function employees(body = root.querySelector('.shuug-content')) {
      const data = await call('employees');
      append(body, el('h3', 'Employee accounts'), el('p', 'Create an account, share its private setup link, then give the employee a WordPress user account. Their business permissions stay with this backend account.'));
      const form = el('form', null, { className: 'shuug-card shuug-form' });
      const member = select('memberId', [{ value: '', label: 'Create a new team member' }, ...data.members.filter(m => !data.accounts.some(a => a.memberId === m.id)).map(m => ({ value: m.id, label: m.name }))]);
      const name = input('name', '', 'text', true), email = input('email', '', 'email', true);
      member.addEventListener('change', () => { const selected = data.members.find(m => m.id === member.value); name.value = selected?.name ?? ''; email.value = selected?.email ?? ''; });
      append(form, label('Team member', member), label('Full name', name), label('Sign-in email', email), label('Role', select('role', data.roles, 'Employee')));
      async function action(values) {
        const response = await call('employee.save', values); await navigate('employees');
        if (response.inviteUrl) { const link = input('invite', response.inviteUrl); link.readOnly = true; link.addEventListener('focus', () => link.select()); body.prepend(append(el('div', null, { className: 'shuug-card' }), label('Private setup link · expires in 48 hours', link), el('p', 'Copy and share this link directly. No email has been sent.'))); }
      }
      submit(form, 'Create employee login', values => perform(() => action({ action: 'create', name: values.get('name'), email: values.get('email'), role: values.get('role'), ...(values.get('memberId') ? { memberId: values.get('memberId') } : {}) }))); body.append(form);
      for (const employee of data.accounts) {
        const role = select('role', data.roles, employee.role); role.addEventListener('change', () => perform(() => action({ action: 'role', id: employee.id, role: role.value })));
        const card = append(el('article', null, { className: 'shuug-card shuug-row' }), append(el('div'), el('h4', employee.name), el('p', `${employee.email} · ${employee.status}`)), label('Access role', role));
        if (employee.status !== 'disabled') card.append(button('New password setup link', () => { if (employee.status !== 'active' || window.confirm('Reset this password and sign the employee out of all sessions?')) perform(() => action({ action: 'invite', id: employee.id })); }));
        card.append(button(employee.status === 'disabled' ? 'Enable login' : 'Disable login', () => { if (employee.status === 'disabled' || window.confirm('Disable this account and end its active sessions?')) perform(() => action({ action: employee.status === 'disabled' ? 'enable' : 'disable', id: employee.id })); })); body.append(card);
      }
    }
    function branding() {
      const brand = workspace.branding, form = el('form', null, { className: 'shuug-card shuug-form' });
      append(form, el('h3', 'Branding & organization profiles'), label('Business name', input('businessName', brand.businessName, 'text', true)), label('Tagline', input('tagline', brand.tagline)), label('Logo text', input('logoText', brand.logoText, 'text', true)), label('Primary color', input('primaryColor', brand.primaryColor, 'color')), label('Accent color', input('accentColor', brand.accentColor, 'color')));
      for (const profile of ['product', 'service', 'nonprofit']) { const control = input('organizationTypes', profile, 'checkbox'); control.checked = brand.organizationTypes.includes(profile); form.append(label(profile === 'product' ? 'Sales / products' : pretty(profile), control)); }
      const allModules = workspace.configurableItems.filter(n => n.group !== 'Workspace');
      const groupNames = [...new Set(allModules.map(item => item.group))];
      const groups = append(el('fieldset'), el('legend', 'Show or hide groups'));
      groupNames.forEach(group => { const control = input('visibleGroups', group, 'checkbox'); control.checked = !brand.hiddenSections.includes(group); groups.append(label(group, control)); }); form.append(groups);
      const serviceTypes = append(el('fieldset'), el('legend', 'Service templates (none selected shows all)'));
      ['field', 'professional', 'appointment', 'managed'].forEach(value => { const control = input('serviceTypes', value, 'checkbox'); control.checked = brand.serviceTypes.includes(value); serviceTypes.append(label(pretty(value), control)); }); form.append(serviceTypes);
      const features = append(el('fieldset'), el('legend', 'Visible tools'));
      allModules.forEach(item => { const control = input('feature:' + item.id, 'true', 'checkbox'); control.checked = brand.featureVisibility?.[item.id] !== false; features.append(label(item.label, control)); }); form.append(features);
      form.append(el('p', 'Changes apply to this WordPress workspace and the full application. Additional template import/export controls are in the full application.'));
      submit(form, 'Save branding & profiles', values => perform(async () => {
        const featureVisibility = { ...brand.featureVisibility }; allModules.forEach(item => { featureVisibility[item.id] = values.get('feature:' + item.id) === 'true'; });
        await call('branding.save', { businessName: values.get('businessName'), tagline: values.get('tagline'), logoText: values.get('logoText'), primaryColor: values.get('primaryColor'), accentColor: values.get('accentColor'), organizationTypes: values.getAll('organizationTypes'), serviceTypes: values.getAll('serviceTypes'), hiddenSections: groupNames.filter(group => !values.getAll('visibleGroups').includes(group)), featureVisibility }); await load();
      })); body.append(form);
    }
    function account() {
      append(body, el('h3', 'My account'), el('p', `${workspace.user.name} · ${workspace.user.email} · ${workspace.user.role}`));
      const form = el('form', null, { className: 'shuug-card shuug-form' });
      const current = input('currentPassword', '', 'password', true), next = input('password', '', 'password', true), confirmation = input('confirmation', '', 'password', true);
      current.autocomplete = 'current-password'; next.autocomplete = confirmation.autocomplete = 'new-password'; next.minLength = confirmation.minLength = 14; next.maxLength = confirmation.maxLength = current.maxLength = 200;
      append(form, label('Current business password', current), label('New password', next), label('Confirm new password', confirmation), el('p', 'Changing the password signs out every business session, including this WordPress connection.'));
      submit(form, 'Change password', values => perform(async () => { if (values.get('password') !== values.get('confirmation')) throw new Error('New passwords do not match.'); await call('password', { currentPassword: values.get('currentPassword'), password: values.get('password') }); workspace = null; login(); })); body.append(form);
    }
    frame();
    if (!config.configured) login();
    else call('workspace').then(async data => { workspace = data; selectedModule = data.modules[0]?.href.split('/').pop() ?? ''; await navigate(tab); }).catch(error => login(error.status === 401 ? '' : error.message));
  }
  document.querySelectorAll('[data-shuug-config]').forEach(mount);
})();
