import { fieldCourse, fieldExercise } from './training-field-course.mjs';

const titleII = { title: 'DOJ · ADA Title II regulations, 28 CFR Part 35', url: 'https://www.ada.gov/law-and-regs/regulations/title-ii-2010-regulations/' };
const titleIII = { title: 'DOJ · ADA Title III regulations, 28 CFR Part 36', url: 'https://www.ada.gov/law-and-regs/regulations/title-iii-regulations/' };
const effectiveCommunication = { title: 'DOJ · ADA requirements for effective communication', url: 'https://www.ada.gov/resources/effective-communication/' };
const aging = { title: 'NIH National Institute on Aging · Memory problems, forgetfulness, and aging', url: 'https://www.nia.nih.gov/health/alzheimers-symptoms-and-diagnosis/do-memory-problems-always-mean-alzheimers-disease' };
const alzheimers = { title: 'NIH National Institute on Aging · Communicating with someone who has Alzheimer’s disease', url: 'https://www.nia.nih.gov/health/alzheimers-changes-behavior-and-communication/communicating-someone-who-has-alzheimers' };
const hearing = { title: 'NIH National Institute on Aging · Hearing loss in older adults', url: 'https://www.nia.nih.gov/health/hearing-and-hearing-loss/hearing-loss-common-problem-older-adults' };
const aphasia = { title: 'NIH National Institute on Deafness and Other Communication Disorders · Aphasia', url: 'https://www.nidcd.nih.gov/health/aphasia' };
const residentRights = { title: 'CMS · Nursing home resident rights and quality of care', url: 'https://www.cms.gov/about-cms/what-we-do/nursing-homes/patients-caregivers/rights-quality-care' };
const seniorCenters = { title: 'Administration for Community Living · Senior centers and supportive services', url: 'https://acl.gov/programs/community-inclusion-integration-and-access/senior-centers-and-supportive-services-older' };
const product = { title: 'TinkyTown · How the QR communication board works', url: 'https://tinkytown.com/' };
const liveKiosk = { title: 'TinkyTown · Live Healthcare kiosk', url: 'https://tinkytown.com/biz/healthcare' };

