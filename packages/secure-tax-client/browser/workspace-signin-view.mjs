import { mountClientOnlyOwner } from './client-only-owner.mjs';
import { enterBusinessWorkspace, resumeWorkspaceProvider, startWorkspaceProvider, workspaceSecret } from './workspace-entry.mjs';

export async function mountWorkspaceSignIn(document, { client, config, run, onMessage, onClientFactor }) {
  const byId = id => document.getElementById(id), body = document.body;
  const section = byId('workspace-signin'), buttons = [...section.querySelectorAll('[data-provider]')];
  const form = byId('workspace-access-code');
  const url = new URL(document.location.href);
  const invite = new URLSearchParams(url.hash.slice(1)).get('invite');
  const invitation = workspaceSecret(invite) ? invite : undefined;
  const resume = url.searchParams.get('signin') === 'resume';
  if (invite !== null || resume) history.replaceState(null, '', url.pathname);
  byId('workspace-invitation').hidden = !invitation;
  function showOwner(visible) {
    byId('owner-console').hidden = !visible;
    body.dataset.workspace = visible ? 'owner' : 'sign-in';
  }
  const owner = await mountClientOnlyOwner(document, { config, onReturn: () => showOwner(false) });
  const credentials = ['workspace-client-code', 'workspace-first-time', 'workspace-owner'].map(byId).concat([...form.elements]);
  byId('workspace-cancel-factor').hidden = false;
  const state = { google: false, apple: false };
  function refresh(working) {
    if (body.dataset.workspace !== 'owner') body.dataset.workspace = client.identity ? 'client' : 'sign-in';
    for (const button of buttons) button.disabled = working || !!client.pendingMfa || !state[button.dataset.provider];
    for (const control of credentials) control.disabled = working || !!client.pendingMfa;
    byId('workspace-cancel-factor').disabled = working;
  }
  byId('workspace-client-code').onclick = () => { body.dataset.workspaceOption = 'client-code'; byId('email').focus(); };
  byId('workspace-first-time').onclick = () => { body.dataset.workspaceOption = 'setup'; byId('enrollment-container').scrollIntoView(); };
  byId('workspace-owner').onclick = () => { showOwner(true); byId('owner-password').focus(); };
  for (const button of buttons) button.onclick = () => run(async () => {
    await startWorkspaceProvider(config.apiOrigin, button.dataset.provider, invitation);
  });
  form.onsubmit = event => {
    event.preventDefault();
    void run(async () => {
      const { email, code } = form.elements, value = code.value;
      code.value = '';
      const destination = await enterBusinessWorkspace({ action: 'login', email: email.value.trim(), code: value });
      location.assign(destination);
    });
  };
  byId('workspace-cancel-factor').onclick = () => run(async () => { client.lock(); byId('mfa-code').value = ''; onMessage('Choose a sign-in method to start again.'); });
  async function initialize() {
    const providers = await client.socialProviders().catch(() => null);
    if (providers) Object.assign(state, providers);
    if (!state.google && !state.apple && !resume) onMessage('Use More sign-in options while Google and Apple are unavailable.');
    refresh(false);
    if (resume) await run(async () => {
      const result = await resumeWorkspaceProvider(config.apiOrigin);
      if (result.audience === 'secure-customer') {
        onClientFactor(client.stageWorkspaceSignIn(result));
        byId('mfa-code').focus();
      } else if (result.audience === 'owner') {
        owner.stageFederated(result);
        showOwner(true);
        byId('owner-mfa-code').focus();
      } else if (['staff', 'location'].includes(result.audience) && workspaceSecret(result.ticket)) {
        location.assign(await enterBusinessWorkspace({ action: 'workspace-entry', ticket: result.ticket }));
      } else throw new Error('The service did not confirm your assigned workspace.');
    });
  }
  return { refresh, initialize };
}
