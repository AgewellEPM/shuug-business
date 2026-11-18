import { mountClientOnlyOwner } from './client-only-owner.mjs';
import { enterBusinessWorkspace, resumeWorkspaceProvider, signInWorkspacePassword, startWorkspaceProvider, workspaceSecret } from './workspace-entry.mjs';
import { mountWorkspaceEmailSettings } from './workspace-email-settings.mjs';

export async function mountWorkspaceSignIn(document, { client, config, run, onMessage, onClientFactor }) {
  const byId = id => document.getElementById(id), body = document.body;
  const section = byId('workspace-signin'), buttons = [...section.querySelectorAll('[data-provider]')];
  const form = byId('workspace-access-code');
  const passwordForm = byId('workspace-password');
  const url = new URL(document.location.href);
  const invite = new URLSearchParams(url.hash.slice(1)).get('invite');
  let invitation = workspaceSecret(invite) ? invite : undefined;
  const resume = url.searchParams.get('signin') === 'resume';
  if (invite !== null || resume) history.replaceState(null, '', url.pathname);
  function showInvitation() {
    byId('workspace-invitation').hidden = !invitation;
    byId('workspace-invitation').textContent = 'Set a password of at least 14 characters or use Google or Apple to accept your invitation.';
    passwordForm.elements.password.minLength = invitation ? 14 : 1;
    passwordForm.elements.password.autocomplete = invitation ? 'new-password' : 'current-password';
    passwordForm.querySelector('button').textContent = invitation ? 'Create sign-in' : 'Sign in';
  }
  showInvitation();
  function showOwner(visible) {
    byId('owner-console').hidden = !visible;
    body.dataset.workspace = visible ? 'owner' : 'sign-in';
  }
  const owner = await mountClientOnlyOwner(document, { config, onReturn: () => showOwner(false) });
  const credentials = ['workspace-client-code', 'workspace-first-time', 'workspace-owner'].map(byId).concat([...form.elements], [...passwordForm.elements]);
  const emailSettings = mountWorkspaceEmailSettings(document.querySelector('#client-workspace [data-sign-in-email]'), {
    run, save: (email, password) => client.configureSignInEmail(email, password), message: onMessage,
  });
  byId('workspace-cancel-factor').hidden = false;
  const state = { google: false, apple: false };
  let working = false;
  function refresh(busy = working) {
    working = busy;
    if (body.dataset.workspace !== 'owner') body.dataset.workspace = client.identity ? 'client' : 'sign-in';
    for (const button of buttons) button.disabled = working || !!client.pendingMfa || !state[button.dataset.provider];
    for (const control of credentials) control.disabled = working || !!client.pendingMfa;
    emailSettings.refresh(!!client.identity, working);
    byId('workspace-cancel-factor').disabled = working;
  }
  byId('workspace-client-code').onclick = () => { body.dataset.workspaceOption = 'client-code'; byId('email').focus(); };
  byId('workspace-first-time').onclick = () => { body.dataset.workspaceOption = 'setup'; byId('enrollment-container').scrollIntoView(); };
  byId('workspace-owner').onclick = () => { showOwner(true); byId('owner-password').focus(); };
  for (const button of buttons) button.onclick = () => run(async () => {
    passwordForm.elements.password.value = '';
    await startWorkspaceProvider(config.apiOrigin, button.dataset.provider, invitation);
  });
  async function finish(result) {
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
  }
  passwordForm.onsubmit = event => {
    event.preventDefault();
    void run(async () => {
      const { email, password } = passwordForm.elements, value = password.value;
      password.value = '';
      const result = await signInWorkspacePassword(config.apiOrigin, email.value.trim(), value, invitation);
      if (invitation) { invitation = undefined; showInvitation(); }
      await finish(result);
    });
  };
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
    refresh(false);
    void client.socialProviders().then(providers => { Object.assign(state, providers); refresh(); }).catch(() => {});
    if (resume) await run(async () => {
      try { await finish(await resumeWorkspaceProvider(config.apiOrigin)); }
      catch (error) {
        if (error.code !== 'provider_not_connected') throw error;
        byId('workspace-options').open = true;
        onMessage('To connect Google or Apple, first sign in with your existing password or account code. Staff and tax locations can connect from their invitation link.');
      }
    });
  }
  return { refresh, initialize };
}