export const fieldTrainingCourses = [
  {
    id: 'ada-title-ii-and-iii', category: 'ada-compliance', title: 'ADA Title II, Title III, and Effective Communication',
    description: 'Recognize the organization’s obligations and help its accessibility lead evaluate a communication aid for a particular interaction.',
    durationMinutes: 25,
    sources: [titleII, titleIII, effectiveCommunication],
    sections: [
      {
        id: 'coverage', title: 'Identify who provides the service',
        steps: [
          'Title II covers state and local government programs, services, and activities. A senior center run by a town is an example. Verify the operator and who owns the program, especially when a service is delivered through a contractor.',
          'Title III covers qualifying places of public accommodation operated by private businesses and nonprofits. A privately operated healthcare facility may fall within Title III. Confirm the facts with the organization’s accessibility or legal lead before classifying an account.',
          'Ask who handles communication access requests, policy changes, staff training, and review of proposed tools. Record the responsible roles and the interaction the team wants to improve.',
        ],
      },
      {
        id: 'aids-and-modifications', title: 'Match the response to the interaction',
        steps: [
          'A reasonable modification may involve changing a usual rule or procedure, such as letting a visitor check in using a communication board when the ordinary process assumes spoken answers. An auxiliary aid or service helps the visitor exchange information. A board, qualified interpreter, real-time captions, or accessible written materials may be appropriate in different contexts.',
          'Ask how the person usually communicates and what they request. Consider the subject, detail, time involved, and setting. A short room-direction request and a discussion of medical consent call for different levels of support.',
          'Under Title II the organization gives primary consideration to the aid or service the person requests, subject to the applicable regulatory limits. Under Title III the organization should consult with the person when possible and provide a way to communicate effectively. Route decisions about exceptions and alternatives to the organization’s responsible lead.',
        ],
      },
      {
        id: 'rep-language', title: 'Present one possible aid and the staff workflow',
        steps: [
          'Say, “We can show how a visitor uses a board to ask for help finding an activity. How do you handle that request today, and what should staff do if the board cannot convey the person’s message?”',
          'Ask the lead to review the setup alongside the organization’s other communication options. Staff should know how to arrange qualified services when needed and how to protect privacy when sharing information.',
          'Document the demonstration and the participant’s feedback. Refer legal determinations and requests for a compliance guarantee to the organization’s qualified reviewers.',
        ],
      },
    ],
  },
  {
    id: 'aging-and-dementia', category: 'healthcare-sales', title: 'Communication in Aging and Dementia',
    description: 'Adapt the pace, environment, and wording to the person, including someone living with Alzheimer’s disease or another dementia.',
    durationMinutes: 22,
    sources: [aging, alzheimers, hearing, aphasia],
    sections: [
      {
        id: 'individual-needs', title: 'Recognize a communication need without diagnosing it',
        steps: [
          'Dementia involves changes in thinking or behavior that interfere with daily life. It can affect attention, understanding, or finding words, and each person’s experience differs. Age or a long pause gives a rep too little information to draw a conclusion about the person’s health.',
          'Hearing, vision, language, fatigue, background noise, and access to a device can also affect a conversation. Ask how the person would prefer to communicate and ask staff about the setting with the person’s permission.',
          'Aphasia can affect language expression, comprehension, reading, and writing, including after stroke. Give the person time to communicate in the way that works for them and involve the care team for clinical questions.',
        ],
      },
      {
        id: 'communication-adjustments', title: 'Try respectful, simple adjustments',
        steps: [
          'Introduce yourself, address the person directly, and use your usual adult tone. Reduce competing voices or background sound where practical. Offer a clear view of your face and the board if the person wants it.',
          'Use one idea or question at a time. Pause to let the person respond. Rephrase if needed and offer two clear choices or a yes-or-no question when helpful. Make room for the person to decline, correct you, or give a different answer.',
          'Offer the person their preferred communication method, such as speech, gesture, writing, pictures, or their own device. Check your understanding with them and pause the demonstration if they want to stop.',
        ],
      },
      {
        id: 'observe-and-report', title: 'Describe what worked in the setting',
        steps: [
          'Choose a familiar task, such as finding the activities room or asking for a quieter place. Show one brief example and let the participant try it at their pace.',
          'Keep the business note focused on the setup and observations. A useful example is, “The participant preferred to read the prompt and select a picture in a quieter room.” Let the care team handle clinical documentation.',
        ],
      },
    ],
  },
  {
    id: 'ethical-care-communication', category: 'healthcare-sales', title: 'Dignity, Privacy, and Ethical Communication',
    description: 'Run a respectful walkthrough, represent the product accurately, and record only the information the Sales team needs.',
    durationMinutes: 18,
    sources: [residentRights, alzheimers, effectiveCommunication],
    sections: [
      {
        id: 'participation', title: 'Offer a choice to participate',
        steps: [
          'CMS describes dignity, choice, and privacy as resident protections in Medicare- or Medicaid-certified nursing homes. Follow the facility’s participation, privacy, and staff procedures before involving anyone in a walkthrough.',
          'Explain what you are showing in plain language. Ask if the person wants to try, address them directly, and include a companion when the person wants their help. Respect a pause or a refusal and offer to continue with staff using a fictional scenario.',
          'Use fictional names and circumstances on demo boards. Obtain the facility’s approval and the required permissions before any recording or photography. Keep resident identifiers, clinical details, and care notes in the facility’s approved systems.',
        ],
      },
      {
        id: 'accurate-claims', title: 'Describe the demonstration accurately',
        steps: [
          'Describe what the device and staff did during the walkthrough. For example, “They selected a phrase, the board displayed it, and the receptionist confirmed what help they wanted.”',
          'Use observed results and approved product documentation for statements about features. Refer requests about clinical outcomes, privacy terms, or accessibility determinations to the person authorized to answer.',
          'In outreach, use the verified work contact and their role. Ask about a process without repeating a reviewer’s sensitive story. Record a request to stop outreach and follow the workspace’s contact preferences.',
        ],
      },
    ],
  },
  {
    id: 'tinkytown-tinkyspeak-workflow', category: 'product-training', title: 'TinkyTown and TinkySpeak in a Real Conversation',
    description: 'Show the QR-to-board workflow, offer a kiosk or another access option, and practice the staff response.',
    durationMinutes: 20,
    sources: [product, liveKiosk, effectiveCommunication],
    sections: [
      {
        id: 'counter-workflow', title: 'Walk through a service counter request',
        steps: [
          'TinkyTown places a communication board at a service location. Scan the location’s QR code with the phone camera to open a browser board. Select a picture-and-word tile and let the device display or speak the phrase.',
          'Explain that the board uses augmentative and alternative communication, or AAC, to help someone express a message. TinkySpeak includes tools for creating and using tile-based communication boards. Ask which location, phrases, devices, and languages the organization wants to verify during a demo.',
          'Ask staff to speak directly to the visitor, confirm the meaning, and respond to the request. If the visitor prefers another aid or the board cannot express the message, follow the facility’s communication support process.',
        ],
      },
      {
        id: 'demo-options', title: 'Test the phone and shared-device routes',
        steps: [
          'In Sales team, open Demo and select Open live customer kiosk. Choose Nursing Home on the Healthcare board, tap one visitor message and listen to how it plays.',
          'Select Listen for Staff. Have a teammate say a short practice reply. Review the suggested tiles and let the visitor choose their own response. Try the typed option if the browser cannot listen.',
          'At a site with a kiosk, show how a visitor can reach the board on the shared device. Try the actual phone, browser, language, and audio output before a site review. Offer a staff-supported option when a visitor has no usable phone or asks for another method.',
          'Rehearse bedside and rehabilitation scenarios with the TinkyStroke walkthrough. When presenting to a specific facility, use its issued QR and confirm the actual board and access options in that setting.',
        ],
      },
      {
        id: 'staff-handoff', title: 'Agree on the next check at the site',
        steps: [
          'Pick one desk or care setting, one representative message, and a staff point person. Verify where the QR sign or shared device would be placed and how someone can get help there.',
          'Ask the point person to describe what staff will do after receiving a message and when they should switch to another communication method. Record the agreed review date and the setup they will test.',
        ],
      },
    ],
  },
  {
    id: 'sell-to-senior-centers-and-nursing-homes', category: 'sales-prospecting', title: 'Sell to Senior Centers and Nursing Homes',
    description: 'Find a concrete use case, speak with the right roles, and move an interested location toward a bounded pilot or agreement review.',
    durationMinutes: 25,
    sources: [seniorCenters, residentRights, effectiveCommunication],
    sections: [
      {
        id: 'senior-centers', title: 'Start with a senior center’s services',
        steps: [
          'Find the center’s operator and published programs. Community senior centers may coordinate activities, meals, education, transportation, and other services. Pick a published program such as meal check-in or transportation questions to anchor discovery.',
          'Start with the center director or program coordinator. Ask who handles accessibility requests, who works at the desk, and who approves a trial or procurement. In a municipally operated program, ask how the town’s accessibility lead participates.',
          'Try this opening: “How does someone check in for lunch or ask about a ride if speaking at the desk is difficult? Would it help to walk through one example with your front-desk team?”',
        ],
      },
      {
        id: 'nursing-homes', title: 'Start with a nursing home’s actual workflow',
        steps: [
          'Confirm the facility address and leadership in the directory and public sources. Ask the administrator about sponsorship and approval. Include the activities lead, reception supervisor, nursing lead, or speech-language pathologist according to the use case.',
          'Try this opening: “When a resident wants to make an everyday request, how do they usually tell the team? Could we show one communication board and hear what would fit your workflow?”',
          'Ask where a board would be used, what residents already use, who could support it, and how a resident can decline or request another aid. Demonstrate with sample data and leave clinical decisions to the appropriate care team.',
        ],
      },
      {
        id: 'next-step', title: 'Set a pilot goal and agree on ownership',
        steps: [
          'Suggest one location, one task, and a named staff contact. Agree on what the team wants to observe, such as whether a participant can express a request and staff can confirm it using a chosen method.',
          'Confirm who reviews accessibility, privacy, purchasing, and written terms. Use the calendar to arrange a walkthrough if the prospect agrees. Save the requested follow-up in Pipeline.',
          'At the agreed review, report what was actually observed. If the facility wants to proceed, record the decision-maker and hand off the terms through the contract workflow.',
        ],
      },
    ],
  },
];

