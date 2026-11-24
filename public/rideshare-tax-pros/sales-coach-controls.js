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

  function wave(blocks, length, rate) {
    const samples = new Float32Array(length);
    let offset = 0;
    for (const block of blocks) { samples.set(block, offset); offset += block.length; }
    const count = Math.floor(length * 16000 / rate), bytes = new ArrayBuffer(44 + count * 2), view = new DataView(bytes);
    function mark(start, text) { for (let i = 0; i < text.length; i++) view.setUint8(start + i, text.charCodeAt(i)); }
    mark(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); mark(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    mark(36, 'data'); view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * rate / 16000), end = Math.max(start + 1, Math.floor((i + 1) * rate / 16000));
      let total = 0;
      for (let j = start; j < end; j++) total += samples[j];
      view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, total / (end - start))) * 32767), true);
    }
    return bytes;
  }

  function microphoneHelp(error) {
    if (['NotAllowedError','SecurityError','not-allowed','service-not-allowed'].includes(error)) {
      return 'Allow microphone access for this site. In Safari, open Safari Settings → Websites → Microphone, then try Speak again.';
    }
    if (['NotFoundError','DevicesNotFoundError','audio-capture'].includes(error)) {
      return 'No microphone is available. Connect or power on your microphone and select it under Sound → Input, or type your command here.';
    }
    if (['NotReadableError','AbortError'].includes(error)) return 'The microphone is busy or disconnected. Check Sound → Input and try Speak again.';
    if (error === 'no-speech') return 'Tinky didn’t hear any words. Check the input level in Sound settings, then try Speak again.';
    return 'Voice input is unavailable. You can type a command or use your keyboard’s dictation in the message box.';
  }

  async function recordPhrase(signal, announce) {
    const Context = window.AudioContext || window.webkitAudioContext;
    const audio = new Context();
    let stream, source, processor, timer, settle, fail;
    const done = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
    // The permission prompt may outlive the popup. Release late-arriving tracks too.
    function release() {
      clearTimeout(timer);
      if (processor) { processor.port.onmessage = null; processor.port.close(); processor.disconnect(); processor = null; }
      source?.disconnect(); source = null;
      stream?.getTracks().forEach(track => track.stop()); stream = null;
      if (audio.state !== 'closed') void audio.close().catch(() => {});
    }
    const abort = () => { release(); settle(); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      announce('Allow microphone access to speak with Tinky.');
      const resumed = audio.resume();
      resumed.catch(() => {});
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false });
      if (signal.aborted) return;
      await resumed;
      await audio.audioWorklet.addModule('/sales-coach-audio-worklet.js');
      if (signal.aborted) return;
      source = audio.createMediaStreamSource(stream);
      processor = new AudioWorkletNode(audio, 'tinky-microphone');
      let length = 0, voiced = 0, lastWord = 0;
      const blocks = [], rate = audio.sampleRate;
      const end = () => voiced < rate * 0.1 ? fail(new Error(microphoneHelp('no-speech'))) : settle(wave(blocks, length, rate));
      processor.port.onmessage = ({ data }) => {
        if (signal.aborted) return;
        const energy = data.reduce((sum, sample) => sum + sample * sample, 0) / data.length;
        blocks.push(data); length += data.length;
        if (energy > 0.000048) { voiced += data.length; lastWord = length; }
        if ((voiced >= rate * 0.1 && length - lastWord > rate * 1.25) || length >= rate * 30) end();
        else if (!voiced && length >= rate * 10) end();
      };
      stream.getAudioTracks()[0]?.addEventListener('ended', () => fail(new Error(microphoneHelp('NotFoundError'))), { once: true });
      source.connect(processor); processor.connect(audio.destination);
      timer = setTimeout(end, 31000);
      announce('Listening… Pause when you finish. Tap Stop to turn off the microphone.');
      return await done;
    } finally { signal.removeEventListener('abort', abort); release(); }
  }

  function voice(button, submit, announce, localAvailable = () => false) {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!button) return { stop() {}, answer() {} };
    let active = false, run, recording, speaking, generation = 0;
    button.hidden = false;
    function pressed(on) {
      button.setAttribute('aria-pressed', String(on));
      const label = on ? 'Stop talking with Tinky' : 'Speak to Tinky';
      button.setAttribute('aria-label', label); button.title = label;
      const caption = button.querySelector('span');
      if (caption) caption.textContent = on ? 'Stop' : 'Speak';
    }
    function stop() {
      generation++; active = false;
      if (recording) { recording.abort(); recording = null; }
      if (run) { const old = run; run = null; old.onend = null; old.abort(); }
      if (speaking) { speaking = null; window.speechSynthesis?.cancel(); }
      pressed(false);
    }
    async function listenLocally(epoch) {
      const controller = new AbortController(); recording = controller;
      try {
        const wav = await recordPhrase(controller.signal, announce);
        if (!wav || epoch !== generation) return;
        announce('Transcribing your words…');
        const res = await fetch('/api/sales/coach/voice', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'audio/wav' }, body: wav, signal: controller.signal });
        const result = await res.json();
        if (epoch !== generation) return;
        if (!res.ok || !result.text) throw new Error(result.error || 'Tinky could not transcribe this recording. Please try again.');
        recording = null; submit(result.text);
      } catch (error) {
        if (epoch !== generation) return;
        stop(); announce(error.name === 'Error' ? error.message : microphoneHelp(error.name));
      }
    }
    function listen() {
      if (!active) return;
      const epoch = generation;
      if (localAvailable() && navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode && (window.AudioContext || window.webkitAudioContext)) {
        void listenLocally(epoch); return;
      }
      if (!Speech) { stop(); announce(microphoneHelp()); button.form?.elements.question?.focus(); return; }
      const recognition = new Speech(); run = recognition;
      recognition.lang = navigator.language || 'en-US'; recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = event => {
        if (epoch !== generation) return;
        const phrase = Array.from(event.results).filter(result => result.isFinal !== false).map(result => result[0]?.transcript).filter(Boolean).join(' ').trim();
        if (!phrase) return;
        run = null; recognition.onend = null; recognition.stop(); submit(phrase);
      };
      recognition.onerror = event => { if (epoch === generation) { stop(); announce(microphoneHelp(event.error)); } };
      recognition.onend = () => { if (epoch === generation && run === recognition) { run = null; stop(); announce('Microphone stopped. Tap it to speak again.'); } };
      try { recognition.start(); announce('Listening…'); } catch (error) { stop(); announce(microphoneHelp(error.name)); }
    }
    button.onclick = () => {
      if (active) { stop(); announce('Microphone off.'); return; }
      active = true; generation++; pressed(true); listen();
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
