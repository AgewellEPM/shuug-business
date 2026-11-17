import { signInRequestId } from './social-proof.mjs';
import { workspaceSecret } from './workspace-entry.mjs';

export function mountWorkspaceAssignments(root, { call, run, onMessage }) {
  const find = selector => root.querySelector(selector);
  const menu = find('[name=assignment]'), form = find('form'), link = find('[name=invitation]');
  const invite = find('[data-invite]'), copy = find('[data-copy]'), methods = find('[data-methods]');
  let assignments = [], available = false, busy = false;
  const selected = () => assignments.find(item => item.id === menu.value);
  function refresh() {
    root.hidden = !available;
    for (const element of root.querySelectorAll('button,input,select')) element.disabled = !available || busy;
    invite.disabled = !available || busy || !selected()?.enabled;
    copy.disabled = !available || busy || !link.value;
  }
  function fill() {
    const item = selected();
    form.elements.label.value = item?.label ?? '';
    form.elements.role.value = item?.role ?? 'staff';
    form.elements.targetId.value = item?.targetId ?? '';
    form.elements.enabled.checked = item?.enabled ?? true;
    link.value = '';
    const connected = (item?.providers ?? []).map(provider => provider === 'google' ? 'Google' : 'Apple');
    if (item?.passwordConfigured) connected.push('Email and password');
    methods.textContent = connected.length ? `Connected sign-in: ${connected.join(', ')}` : '';
    refresh();
  }
  function render(value, choose = '') {
    if (!Array.isArray(value.assignments) || value.assignments.some(item => !signInRequestId(item.id))) throw new Error('The assignment response was invalid.');
    assignments = value.assignments;
    const option = (value, text) => {
      const element = root.ownerDocument.createElement('option');
      element.value = value; element.textContent = text; return element;
    };
    menu.replaceChildren(option('', 'New assignment'), ...assignments.map(item => option(item.id, `${item.label} · ${item.role === 'staff' ? 'Staff' : 'Tax location'}${item.enabled ? '' : ' · Suspended'}`)));
    menu.value = assignments.some(item => item.id === choose) ? choose : '';
    fill();
  }
  menu.onchange = fill;
  find('[data-load]').onclick = () => run(async () => render(await call('/staff/workspace-access'), menu.value));
  form.onsubmit = event => {
    event.preventDefault();
    void run(async () => {
      const item = selected(), { label, role, targetId, enabled } = form.elements;
      const input = { action: 'save', ...(item ? { id: item.id, revision: item.revision } : {}), label: label.value.trim(), role: role.value, targetId: targetId.value.trim(), enabled: enabled.checked };
      const value = await call('/staff/workspace-access', 'POST', input);
      render(value, value.assignmentId);
      onMessage('Workspace assignment saved.');
    });
  };
  invite.onclick = () => run(async () => {
    const item = selected();
    if (!item?.enabled) return;
    const value = await call('/staff/workspace-access', 'POST', { action: 'invite', id: item.id, revision: item.revision });
    if (!workspaceSecret(value.invitation)) throw new Error('The account service did not issue a valid invitation.');
    render(value, item.id);
    link.value = `${root.ownerDocument.location.origin}/#invite=${value.invitation}`;
    refresh();
    onMessage('Share this one-use link privately with the assigned person to set up or update their sign-in. It expires in 48 hours.');
  });
  copy.onclick = () => run(async () => { await navigator.clipboard.writeText(link.value); onMessage('Private sign-in link copied.'); });
  return {
    refresh(enabled, working) { available = enabled; busy = working; refresh(); },
    clear() { render({ assignments: [] }); },
  };
}