const question = (id, prompt, options, correct, explanation, line, delivery) => ({ id, prompt, options, correct, explanation, line, delivery });
const practice = (id, prompt, checklist) => ({ id, prompt, checklist });

export const trainingCourseExercises = {
  [fieldCourse.id]: fieldExercise,
  'sales-onboarding': {
    questions: [
      question('first-step', 'You find a facility that may be a fit. What is the next step before outreach?',
        ['Send the same introduction to everyone shown', 'Confirm the address, your scope, and the role relevant to the workflow', 'Move the facility straight to contract review'],
        1, 'Verifying the site and role gives you a specific person and reason to contact.',
        "Have I reached the front desk on Maple Street? Who looks after visitor check-in there?", "Use the verified street name. Ask for the role before asking for someone’s time."),
      question('show-one-use', 'How should you start a short demonstration?',
        ['Show the longest board in the product', 'Walk through the entire settings menu', 'Choose a task the facility named and show one related message'],
        2, 'A task the facility recognizes lets staff decide whether the interaction fits.',
        "You mentioned visitors asking where to check in. Want to try that one with me?", "Use their example and put the board within their reach."),
      question('next-action', 'A director asks to revisit the demo next Tuesday. What should the CRM show?',
        ['The conversation outcome and a dated follow-up', 'A signed agreement', 'A new duplicate record for the same facility'],
        0, 'Log what happened and set the date the director requested so the next rep can follow through.',
        "Tuesday works. What would you like me to bring back for you?", "Pause for the answer, then log what you agreed and when."),
    ],
    practice: [practice('prospect-to-next-step', 'Role-play a first meeting with a teammate acting as a community center director.',
      ['Use one verified public program or fictional practice scenario.', 'Show one message and ask how it fits the center’s process.', 'Write a sample CRM note with one agreed action, owner, and date.'])],
  },
  'qualify-directory-prospects': {
    questions: [
      question('match-location', 'Two facilities share a name. Which evidence resolves the match?',
        ['Verified street address and matching facility source', 'The order of the search results', 'The state alone'],
        0, 'Match the actual service location and source before saving or contacting a business.',
        "Is this the Oak Street location or the one across town?", "Use the two actual addresses from the listings, then check the source."),
      question('verify-role', 'A search result lists a former administrator. What should you do?',
        ['Record them as current administrator', 'Email every address with the same last name', 'Check the employer’s current listing or confirm the role through the facility'],
        2, 'Use current evidence connecting the role to the exact facility.',
        "Who’s handling admissions at this location now?", "Ask neutrally. Give staff room to correct an old name."),
      question('no-direct-email', 'When only a main number is published, what can you do?',
        ['Infer a private email pattern', 'Ask the facility who handles the workflow and use confirmed work details', 'Mark the administrator as contacted'],
        1, 'Use the published business channel and wait for confirmation of the relevant role.',
        "I have the main number. What’s the best work contact for the person who runs your desk?", "Write down the route they give you and verify it before sending."),
    ],
    practice: [practice('qualify-one-record', 'Research one facility in your territory or use a fictional facility with a sample listing.',
      ['Check its exact name, address, and source.', 'Identify a relevant role and how you would confirm it.', 'Draft a question about one facility workflow.'])],
  },
  'tinkystroke-demo': {
    questions: [
      question('demo-scenario', 'Which demo setup fits a conversation about communication during stroke rehabilitation?',
        ['Hospital reception with a visitor wayfinding prompt', 'TinkyStroke with the rehab setting and one routine request', 'An agreement signature walkthrough'],
        1, 'Use the rehab scenario in TinkyStroke to demonstrate a request relevant to the setting.',
        "Let’s try the rehab board. Imagine you want a break. How would you tell me?", "Set the scene in one sentence and hand control to the participant."),
      question('display-speech', 'Speak on tap is off. What should happen after you choose a tile?',
        ['The board exits the session', 'You must open another board to see the message', 'The phrase appears and you can choose Speak'],
        2, 'Selected message shows the phrase. Speak plays it when the participant is ready.',
        "There’s the phrase you picked. If it looks right, tap Speak when you’re ready.", "Point once and wait. Let the participant decide when to play it."),
      question('confirm-preference', 'What is the next step after showing switch scanning?',
        ['Ask the participant which interaction they prefer', 'Enable it as the default for everyone', 'Assume the participant wants their caregiver to select the tiles'],
        0, 'The participant’s preference and the actual task guide which setup to try.',
        "Which felt easier for you, tapping the picture or choosing it as it lit up?", "Accept their preference, including a different method."),
    ],
    practice: [practice('rehab-walkthrough', 'Show a fictional rehab participant how to express one everyday need.',
      ['Read the prompt and point out Selected message.', 'Demonstrate one access option and let the participant choose the method.', 'Describe what was shown without making recovery or clinical claims.'])],
  },
  'hospital-reception-demo': {
    questions: [
      question('route-request', 'Which request fits a first reception walkthrough?',
        ['Ask how to find an outpatient desk', 'Review the risks of a medical procedure', 'Authorize a clinical referral'],
        0, 'A directions request illustrates the reception workflow with a bounded message.',
        "Suppose you’re here for an outpatient appointment. What would you ask the person at reception?", "Pick one everyday request the desk can answer."),
      question('after-speaking', 'What should reception staff do when a board speaks a visitor’s request?',
        ['Assume the device took care of the request', 'Address the visitor, confirm the meaning, and respond', 'Answer only the person who accompanied them'],
        1, 'Effective interaction includes the staff response and gives the visitor a chance to correct the message.',
        "You’re looking for outpatient check-in. Have I got that right?", "Address the visitor, wait for confirmation, then give the directions."),
      question('no-smartphone', 'The visitor doesn’t have a phone they can use. What should the walkthrough cover?',
        ['A promise that everyone will scan a QR code', 'A requirement that the visitor bring a device next time', 'A reachable shared device or the facility’s staffed communication option'],
        2, 'The placement and fallback need to work for visitors with different device access.',
        "Would you like to try the desk screen, or would you rather I help another way?", "Offer both routes in the same matter-of-fact tone."),
    ],
    practice: [practice('reception-response', 'Role-play a visitor asking for directions at a reception desk.',
      ['Select and play a sample message.', 'Have a teammate confirm the meaning and answer it as the receptionist.', 'Give the visitor a usable option without a smartphone.'])],
  },
  'senior-care-discovery': {
    questions: [
      question('start-discovery', 'What makes a useful first discovery question?',
        ['“Our tool will improve everything. Who signs?”', '“How does a resident express an everyday request today?”', '“How many people have a particular diagnosis?”'],
        1, 'Ask about the actual process and one moment you can discuss or demonstrate.',
        "Think about yesterday. When someone wanted something during activities, how did they let staff know?", "Ask for one ordinary example, then listen for the part that was difficult."),
      question('review-sample', 'A public review mentions unanswered requests. How can it inform discovery?',
        ['Ask generally how requests are acknowledged and routed', 'Treat the review as a verified incident and confront staff', 'Quote the reviewer’s account in a mass email'],
        0, 'A review theme can prompt a process question. Its sample cannot establish what happened in a particular case.',
        "When someone asks for help here, how do they know the right person heard them?", "Stay curious about their process and leave individual reviews out of the conversation."),
      question('right-attendees', 'Who should be invited to a routine resident-request walkthrough?',
        ['Only the person who prepares the purchase order', 'Everyone from the directory listing', 'The people who run the workflow and the person who will review the next step'],
        2, 'The right participants can explain what staff and residents do and how the facility evaluates a change.',
        "Who’s usually there when that happens? Who else would need to see it before you could try a change?", "Find both the person doing the work and the person who reviews it."),
    ],
    practice: [practice('discovery-interview', 'A nursing home asks for a conversation about everyday requests.',
      ['Ask how the resident communicates the request now.', 'Ask who receives it and what happens after receipt.', 'Reflect the process back and arrange one next step only if the facility agrees.'])],
  },
  'facility-demo-follow-up': {
    questions: [
      question('write-recap', 'Which recap provides observable evidence from a demo?',
        ['“The facility’s process is solved.”', '“Everyone saw value.”', '“We used the reception board to ask for directions and staff confirmed the requested destination.”'],
        2, 'A useful recap states the scenario, what was observed, and any agreed next step.',
        "You used the board to ask for directions, and the receptionist checked where you wanted to go. Does that match what you saw?", "Invite a correction before putting the observation in writing."),
      question('quick-email', 'What happens when Quick Email prepares introductions?',
        ['Editable drafts are prepared for eligible contacts', 'All messages are automatically sent', 'A contract is issued to the facility'],
        0, 'Quick Email prepares drafts. Review the addressee and each message before using a separate email action.',
        "I’ll draft a short note about that example. Which work address should I use?", "Check the recipient and wording in the draft before using the send workflow."),
      question('schedule-owner', 'Which follow-up belongs in the CRM?',
        ['“Maybe later” with no owner or date', '“Sam will confirm a reception review with the program lead by Thursday.”', 'A duplicate prospect for the demo attendee'],
        1, 'A named action with a date lets the next person act without guessing.',
        "I’ll check with the program lead by Thursday. What do you need me to find out?", "Agree on one owner and date while the buyer is still there."),
    ],
    practice: [practice('sendable-draft', 'Draft a follow-up to a fictional attendee who wants a second walkthrough.',
      ['Use a short subject and address the person by their role or fictional name.', 'Recap only what the audience observed and one question they raised.', 'Include a requested date and save the text as a practice draft.'])],
  },
  'accessible-communication-discovery': {
    questions: [
      question('ask-directly', 'Who should you ask first about how the participant prefers to communicate?',
        ['The participant, using a method they can access', 'The first staff member you see', 'The equipment vendor'],
        0, 'Start with the person using the aid and include other people when the participant wants their help.',
        "How would you like us to talk through this together?", "Address the participant first and wait for their own answer."),
      question('access-review', 'What evidence helps the facility review an access option?',
        ['The number of product settings', 'The scenario, setup tested, and participant’s feedback', 'An assurance that the device works for any visitor'],
        1, 'The facility needs the actual task, participation, and observations to evaluate what works in context.',
        "You tried the larger tiles on the desk tablet. What felt easier, and what was still awkward?", "Use their description in the recap so the reviewer knows what was tried."),
      question('legal-review', 'Who decides whether a proposed setup meets the facility’s obligations?',
        ['The rep who builds a demo board', 'The most senior person in the CRM list', 'The organization’s authorized accessibility or legal lead'],
        2, 'The rep provides specific information from a walkthrough for the organization’s review.',
        "I can show you exactly what worked in this example. Who on your team should review how it fits your requirements?", "Offer evidence and route the determination to the authorized reviewer."),
    ],
    practice: [practice('requirements-brief', 'A participant says that holding a phone and tapping small tiles is difficult.',
      ['Ask which device or input method they prefer.', 'Offer one relevant setup to try and record their feedback.', 'Write the observation and the question for the facility’s reviewer.'])],
  },
  'accessibility-demo-check': {
    questions: [
      question('pointer-dwell', 'How does pointer dwell select a tile?',
        ['Press and hold Escape', 'Move the pointer over the tile and hold it there', 'Choose a tile after ending the conversation'],
        1, 'Dwell uses time over a tile to select it when the option is enabled.',
        "Move the pointer over the picture you want and hold it there. Want to give it a try?", "Show the movement once, then let them control the pointer."),
      question('switch-scan', 'While switch scanning is active, how do you choose the highlighted tile in the demo?',
        ['Press Space or Enter', 'Turn on Speak on tap', 'Press Escape'],
        0, 'Space and Enter activate the highlighted tile. Escape stops scanning.',
        "Watch for the choice you want. When it lights up, press Space or Enter.", "Stop speaking while they follow the highlight."),
      question('reproduce-issue', 'What should a rep include when a demo option was hard to use?',
        ['A clinical assumption about the participant', 'The participant’s private care history', 'The device, browser, option, and action that caused difficulty'],
        2, 'These details let a reviewer reproduce the problem and keep the report focused on the setup.',
        "Which device and browser were you using? Show me the step where it stopped working for you.", "Capture the setting and action so someone else can reproduce the issue."),
    ],
    practice: [practice('compare-access-options', 'Run the same sample request through two input methods in the demo.',
      ['Try a method with larger tiles or pointer dwell.', 'Try switch scanning and stop it after the sample message.', 'Record which setup the participant preferred and one reason.'])],
  },
  'pipeline-follow-ups': {
    questions: [
      question('stage-is-fact', 'When should a rep advance a stage?',
        ['After the corresponding event actually occurs and is recorded', 'Whenever a draft is generated', 'Whenever the rep opens Today’s Plan'],
        0, 'The stage reflects the known outcome, so it should follow the actual activity.',
        "So today we agreed to a demo. The agreement is still with purchasing. Is that right?", "Record the two events separately and advance only the stage that happened."),
      question('correct-record', 'What should you verify before logging a call for a business with several branches?',
        ['The ZIP code of the sales office', 'The contact, address, and prospect record for the branch you called', 'The date the CRM was created'],
        1, 'Check the business location and contact so the history stays on the correct record.',
        "Before I save our call, this was the North Street branch, right?", "Check the actual address and contact against the open record."),
      question('dated-action', 'Which note is actionable for a teammate?',
        ['“Interesting”', '“Call sometime”', '“Jordan will confirm the May 6 demo time with the activities director by May 2.”'],
        2, 'The action, person responsible, and date give a teammate clear follow-through.',
        "I’ll confirm the time with the activities director by Friday. Who should get the confirmation?", "Write the calendar date, responsible person and specific follow-up."),
    ],
    practice: [practice('record-practice-call', 'In a practice record or on paper, document a call about scheduling a demonstration.',
      ['Record who spoke and the actual outcome.', 'Use the matching stage and a dated next action.', 'Review the record for the right organization, address, and date.'])],
  },
  'booking-and-contracts': {
    questions: [
      question('booking-details', 'Before sharing a booking link, what should you verify?',
        ['The director’s contact photo', 'A signed agreement for every appointment', 'Your published availability, relevant meeting type, and client access to the address'],
        2, 'Verify that the client can open the booking page and choose the right meeting.',
        "Would ten minutes with the desk team work? What time zone should I use for the invite?", "Verify that a client can open the published booking link and select that appointment."),
      question('before-prepare', 'What should you check before preparing an agreement?',
        ['The organization, signer authority, business email, and approved terms', 'Only the organization’s logo', 'Only whether a rep completed the training'],
        0, 'The agreement must match the business, authorized signer, and terms.',
        "Which organization name goes on the agreement, and who is authorized to sign for it?", "Read back the signer’s work address and check the approved scope and terms."),
      question('confirm-signature', 'What shows that the agreement is signed?',
        ['The link was copied', 'The contract record shows a signature and offers the signed agreement', 'The prospect opened an email draft'],
        1, 'Use the signature status and the signed agreement record as evidence.',
        "I’ll check the signed copy in Contracts. Once it’s there, who should I introduce to the setup team?", "Distinguish a sent link from a recorded signature."),
    ],
    practice: [practice('demo-agreement-rehearsal', 'Rehearse a future demo booking and agreement review with a teammate.',
      ['Agree on a meeting type, local time, and attendees in the exercise.', 'Locate the saved terms and signer fields on a practice agreement.', 'Explain where a real signature and downloadable copy will appear.'])],
  },
  'ada-title-ii-and-iii': {
    questions: [
      question('title-ii', 'Which ADA title ordinarily applies to a senior center run directly by a municipality?',
        ['Title I', 'Title II', 'Title III'],
        1, 'Title II applies to the programs, services, and activities of state and local governments.',
        "Does the town run this center directly? Who handles access requests for the program?", "Confirm the operator and bring the town’s reviewer into the conversation."),
      question('title-iii', 'Which setting is an example to check for Title III public-accommodation coverage?',
        ['A state-operated recreation program', 'The town department that operates a senior center', 'A privately operated healthcare facility serving patients'],
        2, 'Title III applies to qualifying public accommodations operated by private businesses or nonprofits. Verify coverage with the organization.',
        "Who operates this facility, and who reviews communication access for visitors here?", "Verify the organization and refer coverage questions to its reviewer."),
      question('primary-consideration', 'A person requests a particular aid for a town program. How should the town start?',
        ['Give primary consideration to the person’s requested aid', 'Use its newest device for all visitors', 'Send the request directly to a sales agent to decide'],
        0, 'Under Title II the public entity gives primary consideration to the person’s request, subject to the applicable limits.',
        "What way of communicating have you asked the town to provide?", "Let the person finish. Connect them with the town staff responsible for the request."),
      question('different-context', 'A board helped with directions. What should staff do when the same visitor needs a complex discussion?',
        ['Assume the directions result covers the new task', 'Check the person’s preferred method and arrange support suited to the new conversation', 'Ask the visitor to use only a short phrase'],
        1, 'The choice of aid depends on the person and on the content, complexity, length, and setting of the exchange.',
        "That worked for directions. For this conversation, how would you prefer to communicate?", "Pause the board demonstration while staff arrange appropriate support."),
      question('accurate-pitch', 'Which sales statement reflects the rep’s role?',
        ['“Installing this board makes the whole facility compliant.”', '“The device replaces every other auxiliary aid.”', '“We can test one interaction with your team and document it for your accessibility reviewer.”'],
        2, 'A sales demo can show a bounded workflow and inform the covered entity’s decision.',
        "Would it help if we tried one visitor question and wrote down what happened for your accessibility lead?", "Sound confident about the specific demonstration you can provide."),
    ],
    practice: [practice('town-access-request', 'A town senior center asks about meal check-in after a participant requests a different communication method.',
      ['Identify Title II and name the town role that should handle the request.', 'Propose one process change and one aid to discuss with the participant.', 'Explain how staff will arrange another method when the example board is insufficient.', 'Write a brief description of what the rep can demonstrate and who will review it.'])],
  },
  'aging-and-dementia': {
    questions: [
      question('avoid-assumption', 'A visitor takes time to find a word. What is a useful first response?',
        ['Pause and ask how they prefer to communicate', 'Assume they have dementia', 'Answer on their behalf'],
        0, 'Give the person time and ask their preference. Communication difficulty has many possible causes.',
        "Take your time. How would you like to tell me?", "Leave a real pause. A slow answer is still the person’s answer."),
      question('busy-room', 'Several people are talking while a participant tries to answer. What could you try?',
        ['Speak very loudly', 'Ask another three questions quickly', 'Offer to reduce background noise and use one clear question at a time'],
        2, 'A quieter setting and a single prompt can make an exchange easier to follow.',
        "It’s loud in here. Would you like to move somewhere quieter?", "Ask one question and wait before offering another choice."),
      question('include-person', 'A companion interrupts a participant who is choosing a message. What should you do?',
        ['Direct all remaining prompts to the companion', 'Ask the participant whether they want assistance and give them time', 'Select a message for the participant and move on'],
        1, 'The person should remain included and decide when they want help.',
        "Would you like some help choosing, or would you like a moment?", "Direct the question to the person choosing. Follow their lead."),
      question('honor-no', 'The participant says they want to stop the demo. What happens next?',
        ['Stop and offer to brief staff using a fictional example if appropriate', 'Continue until the participant makes one selection', 'Ask the companion to approve continuing'],
        0, 'Respect the participant’s decision. Staff can still review a fictional demonstration when appropriate.',
        "Of course. We’ll stop here. Thank you for trying it with me.", "Put the device away. Discuss a fictional staff example separately if appropriate."),
      question('business-note', 'Which note belongs in the sales record?',
        ['A list of residents’ diagnoses', 'A recording of an individual care discussion', 'A general observation that the participant preferred a quieter room and a picture choice'],
        2, 'Record the relevant access setup and observation while leaving clinical details with the care team.',
        "I heard that the quieter room and the picture choices worked better for you. Did I get that right?", "Keep the business note to the setup and what the participant reported."),
    ],
    practice: [practice('quieter-choice', 'Role-play a participant losing track of a question in a loud activities room.',
      ['Offer a quieter spot or fewer competing voices.', 'Introduce one prompt and wait for the participant’s reply.', 'Offer a plain-language rephrase or two choices with room for another answer.', 'Confirm the chosen response with the participant.'])],
  },
  'ethical-care-communication': {
    questions: [
      question('photo-request', 'A manager asks you to film a participant during a practice walkthrough. What should you do first?',
        ['Record a short clip and ask afterward', 'Check facility approval and obtain the required permissions before recording', 'Upload it to sales chat because the team is internal'],
        1, 'Recording requires the applicable facility process and permissions. Sample staff role-play is available for a demo.',
        "Let’s put the camera away for now. Who handles permission for filming here?", "Follow the facility process and obtain the required permissions before recording."),
      question('claim-evidence', 'Which follow-up accurately describes a successful demo interaction?',
        ['“The technology guarantees better care.”', '“All users at this facility will do well.”', '“In the demo the participant chose a phrase and staff confirmed its meaning.”'],
        2, 'Describe the workflow and observed result, then leave clinical or compliance assessments with the designated reviewers.',
        "You chose a message and the staff member checked what you meant. Would you use that at this desk?", "Invite the buyer’s judgment. Keep your claim to the exchange they saw."),
      question('personal-information', 'What should you type into a sales practice board?',
        ['A fictional example', 'A resident’s clinical record', 'A participant’s name and health history'],
        0, 'Use fictional details for practice and keep care information in the facility’s approved systems.',
        "Let’s use a made-up visitor who wants directions. What would the desk say back?", "Practice the workflow without entering anyone’s personal information."),
      question('outreach-preference', 'A verified work contact asks for no more outreach. What should you do?',
        ['Change the subject line and try again', 'Record the request and follow the workspace’s contact preference controls', 'Route the same message to their personal email'],
        1, 'Respect the request and maintain an accurate record so other reps can honor it.',
        "Understood. I’ll record that you’ve asked us to stop contacting you.", "End the pitch and record the request in the contact controls."),
      question('dignity', 'Who should answer a question about a resident’s preference when the resident wants to participate?',
        ['Only the administrator', 'Only the companion', 'The resident, with assistance they request if appropriate'],
        2, 'Address the resident directly and support their participation and choices.',
        "Which would you like to try? We can bring someone in to help if you’d like.", "Give the person time to choose how they participate."),
    ],
    practice: [practice('privacy-respecting-demo', 'A staff member offers to show a real resident’s chart to make the demo more relevant.',
      ['Offer a fictional scenario based on the general workflow.', 'Ask how the facility handles participant permission and preferences.', 'Write a sample CRM note with workflow-level observations only.'])],
  },
  'tinkytown-tinkyspeak-workflow': {
    questions: [
      question('board-steps', 'Which sequence describes a visitor using a TinkyTown QR board?',
        ['Scan the QR, open the browser board, select a tile, and display or speak the message', 'Enter a medical history and wait for a diagnosis', 'Download a contract and choose an appointment'],
        0, 'The QR opens a tile-based communication board in the browser for that setting.',
        "Scan this code, pick the picture you want, then show me the words or play them aloud.", "Let the person do each step at their own pace."),
      question('where-tool-fits', 'Which flow should you use to walk through a bedside conversation after stroke?',
        ['A QR sign for a town-hall tax counter', 'TinkyStroke in the appropriate setting', 'The contracts tab'],
        1, 'TinkyStroke has distinct bedside and rehabilitation practice scenarios.',
        "For a bedside conversation, let’s open TinkyStroke. What everyday request should we try?", "Choose the care setting and a fictional example with staff."),
      question('message-confirm', 'A tile speaks a phrase the visitor did not mean. What is the best next step?',
        ['Assume it was their choice and act on it', 'Restart the whole product without asking', 'Invite the visitor to correct it or use their preferred alternative'],
        2, 'Confirm the person’s intended meaning and give them a way to correct or complete their message.',
        "I may have misunderstood. Would you like to pick another message or tell me a different way?", "Stop acting on the first message until the person confirms it."),
      question('verify-setup', 'What should a rep verify before relying on a board for a site demonstration?',
        ['Phone or kiosk access, chosen language, input method, and audio in that environment', 'Only that the QR sign looks bright', 'Only the number of categories available'],
        0, 'Testing the actual device, access, and environment confirms that the demo setup works as described.',
        "Can we try it on the device and in the language your visitors would actually use?", "Check the input, volume and location together before promising a demo there."),
      question('next-step', 'What makes a useful handoff after showing the counter setup?',
        ['A promise that people can always use the board', 'One scenario, one staff point person, a fallback method, and a review date', 'A request to install it at every location at once'],
        1, 'A bounded handoff helps staff test and report where the tool helps and where another method is needed.',
        "Which desk should we try first, who’ll be there, and when should we review how it went?", "Agree on a fallback for anyone who wants to communicate another way."),
    ],
    practice: [practice('qr-and-kiosk', 'Rehearse a community center visitor asking where to check in for lunch.',
      ['Trace the QR-to-browser steps using an available demo board or describe them to a teammate.', 'Play or display one message and have a staff role-player confirm it.', 'Show a shared-device or staffed option for a person who cannot use the QR.', 'State what will be tested with the facility and who will own the review.'])],
  },
  'sell-to-senior-centers-and-nursing-homes': {
    questions: [
      question('center-sponsor', 'Who is a sensible first contact for a community center’s program check-in workflow?',
        ['An unrelated hospital department', 'The center director or program coordinator', 'Every person found in a directory'],
        1, 'The director or coordinator can describe the program and identify accessibility, desk operations, and approval roles.',
        "Who coordinates the lunch program? I’d like to ask how people check in.", "Use a program the center actually offers and ask for the right role."),
      question('nursing-fit', 'Who should be involved in evaluating an activities-room communication example?',
        ['Only a purchasing inbox', 'A reviewer who never works with activities', 'The administrator or sponsor and staff who run the activity and support participants'],
        2, 'Include the people who run the workflow and the people who can review or approve a test.',
        "Who runs the activity, and who would decide whether to try the board in that room?", "Bring the staff who know the routine into the same discussion as the sponsor."),
      question('pilot-measure', 'Which goal fits a small test?',
        ['Observe whether a person can indicate one everyday request and staff can confirm it', 'Guarantee fewer hospital admissions', 'Prove facility-wide ADA compliance'],
        0, 'Use a specific, observable interaction within the scope of the trial.',
        "If a visitor could ask for directions and the desk could confirm where they want to go, would that be worth testing?", "Let the buyer define what a useful trial would show."),
      question('reception-opening', 'What should a rep lead with in an introduction?',
        ['A compliance scare and a request to buy today', 'A reference to a verified program and a question about one communication moment', 'A price quoted from an unrelated project'],
        1, 'Ground the introduction in something the organization actually does and invite it to describe the process.',
        "I saw you offer a shuttle. When someone needs a ride but can’t easily ask, what happens at this desk?", "Use a verified service and listen before showing anything."),
      question('review-terms', 'The facility wants to proceed after a trial. What should you confirm?',
        ['That all trial participants get an email', 'That a sales stage has been changed to active', 'The authorized signer, terms review, and handoff owner'],
        2, 'Proceed through the facility’s approval and signing process with the correct person and terms.',
        "Does the written pilot cover what we agreed? If it does, are you ready to sign, or should someone else review it?", "Ask once. Wait for the authorized buyer’s answer before discussing setup."),
    ],
    practice: [practice('two-segment-pitches', 'Prepare a brief opening for a municipal senior center and another for a nursing home.',
      ['Name the operator, a relevant first contact, and one task for each organization.', 'Ask about the existing workflow and the participant’s preferred method.', 'Propose a fictional demo and a staff handoff for each setting.', 'Write one observation to test and identify who makes the next decision.'])],
  },
};

