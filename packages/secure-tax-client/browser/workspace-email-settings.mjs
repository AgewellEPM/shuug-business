export function mountWorkspaceEmailSettings(panel, { run, save, message }) {
  const form = panel.querySelector('form');
  const { email, password } = form.elements;
  function clear() {
    form.reset();
    panel.open = false;
  }
  form.onsubmit = event => {
    event.preventDefault();
    void run(async () => {
      const currentPassword = password.value;
      password.value = '';
      const result = await save(email.value.trim(), currentPassword);
      if (result?.emailConfigured !== true) throw new Error('The sign-in email could not be saved.');
      clear();
      message('Sign-in email saved. Use it with your existing password next time.');
    });
  };
  return {
    clear,
    refresh(active, working) {
      panel.hidden = !active;
      for (const control of form.elements) control.disabled = !active || working;
      if (!active) clear();
    },
  };
}
