(() => {
  'use strict';
  function forms() {
    const catalog = JSON.parse(document.querySelector('#coach-form-catalog')?.textContent || '{}');
    let last;
    const visible = form => form && !form.closest('[hidden], dialog:not([open]), details:not([open])');
    function read(key) {
      const item = catalog[key], form = item && document.querySelector(item.selector);
      if (!visible(form)) return;
      const fields = {};
      for (const name of item.fields) {
        const input = form.elements.namedItem(name);
        if (!input || input.matches(':disabled') || input.closest('[hidden]') || ['hidden','file','password','checkbox'].includes(input.type)) continue;
        fields[name] = { value: String(input.value).slice(0, 1000), options: input.options ? [...input.options].slice(0, 100).map(o => [o.value, o.text]) : undefined };
      }
      return { key, fields };
    }
    document.addEventListener('focusin', event => {
      const form = event.target.closest('form');
      const key = form && Object.keys(catalog).find(key => form.matches(catalog[key].selector));
      if (key) last = key;
    });
    function current() {
      if (last && read(last)) return read(last);
      const visibleForms = Object.keys(catalog).map(read).filter(Boolean);
      return visibleForms.length === 1 ? visibleForms[0] : undefined;
    }
    async function fill(draft, original, navigate, activeView) {
      const item = catalog[draft.formKey];
      if (!item) throw new Error('This form is unavailable.');
      if (activeView !== item.view && !visible(document.querySelector(item.selector))) await navigate('#view=' + item.view);
      let form = document.querySelector(item.selector);
      if (!visible(form)) {
        if (form && !form.closest('[hidden],dialog:not([open])')) { const details = form.closest('details'); if (details) details.open = true; }
        if (!visible(form) && item.opener) document.querySelector(item.opener)?.click();
        form = document.querySelector(item.selector);
      }
      if (!visible(form)) throw new Error('Open ' + item.title + ' in the workspace, then say “fill it in.”');
      let filled = 0;
      for (const name of item.fields) {
        const proposed = draft.fields[name];
        const input = form.elements.namedItem(name);
        if (!input || input.matches(':disabled') || input.readOnly || input.closest('[hidden]') || !proposed) continue;
        const expected = original?.key === draft.formKey && original.fields[name];
        if (expected && input.value !== expected.value && input.value !== proposed) continue;
        let value = String(proposed);
        if (input.options) {
          const option = [...input.options].find(o => [o.value, o.text].some(s => s.toLowerCase() === value.toLowerCase()));
          if (!option) continue;
          value = option.value;
        }
        input.value = value;
        if (!input.value) continue;
        input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); filled++;
      }
      if (!filled) throw new Error('The open form changed or needs more details. Check the fields and ask Tinky again.');
      form.scrollIntoView?.({ block: 'center' }); form.querySelector('input,select,textarea')?.focus({ preventScroll: true });
    }
    return { current, fill };
  }

  function voice(button, submit, announce) {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!button || !Speech) return { stop() {}, answer() {} };
    let active = false, run, speaking, generation = 0;
    button.hidden = false;
    function stop() {
      generation++; active = false;
      if (run) { const old = run; run = null; old.onend = null; old.abort(); }
      if (speaking) { speaking = null; window.speechSynthesis?.cancel(); }
      button.setAttribute('aria-pressed','false'); button.setAttribute('aria-label','Speak to Tinky');
    }
    function listen() {
      if (!active) return;
      const epoch = generation, recognition = new Speech(); run = recognition;
      recognition.lang = navigator.language || 'en-US'; recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = event => {
        if (epoch !== generation) return;
        const phrase = Array.from(event.results).filter(result => result.isFinal !== false).map(result => result[0]?.transcript).filter(Boolean).join(' ').trim();
        if (!phrase) return;
        run = null; recognition.onend = null; recognition.stop(); submit(phrase);
      };
      recognition.onerror = event => { if (epoch === generation) { stop(); announce(event.error === 'not-allowed' ? 'Allow microphone access in your browser to speak with Tinky.' : 'Voice input stopped. Try the microphone again or type your message.'); } };
      recognition.onend = () => { if (epoch === generation && run === recognition) { run = null; stop(); announce('Microphone stopped. Tap it to speak again.'); } };
      try { recognition.start(); announce('Listening…'); } catch { stop(); announce('Your browser could not start voice input.'); }
    }
    button.onclick = () => {
      if (active) { stop(); announce('Microphone off.'); return; }
      active = true; generation++; button.setAttribute('aria-pressed','true'); button.setAttribute('aria-label','Stop talking with Tinky'); listen();
    };
    function answer(turn) {
      if (!active) return;
      const items = turn.mail?.entries || [];
      if (items.length > 1) { stop(); announce('Review the individual emails below. Tap the microphone again to confirm.'); return; }
      const item = items[0];
      const text = item ? ['Email to', item.to, 'from', item.from, '. Subject.', item.subject, '. Message.', item.body, '. Say send it to send.'].join(' ') : turn.answer.slice(0, 1200);
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { listen(); return; }
      const epoch = generation, utterance = new SpeechSynthesisUtterance(text); speaking = utterance;
      utterance.onend = () => { if (epoch === generation) { speaking = null; listen(); } };
      utterance.onerror = () => { if (epoch === generation) stop(); };
      window.speechSynthesis.speak(utterance);
    }
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    return { stop, answer };
  }
  window.SdrCoachControls = { forms, voice };
})();
