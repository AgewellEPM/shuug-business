// Each walkthrough uses its venue's installed visitor board. Only the start
// and restart controls change the kiosk; handing it to a buyer keeps the visit.
(() => {
  'use strict';

  const tours = {
    airport: {
      title: 'Find a departure gate', place: 'bdl',
      scene: 'At Bradley International Airport, a traveler has a boarding pass and needs directions. Ask the buyer to play the traveler after your first turn.',
      first: 'Tap My Gate. Show how the traveler can ask about the next part of the trip from this board.',
      buyer: 'As the gate agent, ask “What would help you get there?” Hand over the board. The traveler can choose How do I get to my gate? or How long to walk? Then answer the question they chose.',
      pilot: 'Which information desk would offer the QR first? Ask the gate team which directions passengers request most.'
    },
    college: {
      title: 'Visit the registrar', place: 'uconn-storrs',
      scene: 'At the University of Connecticut, a student needs something from the registrar. Ask the buyer to take the student role.',
      first: 'From the campus board, tap Academics. Point out Request transcript and Talk to my advisor.',
      buyer: 'As the registrar, ask “What did you come in for today?” Let the student choose the request. Read or listen to their words before explaining the next step.',
      pilot: 'Which student service window would try the first QR, and who can confirm its department names before posting it?'
    },
    townhall: {
      title: 'Ask the clerk for a record',
      scene: 'A Hartford resident visits City Hall for a birth certificate. Invite the buyer to play the resident.',
      first: 'Tap Town Clerk, then Birth Certificate. The record has its own follow-up choices.',
      buyer: 'As the clerk, ask “What would you like to know before we start?” The resident can choose What ID? or How Much? Use Staff reply to answer their question.',
      pilot: 'Which clerk window should get the first QR? Ask the clerk to verify the counter name, room and common records requests.'
    },
    library: {
      title: 'Get a library card',
      scene: 'A first-time patron visits the Hartford library desk. The buyer will try asking for a card.',
      first: 'Tap Library Card to open the application conversation. Show the patron where I Want a Card and Any Fee? appear.',
      buyer: 'Ask “What would you like to ask the librarian?” Let the buyer choose a tile. Switch to Staff reply and type the answer a librarian at their branch would give.',
      pilot: 'Which circulation desk would host the first QR, and who will check that card application choices match the branch?'
    },
    police: {
      title: 'Ask a non-emergency desk question',
      scene: 'A resident comes to the Hartford police front desk with a routine question. Invite the buyer to play the resident.',
      first: 'Tap Fingerprinting. Show the request on screen so a front-desk employee can read it.',
      buyer: 'Ask the buyer to start a different routine request with Parking Issue or Non-Emergency Line. As the employee, use Staff reply to offer your next question. Open Conversation to review both voices.',
      pilot: 'Would the lobby window or non-emergency service desk be the better place for a first QR? Who owns the counter wording?'
    },
    clinic: {
      title: 'Check in at a medical office',
      scene: 'A patient arrives at the Hartford medical office. Invite the buyer to play the patient at the front desk.',
      first: 'Tap Check In. Show the different requests for a scheduled visit, a walk-in or a change of appointment.',
      buyer: 'Ask “How can I help with your visit?” Let the patient choose Have appointment, Walk-in or Reschedule. Use Staff reply to acknowledge what they actually selected.',
      pilot: 'Which reception desk would try the QR first, and which check-in question would front-desk staff want on it?'
    },
    directory: {
      title: 'Find the right counter',
      scene: 'A visitor wants to call a nursing home before visiting. Let a buyer make the enquiry in their own words.',
      first: 'Set Conversation to By phone, search for Nursing Home, then open Nursing Home in the results. Show the buyer the choices for this call.',
      buyer: 'As the receptionist, ask “What can I help with?” Let the buyer choose Visiting hours or Check on resident. Use Staff reply to give a response and show the exchange in Conversation.',
      pilot: 'Ask the buyer which service counter and which recurring question to use for the first placement.'
    },
    bank: {
      title: 'Make a deposit at a teller window', place: 'chase',
      scene: 'At the Chase teller window, a customer wants to make a deposit. Invite the buyer to play the customer.',
      first: 'Tap Deposit. Point out that the customer can specify the kind of deposit and its destination.',
      buyer: 'As the teller, ask “What are you depositing?” Let the customer choose Cash or Check. Next ask “Which account?” and let them pick To my checking or To my savings.',
      pilot: 'Which teller window would try the QR and which transactions should the branch team walk through before placing it?'
    },
    grocery: {
      title: 'Ask at the seafood counter', place: 'big-y',
      scene: 'At Big Y, a shopper wants to compare seafood. Let the buyer make the choice.',
      first: 'Tap Fish / Seafood on the store board. Show the shopper the products and the questions they can ask the counter worker.',
      buyer: 'Ask “What would you like today?” Let the buyer choose Salmon, Cod or Help me pick. Respond as the counter worker and let them decide what to ask next.',
      pilot: 'Which staffed department would get the first QR, and who can check that its product choices match that counter?'
    },
    hotel: {
      title: 'Request an accessible guest room', place: 'delamar',
      scene: 'A guest arrives at Delamar Hotels. Invite the buyer to play the guest as you take the front-desk role.',
      first: 'Tap Check-in / out and show the guest the requests available during check-in.',
      buyer: 'Ask “What can I help with at check-in?” Let the guest choose I need an accessible room or Extra key cards for my family. Reply to the request the guest made.',
      pilot: 'Which reception desk should host a trial, and who can confirm how that property handles these requests?'
    },
    pharmacy: {
      title: 'Collect a prescription', place: 'cvs',
      scene: 'At a CVS pharmacy counter, someone is collecting a prescription. Invite the buyer to play the person picking it up.',
      first: 'Tap Pick up my prescription. Show where a person can ask for a dependent or identify a problem with the pickup.',
      buyer: 'Ask “How can I help with your pickup?” Let the buyer choose Pickup for a dependent or Bag is missing an item. Answer as the pharmacy employee and give them time to respond.',
      pilot: 'Ask the pharmacy team which pickup window and which routine questions to test with the first counter QR.'
    },
    dmv: {
      title: 'Replace a driver’s license', place: 'ct',
      scene: 'A driver visits the Connecticut DMV. Invite the buyer to play the driver and choose what needs to change.',
      first: 'Tap Licenses & ID. Point out the options for a lost license and an address change.',
      buyer: 'Ask “What do you need to do today?” Let the driver choose Replace a lost license or Change my address. Answer as the counter employee.',
      pilot: 'Which licensing window and service would help the branch evaluate its first QR placement?'
    },
    usps: {
      title: 'Choose postage at the counter', place: 'generic',
      scene: 'A customer wants stamps at a post office. Ask the buyer to choose the kind of postage.',
      first: 'Tap Buy stamps. Show the customer the individual stamp, book and postcard options.',
      buyer: 'Ask “Which stamps would you like?” Hand over the board so the customer can select One stamp, Book of 20 or Postcard stamps. Repeat their request back to them.',
      pilot: 'Which retail window should try the QR, and what other counter questions should that branch include?'
    },
    community: {
      title: 'Plan a bus trip at the transit desk', place: 'transit',
      scene: 'A rider asks a transit employee for help getting to a destination. Invite the buyer to play the rider.',
      first: 'On Public transportation, tap BUSES, then WHERE TO. The rider now has destination choices.',
      buyer: 'Ask “Where would you like to go?” Let the rider choose MY DOCTOR, WORK or another destination. Follow up as the transit employee.',
      pilot: 'Which transit information counter would use the first QR, and which destinations do riders there ask about?'
    },
    home: {
      title: 'Choose an activity at home',
      scene: 'A family member wants to decide how to spend the afternoon. Let the buyer make the choice.',
      first: 'On the TinkySpeak home board, tap WANT to open the activity choices.',
      buyer: 'Ask “What would you like to do?” Let the family member choose GO OUTSIDE, MUSIC or READ BOOK. If a new board opens, let them make the next choice too.',
      pilot: 'Which daily routine should the family try first? Decide where the board will be within reach and who will ask how it worked.'
    },
    school: {
      title: 'Choose lunch at school',
      scene: 'At school lunch, a student wants to tell an adult what they need. Invite the buyer to play the student.',
      first: 'Tap LUNCH on the School board. Show where the student can ask for food, a drink or help opening something.',
      buyer: 'Ask “What do you need at lunch?” Let the student pick WATER, HELP OPEN or another choice. Acknowledge their words and offer them the next turn.',
      pilot: 'Which lunch table or classroom would try this first, and who can check that students can reach the board?'
    },
    restaurants: {
      title: 'Build an order at the counter',
      scene: 'A customer is ready to order at Subway. Ask the buyer to choose their own meal.',
      first: 'From Restaurants & Drive-Thru, tap SUBWAY. Select a menu item and show the buyer Add to order. Add it so they can see how an order takes shape.',
      buyer: 'Close My order and ask “What else would you like?” Let the buyer pick another item, use Add to order, then choose Read order. Listen together as the items are read back.',
      pilot: 'Which ordering counter would try the first placement? Ask the manager to confirm the menu and which modifiers matter there.'
    },
    boards: {
      title: 'Find words for what hurts',
      scene: 'A communication partner wants a picture board that lets the person point to where something hurts. Ask the buyer to be the person choosing.',
      first: 'Use Find a board or topic to search for What Hurts. Open What Hurts and show the body-part tiles.',
      buyer: 'Ask “Can you show me where?” Give the buyer the board and let them choose HEAD, KNEE or another location. Repeat the selected message back to them.',
      pilot: 'Which existing board would your team try first, where would it be available, and who would collect feedback?'
    }
  };

  const node = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (className) item.className = className;
    return item;
  };

  function mount(host, venue, {showStep, plan}) {
    const scene = Object.hasOwn(tours, venue) && tours[venue];
    if (!scene) return () => {};
    const guide = node('section', '', 'ctour');
    guide.setAttribute('aria-label', 'Venue sales walkthrough');
    const head = node('div', '', 'ctour-head');
    const name = node('div');
    name.append(node('small', 'Guided sales demo'), node('h3', scene.title));
    const body = node('div', '', 'ctour-body');
    const fold = button('Hide guide', () => {
      body.hidden = !body.hidden;
      fold.textContent = body.hidden ? 'Show guide' : 'Hide guide';
      fold.setAttribute('aria-expanded', String(!body.hidden));
    });
    fold.setAttribute('aria-expanded', 'true');
    head.append(name,fold);
    guide.append(head,body);
    host.append(guide);
    let phase = 0;
    let disposed = false;

    function button(label, action, primary = false) {
      const item = node('button', label, primary ? 'ctour-primary' : '');
      item.type = 'button';
      item.addEventListener('click', () => { if (!disposed) action(); });
      return item;
    }
    function start() {
      showStep(scene.place ? {place:scene.place,board:'main'} : {});
      advance(1);
    }
    function advance(next) {
      phase = next;
      draw();
      body.querySelector('h4')?.focus({preventScroll:true});
    }
    function draw() {
      body.replaceChildren();
      if (!phase) {
        body.append(node('p',scene.scene), button('Start guided demo', start, true));
        return;
      }
      const title = node('h4', ['','Show the first request','Give the buyer a turn','Discuss a pilot'][phase]);
      title.tabIndex = -1;
      const actions = node('div', '', 'ctour-actions');
      if (phase === 1) {
        actions.append(button('Give the buyer a turn', () => advance(2), true));
      } else if (phase === 2) {
        actions.append(button('Discuss a pilot', () => advance(3), true));
      } else actions.append(button('Open pilot planner', plan, true));
      if (phase > 1) actions.append(button('Previous step', () => advance(phase - 1)));
      actions.append(button('Restart walkthrough', start));
      body.append(node('small', phase < 3 ? 'Step '+phase+' of 2' : 'Pilot discussion'), title,
        node('p', [null,scene.first,scene.buyer,scene.pilot][phase]), actions);
    }
    draw();
    return () => { disposed = true; guide.remove(); };
  }

  window.CareVenueTour = Object.freeze({mount});
})();