export const trainingPlaybooks = [
  {
    id: 'buyer-conversation', title: 'Straight Line practice for TinkyTown',
    description: 'Rehearse original TinkyTown lines using qualification, delivery, and honest answers to buyer uncertainty.',
    sources: [{ title: 'Jordan Belfort · Straight Line curriculum', url: 'https://india.jordanbelfort.com/opt-in171269699288' }],
    sections: [
      { id: 'trust', title: 'Find out what the buyer still needs to trust', steps: [
        'Product fit. Ask, “Which question is hardest for somebody to ask at this desk?” Have the buyer try it and tell you where the board falls short.',
        'Trust in you. If they ask for a number you cannot verify, say, “I don’t have that figure. What should I check before we meet again?” Then follow through.',
        'Trust in the company. Ask, “What would your director need in writing before deciding?” Show the current approved scope and identify who will handle the handoff.',
      ] },
      { id: 'decision', title: 'Return to a decision after answering the concern', steps: [
        'When the buyer says “Let me think,” slow down and ask one question: “Of course. What part is still up in the air for you?” Listen for cost, fit, authority, or timing.',
        'If fit is the concern, try the buyer’s example. Ask, “Did that answer it? What still feels unresolved?” A clear no ends the visit.',
        'With a ready signer, speak plainly: “We’ve checked the desk, the price and the start date. Does the agreement match what you want? Are you ready to sign?” Wait for the answer.',
      ] },
    ],
  },
  {
    id: 'senior-center-first-contact', title: 'Senior Center First Call',
    description: 'A discovery script for a director, program coordinator, or municipal accessibility lead.',
    sources: [seniorCenters, effectiveCommunication],
    sections: [
      {
        id: 'prepare-call', title: 'Before you call',
        steps: [
          'Confirm the center’s address, operator, assigned territory, and one current public program.',
          'Find the director’s work contact or use the main desk to ask for the person who handles the program.',
          'Choose one plausible moment such as signing in for lunch, asking about a ride, or finding an activity room.',
        ],
      },
      {
        id: 'script', title: 'Call script',
        steps: [
          '“I’m [name] with TinkyTown. I saw that your center offers [verified program]. Who handles access and communication at check-in?”',
          '“If somebody wants to ask a question without speaking at the desk, how do they do that today? What happens if they need help with a phone or prefer another method?”',
          '“I can show a sample board for one of those requests. If that would be useful, could we include the person who runs check-in and the person who reviews accessibility?”',
        ],
      },
      {
        id: 'log-call', title: 'After you call',
        steps: [
          'Record the confirmed role, process you heard, preferred contact method, and any next step they accepted.',
          'Use the facility’s procurement or accessibility contact if the director refers you there. Honor the contact’s outreach preferences.',
        ],
      },
    ],
  },
  {
    id: 'nursing-home-first-contact', title: 'Nursing Home Discovery and Demo',
    description: 'A script for bringing the administrator and staff who own the workflow into the same conversation.',
    sources: [residentRights, alzheimers],
    sections: [
      {
        id: 'prepare-location', title: 'Prepare the location and roles',
        steps: [
          'Match the facility name, address, and source. Check the administrator’s role and identify the activities, nursing, rehabilitation, or reception lead who owns the proposed interaction.',
          'Use a fictional message from an everyday scenario. Ask the facility which roles should attend and how it would like a resident or participant to be included.',
        ],
      },
      {
        id: 'script', title: 'Conversation script',
        steps: [
          '“How does a resident usually tell the team they want help joining an activity or have an ordinary request? Who hears it and what happens next?”',
          '“What does the resident use now and what works well for them? Would they want to try another way to express one message?”',
          '“With your team’s approval, we can use a fictional example to show the board, let a participant choose how they interact, and see how staff confirm the message.”',
        ],
      },
      {
        id: 'demo-handoff', title: 'Agree on the handoff',
        steps: [
          'Choose a bounded task and verify which staff member will interpret the workflow and arrange other communication support if needed.',
          'Record the observed demo result, decision-maker, and follow-up date. Keep resident identifiers and clinical information in the facility’s approved system.',
        ],
      },
    ],
  },
  {
    id: 'ada-conversation', title: 'ADA and Accessibility Conversation',
    description: 'Use precise language when a prospect asks about Title II, Title III, or compliance.',
    sources: [titleII, titleIII, effectiveCommunication],
    sections: [
      {
        id: 'discover', title: 'Ask about the service and support',
        steps: [
          '“Who operates the service and which team reviews communication access requests?”',
          '“What situations do you want to improve? Which aids or services are currently available and how do staff arrange them?”',
          '“If a person requests their preferred method or their request is complex, what should staff do next?”',
        ],
      },
      {
        id: 'respond', title: 'Respond to a compliance question',
        steps: [
          '“We can demonstrate how this board supports one interaction. Your accessibility lead can evaluate it with your other communication options and review which requirements apply.”',
          '“Could we test one example with the person’s preferred method and document where the board works and where staff should offer another aid?”',
          'Share the DOJ effective communication resource and connect detailed legal questions to the facility’s authorized reviewer.',
        ],
      },
    ],
  },
  {
    id: 'site-demo-checklist', title: 'On-Site Communication Demo Checklist',
    description: 'A short checklist for the device, the participant, and the staff response.',
    sources: [product, effectiveCommunication, alzheimers],
    sections: [
      {
        id: 'before', title: 'Before the demonstration',
        steps: [
          'Agree on the location, one representative task, an appropriate fictional example, and the staff member who handles the request.',
          'Open the location board on the intended phone or kiosk. Check the browser, chosen language, volume, tile reading, and input options.',
          'Prepare a staff-supported alternative for people who ask for another option or cannot use the setup.',
        ],
      },
      {
        id: 'during', title: 'During the demonstration',
        steps: [
          'Introduce the activity directly to the person and ask if they want to participate. Ask how they prefer to communicate.',
          'Let the participant select a sample message. Read or play it when helpful, confirm the meaning with the person, and have staff respond.',
          'Pause as needed. Offer one short prompt at a time and follow the person’s preference about continuing.',
        ],
      },
      {
        id: 'after', title: 'After the demonstration',
        steps: [
          'Write down what the team tried and whether the participant and staff completed the task. Capture barriers and any fallback used.',
          'Confirm the staff point person, review owner, and date. Save the business-level recap to the prospect record.',
        ],
      },
    ],
  },
  {
    id: 'outreach-and-pilot-recap', title: 'Outreach, Pilot, and Agreement Follow-Up',
    description: 'Write individual follow-ups and document a specific next step from discovery through review.',
    sections: [
      {
        id: 'follow-up-template', title: 'Individual email draft',
        steps: [
          'Use a specific subject such as “Walkthrough for [program] check-in.” Address the confirmed work recipient.',
          '“Thanks for walking me through [verified process]. We discussed showing how someone could use a board to [one routine task] and how your staff would confirm the request.”',
          '“Would [proposed time] work for a short walkthrough with [relevant role]? I can bring a fictional example and show options for visitors who prefer another method.”',
          'Review the recipient and the facts before saving the draft. Use the workspace’s authorized send workflow when an actual message is approved.',
        ],
      },
      {
        id: 'pilot-checklist', title: 'Pilot and agreement checklist',
        steps: [
          'Record the named staff point person, exact site, representative task, access method, and fallback.',
          'Agree on an observation and a review date. Check whether the person and staff could complete the interaction and what they would change.',
          'For a prospect that chooses to proceed, confirm parties, signer authority, approved terms, and the next responsible person. Use Contracts to check the actual signature and retrieve the signed agreement.',
        ],
      },
    ],
  },
];
