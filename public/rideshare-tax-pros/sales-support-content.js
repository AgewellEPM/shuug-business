const sdrSupportArticles = [
  {
    id: 'sign-in', kind: 'article', topic: 'Login & Access',
    title: 'Sign in to the Sales Workspace',
    description: 'Open the workspace and check that you are signed in with the right account.',
    steps: [
      'Open the Sales Workspace link from your team. If the sign-in screen appears, choose Go to sign-in and use your work account.',
      'Return to the workspace and check the account name in the top bar. If access is denied, ask your workspace owner to confirm your access.',
    ],
  },
  {
    id: 'choose-workspace', kind: 'guide', topic: 'Login & Access',
    title: 'Choose the right sales workspace',
    description: 'Switch between the Universal CRM and Senior Care CRM.',
    steps: [
      'Use the workspace switch near the top of the sidebar when both workspaces are available.',
      'Choose Senior Care CRM for nursing homes and senior community centers. Open Universal CRM to work with other business prospects.',
      'Check the workspace name before saving a prospect or changing a contact.',
    ],
  },
  {
    id: 'directory-prospects', kind: 'guide', topic: 'Adding Prospects', view: 'prospects',
    title: 'Find facilities by state',
    description: 'Find directory listings in any of the 50 states and save the ones you want to pursue.',
    steps: [
      'Open Prospects in List view. Choose Nursing home or Senior community center under Office type, then choose a state under Territory.',
      'Check Directory matches. Search by facility name or city to narrow the list, and use Next to browse more results.',
      'Open View profile to review the facility details. Select Save to Pipeline to track the facility in the workspace.',
    ],
  },
  {
    id: 'missing-directory-results', kind: 'article', topic: 'Adding Prospects', view: 'prospects',
    title: 'Troubleshoot missing directory results',
    description: 'Check the filters and reload a directory that failed to open.',
    steps: [
      'Select List and choose Clear all to reset the filters. Pick a state and select Nursing home or Senior community center.',
      'If the directory shows an error, choose Retry directory. If a specific listing is missing, try its city or another part of its name.',
      'Use Add prospect if you have the facility’s business information and want to enter it directly.',
    ],
  },
  {
    id: 'add-prospect-manually', kind: 'tutorial', topic: 'Adding Prospects', view: 'prospects',
    title: 'Add a prospect by hand',
    description: 'Create a workspace record from a known business name and address.',
    steps: [
      'In Prospects, select Add prospect and enter the organization name, office type, street address, city, and state.',
      'Enter the business website and contact details you have checked. Choose Save prospect, then open the saved record to plan a follow-up.',
    ],
  },
  {
    id: 'facility-leadership', kind: 'guide', topic: 'Adding Prospects', view: 'prospects',
    title: 'Research a facility and its leadership',
    description: 'Review facility facts and find the people responsible for the location.',
    steps: [
      'In Directory matches, select View profile. Check Facility overview for the address and any published details, such as hours or bed count.',
      'In Organization chart, select a person to see their role, contact details, and available source links. Headshots appear where a sourced photo is available.',
      'Check the role source and business contact information before reaching out. Use the facility website or main office number to confirm missing details.',
    ],
  },
  {
    id: 'google-review-themes', kind: 'article', topic: 'CRM & Pipeline', view: 'prospects',
    title: 'Read a facility’s Google reviews',
    description: 'Compare positive and negative feedback and identify communication topics for outreach.',
    steps: [
      'Open a facility profile and expand Google reviews. Check the overall star rating and the total number of Google ratings.',
      'Read the available sample. Four- and five-star reviews appear under Positive, one- and two-star reviews under Negative, and three-star reviews under Mixed.',
      'Use the Google Maps link for additional context. Treat any outreach topic as a question about the facility’s current process.',
    ],
  },
  {
    id: 'draft-individual-emails', kind: 'tutorial', topic: 'CRM & Pipeline', view: 'prospects',
    title: 'Prepare individual outreach drafts',
    description: 'Write separate introductions to TinkyTown for eligible business contacts.',
    steps: [
      'Open a facility profile and select Quick Email. If you are working from a review theme, choose it under Google reviews and select Draft outreach with this focus.',
      'Open each draft to review the recipient, subject, and message. Check the business email and edit the introduction for that person.',
      'Quick Email prepares drafts only. When ready to continue, use Open in email app for the individual draft you reviewed.',
    ],
  },
  {
    id: 'schedule-follow-up', kind: 'tutorial', topic: 'CRM & Pipeline', view: 'prospects',
    title: 'Record a conversation and schedule the next step',
    description: 'Keep the status, notes, and follow-up date together on the saved record.',
    steps: [
      'Select a saved prospect and choose Log call in Prospect details. Add the outcome of the conversation and select Save call.',
      'Choose Schedule follow-up, enter the date for the next action, and select Save follow-up.',
      'Review the updated status and next action before you leave the record.',
    ],
  },
  {
    id: 'rolodex-add-contact', kind: 'tutorial', topic: 'CRM & Pipeline', view: 'contacts',
    title: 'Add someone to the Rolodex',
    description: 'Keep business contacts attached to their organization.',
    steps: [
      'From this guide, open the Rolodex and choose Add contact.',
      'Choose the existing organization or create a new one. Enter the person’s name, role, and any confirmed business contact details.',
      'Select Save contact and check that the contact appears under the correct organization.',
    ],
  },
  {
    id: 'signed-locations', kind: 'article', topic: 'CRM & Pipeline', view: 'locations',
    title: 'Find signed businesses on the Signup locations map',
    description: 'See where signed businesses are located and open their street addresses.',
    steps: [
      'Open Sales team, select Signup locations, and choose a state or leave the filter on All states.',
      'Select a listed address to see it on the map. The state count reflects signed office agreements.',
    ],
  },
  {
    id: 'prepare-agreement-link', kind: 'guide', topic: 'Contracts', view: 'contracts',
    title: 'Prepare an agreement for review',
    description: 'Review the saved owner and generate the agreement link.',
    steps: [
      'In Contracts, choose Open pipeline to prepare a contract and open the business record.',
      'Review the ownership evidence and choose a saved owner or confirm the owner’s name and business email.',
      'Choose Prepare contract link. Return to Contracts to find its status and, when available, copy the link.',
    ],
  },
  {
    id: 'download-agreement', kind: 'article', topic: 'Contracts', view: 'contracts',
    title: 'Check a signature and download the agreement',
    description: 'Find the signed terms and confirmation information for a business.',
    steps: [
      'Open Contracts and choose Signed agreements under Show contracts. Find the business and check the signer and date.',
      'Choose Download signed agreement to save the signed terms and receipt. Check the card for the current payment or membership status.',
    ],
  },
  {
    id: 'workspace-on-mobile', kind: 'article', topic: 'App & Mobile',
    title: 'Open the workspace on your phone',
    description: 'Access the workspace through your phone’s web browser.',
    steps: [
      'Use the workspace web link supplied by your team and sign in with your authorized account.',
      'If the link starts with 127.0.0.1 or localhost, ask the workspace owner for the hosted address. Those links open only on the device running the workspace.',
      'Include your device, browser, and the page you were trying to use if you submit a request about a mobile issue.',
    ],
  },
  {
    id: 'billing-status', kind: 'article', topic: 'Billing', view: 'contracts',
    title: 'Check agreement payment status',
    description: 'Look up the current membership status before asking about a charge or payment.',
    steps: [
      'Open Contracts and find the business. Check whether its card shows Signed · payment pending or Paid membership active.',
      'If the status needs review, submit a request with the business name, charge date, and any invoice or receipt reference you have. Leave card numbers out of the request.',
    ],
  },
];
if (typeof window !== 'undefined') window.SdrSupportContent = sdrSupportArticles;
if (typeof module !== 'undefined') module.exports = sdrSupportArticles;
