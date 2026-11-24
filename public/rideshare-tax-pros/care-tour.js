// Presenter prompts point to working rooms and bedside tools in the TinkyTown demo.
(() => {
  'use strict';
  const tours = {
    hospital: {
      title: 'From admission to discharge',
      scene: 'A patient who has difficulty speaking arrives for an appointment. Invite someone to play the patient and another person to play hospital staff.',
      steps: [
        {
          title: 'Let the patient check in', target: {room:'reception',mode:''},
          try: 'In Reception & admissions, ask “What brings you in?” Let the patient choose Appointment, then Check in.',
          notice: 'The patient’s own selection produces a full check-in request in the speech bar.'
        },
        {
          title: 'Give staff a turn', target: {room:'reception',mode:''},
          try: 'Choose Hospital staff. Type “I have your appointment. Would you like to sit here?” and select Say it. Open Conversation to review both turns.',
          notice: 'The clerk’s reply and the patient’s request appear under their respective roles in the room.'
        },
        {
          title: 'Ask for the next step', target: {room:'discharge',mode:''},
          try: 'In Discharge planning, ask “What would help before you go?” Let the patient choose Instructions, then try Ride home.',
          notice: 'The same patient can ask for written instructions and transportation help as the visit ends.'
        }
      ],
      pilot: 'Which admissions desk or discharge team could try this exchange, and who would collect feedback from patients and staff?'
    },
    'nursing-home': {
      title: 'A resident directs their morning',
      scene: 'A resident is ready for the day. Hand the resident role to a buyer and let them make each choice.',
      steps: [
        {
          title: 'Choose a morning routine', target: {room:'resident-room',mode:''},
          try: 'In the Resident room, ask “Where would you like to sit?” Invite the resident to choose Recliner. Use Repeat to hear their choice again.',
          notice: 'The resident can state a preference directly and choose when it is repeated.'
        },
        {
          title: 'Request a mobility aid', target: {room:'rehabilitation',mode:''},
          try: 'In the Therapy room, ask “What would help you get there?” Choose Walker. Switch to Care team, type “I’ll bring it to you,” and select Say it.',
          notice: 'The resident names the aid. The care team can acknowledge the request in the same room.'
        },
        {
          title: 'Pick an activity', target: {room:'activities',mode:''},
          try: 'In the Activities room, ask “What would you enjoy?” Let the resident choose Cards, Bingo, or another activity they prefer.',
          notice: 'The resident can make a social choice as well as request care. The selected activity appears in the speech bar.'
        }
      ],
      pilot: 'Which household or activity room would try this first? Who could ask residents whether the available choices fit their routines?'
    },
    'senior-center': {
      title: 'Plan a visit to the center',
      scene: 'A member wants to join a program, ask about lunch, and arrange transportation. Let the member lead the exchange with center staff.',
      steps: [
        {
          title: 'Choose a program', target: {room:'programs',mode:''},
          try: 'In Programs & activities, ask “What would you like to join?” Let the member pick Music, Art, or a program of their choice.',
          notice: 'The member can express an interest without having someone choose a program on their behalf.'
        },
        {
          title: 'Ask about lunch', target: {room:'meals',mode:''},
          try: 'In Meals & nutrition, let the member choose Menu or Cost?. Select Center staff and use Say it to answer with a sample menu or price.',
          notice: 'Both people can participate at the front desk. Open Conversation to see the member’s question and the staff reply.'
        },
        {
          title: 'Ask about a ride', target: {room:'transportation',mode:''},
          try: 'In Transportation, ask “Where would you like to go?” Choose Shopping, then Schedule to express the request.',
          notice: 'The member names the destination and asks to schedule a ride. Staff can handle booking through their usual process.'
        }
      ],
      pilot: 'Which program or meal desk could host a trial? Agree who would ask members and staff which questions still need tiles.'
    },
    stroke: {
      title: 'From a bedside reply to a shift handoff',
      scene: 'Use the fictional bedside patient. Give one person the patient role and another the nurse role so each can try their part.',
      steps: [
        {
          title: 'Answer a bedside question', target: {strokeView:'talk',mode:''},
          try: 'In Conversation, select Are you in pain? Ask the patient to choose a reply such as MODERATE or type a message in their own words.',
          notice: 'The patient controls the reply. The chosen phrase appears under Patient in Conversation history.'
        },
        {
          title: 'Record what the patient reports', target: {strokeView:'nurse',mode:''},
          try: 'In Nurse tools, ask the patient for the rating and location. Under Pain assessment, enter a fictional rating and location, then select Record pain.',
          notice: 'The care timeline distinguishes the patient’s words from the nurse’s recorded assessment.'
        },
        {
          title: 'Hand over the conversation', target: {strokeView:'handoff',mode:''},
          try: 'Read the latest pain assessment and recent care events. Open View shift report. Ask the next nurse to identify the patient’s original words.',
          notice: 'The incoming nurse can read the request and assessment together. The handoff can also be printed for discussion.'
        }
      ],
      pilot: 'Which shift and bedside communication partner could try this with a fictional case first? Agree how the team would assess usability.'
    }
  };
  function el(tag, text, className) {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function button(label, handler, primary) {
    const b = el('button', label, primary ? 'ctour-primary' : 'ctour-action');
    b.type = 'button'; b.addEventListener('click', handler);
    return b;
  }
  function mount(host, venue, {showStep,plan}) {
    const tour = tours[venue];
    host.replaceChildren();
    host.hidden = !tour;
    if (!tour) return () => {};
    let index = -1, disposed = false, folded = false;
    const card = el('aside', '', 'ctour');
    card.setAttribute('aria-label','Presenter guide');
    const head = el('div', '', 'ctour-head');
    const name = el('div');
    name.append(el('small','Presenter guide'), el('h3',tour.title));
    const fold = button('Hide guide',() => {
      folded = !folded; body.hidden = folded;
      fold.textContent = folded ? 'Show guide' : 'Hide guide';
      fold.setAttribute('aria-expanded',String(!folded));
    });
    fold.setAttribute('aria-expanded','true');
    head.append(name,fold);
    const body = el('div','','ctour-body');
    card.append(head,body); host.append(card);
    function select(i) {
      if (disposed) return;
      index = i; draw();
      if (i < tour.steps.length) showStep({...tour.steps[i].target});
      const heading = body.querySelector('h4');
      if (heading && card.isConnected) heading.focus({preventScroll:true});
    }
    function draw() {
      body.replaceChildren();
      if (index < 0) {
        body.append(el('p',tour.scene),button('Start guided demo',() => select(0),true));
        return;
      }
      const foot = el('div','','ctour-actions');
      const step = tour.steps[index];
      const heading = el('h4',step ? step.title : 'Discuss a pilot');
      heading.tabIndex = -1;
      body.append(el('small',step ? 'Step ' + (index + 1) + ' of ' + tour.steps.length : 'Pilot discussion'),heading);
      if (step) {
        const copy = el('div','','ctour-copy'), method = el('div'), outcome = el('div');
        method.append(el('strong','Ask and try'), el('p',step.try));
        outcome.append(el('strong','What to notice'), el('p',step.notice));
        copy.append(method,outcome);body.append(copy);
        foot.append(button('Reopen this step',() => showStep({...step.target})));
      } else body.append(el('p',tour.pilot));
      if (index > 0) foot.append(button('Previous step',() => select(index - 1)));
      foot.append(step ? button(index + 1 === tour.steps.length ? 'Discuss a pilot' : 'Next step',() => select(index + 1),true) :
        button('Open pilot planner',() => plan(),true));
      body.append(foot);
    }
    draw();
    return () => {disposed = true; card.remove();};
  }
  window.CareTour = Object.freeze({mount});
})();
