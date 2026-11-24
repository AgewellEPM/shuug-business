/* TinkyStroke care demonstration. Entries belong to this mounted presentation. */
(() => {
  "use strict";

  const mounted = new WeakMap();
  // Fixed reply boards from TinkyStroke's OfflineService.
  const replies = {
    pain: [
      ["😊", "NO PAIN", "No pain right now."],
      ["😐", "LITTLE", "A little pain, 2 or 3."],
      ["😟", "MODERATE", "Moderate pain, about 5."],
      ["😣", "BAD", "Bad pain, 7 or 8."],
      ["😫", "SEVERE", "Severe pain! 9 or 10!"],
      ["💊", "NEED MEDS", "Can I have pain medicine?"]
    ],
    yesno: [
      ["✅", "YES", "Yes."],
      ["❌", "NO", "No."],
      ["🤔", "MAYBE", "Maybe."],
      ["🤷", "DON'T KNOW", "I don't know."],
      ["🔄", "REPEAT?", "Can you say that again?"],
      ["⏳", "MOMENT", "Give me a moment."]
    ],
    medication: [
      ["✅", "YES TAKE", "Yes, I'll take my medicine."],
      ["❌", "NO", "No, I don't want that medicine."],
      ["❓", "WHAT IS IT", "What is this medicine for?"],
      ["⚠️", "ALLERGIC", "I'm allergic to that."],
      ["🤢", "MAKES SICK", "That medicine makes me feel sick."],
      ["😣", "STILL PAIN", "I'm still in pain."]
    ],
    food: [
      ["🍽️", "HUNGRY", "Yes, I'm hungry."],
      ["🚫", "NOT HUNGRY", "No, I'm not hungry."],
      ["💧", "WATER ONLY", "Just water please."],
      ["😰", "CAN'T SWALLOW", "I can't swallow well."],
      ["🤢", "NAUSEOUS", "I feel nauseous."],
      ["🥤", "STRAW", "Can I have a straw?"]
    ],
    bathroom: [
      ["🚻", "YES NOW", "Yes, I need to go now."],
      ["❌", "NO", "No, I'm fine."],
      ["🛏️", "BEDPAN", "I need a bedpan."],
      ["⏰", "CAN'T HOLD", "I can't hold it!"],
      ["🦵", "LEGS WEAK", "My legs are weak, need help."],
      ["🤝", "HELP ME", "I need help getting there."]
    ],
    feelings: [
      ["👍", "OKAY", "I'm okay."],
      ["😨", "SCARED", "I'm scared."],
      ["😢", "SAD", "I'm feeling sad."],
      ["😴", "TIRED", "I'm very tired."],
      ["😤", "FRUSTRATED", "I'm frustrated."],
      ["😵‍💫", "CONFUSED", "I'm confused."]
    ],
    greeting: [
      ["👋", "HELLO", "Hello."],
      ["👍", "I'M OKAY", "I'm okay, thank you."],
      ["🙏", "THANK YOU", "Thank you."],
      ["😣", "PAIN", "I'm in pain."],
      ["💧", "WATER", "Can I have water?"],
      ["🚻", "BATHROOM", "I need the bathroom."]
    ]
  };
  // Android TinkyAskNurseTools bedside prompts, choices and spoken phrases.
  const clinical = {
    rounding: [
      ["pain", "🩺 How is your pain right now?", [["😊", "No Pain", "No pain"], ["😐", "Mild", "Mild pain"], ["😟", "Moderate", "Moderate pain"], ["😣", "Severe", "Severe pain"], ["😭", "Worst", "Worst pain"]]],
      ["position", "🛏️ Are you comfortable? Need to be repositioned?", [["👍", "I'm Good", "Comfortable"], ["⬆️", "Sit Up", "Needs to sit up"], ["⬇️", "Lie Down", "Wants to lie flat"], ["↩️", "Turn Me", "Needs to be turned"], ["🛋️", "Prop Up", "Wants to be propped up"]]],
      ["potty", "🚻 Do you need to use the bathroom?", [["❌", "No", "No bathroom need"], ["🚻", "Yes", "Needs bathroom"], ["💧", "Urinal", "Needs urinal"], ["🧹", "Changed", "Needs to be changed"]]],
      ["personal", "🌟 Anything else you need?", [["💧", "Water", "Wants water"], ["🧣", "Blanket", "Wants blanket"], ["📱", "Phone", "Wants phone/call"], ["📺", "TV", "TV on/off/change"], ["😊", "All Good", "No additional needs"], ["❓", "Other", "Has other request"]]],
      ["peripherals", "🔔 Can you reach everything you need?", [["✅", "All Good", "Everything within reach"], ["🔔", "Call Light", "Call light out of reach"], ["📱", "Phone", "Phone out of reach"], ["💧", "Water", "Water out of reach"], ["🛏️", "Table", "Bedside table needs adjusting"], ["💡", "Lights", "Can't reach light switch"]]],
      ["plan", "📋 Do you know what's happening today?", [["👍", "Yes", "Understands the plan"], ["❓", "No", "Doesn't know the plan"], ["👨‍⚕️", "Doctor?", "Wants to know when doctor is coming"], ["🧪", "Tests?", "Wants to know about upcoming tests"], ["🏠", "Home?", "Wants to know when going home"], ["💆", "Therapy?", "Wants to know about therapy schedule"]]]
    ],
    neuro: [
      ["face", "Can you smile for me? Show me your teeth.", "😊 Facial Symmetry — Is the smile even?", [["✅", "Symmetric", "Face symmetric"], ["➡️", "Right Droop", "Right facial droop"], ["⬅️", "Left Droop", "Left facial droop"], ["⚠️", "Worse Than Before", "Facial droop worsening"]]],
      ["arms", "Hold both arms out in front of you. Keep them up for me.", "💪 Arm Drift — Can they hold both arms up?", [["✅", "Both Strong", "No arm drift"], ["➡️", "Right Drifts", "Right arm drift"], ["⬅️", "Left Drifts", "Left arm drift"], ["❌", "Can't Lift", "Cannot lift arm(s)"], ["⚠️", "Worse", "Arm weakness worsening"]]],
      ["legs", "Can you push against my hand with your foot? First this side, now the other.", "🦵 Leg Strength — Can they push equally?", [["✅", "Both Strong", "Equal leg strength"], ["➡️", "Right Weak", "Right leg weakness"], ["⬅️", "Left Weak", "Left leg weakness"], ["❌", "Can't Move", "Cannot move leg(s)"], ["⚠️", "Worse", "Leg weakness worsening"]]],
      ["speech", "Tell me your name. What day is it today?", "🗣️ Speech — How is their speech?", [["✅", "Clear", "Speech clear"], ["💬", "Slurred", "Speech slurred"], ["❓", "Can't Find Words", "Word-finding difficulty"], ["❌", "No Speech", "Unable to speak"], ["⚠️", "Worse", "Speech worsening"]]],
      ["grip", "Squeeze my fingers as hard as you can. Both hands.", "✋ Grip Strength — Compare left vs right", [["✅", "Equal Grip", "Grip strength equal bilaterally"], ["➡️", "Right Weaker", "Right grip weaker"], ["⬅️", "Left Weaker", "Left grip weaker"], ["❌", "Very Weak", "Grip very weak or absent"], ["⚠️", "Worse", "Grip weakness worsening"]]],
      ["pupils", "I'm going to shine a light in your eyes. Look straight ahead.", "👁️ Pupils — Equal, round, reactive?", [["✅", "PERRL", "Pupils equal, round, reactive to light"], ["➡️", "Right Larger", "Right pupil larger"], ["⬅️", "Left Larger", "Left pupil larger"], ["❌", "Not Reactive", "Pupil(s) not reactive"], ["⚠️", "Changed", "Pupil response changed from baseline"]]]
    ],
    nursePhrases: [
      ["👋", "Hi, I'm your nurse", "Hi, I'm your nurse. I'm here to take care of you.", "greetings"],
      ["😊", "You're doing great", "You're doing great. Keep it up.", "greetings"],
      ["💤", "Time to rest", "It's time to rest now. Try to get some sleep.", "greetings"],
      ["👋", "I'll be back", "I'll be back to check on you soon.", "greetings"],
      ["💜", "I know it's hard", "I know this is frustrating. I'm here for you.", "empathy"],
      ["🛡️", "You're safe", "You're safe. I'm right here with you.", "empathy"],
      ["😢", "It's okay to cry", "It's okay to cry. You're going through a lot.", "empathy"],
      ["💪", "You're making progress", "You're making progress, even if it doesn't feel like it.", "empathy"],
      ["🙏", "I'm sorry", "I'm sorry you're going through this. We're doing everything we can.", "empathy"],
      ["⏳", "Take your time", "Take your time. There's no rush. I'm right here.", "empathy"],
      ["🩺", "Blood pressure", "I'm going to take your blood pressure now. You'll feel a squeeze on your arm.", "procedure"],
      ["🌡️", "Temperature", "I need to take your temperature. Open your mouth please.", "procedure"],
      ["🩸", "Blood draw", "I need to draw some blood. You'll feel a small pinch.", "procedure"],
      ["💉", "IV check", "I'm going to check your IV line. This shouldn't hurt.", "procedure"],
      ["⬆️", "Sit up please", "I need you to sit up for me. Let me help you.", "procedure"],
      ["🔄", "Turn over", "I need to turn you over. I'll help you. Ready? One, two, three.", "procedure"],
      ["💊", "Time for meds", "It's time for your medication.", "meds"],
      ["💊", "Pain medicine", "I have your pain medicine. This should help.", "meds"],
      ["🧪", "Need a sample", "I need a urine sample when you're ready.", "meds"],
      ["👨‍⚕️", "Doctor coming", "Your doctor will be here soon to see you.", "info"],
      ["👨‍👩‍👧", "Family is here", "Your family is here to see you.", "info"],
      ["🍽️", "Food coming", "Your food tray is on its way.", "info"],
      ["🚑", "Going for test", "We're going to take you for a test. I'll explain what's happening.", "info"],
      ["🏠", "Going home soon", "Great news! You should be going home soon.", "info"],
      ["❓", "Do you understand?", "Do you understand? Tap yes or no on the screen.", "question"],
      ["🩺", "Are you in pain?", "Are you in pain right now? Point to where it hurts.", "question"],
      ["🚻", "Need bathroom?", "Do you need to use the bathroom? Tap yes or no.", "question"],
      ["💧", "Want water?", "Would you like some water? Tap yes or no.", "question"],
      ["🌡️", "Feeling okay?", "How are you feeling? Use the tiles to tell me.", "question"]
    ],
    interview: [
      ["Are you in pain right now?", 1],
      ["Are you having trouble breathing?", 1],
      ["Do you feel nauseous?", 1],
      ["Do you need the bathroom?", 1],
      ["Are you feeling confused right now?", 1],
      ["Are you feeling anxious or scared?", 1],
      ["Are you feeling dizzy?", 2],
      ["Are you too hot?", 2],
      ["Are you too cold?", 2],
      ["Are you thirsty?", 2],
      ["Are you hungry?", 2],
      ["Are you feeling sad?", 2],
      ["Did you have trouble sleeping?", 2],
      ["Are you having trouble seeing?", 2],
      ["Are you having trouble hearing?", 2],
      ["Do you have trouble moving your arms?", 2],
      ["Do you have numbness in your feet?", 2],
      ["Do you want to see your family?", 2]
    ],
    moods: [
      ["😄", "Great", "Feeling great"],
      ["😊", "Good", "Feeling good"],
      ["😐", "Okay", "Feeling okay"],
      ["😟", "Not Great", "Not feeling great"],
      ["😢", "Sad", "Feeling sad"],
      ["😰", "Anxious", "Feeling anxious"],
      ["😡", "Frustrated", "Feeling frustrated"],
      ["😭", "Terrible", "Feeling terrible"]
    ],
    diet: [
      ["Regular Diet", "regular"],
      ["NPO — Nothing by Mouth", "npo"],
      ["Ice Chips Only", "ice_chips"],
      ["Thickened Liquids", "thickened"],
      ["Mechanical Soft", "mechanical_soft"],
      ["Pureed Only", "pureed"]
    ]
  };
  const questions = [
    ["How are you feeling?", "feelings"], ["Are you in pain?", "pain"],
    ["Are you hungry?", "food"], ["Do you need the bathroom?", "bathroom"],
    ["Do you have a question about your medicine?", "medication"], ["Good morning!", "greeting"],
    ["Do you want some quiet time?", "yesno"]
  ];
  const matchers = [
    ["pain", /pain|hurt/i], ["medication", /medicine|medication|pill/i],
    ["food", /hungry|food|eat|swallow|drink/i], ["bathroom", /bathroom|toilet|pee/i],
    ["feelings", /feel|scared|sad/i], ["greeting", /hello|\bhi\b|morning/i]
  ];
  const suggested = ["I love you", "Thank you", "Help me", "I'm okay", "Call my family", "I need water", "Yes", "No", "I'm in pain", "Good morning", "Goodnight", "I miss you"];
  const views = {
    talk: "Conversation", profile: "Patient profile", nurse: "Nurse tools", handoff: "Shift handoff",
    bank: "Message bank", tiles: "My tiles", report: "SLP report"
  };
  const profileFields = [
    ["name", "Preferred name"], ["location", "Care setting", ["Hospital", "Nursing home", "Rehabilitation", "Home", "Other"]],
    ["condition", "Primary condition", ["Stroke", "Traumatic brain injury", "After surgery", "Neurological condition", "Other"]],
    ["room", "Room"], ["personality", "Communication style"], ["role", "Work or role"],
    ["interests", "Interests"], ["likes", "Likes"], ["dislikes", "Dislikes"], ["phrases", "Familiar phrases"],
    ["allergies", "Allergies"], ["medications", "Medications"], ["conditions", "Other conditions"],
    ["doctor", "Clinician"], ["contact", "Emergency contact"], ["phone", "Contact phone"]
  ];
  const vitalsFields = [
    ["hr", "Heart rate", "bpm"], ["o2", "Oxygen saturation", "%"], ["temp", "Temperature", "°C"],
    ["sys", "Systolic pressure", "mmHg"], ["dia", "Diastolic pressure", "mmHg"]
  ];
  const eventKinds = ["Staff request", "Patient said", "Mobility event", "Swallow assessment", "Medication given", "Care note"];
  const clock = at => new Date(at).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  const dateTime = at => new Date(at).toLocaleString();
  function newState() {
    return {
      profile: {
        name: "Alex", location: "Hospital", condition: "Stroke", room: "204", interests: "Gardening, jazz",
        personality: "Ask one question at a time and give me time to answer.", role: "Retired gardener",
        likes: "Jazz", dislikes: "Being rushed", phrases: "Give me a moment."
      },
      large: false, rate: 0.9, voice: true, scan: "Direct selection", scanDelay: 1.5, pain: [], vitals: [], events: [], sessions: [],
      diet: "", bedsideTool: "", drafts: {}, nurseCategory: "greetings",
      custom: [], clips: [], question: "", category: "yesno", editing: null
    };
  }
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function action(label, run, className = "") {
    const button = node("button", label, "cts-btn " + className);
    button.type = "button";
    button.addEventListener("click", run);
    return button;
  }
  function field(name, label, value = "", options) {
    const wrap = node("label", undefined, "cts-field");
    const input = node(options ? "select" : "input");
    input.name = name;
    if (options) {
      for (const option of options) {
        const item = node("option", option);
        input.append(item);
      }
    } else {
      input.type = "text";
      input.maxLength = 180;
    }
    input.value = value;
    wrap.append(node("span", label), input);
    return {wrap, input};
  }
  function section(title, description) {
    const el = node("section", undefined, "cts-card");
    el.append(node("h4", title));
    if (description) el.append(node("p", description, "cts-description"));
    return el;
  }
  function cluster(...items) {
    const el = node("div", undefined, "cts-actions");
    el.append(...items);
    return el;
  }
  function form(handler, label) {
    const form = node("form", undefined, "cts-form");
    form.setAttribute("aria-label", label);
    form.addEventListener("submit", event => {
      event.preventDefault();
      handler(form, new FormData(form));
    });
    return form;
  }
  function submit(label) {
    const el = node("button", label, "cts-btn cts-primary");
    el.type = "submit";
    return el;
  }
  function table(headers, rows, empty) {
    if (!rows.length) return node("p", empty, "cts-empty");
    const wrap = node("div", undefined, "cts-table-wrap");
    const t = node("table", undefined, "cts-table");
    const head = t.createTHead().insertRow();
    for (const label of headers) {
      const th = node("th", label);
      th.scope = "col";
      head.append(th);
    }
    const body = t.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      row.forEach(value => { tr.insertCell().textContent = value; });
    }
    wrap.append(t);
    return wrap;
  }
  function describeVital(v) {
    return vitalsFields.filter(([key]) => v[key] !== undefined)
      .map(([key, label, unit]) => label + " " + v[key] + " " + unit).join(" · ");
  }
  function mount(element) {
    if (mounted.has(element)) return mounted.get(element);
    let state = newState();
    let view = "talk";
    let activeSession = null;
    let capture = null;
    let disposed = false;
    let utterance = null;
    let scanTimer = null;
    let stopScanning = null;
    let printCopy = null;
    const root = node("section", undefined, "cts");
    root.setAttribute("aria-label", "TinkyStroke care workspace");
    const heading = node("header", undefined, "cts-heading");
    const intro = node("div");
    intro.append(node("h3", "TinkyStroke"), node("p", "Bedside communication and care tools"));
    const who = node("span", undefined, "cts-identity");
    heading.append(intro, who);
    const nav = node("nav", undefined, "cts-nav");
    nav.setAttribute("aria-label", "TinkyStroke tools");
    const panel = node("div", undefined, "cts-panel");
    const status = node("p", "", "cts-status");
    status.setAttribute("role", "status");
    root.append(heading, nav, status, panel);
    element.replaceChildren(root);
    const navButtons = new Map();
    for (const [key, label] of Object.entries(views)) {
      const b = action(label, () => open(key));
      b.dataset.strokeView = key;
      navButtons.set(key, b);
      nav.append(b);
    }
    function announce(message) { status.textContent = message; }
    function note(type, description) {
      state.events.unshift({at: Date.now(), type, description});
    }
    function log(role, text, source) {
      if (!activeSession) {
        activeSession = {at: Date.now(), messages: []};
        state.sessions.unshift(activeSession);
      }
      activeSession.messages.push({at: Date.now(), role, text, source});
    }
    function recordMessage(value, source = "Communication board") {
      const text = String(value || "").trim();
      if (disposed || !text) return;
      log("Patient", text, source);
      note("Patient said", text);
      if (["report", "handoff", "nurse"].includes(view)) render();
    }
    function stopSpeech() {
      if (utterance && window.speechSynthesis) window.speechSynthesis.cancel();
      utterance = null;
    }
    function speak(text, source) {
      recordMessage(text, source);
      voiceText(text);
    }
    function voiceText(text) {
      announce(text);
      if (!state.voice || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      stopSpeech();
      utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = state.rate;
      const current = utterance;
      current.onend = current.onerror = () => { if (utterance === current) utterance = null; };
      window.speechSynthesis.speak(current);
    }
    function cancelCapture() {
      const pending = capture;
      capture = null;
      if (!pending) return;
      if (pending.recorder && pending.recorder.state !== "inactive") pending.recorder.stop();
      if (pending.stream) pending.stream.getTracks().forEach(track => track.stop());
    }
    function deactivate() {
      if (stopScanning) stopScanning();
      stopSpeech();
      panel.querySelectorAll("audio").forEach(audio => { if (!audio.paused) audio.pause(); });
      if (capture) {
        cancelCapture();
        if (view === "bank" && !disposed) render();
        announce("Recording stopped.");
      }
    }
    function open(key) {
      if (disposed || !Object.hasOwn(views, key)) return false;
      deactivate();
      view = key;
      announce("");
      render();
      return true;
    }
    function render() {
      if (stopScanning) stopScanning();
      stopScanning = null;
      who.textContent = state.profile.name + " · " + state.profile.location + " demo";
      root.classList.toggle("cts-large", state.large);
      for (const [key, button] of navButtons) button.setAttribute("aria-pressed", String(view === key));
      panel.replaceChildren();
      const renderers = {talk, profile, nurse, handoff: () => documentView(false), bank, tiles, report: () => documentView(true)};
      renderers[view]();
    }
    function talk() {
      const ask = section("Start a conversation", "A care partner asks a question. The patient chooses a reply or types their own.");
      function askNow(prompt, category) {
        state.question = prompt;
        state.category = category || (matchers.find(([, pattern]) => pattern.test(prompt)) || ["yesno"])[0];
        log("Care partner", prompt, "Conversation");
        render();
        panel.querySelector(".cts-replies button")?.focus();
      }
      const starters = cluster(...questions.map(([q, key]) => action(q, () => askNow(q, key))));
      const custom = form((_, values) => {
        const prompt = values.get("question").trim();
        if (prompt) askNow(prompt);
      }, "Care partner question");
      const q = field("question", "Your question");
      q.input.required = true;
      custom.append(q.wrap, submit("Ask question"));
      ask.append(starters, custom);
      panel.append(ask);
      if (state.question) {
        const answers = section(state.question, "Choose a reply to speak.");
        const list = node("div", undefined, "cts-replies");
        replies[state.category].forEach(([emoji, label, phrase]) => {
          const b = action("", () => { speak(phrase, "Conversation"); refreshHistory(); }, "cts-reply");
          const mark = node("span", emoji);
          mark.setAttribute("aria-hidden", "true");
          b.append(mark, node("strong", label), node("small", phrase));
          list.append(b);
        });
        answers.append(list);
        panel.append(answers);
        setupAccess(list);
      }
      const compose = form((f, values) => {
        const reply = values.get("reply").trim();
        if (!reply) return;
        speak(reply, "Typed message");
        f.reset();
        suggestedWords.replaceChildren();
        refreshHistory();
      }, "Typed patient response");
      const message = field("reply", "Type a patient message");
      message.input.required = true;
      const suggestedWords = node("div", undefined, "cts-actions cts-suggestions");
      message.input.addEventListener("input", () => suggestions(message.input, suggestedWords));
      compose.append(message.wrap, submit("Speak message"), suggestedWords);
      const history = section("Conversation history");
      const transcript = node("div");
      function refreshHistory() {
        const messages = activeSession?.messages || [];
        transcript.replaceChildren(table(["Time", "Speaker", "Message"], messages.map(m => [clock(m.at), m.role, m.text]), "Start a conversation to see the exchange here."));
        finish.disabled = !messages.length;
      }
      const finish = action("Finish conversation", () => {
        activeSession = null;
        state.question = "";
        render();
        announce("Conversation saved to this demo’s SLP report.");
      });
      refreshHistory();
      history.append(transcript, cluster(finish));
      panel.append(compose, history);
    }
    function setupAccess(grid) {
      const mode = state.scan;
      if (mode === "Direct selection") return;
      const choices = Array.from(grid.querySelectorAll("button"));
      if (!choices.length) return;
      const group = node("div", undefined, "cts-scan");
      const guide = node("p", mode === "Automatic scan" ? "Start the scan, then press Space to speak the highlighted reply." : "Press Right Arrow to advance and Space to speak the highlighted reply.", "cts-description");
      const readout = node("span", "Ready", "cts-scan-readout");
      let running = false;
      let index = -1;
      function next() {
        if (index >= 0) choices[index].classList.remove("cts-highlight");
        index = (index + 1) % choices.length;
        choices[index].classList.add("cts-highlight");
        readout.textContent = choices[index].querySelector("strong").textContent;
      }
      function stop() {
        if (scanTimer !== null) window.clearInterval(scanTimer);
        scanTimer = null;
        running = false;
        if (index >= 0) choices[index].classList.remove("cts-highlight");
        index = -1;
        readout.textContent = "Ready";
        start.textContent = "Start scan";
      }
      function toggle() {
        if (running) { stop(); return; }
        running = true;
        next();
        start.textContent = "Stop scan";
        if (mode === "Automatic scan") scanTimer = window.setInterval(next, state.scanDelay * 1000);
        keys.focus();
      }
      function select() {
        if (!running || index < 0) return;
        choices[index].click();
      }
      const start = action("Start scan", toggle);
      const keys = action("Select highlighted reply", select, "cts-primary");
      keys.addEventListener("keydown", event => {
        if (event.key === "ArrowRight" && running) { event.preventDefault(); next(); }
      });
      const advance = action("Next reply", () => { if (running) next(); });
      group.append(guide, cluster(start, advance, keys, readout));
      grid.after(group);
      stopScanning = stop;
    }
    function suggestions(input, container) {
      const following = new Map();
      for (const session of state.sessions) {
        for (const m of session.messages) {
          if (m.role !== "Patient" || m.source === "Message bank label") continue;
          const words = m.text.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
          for (let i = 1; i < words.length; i++) {
            const counts = following.get(words[i - 1]) || new Map();
            counts.set(words[i], (counts.get(words[i]) || 0) + 1);
            following.set(words[i - 1], counts);
          }
        }
      }
      const words = input.value.trim().toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
      const counts = following.get(words.at(-1));
      container.replaceChildren();
      if (!counts) return;
      container.append(node("small", "Next word"));
      Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([word]) => {
        container.append(action(word, () => {
          input.value = (input.value.trimEnd() + " " + word + " ").slice(0, input.maxLength);
          suggestions(input, container);
          input.focus();
        }));
      });
    }
    function profile() {
      const card = section("Patient profile", "Use fictional details for this presentation. Entries and recordings clear when the demo is reset or the page is reloaded.");
      const f = form((_, values) => {
        for (const [key] of profileFields) state.profile[key] = values.get(key).trim();
        if (!state.profile.name) state.profile.name = "Demo patient";
        state.rate = Number(values.get("rate"));
        state.scan = values.get("scan");
        state.scanDelay = Number(values.get("scanDelay"));
        state.voice = values.get("voice") === "On";
        state.large = values.get("size") === "Large";
        render();
        announce("Patient profile and communication preferences saved.");
      }, "Patient profile");
      for (const [key, label, choices] of profileFields) {
        const item = field(key, label, state.profile[key] || "", choices);
        if (key === "name") item.input.required = true;
        f.append(item.wrap);
      }
      f.append(field("size", "Care workspace text", state.large ? "Large" : "Standard", ["Standard", "Large"]).wrap,
        field("voice", "Speak patient choices", state.voice ? "On" : "Off", ["On", "Off"]).wrap);
      const rate = field("rate", "Speech speed", String(state.rate), ["0.7", "0.9", "1", "1.2"]);
      f.append(rate.wrap,
        field("scan", "Conversation reply access", state.scan, ["Direct selection", "Automatic scan", "Step scan"]).wrap,
        field("scanDelay", "Scan interval (seconds)", String(state.scanDelay), ["1", "1.5", "2", "3", "5"]).wrap,
        submit("Save profile"));
      card.append(f);
      panel.append(card);
    }
    function nurse() {
      const tools = section("Bedside tools", "Lead a round, record an observation or let a patient answer one question at a time.");
      tools.append(cluster(...[["rounding", "Rounding check"], ["neuro", "Neuro observations"],
        ["interview", "Yes / no assessment"], ["nursePhrases", "Speak to patient"], ["moods", "Mood check-in"],
        ["diet", "Diet / NPO status"]].map(([key, title]) => {
        const b = action(title, () => {
          state.bedsideTool = key;
          render();
          panel.querySelector(".cts-bedside h4")?.focus();
        });
        b.setAttribute("aria-pressed", String(state.bedsideTool === key));
        return b;
      })));
      panel.append(tools);
      if (state.bedsideTool) bedside();
      const pain = section("Pain assessment", "Choose the patient’s rating from 0 (no pain) to 10 (worst pain).");
      const painForm = form((_, values) => {
        const checked = values.get("level");
        if (checked === null) return;
        const entry = {at: Date.now(), level: Number(checked), location: values.get("location").trim(), notes: values.get("notes").trim()};
        state.pain.unshift(entry);
        note("Pain assessment", painText(entry));
        render();
        announce("Pain assessment recorded.");
      }, "Record pain");
      const scale = node("fieldset", undefined, "cts-scale");
      scale.append(node("legend", "Pain rating"));
      for (let level = 0; level <= 10; level++) {
        const wrap = node("label"), radio = node("input");
        radio.type = "radio";
        radio.name = "level";
        radio.value = String(level);
        radio.required = true;
        wrap.append(radio, node("span", String(level)));
        scale.append(wrap);
      }
      painForm.append(scale, field("location", "Pain location").wrap, field("notes", "Patient’s words or notes").wrap, submit("Record pain"));
      pain.append(painForm);
      const vitals = section("Vital signs", "Enter a sample measurement. Blood pressure uses both pressure readings.");
      const vf = form((f, values) => {
        const v = {at: Date.now()};
        for (const [key] of vitalsFields) if (values.get(key) !== "") v[key] = Number(values.get(key));
        if (Object.keys(v).length === 1) { announce("Enter at least one vital sign."); f.elements.hr.focus(); return; }
        if ((v.sys === undefined) !== (v.dia === undefined)) {
          announce("Enter both blood pressure readings.");
          f.elements[v.sys === undefined ? "sys" : "dia"].focus();
          return;
        }
        state.vitals.unshift(v);
        note("Vital signs", describeVital(v));
        render();
        announce("Vital signs recorded.");
      }, "Record vital signs");
      for (const [key, label, unit] of vitalsFields) {
        const f = field(key, label + " (" + unit + ")");
        f.input.type = "number";
        f.input.min = "0";
        f.input.step = key === "temp" ? "0.1" : "1";
        if (key === "o2") f.input.max = "100";
        vf.append(f.wrap);
      }
      vf.append(submit("Record vitals"));
      vitals.append(vf);
      const noteCard = section("Care event");
      const ef = form((_, values) => {
        const value = values.get("event").trim();
        if (!value) return;
        note(values.get("kind"), value);
        render();
        announce("Care event recorded.");
      }, "Record a care event");
      const e = field("event", "Observation or request");
      e.input.required = true;
      ef.append(field("kind", "Type of event", eventKinds[0], eventKinds).wrap, e.wrap, submit("Record event"));
      noteCard.append(ef);
      const timeline = section("Care timeline");
      timeline.append(table(["Time", "Event", "Details"], state.events.map(n => [clock(n.at), n.type, n.description]), "Recorded measurements, events and patient messages appear here."));
      panel.append(pain, vitals, noteCard, timeline);
    }
    function bedside() {
      const key = state.bedsideTool;
      const titles = {rounding: "Six-part rounding check", neuro: "Neuro observations", interview: "Yes / no assessment",
        moods: "How are you feeling?", diet: "Diet / NPO status", nursePhrases: "Speak to patient"};
      const card = section(titles[key]);
      card.classList.add("cts-bedside");
      card.querySelector("h4").tabIndex = -1;
      panel.append(card);
      if (key === "moods") {
        card.append(cluster(...clinical.moods.map(([emoji, label, value]) => action(emoji + " " + label, () => {
          log("Patient", value, "Mood check-in");
          note("Mood check-in", value);
          render();
          voiceText(value);
        }))));
        return;
      }
      if (key === "diet") {
        const f = form((_, values) => {
          state.diet = values.get("diet");
          note("Diet status", state.diet);
          render();
          announce("Sample diet status added to handoff.");
        }, "Set sample diet status");
        const d = field("diet", "Documented diet for this demo", state.diet, ["", ...clinical.diet.map(row => row[0])]);
        d.input.required = true;
        f.append(d.wrap, submit("Save diet status"));
        card.append(f);
        return;
      }
      if (key === "nursePhrases") {
        const labels = {greetings: "Greetings & comfort", empathy: "Empathy & support", procedure: "Procedures",
          meds: "Medication", info: "Information", question: "Questions"};
        const categories = cluster(...Object.entries(labels).map(([category, name]) => {
          const button = action(name, () => { state.nurseCategory = category; render(); });
          button.setAttribute("aria-pressed", String(category === state.nurseCategory));
          return button;
        }));
        const phrases = node("div", undefined, "cts-replies");
        function say(text) { log("Care partner", text, "Nurse speech board"); voiceText(text); }
        clinical.nursePhrases.filter(row => row[3] === state.nurseCategory).forEach(([emoji, label, phrase]) => {
          const button = action("", () => say(phrase), "cts-reply");
          button.append(node("strong", emoji + " " + label), node("small", phrase));
          phrases.append(button);
        });
        const free = form((f, values) => {
          const text = values.get("nurseMessage").trim();
          if (text) { say(text); f.reset(); }
        }, "Speak a care partner message");
        const custom = field("nurseMessage", "Care partner’s own message");
        custom.input.required = true;
        free.append(custom.wrap, submit("Speak to patient"));
        card.append(categories, phrases, free);
        return;
      }
      const steps = clinical[key];
      const draft = state.drafts[key] || (state.drafts[key] = {index: 0, answers: [], extended: false});
      const i = draft.index;
      const reviewing = i === steps.length;
      function move(index) {
        draft.index = index;
        render();
        panel.querySelector(".cts-bedside h4")?.focus();
      }
      function save() {
        const parts = draft.answers.flatMap((answer, index) => answer ? [promptFor(index) + " — " + answer] : []);
        if (!parts.length) { announce("Record a response before saving."); return; }
        note(titles[key], parts.join(" · "));
        delete state.drafts[key];
        state.bedsideTool = "";
        render();
        announce(titles[key] + " recorded in the care timeline.");
      }
      function promptFor(index) {
        if (key === "interview") return steps[index][0];
        return steps[index][0].charAt(0).toUpperCase() + steps[index][0].slice(1);
      }
      const continueExtended = key === "interview" && i === steps.findIndex(row => row[1] === 2) && !draft.extended;
      if (reviewing || continueExtended) {
        card.append(node("p", "Review the recorded responses before adding them to the timeline."));
        card.append(table(["Item", "Recorded response"], draft.answers.flatMap((answer, index) =>
          answer ? [[promptFor(index), answer]] : []), "No responses entered."));
        const controls = cluster(action("Review previous", () => move(Math.max(0, draft.answers.length - 1))), action("Save to timeline", save, "cts-primary"));
        if (continueExtended) controls.append(action("Continue extended assessment", () => { draft.extended = true; move(i); }));
        card.append(controls);
        return;
      }
      const step = steps[i];
      const prompt = step[key === "interview" ? 0 : 1];
      const caption = key === "interview" ? (step[1] === 1 ? "Initial questions" : "Extended questions") : promptFor(i);
      const counter = node("p", caption + " · " + (i + 1) + " of " + steps.length, "cts-description");
      card.append(counter, node("h5", prompt, "cts-step-title"));
      if (key === "neuro") card.append(node("p", step[2]));
      const options = key === "interview" ? [["", "Yes", "Yes"], ["", "No", "No"], ["", "Skip", "Skipped"]] : step[step.length - 1];
      const answers = cluster(...options.map(([emoji, label, value]) => {
        const b = action((emoji ? emoji + " " : "") + label, () => {
          draft.answers[i] = value;
          move(i + 1);
          if (key !== "neuro") voiceText(value);
        });
        b.setAttribute("aria-pressed", String(draft.answers[i] === value));
        return b;
      }));
      const controls = cluster(action("Read prompt aloud", () => voiceText(prompt)));
      if (i) controls.append(action("Previous item", () => move(i - 1)), action("Review and finish", () => move(steps.length)));
      card.append(answers, controls);
    }
    function painText(entry) {
      return entry.level + "/10" + (entry.location ? " · " + entry.location : "") + (entry.notes ? " · " + entry.notes : "");
    }
    function handoffText() {
      const p = state.profile;
      const lines = ["TinkyStroke · Demo patient handoff", dateTime(Date.now()), "", "Patient: " + p.name,
        "Setting: " + p.location, "Room: " + (p.room || "Unspecified"), "Condition: " + p.condition];
      for (const key of ["allergies", "medications", "conditions", "doctor", "contact", "phone", "personality", "phrases"]) {
        if (p[key]) lines.push(profileFields.find(([name]) => name === key)[1] + ": " + p[key]);
      }
      if (state.diet) lines.push("Diet / NPO status: " + state.diet);
      const pain = state.pain[0], vitals = state.vitals[0];
      lines.push("", "Latest pain assessment", pain ? dateTime(pain.at) + " · " + painText(pain) : "No assessment recorded.",
        "", "Latest vital signs", vitals ? dateTime(vitals.at) + " · " + describeVital(vitals) : "No measurements recorded.",
        "", "Recent care events");
      if (!state.events.length) lines.push("No care events recorded.");
      state.events.slice(0, 5).forEach(e => lines.push(clock(e.at) + " · " + e.type + " · " + e.description));
      return lines.join("\n");
    }
    function reportText() {
      const messages = state.sessions.flatMap(s => s.messages);
      const patient = messages.filter(m => m.role === "Patient");
      const written = patient.filter(m => m.source !== "Message bank label");
      const words = written.flatMap(m => m.text.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []);
      const freq = new Map(), sources = new Map();
      words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
      patient.forEach(m => sources.set(m.source, (sources.get(m.source) || 0) + 1));
      const top = Array.from(freq.entries()).filter(([w]) => w.length > 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20);
      const lines = ["TinkyStroke · Demo SLP communication report", dateTime(Date.now()), "",
        state.profile.name + " · " + state.profile.condition + " · " + state.profile.location, "",
        "Usage statistics", "Conversations: " + state.sessions.length, "Total utterances: " + messages.length,
        "Patient messages: " + patient.length, "", "Vocabulary analysis", "Total patient words: " + words.length,
        "Unique words: " + freq.size, "Vocabulary diversity: " + (words.length ? Math.round(freq.size * 100 / words.length) : 0) + "%",
        "Frequent words: " + (top.map(([word, count]) => word + " (" + count + ")").join(", ") || "None yet"), "", "Communication methods"];
      if (!sources.size) lines.push("No patient messages recorded.");
      sources.forEach((count, key) => lines.push(key + ": " + count));
      if (patient.length !== written.length) lines.push("Voice recording labels are excluded from vocabulary counts.");
      if (written.length) {
        const facts = [...new Set(written.map(m => m.text).filter(t => /^(?:I(?:’|'| a)m |I (?:take|have|live|work|like|love|hate) |My name is )/i.test(t)))].slice(-5);
        lines.push("", "Communication patterns", "Average words per patient message: " + (words.length / written.length).toFixed(1),
          "Questions selected or typed: " + written.filter(m => m.text.includes("?")).length);
        if (facts.length) lines.push("Patient statements: " + facts.join(" · "));
      }
      lines.push("", "Pain summary", "Assessments: " + state.pain.length);
      if (state.pain.length) {
        const avg = state.pain.reduce((sum, n) => sum + n.level, 0) / state.pain.length;
        lines.push("Mean rating: " + Number(avg.toFixed(1)) + "/10", "Most recent: " + painText(state.pain[0]));
      }
      lines.push("", "Recent conversations");
      if (!state.sessions.length) lines.push("No conversations recorded.");
      state.sessions.slice(0, 5).forEach(s => {
        lines.push(dateTime(s.at) + " · " + s.messages.length + " messages");
        s.messages.slice(0, 10).forEach(m => lines.push("  " + m.role + ": " + m.text));
        if (s.messages.length > 10) lines.push("  " + (s.messages.length - 10) + " more messages");
      });
      return lines.join("\n");
    }
    function download(text, name) {
      const url = URL.createObjectURL(new Blob([text], {type: "text/plain;charset=utf-8"}));
      const a = node("a");
      a.href = url;
      a.download = name;
      root.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function clearPrint() {
      if (printCopy) printCopy.remove();
      printCopy = null;
      window.removeEventListener("afterprint", clearPrint);
    }
    function printText(text) {
      clearPrint();
      printCopy = node("pre", text, "cts-print-copy");
      document.body.append(printCopy);
      window.addEventListener("afterprint", clearPrint, {once: true});
      window.print();
    }
    function shiftText() {
      const lines = ["TinkyStroke · Demo shift report", dateTime(Date.now()),
        state.profile.name + " · " + state.profile.location + (state.profile.room ? " · Room " + state.profile.room : ""),
        "", "Diet / NPO status: " + (state.diet || "Unspecified")];
      const recorded = new Map();
      for (const e of state.events) {
        const group = recorded.get(e.type) || [];
        group.push(clock(e.at) + " · " + e.description);
        recorded.set(e.type, group);
      }
      if (!recorded.size) lines.push("", "No care events recorded.");
      for (const [name, entries] of recorded) lines.push("", name, ...entries);
      return lines.join("\n");
    }
    function documentView(isReport) {
      const title = isReport ? "Speech-language pathology report" : "Patient handoff card";
      const card = section(title, isReport ? "This presentation’s conversations, vocabulary use and pain assessments." : "Current patient details, latest measurements and the five most recent care events.");
      const body = isReport ? reportText() : handoffText();
      const preview = node("pre", body, "cts-document");
      const controls = (text, name) => cluster(action("Download text", () => download(text, name), "cts-primary"),
        action("Print / Save PDF", () => printText(text)));
      card.append(controls(body, isReport ? "TinkyStroke-demo-SLP.txt" : "TinkyStroke-demo-handoff.txt"), preview);
      panel.append(card);
      if (!isReport) {
        const shift = section("Shift report", "Every recorded care event in this presentation, grouped by type.");
        const report = shiftText();
        const detail = node("details", undefined, "cts-detail");
        detail.append(node("summary", "View shift report"), node("pre", report, "cts-document"));
        shift.append(detail, controls(report, "TinkyStroke-demo-shift.txt"));
        panel.append(shift);
        return;
      }
      const archive = section("Conversation archive", "Open a conversation to review the exchange or play a line again.");
      if (!state.sessions.length) archive.append(node("p", "No conversations recorded.", "cts-empty"));
      for (const session of state.sessions) {
        const detail = node("details", undefined, "cts-detail");
        const first = session.messages[0]?.text || "Conversation";
        detail.append(node("summary", clock(session.at) + " · " + first + " (" + session.messages.length + ")"));
        for (const m of session.messages) {
          const row = node("div", undefined, "cts-history-row");
          row.append(node("small", m.role + " · " + clock(m.at)), node("span", m.text));
          if (m.source !== "Message bank label") row.append(action("Read aloud", () => voiceText(m.text)));
          detail.append(row);
        }
        archive.append(detail);
      }
      panel.append(archive);
    }
    function tiles() {
      const creating = state.editing === null;
      const existing = state.custom.find(t => t.id === state.editing) || {};
      const edit = section(creating ? "Create a communication tile" : "Edit communication tile", "Give a familiar phrase a short label and a symbol the patient recognizes.");
      const f = form((_, values) => {
        const label = values.get("label").trim(), phrase = values.get("phrase").trim();
        if (!label || !phrase) { announce("Enter a label and a spoken phrase."); return; }
        const tile = {id: existing.id || Symbol(), icon: values.get("icon").trim() || "💬", label, phrase};
        if (creating) state.custom.push(tile);
        else state.custom[state.custom.findIndex(t => t.id === existing.id)] = tile;
        state.editing = null;
        render();
        announce("Communication tile saved.");
      }, "Custom tile editor");
      const label = field("label", "Tile label", existing.label || "");
      const phrase = field("phrase", "Spoken phrase", existing.phrase || "");
      const emoji = field("icon", "Symbol or emoji", existing.icon || "💬");
      emoji.input.maxLength = 12;
      label.input.maxLength = 44;
      label.input.required = phrase.input.required = true;
      f.append(emoji.wrap, label.wrap, phrase.wrap, submit("Save tile"));
      if (!creating) f.append(action("Cancel edit", () => { state.editing = null; render(); }));
      edit.append(f);
      const saved = section("My communication tiles");
      if (!state.custom.length) saved.append(node("p", "Saved tiles appear here, ready to speak.", "cts-empty"));
      for (const tile of state.custom) {
        const row = node("div", undefined, "cts-item");
        const say = action("", () => speak(tile.phrase, "My tiles"), "cts-saved-tile");
        say.append(node("strong", tile.icon + " " + tile.label), node("small", tile.phrase));
        row.append(say, cluster(action("Edit", () => {
          state.editing = tile.id;
          render();
          panel.querySelector('[name="label"]').focus();
        }), action("Remove", () => {
          state.custom = state.custom.filter(t => t.id !== tile.id);
          if (state.editing === tile.id) state.editing = null;
          render();
          announce("Tile removed.");
        })));
        saved.append(row);
      }
      panel.append(edit, saved);
    }
    function bank() {
      const create = section("Record a familiar voice", "Choose a phrase, then record it in the speaker’s own voice. Recordings stay in this open demo.");
      const f = form(() => {
        if (capture?.recorder?.state === "recording") {
          capture.recorder.stop();
          capture.stream.getTracks().forEach(track => track.stop());
          control.disabled = true;
        } else if (!capture) beginRecording(label.input.value.trim());
      }, "Record a voice message");
      const label = field("label", "Phrase or recording label", capture?.label || "");
      label.input.required = true;
      const recording = capture?.recorder?.state === "recording";
      const supported = Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
      const control = submit(recording ? "Stop and save" : "Record voice");
      control.disabled = !supported || Boolean(capture && !recording);
      label.input.readOnly = Boolean(capture);
      f.append(label.wrap, control);
      create.append(f);
      if (!supported) create.append(node("p", "Voice recording needs a microphone-enabled browser on HTTPS or localhost.", "cts-empty"));
      if (capture) create.append(cluster(action("Cancel recording", () => { cancelCapture(); render(); announce("Recording canceled."); })));
      else {
        const suggestion = field("suggestion", "Choose a suggested phrase", "", ["", ...suggested]);
        suggestion.input.addEventListener("change", () => { label.input.value = suggestion.input.value; });
        create.append(suggestion.wrap);
      }
      const saved = section("Saved recordings");
      if (!state.clips.length) saved.append(node("p", "Your recorded phrases will appear here for playback.", "cts-empty"));
      for (const clip of state.clips) {
        const row = node("div", undefined, "cts-item");
        const stack = node("div", undefined, "cts-clip");
        stack.append(node("strong", clip.label), node("small", Math.max(1, Math.round(clip.seconds)) + " seconds"));
        const player = node("audio");
        player.controls = true;
        player.preload = "metadata";
        player.src = clip.url;
        player.setAttribute("aria-label", "Play " + clip.label);
        player.addEventListener("play", () => {
          panel.querySelectorAll("audio").forEach(other => { if (other !== player && !other.paused) other.pause(); });
          if (!player.dataset.counted) {
            recordMessage(clip.label, "Message bank label");
            player.dataset.counted = "true";
          }
        });
        player.addEventListener("ended", () => { delete player.dataset.counted; });
        stack.append(player);
        row.append(stack, action("Remove recording", () => {
          if (!player.paused) player.pause();
          URL.revokeObjectURL(clip.url);
          state.clips = state.clips.filter(c => c !== clip);
          render();
          announce("Recording removed.");
        }));
        saved.append(row);
      }
      panel.append(create, saved);
    }
    async function beginRecording(label) {
      if (!label) { announce("Enter a recording label."); return; }
      const pending = {label, stream: null, recorder: null, started: 0};
      capture = pending;
      render();
      announce("Waiting for microphone permission.");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        if (capture !== pending || disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        pending.stream = stream;
        const recorder = new window.MediaRecorder(stream);
        pending.recorder = recorder;
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = () => {
          if (capture !== pending) return;
          cancelCapture();
          render();
          announce("Recording interrupted. Check the microphone and try again.");
        };
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          if (capture !== pending || disposed) return;
          capture = null;
          if (!chunks.length) {
            render();
            announce("No audio was captured. Try recording again.");
            return;
          }
          const blob = new Blob(chunks, {type: recorder.mimeType || chunks[0].type});
          state.clips.push({label, url: URL.createObjectURL(blob), seconds: (Date.now() - pending.started) / 1000});
          render();
          announce("Voice message saved.");
        };
        pending.started = Date.now();
        recorder.start();
        render();
        announce("Recording. Choose Stop and save when finished.");
      } catch {
        if (capture !== pending || disposed) return;
        cancelCapture();
        render();
        announce("Microphone unavailable. Check the browser’s microphone permission and try again.");
      }
    }
    function release() {
      clearPrint();
      if (stopScanning) stopScanning();
      stopScanning = null;
      cancelCapture();
      stopSpeech();
      panel.querySelectorAll("audio").forEach(audio => { if (!audio.paused) audio.pause(); });
      for (const clip of state.clips) URL.revokeObjectURL(clip.url);
    }
    function reset() {
      if (disposed) return;
      release();
      state = newState();
      activeSession = null;
      view = "talk";
      render();
      announce("TinkyStroke demo reset.");
    }
    function onVisibility() { if (document.hidden) deactivate(); }
    function destroy() {
      if (disposed) return;
      disposed = true;
      release();
      activeSession = null;
      state = newState();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", deactivate);
      mounted.delete(element);
      root.remove();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", deactivate);
    const api = {open, recordMessage, deactivate, reset, destroy};
    mounted.set(element, api);
    render();
    return api;
  }
  window.CareStroke = Object.freeze({mount});
})();
