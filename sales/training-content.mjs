export const featuredTrainingCourseId = 'sales-onboarding';

export const trainingCategories = [
  { id: 'sales-prospecting', title: 'Sales & Prospecting' },
  { id: 'product-training', title: 'Product Training' },
  { id: 'healthcare-sales', title: 'Healthcare Sales' },
  { id: 'ada-compliance', title: 'ADA & Compliance' },
  { id: 'crm-tools', title: 'CRM & Tools' },
];

export const trainingCourses = [
  {
    id: featuredTrainingCourseId, category: 'sales-prospecting', title: 'Sales Onboarding',
    description: 'Learn how TinkyTown supports communication and practice the path from a facility prospect to a reviewed agreement.',
    durationMinutes: 30,
    sections: [
      {
        id: 'workspace', title: 'Get oriented in the workspace',
        steps: [
          'Open Today’s Plan and locate your follow-ups. Use the sidebar profile to check your name and role, then use the CRM switch to open Senior Care CRM if it is available.',
          'In Prospects, choose List, Nursing home, and a territory you cover. Open one directory result and check its address, facility overview, and role source.',
          'In the facility profile, explore the organization chart. Identify a role to ask about how a resident communicates a routine need. Note the difference between the main facility number and a person’s published work contact.',
        ],
      },
      {
        id: 'conversation', title: 'Connect a first conversation to a demo',
        steps: [
          'Pick one communication moment to discuss, such as asking for assistance or expressing a preference. Ask who is involved today and where the person gets stuck.',
          'Open Sales team and select Demo. Pick TinkyStroke for a bedside conversation or TinkyTown Hospital for reception. Walk through one prompt and select a sample message to display and speak.',
          'Practice a short introduction for a teammate. Name the setting you researched, show one message on the demo board, and ask whether that interaction would fit their workflow.',
        ],
      },
      {
        id: 'follow-through', title: 'Practice the handoff to a next step',
        steps: [
          'Open a practice prospect or a record you already own. Locate the status, Log call, and Schedule follow-up controls. Write a brief practice note with the outcome, who owns the next step, and a date.',
          'Open Contracts and identify where to check the business, signer, terms, and signature status. Find Download signed agreement on an existing signed record if one is visible.',
          'Check your work by explaining the difference between a directory listing, a saved prospect, an accepted demo appointment, and a signed agreement.',
        ],
      },
    ],
  },
  {
    id: 'qualify-directory-prospects', category: 'sales-prospecting', title: 'Qualify a Directory Prospect',
    description: 'Match a published facility to the right account and find a business contact to approach.',
    durationMinutes: 15,
    sections: [
      {
        id: 'find-location', title: 'Match the physical location',
        steps: [
          'In Prospects, choose a facility type and state. Search the facility name, then compare its street address with the listing source and facility website.',
          'Use the header search to check your saved records before adding a location. Save an in-scope directory result to Pipeline when you are ready to work it.',
        ],
      },
      {
        id: 'confirm-contact', title: 'Confirm who handles the workflow',
        steps: [
          'Open the facility profile and select the relevant role in Organization chart. Check its role source and business email against the facility location.',
          'If a direct contact is missing, use the published facility number to ask which role handles communication tools. Add the person and role to the saved organization when you have confirmed them.',
          'Write one line explaining why the facility is a fit and one question about how it handles the use case today.',
        ],
      },
    ],
  },
  {
    id: 'tinkystroke-demo', category: 'product-training', title: 'Present the TinkyStroke Demo',
    description: 'Show how a person can select and speak a message in a bedside or rehabilitation conversation.',
    durationMinutes: 15,
    sections: [
      {
        id: 'choose-setting', title: 'Run a bedside walkthrough',
        steps: [
          'Open Sales team, select Demo, and choose TinkyStroke. Pick a hospital ward, nursing home, or rehab scenario that matches the conversation.',
          'Read the staff prompt, select a relevant tile, and point out the Selected message area. With Speak on tap turned off, choose Speak to play the selected phrase.',
          'Use Next prompt and select a different board from the Board menu. Show how someone can move between quick answers and a more specific message.',
        ],
      },
      {
        id: 'access-and-recap', title: 'Show an access option and ask for feedback',
        steps: [
          'Expand Access options. Try Larger tiles and show how a person can select a highlighted tile with Space or Enter during switch scanning. Press Escape to stop scanning.',
          'Ask which interaction the participant would prefer and where the board could be available during the day. Summarize the setting and the option they tried.',
        ],
      },
    ],
  },
  {
    id: 'hospital-reception-demo', category: 'product-training', title: 'Present the TinkyTown Hospital Demo',
    description: 'Walk through a reception interaction and discuss how a facility might make a board available.',
    durationMinutes: 12,
    sections: [
      {
        id: 'reception-walkthrough', title: 'Show a reception interaction',
        steps: [
          'Open Sales team, then Demo, and choose TinkyTown Hospital. Read the reception prompt and select a sample message from the displayed board.',
          'Show the written phrase and use Speak to play it when helpful. Continue with Next prompt so the audience sees how a conversation can progress.',
        ],
      },
      {
        id: 'placement', title: 'Discuss placement and staff response',
        steps: [
          'Ask where visitors would find a kiosk or QR access point and who could assist when a visitor asks for help.',
          'Ask the team to describe how it would respond to the message shown in the demo. Pick one check-in or wayfinding interaction for a later hands-on review.',
        ],
      },
    ],
  },
  {
    id: 'senior-care-discovery', category: 'healthcare-sales', title: 'Run a Senior Care Discovery Conversation',
    description: 'Turn facility research into a focused conversation about everyday communication.',
    durationMinutes: 18,
    sections: [
      {
        id: 'prepare', title: 'Prepare for the right person and setting',
        steps: [
          'Use the facility profile to check its type, address, and available facts. Identify who can describe the workflow and who can approve a demonstration.',
          'If Google reviews are available, compare Positive, Negative, and Mixed feedback. Use an observed theme as a question to explore, such as how residents request routine assistance.',
        ],
      },
      {
        id: 'discover', title: 'Ask about the existing process',
        steps: [
          'Start with a concrete moment. Ask what someone needs to communicate, who receives it, what tools are already available, and what happens when a message is hard to express.',
          'Repeat the workflow back in their words. Ask what a useful demonstration would need to show and which care, activities, or reception team member should attend.',
          'Record role-level feedback and the next step on the facility record. Keep the note focused on the business workflow and public contact details.',
        ],
      },
    ],
  },
  {
    id: 'facility-demo-follow-up', category: 'healthcare-sales', title: 'Follow Up After a Facility Demo',
    description: 'Capture what the facility tried and agree on a useful next step.',
    durationMinutes: 14,
    sections: [
      {
        id: 'recap', title: 'Capture what happened',
        steps: [
          'Ask which message or access option participants tried and whether it fit the setting you discussed. Record their feedback and any follow-up question in the saved prospect.',
          'Agree on an owner and date for a follow-up. Examples include a second walkthrough with another team, a placement conversation, or review of written terms.',
        ],
      },
      {
        id: 'draft', title: 'Prepare an individual follow-up',
        steps: [
          'Use the saved business email and address the person who attended. Start with their workflow, recap what you showed, and ask them to confirm the next step.',
          'When available, Quick Email can prepare an editable draft for each eligible contact. Review the recipient, wording, and any claims in each draft, then save the draft or continue in your authorized mailbox.',
          'Schedule the next follow-up and verify the updated date in Prospect details.',
        ],
      },
    ],
  },
  {
    id: 'accessible-communication-discovery', category: 'ada-compliance', title: 'Discover Accessible Communication Needs',
    description: 'Ask people how they prefer to communicate and document the requirements for a product walkthrough.',
    durationMinutes: 14,
    sections: [
      {
        id: 'preferences', title: 'Start with the participant’s preferences',
        steps: [
          'Ask how the person prefers to communicate today, what device or support they already use, and whether touch, a pointer, or a switch works for them.',
          'Write down the relevant language, device, placement, and environment. Ask the participant what a successful interaction would look like to them.',
          'Choose one message in the demo that fits the setting and give the participant time to try it with their preferred setup.',
        ],
      },
      {
        id: 'requirements', title: 'Record and route accessibility requirements',
        steps: [
          'Document the scenario, the options you showed, and the participant’s feedback about what worked or was difficult.',
          'Ask the facility’s accessibility or compliance lead to identify its review criteria. Send them the specific workflow and setup you observed for their assessment.',
        ],
      },
    ],
  },
  {
    id: 'accessibility-demo-check', category: 'ada-compliance', title: 'Check Access Options in a Demo',
    description: 'Try tile size, pointer dwell, and switch scanning with a representative task.',
    durationMinutes: 16,
    sections: [
      {
        id: 'try-options', title: 'Practice the three access options',
        steps: [
          'In a Demo board, expand Access options and choose Larger tiles. Check that the sample message is still available and easy to locate.',
          'Enable pointer dwell and hold the pointer over a tile until the message is selected. Next, use Start switch scan and press Space or Enter when a tile is highlighted. Press Escape to stop.',
          'With Speak on tap turned off, choose a tile and verify the Selected message first, then use Speak to hear it.',
        ],
      },
      {
        id: 'capture-check', title: 'Record the result for the next review',
        steps: [
          'Ask the participant to try one relevant action on the device and input method they intend to use. Record which option they chose and what they were able to complete.',
          'Bring any barriers to the next product or accessibility review. Include the device, browser, selected option, and action that was difficult.',
        ],
      },
    ],
  },
  {
    id: 'pipeline-follow-ups', category: 'crm-tools', title: 'Keep Follow-Ups Current in Pipeline',
    description: 'Use status, activity history, and follow-up dates to keep a saved prospect actionable.',
    durationMinutes: 15,
    sections: [
      {
        id: 'record-conversation', title: 'Record the conversation and its outcome',
        steps: [
          'Search for the business in the header or open it from Pipeline. Check its address and contact before adding activity.',
          'In Prospect details, choose Log call and record the outcome, or use Record a follow-up in the full office record. Choose the status that matches what happened.',
        ],
      },
      {
        id: 'plan-next-action', title: 'Add a date and check Today’s Plan',
        steps: [
          'Use Schedule follow-up to select a date. Use a note or activity record to describe the action clearly enough that a teammate could follow it.',
          'Check Today’s Plan for work due now and review the next action on the office record. Confirm that the correct business, stage, and date are shown.',
        ],
      },
    ],
  },
  {
    id: 'booking-and-contracts', category: 'crm-tools', title: 'Book a Demo and Prepare an Agreement',
    description: 'Use the booking calendar and check the signer, terms, and status before handing off an agreement.',
    durationMinutes: 18,
    sections: [
      {
        id: 'book', title: 'Set up the right appointment',
        steps: [
          'Open Sales team and choose Calendar. Review the meeting types and your availability. If your calendar is published, use Copy booking link to open the client booking page and check the options.',
          'Confirm the date, time zone, meeting type, and attendees with the facility. Check the saved appointment in your schedule and review any listed delivery status.',
        ],
      },
      {
        id: 'agreement', title: 'Review the handoff to the signer',
        steps: [
          'Open the saved business record. Check the ownership evidence and make sure the owner or signer details match the business. Confirm the terms with the person who manages agreements in your workspace.',
          'Use Prepare contract link when the record is ready. Check the recipient and exact terms in the contract review flow, then review its status in Contracts.',
          'Once signed, open the contract record and choose Download signed agreement. Record the next operational step in the business activity history.',
        ],
      },
    ],
  },
];

