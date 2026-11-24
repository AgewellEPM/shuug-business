export const trainingScenarios = [
  {
    id: 'nursing-home-pipeline',
    title: 'Nursing home pilot',
    setting: 'A 90-bed nursing home with a rehabilitation wing',
    opening: 'The administrator agreed to fifteen minutes. Families have asked for clearer ways to express everyday needs after admission. The facility already uses individual communication supports.',
    passPercent: 80,
    stages: [
      {
        id: 'qualify', phase: 'Prospect', title: 'Qualify the location',
        prompt: 'The directory lists two related facilities with similar names. What do you do before preparing outreach?',
        options: [
          { label: 'Use the parent organization’s main number as the administrator’s direct line.', feedback: 'Confirm the location and contact role. A parent company number is a separate contact point.' },
          { label: 'Match the address to the facility’s source listing and confirm who manages the communication workflow.', feedback: 'That gives you a documented location and a confirmed role to invite.' },
          { label: 'Add both locations to the pipeline and use the same outreach for each.', feedback: 'Qualify the locations individually so the records and examples match.' },
        ],
        correct: 1,
      },
      {
        id: 'discover', phase: 'Discovery', title: 'Learn the resident workflow',
        prompt: 'The administrator says residents struggle to communicate after admission. What do you ask first?',
        options: [
          { label: 'How does an individual currently express a need, and who helps when their preferred method is unavailable?', feedback: 'This identifies a real interaction and respects the supports the resident already uses.' },
          { label: 'How many devices would you buy if I showed you all the features?', feedback: 'Start with a specific communication barrier and the people affected.' },
          { label: 'Which diagnoses should I enter into our CRM for targeting?', feedback: 'Use facility-level workflows and fictional examples for training and discovery.' },
        ],
        correct: 0,
      },
      {
        id: 'demo', phase: 'Demo', title: 'Show one communication moment',
        prompt: 'The nursing team wants to see how someone can express discomfort at the bedside. What do you show?',
        options: [
          { label: 'Present a catalog of every board and feature that could be relevant.', feedback: 'An end-to-end example lets staff see who enters, selects, and responds to a message.' },
          { label: 'Open the board and have the rep announce a condition on the resident’s behalf.', feedback: 'Keep control with the person. The resident can select or correct what they want to say.' },
          { label: 'Use fictional details to open the bedside demo, choose a message, and ask a staff teammate to respond.', feedback: 'The scenario demonstrates the person’s role and the facility’s response within its own workflow.' },
        ],
        correct: 2,
      },
      {
        id: 'objection', phase: 'Pilot', title: 'Respond to an accommodation question',
        prompt: 'A staff lead asks whether the boards replace their current accommodations. What do you tell them?',
        options: [
          { label: 'The boards are an option for certain interactions. Keep the resident’s preferred supports and ask the facility’s appropriate lead to review fit.', feedback: 'This gives staff a clear role for the product and preserves individualized support.' },
          { label: 'The QR code handles the facility’s effective communication responsibilities.', feedback: 'The relevant aid or service depends on the individual, interaction and facility obligations.' },
          { label: 'A board can be assigned to every resident based on their age group.', feedback: 'Communication needs, preferences, and abilities vary from person to person.' },
        ],
        correct: 0,
      },
      {
        id: 'agreement', phase: 'Agreement', title: 'Set the scope and approver',
        prompt: 'The team likes the demo. The person who attended can recommend a pilot, and the administrator signs agreements. What’s the next step?',
        options: [
          { label: 'Mark the agreement signed when the person who attended says yes.', feedback: 'Record the meeting outcome and the review step. A signature has its own status.' },
          { label: 'Agree on the pilot setting and review date, then prepare the agreement for the identified signer.', feedback: 'Confirm the implementation scope and evidence before advancing the agreement status.' },
          { label: 'Send the same agreement to everyone listed in the directory.', feedback: 'Confirm the authorized signer and use the reviewed, correctly addressed agreement.' },
        ],
        correct: 1,
      },
      {
        id: 'handoff', phase: 'Handoff', title: 'Close the loop with staff',
        prompt: 'The approved pilot is ready for practice. What does a clear handoff include?',
        options: [
          { label: 'An install date and no further meetings.', feedback: 'The handoff also needs an owner, agreed workflow and a method to review what happened.' },
          { label: 'A list of residents and diagnoses to track centrally in the sales workspace.', feedback: 'Keep resident information in the facility’s approved workflow. Discuss measures at the process level.' },
          { label: 'A named site owner, chosen workflow, backup communication option, staff practice, and a feedback date.', feedback: 'The team can rehearse, support each participant and review a specific interaction.' },
        ],
        correct: 2,
      },
    ],
  },
  {
    id: 'senior-center-pipeline',
    title: 'Senior center visitor access',
    setting: 'A town-run center that offers classes and transportation',
    opening: 'The program director hears that first-time visitors sometimes miss activities because they could not ask about the calendar or shuttle. Visitors use different ways to communicate.',
    passPercent: 80,
    stages: [
      {
        id: 'qualify', phase: 'Prospect', title: 'Identify decision makers',
        prompt: 'The town runs the center. Who should be involved in exploring the visitor workflow?',
        options: [
          { label: 'Only the volunteer who answers the visitor desk phone.', feedback: 'Ask the desk about workflow and bring in the program and accessibility leads and authorized buyer.' },
          { label: 'The program lead, the visitor desk and the town’s appropriate accessibility and purchasing contacts.', feedback: 'The people doing the work and the authority that evaluates it should both be involved.' },
          { label: 'Anyone whose personal email appears in a social search.', feedback: 'Use published work channels and confirm the person’s role.' },
        ],
        correct: 1,
      },
      {
        id: 'discover', phase: 'Discovery', title: 'Ask about one real interaction',
        prompt: 'You have time for one question on your first call. What do you ask?',
        options: [
          { label: 'What happens when a visitor arrives and needs help finding the shuttle or the right class?', feedback: 'This gives you a concrete example you can demonstrate and test.' },
          { label: 'Would you like our complete list of accessibility products?', feedback: 'Learn where people currently need help before deciding which feature to show.' },
          { label: 'What accommodation do you use for everyone over 65?', feedback: 'Ask about visitors’ individual preferences and actual communication barriers.' },
        ],
        correct: 0,
      },
      {
        id: 'demo', phase: 'Demo', title: 'Start with access then show the reply',
        prompt: 'Two staff members join your demo. One wants to see the phone experience, the other asks what visitors without phones can do.',
        options: [
          { label: 'Show only the QR code because most visitors have a phone.', feedback: 'Show how someone can get help with the same interaction through another route.' },
          { label: 'Start with staff reports so they can see the technical setup.', feedback: 'Begin with the actual visitor interaction. Staff tools can come after that.' },
          { label: 'Scan the QR, choose a visitor message, and repeat the interaction using the staff-assisted kiosk.', feedback: 'Both people can see the path from opening the board to choosing a message and getting a response.' },
        ],
        correct: 2,
      },
      {
        id: 'objection', phase: 'Pilot', title: 'Be precise about access',
        prompt: 'The director asks if the town can count on the QR sign as its complete accommodation plan.',
        options: [
          { label: 'Say that the QR sign is one access option and ask how the town handles other effective communication requests.', feedback: 'Identify the product’s role and include the town’s accessibility lead and existing options.' },
          { label: 'Guarantee the QR sign covers all visitors in every context.', feedback: 'A single tool cannot determine whether communication is effective for everyone.' },
          { label: 'Say this is an optional convenience and skip discussion of visitor access.', feedback: 'Discuss barriers and existing workflows. A sales call can help identify where to test the tool.' },
        ],
        correct: 0,
      },
      {
        id: 'agreement', phase: 'Agreement', title: 'Respect the purchasing process',
        prompt: 'The director wants to start, and the town’s purchasing office must approve the agreement.',
        options: [
          { label: 'Present the price as accepted and request immediate setup.', feedback: 'Confirm the purchasing steps and the person authorized to sign.' },
          { label: 'Record the director’s recommendation, document the pilot scope, and ask what the purchasing office needs for review.', feedback: 'You have a documented next step while the authorized team reviews the terms.' },
          { label: 'Skip the scope review and classify the location as signed.', feedback: 'Only set signed status after the reviewed agreement has an actual recorded signature.' },
        ],
        correct: 1,
      },
      {
        id: 'handoff', phase: 'Handoff', title: 'Set a practice and review date',
        prompt: 'The pilot was approved for the activity desk. What should staff practice first?',
        options: [
          { label: 'The number of buttons and every language setting.', feedback: 'Practice a complete visitor interaction before introducing optional settings.' },
          { label: 'Replacing all existing desk and phone support with a QR sign.', feedback: 'Keep the existing ways to communicate and test one accessible workflow.' },
          { label: 'Answer a visitor’s class or shuttle question using the board, with a backup method and a review date.', feedback: 'This is a repeatable, observable interaction that staff can review after practice.' },
        ],
        correct: 2,
      },
    ],
  },
];
