export const fieldCourse = {
  id: 'first-week-in-the-field', category: 'sales-prospecting', title: 'Your First Week Selling TinkyTown',
  description: 'Walk into a real conversation, let the buyer try the board, and ask for a decision. Rehearse with a partner before the observed sales practical.',
  durationMinutes: 30,
  sections: [
    { id: 'prepare', title: 'Monday · Choose a desk and earn the first minute', steps: [
      'Pick three locations in your territory where staff answer questions in person. For each, check the address, published business contact, and contact preferences. Write one thing you actually know and one question only the staff can answer. Bring a working sample board and a way to show it without asking anyone for their phone.',
      'At a nursing home, speak with reception about visitor check-in. At a town hall or library, ask which counter gets the most questions. At a shop, ask the floor manager how a customer finds an item when speaking is difficult. A line of waiting customers is a reason to step aside.',
      'At the door: “Hi, I’m with TinkyTown. Is now a bad time for a quick question about the desk?” If they’re busy: “Of course. Is there a time the desk is usually quieter?” If they decline, thank them and leave. If there’s time, ask who works on the problem before asking who signs.',
    ] },
    { id: 'listen', title: 'Tuesday · Hear the buyer before reaching for the demo', steps: [
      'Ask, “Think of the last time somebody couldn’t tell you what they needed here. What did you both do?” Wait through the silence. Ask what worked, where either person got stuck, and how often it comes up. Keep personal or medical details out of your notes.',
      'Check what you heard: “So people can usually point to the sign, but it gets tricky when they need a different desk. Did I get that right?” Let them correct you. Then ask, “Is that something you’d want to change?” A buyer who describes a problem may still prefer their current approach.',
      'Before the call, take a breath, pick the one question you want answered, and say the opening aloud. Afterward, write the buyer’s actual answer. Have a partner repeat the call with a different answer. Listen for where your second question changes.',
    ] },
    { id: 'show', title: 'Wednesday · Put the board in the buyer’s hands', steps: [
      'Ask, “Would you try that with me? You be the visitor. I’ll be at the desk.” Use a fictional request on a board you have checked. Let them choose a tile on their phone or a shared device. Respond as staff, then ask, “What would happen next at your desk?”',
      'If the device or a phrase fails, say what happened. Ask how staff would help using the person’s preferred method. If the buyer asks about savings, ask what they measure today and agree on one observation they can compare during a pilot. Quote the current written terms when asked about cost.',
      'Try the same exercise with a librarian helping someone find a computer and with a care team helping a visitor find reception. Change the message, staff role and buying process for each. Keep the person using the board in control of the exchange.',
    ] },
    { id: 'decide', title: 'Thursday · Handle hesitation and ask for the decision', steps: [
      '“Just email me.” Try “Sure. What would make the email worth opening?” Confirm the recipient and what they requested. “We have picture boards.” Try “What does yours do well? Is there anything people still have trouble asking?” If they’re covered, thank them and close the conversation.',
      '“Too expensive.” Ask “Is the issue this year’s budget, or that you haven’t seen enough value at this desk?” If they need evidence, offer one agreed test. If there’s no budget, ask whether they want to revisit it in a particular month. A clear no ends the pitch.',
      'Ask for the smallest decision the buyer can make: “Would you like to try this at reception?” For a yes, agree the desk, staff owner, what they’ll look for and when they’ll review it. Ask who approves the terms. Use Contracts for the exact owner-approved offer and the intended signer’s private link.',
      'With the authorized buyer: “We agreed on the front desk. Here’s the written scope, price and timing. What would you like to go over? If this matches what you want, are you ready to sign?” Stop talking. If terms change, return the draft for approval. Let the signer review and sign for themselves. Verify the recorded signature before arranging the agreed handoff.',
    ] },
    { id: 'pipeline', title: 'Friday · Turn conversations into a repeatable week', steps: [
      'Start each workday in Today’s Plan. Do the follow-ups you promised, then work a short list of researched locations. End each visit by logging the outcome, the buyer’s words, the responsible person, and the agreed date or decline. A request for a brochure is a request for information.',
      'Practice note: “Library lead tried asking for a computer. Wants the desk team to test it. I’ll bring the board Thursday at 10. Branch manager reviews purchases.” After signature, confirm the copy, introduction to the site lead, first staff practice and review date. Ask about a second location only after the first team can describe what worked.',
      'Review each week with your coach. Count conversations with the right person, demos held, pilots agreed, and agreements signed for the same group of accounts. Six conversations and one held demo means revisit the other five call notes. Three demos and no pilot means ask what the buyers needed to see. Pick one change, rehearse it twice, and check what happens with the next group.',
    ] },
  ],
};

export const fieldExercise = {
  questions: [
    { id: 'door', prompt: 'People are lining up at reception as you arrive. What do you say?', options: ['“I’ll get the demo started while you help them.”', '“I can come back. Is there a quieter time, or should I leave it here?”', '“Who can sign today?”'], correct: 1, explanation: 'Let staff serve the people in front of them and choose whether to continue.' },
    { id: 'evidence', prompt: '“How much staff time will we save?” You have no data for this desk. What do you offer?', options: ['A typical percentage from a different site', 'A lower estimate to be conservative', 'Agree on a baseline and observe the same task in a small pilot'], correct: 2, explanation: 'The buyer can test an observable difference at their own desk.' },
    { id: 'value', prompt: '“We already have a board and it works for everyone who asks.” What comes next?', options: ['Ask whether any request still goes unmet and end the pitch if they are covered', 'Offer a discount to create interest', 'Ask to speak to someone else'], correct: 0, explanation: 'Their current method may meet the need. Respect their answer.' },
    { id: 'signer', prompt: 'The buyer is ready if you waive a fee in the approved agreement. What do you say?', options: ['“Sign now and I’ll fix it later.”', '“Let me get that change reviewed and bring you the revised terms.”', '“You can cross out that line.”'], correct: 1, explanation: 'The signer must see the approved version of the terms they agreed to.' },
    { id: 'close', prompt: 'The desk lead likes the demo. Purchasing signs. What belongs in the recap?', options: ['A signed account', 'An installation date you choose', 'The desk lead’s feedback, the purchasing contact and an agreed review date'], correct: 2, explanation: 'Record the commitment the buyer actually made.' },
  ],
  practice: [{ id: 'walk-in', prompt: 'Run a five-minute walk-in with a partner. Switch roles and repeat with a different buyer.', checklist: [
    'Ask permission, listen to the buyer’s example, and say it back in your own words.',
    'Let the buyer try one request and ask what they would change.',
    'Respond to an unexpected objection, then ask for a decision and wait.',
    'Draft a business-only note and read it back to the buyer. Include the decision owner and next date or the decision to stop.',
  ] }],
};

export const fieldRubric = [
  { id: 'permission', label: 'Opens briefly, asks permission and respects a refusal or a busy desk.' },
  { id: 'discovery', label: 'Gets a specific example, listens and checks the buyer’s meaning before pitching.' },
  { id: 'demo', label: 'Lets the buyer choose a message, answers as staff and offers another way to communicate.' },
  { id: 'objection', label: 'Clarifies the objection, uses approved terms and avoids unsupported savings, clinical or compliance claims.' },
  { id: 'decision', label: 'Asks for a signature from the authorized buyer on approved terms and accepts a no in the alternate ending.' },
  { id: 'handoff', label: 'Recaps the actual outcome, owner and date or decline, with a business-only CRM note.' },
];