export const trainingPaths = [
  {
    id: 'new-sales-rep', title: 'New Sales Rep',
    description: 'Complete onboarding and learn how to qualify, track, and follow through with a prospect.',
    courseIds: ['sales-onboarding', 'qualify-directory-prospects', 'pipeline-follow-ups', 'booking-and-contracts'],
  },
  {
    id: 'healthcare-senior-living', title: 'Healthcare & Senior Living Specialist',
    description: 'Prepare for nursing home, hospital, rehab, and senior community center conversations.',
    courseIds: ['senior-care-discovery', 'tinkystroke-demo', 'hospital-reception-demo', 'facility-demo-follow-up'],
  },
  {
    id: 'ada-accessibility', title: 'ADA & Accessibility Solutions',
    description: 'Gather communication requirements and demonstrate the available access options.',
    courseIds: ['accessible-communication-discovery', 'accessibility-demo-check', 'tinkystroke-demo'],
  },
];

export const trainingCertificates = [
  {
    id: 'tinkytown-sales', title: 'TinkyTown Sales Certification', pathId: 'new-sales-rep',
    description: 'Workspace certificate for completing TinkyTown onboarding and core sales courses.',
  },
  {
    id: 'healthcare-sales-specialist', title: 'Healthcare Sales Specialist', pathId: 'healthcare-senior-living',
    description: 'Workspace certificate for completing healthcare discovery, demonstration, and follow-up courses.',
  },
  {
    id: 'ada-accessibility-completion', title: 'ADA & Accessibility Certification', pathId: 'ada-accessibility',
    description: 'Workspace certificate for completing the accessibility discovery and demonstration courses.',
  },
];

export const trainingFaqs = [
  {
    question: 'Where should I start?',
    answer: 'Open Sales Onboarding on Training Home. It walks through the workspace, a sample product demonstration, and the steps to a reviewed agreement.',
  },
  {
    question: 'How are course completion and training time counted?',
    answer: 'Mark a course complete after working through its lessons. Training time totals the estimated minutes of courses you have completed.',
  },
  {
    question: 'How do I earn a certificate?',
    answer: 'Complete all courses in its learning path, then open Certifications to view the workspace completion record.',
  },
  {
    question: 'Where can I practice the product demos?',
    answer: 'Open Sales team and choose Demo in a workspace that has the care demos enabled. The walkthroughs include sample prompts and communication boards.',
  },
  {
    question: 'Where do I find live training?',
    answer: 'Open Live Training to check for scheduled sessions. The written courses and learning paths are available to work through at your own pace.',
  },
  {
    question: 'Who can help if I get stuck?',
    answer: 'Open Support and submit a request with the course name and the step you are working on.',
  },
];
