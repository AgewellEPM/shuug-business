(() => {
  'use strict';

  const settings = {
    nursing: [
      ['thirst|thirsty|water|drink|juice', ['Yes, I’d like some water, please.', 'Could you show me the drink choices?', 'No drink for me right now.'], ['I’d like some water, please.', 'I’m thirsty.', 'Could you help me get a drink?']],
      ['eat|meal|dinner|lunch|snack|hungry|breakfast', ['Yes, I’m ready to eat.', 'Could you tell me the choices?', 'I’d rather eat later.'], ['I’m hungry.', 'I’d like to see the meal choices.', 'I’d like help with my meal.']],
      ['family|visit|visitor|daughter|son|call', ['Yes, please help me call my family.', 'I’d like to talk privately.', 'I’m ready for my visitor.'], ['I’d like to call my family.', 'I’m waiting for a visitor.', 'Could you tell me when visiting hours start?']],
      ['bathroom|restroom|toilet|washroom', ['Yes, please help me get to the bathroom.', 'Could you point me to the bathroom?', 'No, thank you.'], ['I need the bathroom.', 'Could someone come with me?', 'Could you give me some privacy?']],
      ['noise|hear|quiet|repeat|loud', ['Could we go somewhere quieter?', 'Could you say that again, more slowly?', 'I’d like to use my communication board.'], ['I’d like a quieter place.', 'I didn’t hear that.', 'Could you speak a little more slowly?']],
    ],
    senior: [
      ['ride|bus|transport|transportation|shuttle|pick up', ['Yes, please show me the schedule.', 'Where do I wait for the ride?', 'I already have a ride, thank you.'], ['I’d like to arrange a ride.', 'Where is the shuttle pickup?', 'Could you tell me when the bus leaves?']],
      ['class|program|activity|activities|event|calendar|join', ['Yes, please show me what’s available.', 'What time does it start?', 'I’d like to watch first.'], ['I’d like to join an activity.', 'Can I see the program calendar?', 'Could you show me where the class is?']],
      ['desk|office|sign in|check in|register|form|membership', ['Yes, please help me check in.', 'Can we do one step at a time?', 'I can fill this out myself.'], ['I’d like to check in.', 'Could you help me with this form?', 'I’d like to ask about membership.']],
      ['meal|lunch|eat|water|drink', ['Yes, please show me the options.', 'Where do I go for lunch?', 'Not right now, thank you.'], ['I’d like to ask about lunch.', 'Could you show me where to get water?', 'I’d like to see the meal schedule.']],
    ],
    bedside: [
      ['hurt|hurts|pain|sore|discomfort', ['Yes, I’m in pain.', 'Could you show me the body chart?', 'I’d like to speak to a nurse.'], ['Something hurts.', 'I’d like to show you where it hurts.', 'Could a nurse come and talk with me?']],
      ['position|move|turn|sit|bed|pillow|comfortable', ['I’d like to sit up.', 'Could you help me change position?', 'I’m comfortable as I am.'], ['I’d like to change position.', 'Could someone help me move?', 'I’d like a different pillow.']],
      ['water|drink|thirsty|mouth', ['My mouth feels dry.', 'Can you tell me what I can drink?', 'No, thank you.'], ['My mouth feels dry.', 'I’d like to ask if I can have water.', 'Could I speak to a nurse about this?']],
      ['family|visit|visitor|call|phone', ['Yes, please help me call my family.', 'Could you tell them I’d like to talk?', 'I’d like to talk later.'], ['I’d like to call someone.', 'Could you tell me when my visitor can come?', 'I’d like some privacy.']],
    ],
  };
  const shared = [
    ['help|assist|staff|nurse', ['Yes, please help me.', 'I need a moment first.', 'No, thank you.'], ['I need help, please.', 'Could someone come over?', 'I’d like to use my board.']],
    ['tired|rest|break|sleep', ['Yes, I’d like to rest.', 'Could I stay here a little longer?', 'I’d like a quieter place.'], ['I’m tired.', 'I’d like to take a break.', 'Could we continue later?']],
  ];
  const urgent = ['Please get a staff member right away.', 'I need help now.', 'Please stay with me.'];
  const fallback = {
    answer: ['Could you repeat that, please?', 'Please give me time to answer.', 'I’d like to use my board.'],
    express: ['I want to say something.', 'Please give me a moment.', 'Can you help me find the right words?'],
  };
  const examples = {
    nursing: { answer: ['Would you like some water?', 'Would you like to call your family?'], express: ['I want some water', 'I need a quieter place'] },
    senior: { answer: ['Would you like to join an activity?', 'Do you need help arranging a ride?'], express: ['I need a ride home', 'I want to see the program calendar'] },
    bedside: { answer: ['Are you in pain?', 'Would you like to sit up?'], express: ['Something hurts', 'I want to talk to a nurse'] },
  };

  function replyChoices(value, setting, mode) {
    const words = String(value).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(emergency|urgent|cannot breathe|cant breathe|hard to breathe|cant catch my breath|chest pain|severe bleeding)\b/.test(words)) {
      return mode === 'express' ? urgent : [urgent[0], 'No, I’m not having that problem.', 'I need more time to answer.'];
    }
    const match = [...(settings[setting] || []), ...shared].find(([pattern]) => new RegExp('\\b(?:' + pattern + ')\\b').test(words));
    return match ? match[mode === 'express' ? 2 : 1] : fallback[mode] || fallback.answer;
  }

  function mount() {
    const root = document.querySelector('[data-training-voice]');
    if (!root) return;
    const find = name => root.querySelector('[data-training-voice-' + name + ']');
    const panel = root.closest('[data-tab-panel]');
    const form = find('form');
    const { words, setting, mode } = form.elements;
    const listen = find('listen');
    const output = find('result');
    const choices = find('choices');
    const selection = find('selection');
    const speak = find('speak');
    const status = find('status');
    let recognition, active = false, selected = '', speaking;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const report = message => { status.textContent = message; };
    const makeButton = label => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'training-button';
      button.textContent = label;
      return button;
    };
    function cancelVoice() {
      if (speaking) window.speechSynthesis?.cancel();
      speaking = undefined;
    }

    function stopListening() {
      const run = recognition;
      recognition = undefined;
      active = false;
      listen.textContent = 'Use microphone';
      listen.setAttribute('aria-pressed', 'false');
      if (run) {
        try { run.abort(); } catch { /* The browser has stopped listening. */ }
      }
    }

    function clearReply() {
      selected = '';
      find('message').textContent = '';
      choices.replaceChildren();
      selection.hidden = true;
      output.hidden = true;
    }

    function showReplies({ moveFocus = true } = {}) {
      report('');
      clearReply();
      if (!words.value.trim()) {
        report('Say or type a phrase to see reply choices.');
        return;
      }
      const replies = replyChoices(words.value, setting.value, mode.value).map(text => ({ text, label: text }));
      if (mode.value === 'express' && !replies.some(reply => reply.text === words.value.trim())) {
        replies.push({ text: words.value.trim(), label: 'Use my own words' });
      }
      for (const { text, label } of replies) {
        const button = makeButton(label);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          selected = text;
          find('message').textContent = text;
          selection.hidden = false;
          for (const option of choices.children) option.setAttribute('aria-pressed', String(option === button));
        });
        choices.append(button);
      }
      output.hidden = false;
      if (moveFocus) root.querySelector('#training-voice-result-heading').focus();
    }

    function renderExamples() {
      find('examples').replaceChildren(...examples[setting.value][mode.value].map(text => {
        const button = makeButton(text);
        button.addEventListener('click', () => {
          stopListening();
          cancelVoice();
          words.value = text;
          showReplies();
        });
        return button;
      }));
    }

    function startListening() {
      if (active) {
        stopListening();
        report('Microphone stopped.');
        return;
      }
      if (!Recognition) {
        report('Microphone recognition is unavailable in this browser. You can type a phrase or try an example.');
        words.focus();
        return;
      }
      cancelVoice();
      clearReply();
      let run;
      try {
        run = new Recognition();
        recognition = run;
        active = true;
        run.lang = 'en-US';
        run.continuous = false;
        run.interimResults = false;
        run.maxAlternatives = 1;
        listen.textContent = 'Stop listening';
        listen.setAttribute('aria-pressed', 'true');
        report('Starting microphone…');
        run.onstart = () => { if (recognition === run) report('Listening. Say a short practice phrase.'); };
        run.onresult = event => {
          if (recognition !== run) return;
          const transcript = Array.from(event.results).filter(item => item.isFinal !== false).map(item => item[0]?.transcript || '').join(' ').trim();
          if (!transcript) return;
          words.value = transcript.slice(0, words.maxLength);
          stopListening();
          showReplies();
          report('Speech recognized. You can edit the wording or choose a reply.');
        };
        run.onerror = () => {
          if (recognition !== run) return;
          stopListening();
          report('The browser could not use the microphone. Check its permissions, type a phrase, or try an example.');
        };
        run.onend = () => {
          if (recognition !== run) return;
          stopListening();
          report('No speech was recognized. Try again or type your phrase.');
        };
        run.start();
      } catch {
        stopListening();
        report('Microphone recognition is unavailable. Type your phrase or try an example.');
      }
    }

    function say() {
      if (!selected) return;
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        report('Read the selected reply on screen. No spoken voice is available in this browser.');
        return;
      }
      stopListening();
      cancelVoice();
      const message = new window.SpeechSynthesisUtterance(selected);
      message.lang = 'en-US';
      message.rate = .9;
      const voice = window.speechSynthesis.getVoices().find(item => item.localService && /^en\b/i.test(item.lang));
      if (voice) message.voice = voice;
      speaking = message;
      message.onend = () => {
        if (speaking !== message) return;
        speaking = undefined;
        report('Reply spoken.');
      };
      message.onerror = () => {
        if (speaking !== message) return;
        speaking = undefined;
        report('The selected reply is on screen. The voice could not play.');
      };
      try { window.speechSynthesis.speak(message); }
      catch { message.onerror(); }
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      stopListening();
      cancelVoice();
      showReplies();
    });
    listen.addEventListener('click', startListening);
    find('clear').addEventListener('click', () => {
      stopListening();
      cancelVoice();
      words.value = '';
      clearReply();
      report('');
      words.focus();
    });
    for (const field of [setting, mode, words]) field.addEventListener(field === words ? 'input' : 'change', () => {
      stopListening();
      cancelVoice();
      clearReply();
      if (field !== words) renderExamples();
      report('');
    });
    speak.addEventListener('click', say);
    new MutationObserver(() => {
      if (panel.hidden) {
        stopListening();
        cancelVoice();
        report('');
      }
    }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('pagehide', () => { stopListening(); cancelVoice(); });
    renderExamples();
  }

  mount();
})();
