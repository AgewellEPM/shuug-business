const configuredOrigin = new URL(process.env.RIDESHARE_SITE_ORIGIN || 'https://gigtax.pro');
if (configuredOrigin.protocol !== 'https:' || configuredOrigin.pathname !== '/' || configuredOrigin.search || configuredOrigin.hash || configuredOrigin.username || configuredOrigin.password) throw new Error('The public site origin must be an HTTPS origin without a path or credentials.');
export const origin = configuredOrigin.origin;
export const reviewed = 'November 2, 2026';
export const sources = {
  gig: ['IRS · Manage taxes for your gig work', 'https://www.irs.gov/businesses/small-businesses-self-employed/manage-taxes-for-your-gig-work'],
  documents: ['IRS · Gather your documents', 'https://www.irs.gov/filing/gather-your-documents'],
  records: ['IRS · What kind of records should I keep?', 'https://www.irs.gov/businesses/small-businesses-self-employed/what-kind-of-records-should-i-keep'],
  car: ['IRS · Business use of car', 'https://www.irs.gov/taxtopics/tc510'],
  estimated: ['IRS · Estimated taxes', 'https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes'],
  withholding: ['IRS · Tax withholding and estimated tax', 'https://www.irs.gov/publications/p505'],
  forms: ['IRS · Understanding your Form 1099-K', 'https://www.irs.gov/businesses/understanding-your-form-1099-k'],
  uber: ['Uber · US tax information', 'https://www.uber.com/us/en/drive/tax-information/'],
  lyft: ['Lyft · Tax information for US drivers', 'https://help.lyft.com/hc/en-us/all/articles/115012926967'],
  preparer: ['IRS · Choosing a tax return preparer', 'https://www.irs.gov/taxtopics/tc254'],
};

export const services = [
  {
    slug: 'tax-preparation', number: '01', label: 'Tax preparation', short: 'Your driving. Your other income. One complete picture.',
    title: 'Bring your tax year', accent: 'into focus.', category: 'FILING SEASON',
    description: 'A clear preparation path for Uber, Lyft, delivery and independent-driver work, including side gigs alongside a regular job.',
    audience: 'Drivers preparing a return, changing platforms, working a side gig or getting organized for their first tax season.',
    points: [
      ['Map the work you did', 'Identify the platforms, tax years and other income your preparer needs to understand. A side gig belongs in the conversation alongside your regular job.'],
      ['Bring the records together', 'Use a practical checklist for platform statements, tax forms, business records and prior-year information. Mark what is ready and what still needs attention.'],
      ['Review the scope before starting', 'Confirm who will prepare the return, which years and jurisdictions are included, what help is included and how questions will be handled.'],
    ],
    prepare: ['Platform annual summaries and any tax forms received', 'Income and expense records for the relevant year', 'Mileage and vehicle records for professional review', 'Prior-year return and records of tax payments, where relevant'],
    questions: ['Can I include my other income?', 'Which federal and state returns are included?', 'How will I review the return and authorize any filing?'],
    related: ['document-checklist', 'guides/uber-lyft-tax-forms', 'free'], sourceKeys: ['documents'],
  },
  {
    slug: 'mileage-and-expenses', number: '02', label: 'Mileage & expenses', short: 'Turn scattered records into a useful review.',
    title: 'Your miles matter.', accent: 'Your records do, too.', category: 'RECORDS & DEDUCTIONS',
    description: 'Organize vehicle and other business records so your tax professional can review what applies to your situation.',
    audience: 'Drivers with mileage logs, multiple vehicles, a rental or lease, a new vehicle, or mixed personal and business use.',
    points: [
      ['Keep the story behind the numbers', 'Gather the trip records, dates and business context you already have. Flag missing information and changes in vehicles or driving patterns for your preparer.'],
      ['Ask about the right vehicle method', 'The IRS describes standard-mileage and actual-expense methods, with eligibility and vehicle-history rules. The right treatment needs a review of your facts; a large mileage number alone does not decide it.'],
      ['Make expenses reviewable', 'Group supporting documents by year and expense type. Keep enough context to explain the purchase and how it relates to the work.'],
    ],
    prepare: ['Mileage records and available annual vehicle-use records', 'Vehicle purchase, lease or rental information', 'Platform fees, tolls, parking and other business expense records', 'Questions about mixed use, missing logs or prior deduction methods'],
    questions: ['Which vehicle method is available for my circumstances?', 'What records support the business use?', 'How do vehicle changes or earlier tax choices affect this year?'],
    related: ['document-checklist', 'bookkeeping', 'guides/uber-lyft-tax-forms'], sourceKeys: ['car', 'records'],
  },
  {
    slug: 'quarterly-taxes', number: '03', label: 'Quarterly tax support', short: 'Check in before the year gets away from you.',
    title: 'A plan for', accent: 'more than April.', category: 'THROUGHOUT THE YEAR',
    description: 'Prepare for a professional conversation about changing income, payments and the next review date.',
    audience: 'Drivers with income that changes across the year, a new independent business, or a mix of employee and gig work.',
    points: [
      ['Review the whole income picture', 'Bring current income records, previous tax information and payments already made. A useful review starts with what has changed since the last conversation.'],
      ['Discuss how tax is being paid', 'Federal tax is paid during the year through withholding or estimated payments. Your professional can review whether estimated payments or a withholding adjustment fit your circumstances.'],
      ['Confirm the dates that apply', 'Use the current IRS instructions and the relevant state authority for actual due dates. This site does not assign a payment amount or assume one schedule covers every taxpayer.'],
    ],
    prepare: ['Year-to-date income and business expense records', 'Any employee withholding information relevant to the review', 'Dates and records of payments already made', 'Prior-year return and questions about income changes'],
    questions: ['Should we review employee withholding as well?', 'Which payment dates apply to my year and location?', 'When should we check the plan again if my income changes?'],
    related: ['get-started', 'bookkeeping', 'document-checklist'], sourceKeys: ['estimated', 'withholding'],
  },
  {
    slug: 'bookkeeping', number: '04', label: 'Year-round bookkeeping', short: 'A clearer picture between filing seasons.',
    title: 'Less catching up.', accent: 'More keeping up.', category: 'YEAR-ROUND SUPPORT',
    description: 'A practical routine for income, expenses and follow-up questions as your independent business changes.',
    audience: 'Drivers who want a regular records routine, have several income sources, or need to catch up before a preparation engagement.',
    points: [
      ['Collect the records you actually use', 'Start with the platform statements, payment records and receipts you already receive. Choose a consistent place and routine for organizing them.'],
      ['Keep questions visible', 'Separate a record that is ready for review from one that needs an explanation, correction or missing statement. Agree on who will follow up.'],
      ['Define what ongoing help includes', 'Confirm the review frequency, period covered and deliverables before an engagement. Bank connections, historical cleanup and return preparation need an agreed scope.'],
    ],
    prepare: ['The months or years you want organized', 'Platform and other income records', 'Available statements, receipts and existing spreadsheets', 'A list of missing records or questions to resolve'],
    questions: ['How often will the records be reviewed?', 'Is historical cleanup included?', 'What information will I receive after each review?'],
    related: ['quarterly-taxes', 'free', 'document-checklist'], sourceKeys: ['records'],
  },
];

export const checklistGroups = [
  { id: 'income', title: 'Platform income', detail: 'Bring the records for each platform and tax year.', items: [
    ['uber-summary', 'Uber annual tax summary and available tax forms', 'uber'],
    ['lyft-summary', 'Lyft annual summary and available tax forms', 'lyft'],
    ['other-summary', 'Statements and available forms from other gig platforms', 'other'],
    ['other-income', 'Records of other work or income to discuss', 'all'],
    ['income-questions', 'A list of missing, incorrect or overlapping statements', 'all'],
  ] },
  { id: 'vehicle', title: 'Mileage & vehicles', detail: 'Collect records for review; this checklist does not determine deductibility.', items: [
    ['mileage', 'Available mileage logs and trip records', 'all'],
    ['vehicle-use', 'Annual vehicle-use and odometer records, if available', 'all'],
    ['vehicle-terms', 'Purchase, lease or rental records and vehicle changes', 'all'],
  ] },
  { id: 'expenses', title: 'Business expenses', detail: 'Keep supporting records and the context for each expense.', items: [
    ['platform-fees', 'Platform fee and transaction summaries', 'all'],
    ['receipts', 'Receipts, statements and business expense records', 'all'],
    ['expense-questions', 'Questions about mixed personal/business use or missing records', 'all'],
  ] },
  { id: 'history', title: 'Your wider tax picture', detail: 'Your preparer will confirm which records apply to you.', items: [
    ['previous-return', 'Prior-year return, if you filed one', 'all'],
    ['tax-payments', 'Records of estimated payments or relevant withholding', 'all'],
    ['other-forms', 'Other tax forms and records requested by your preparer', 'all'],
    ['questions', 'Your questions about the year and the help you need', 'all'],
  ] },
];

export const faqs = [
  ['Getting started', 'Where should I begin?', 'Use Get Started to choose the kind of help you need and create a preparation plan. It asks about services, years and platforms, not your name, taxpayer ID or financial amounts.'],
  ['Getting started', 'Can I use this if driving is a side job?', 'Yes. The preparation path includes driving alongside a regular job. Let your tax professional know about all work and other relevant income.'],
  ['Getting started', 'What if this is my first year?', 'Start with the document checklist and note anything you do not yet have. Bring your questions to the preparer before deciding on the service scope.'],
  ['Platforms & records', 'Do I need records from both Uber and Lyft?', 'If you worked on both, gather the available year-end documents from both. Keep other platform and income records available for the same review.'],
  ['Platforms & records', 'Where do I find my Uber documents?', 'Uber directs US drivers to Tax Information in the driver dashboard and Tax Info in the app. The forms guide links to Uber’s current instructions.'],
  ['Platforms & records', 'Where do I find my Lyft documents?', 'Use the Tax Center in your Lyft Driver Dashboard for available tax documents and your annual summary. The forms guide links to Lyft’s instructions.'],
  ['Platforms & records', 'What if I did not receive a 1099?', 'A missing information form does not by itself remove the responsibility to report income. Bring your other records and ask your preparer what is needed.'],
  ['Platforms & records', 'Why can a platform total be higher than my bank deposits?', 'Some platform figures describe gross customer payments before fees and other adjustments. Gather the summary and payout records together for review rather than assuming they describe the same number.'],
  ['Platforms & records', 'Does the checklist upload my documents?', 'No. It marks record categories as ready in this tab. It has no file upload, no financial entry and no connection to a client account.'],
  ['Free access', 'Is Gig Tax Pros free to use?', 'Yes. Use the app and tools for free, with no subscription. You pay only when you choose and approve a professional service, with the price shown before work begins.'],
  ['Free access', 'How do I check which returns I need?', 'Tell your preparer which tax years and states are involved so you can review the right records together.'],
  ['Free access', 'Can I organize records throughout the year?', 'Yes. Use the records checklist and bookkeeping guidance throughout the year, and confirm the next review with your preparer.'],
  ['Quarterly & mileage', 'Can this website calculate what I should pay?', 'No. It helps organize records and questions. Your payment amount needs a review of your circumstances and the applicable instructions.'],
  ['Quarterly & mileage', 'Which mileage rate should I use?', 'Use the official rules for the tax year and dates involved with your tax professional. The mileage guide links to the IRS rather than applying one fixed rate to every trip.'],
  ['Quarterly & mileage', 'What if I have a rental, lease or more than one vehicle?', 'Collect the relevant vehicle records and explain the changes to your preparer. Eligibility and prior vehicle choices can affect how expenses are treated.'],
  ['Client access', 'Can I sign in to Shuug today?', 'The firm’s private client workspace is not connected to this public site yet. The My Portal page shows its current availability; it does not accept passwords.'],
  ['Client access', 'Is Drake required?', 'No. Shuug is the business workspace. If the firm uses an external filing engine such as Drake, that is a separate service and will be clearly identified.'],
  ['Client access', 'Can I send sensitive documents by ordinary email?', 'Wait for verified instructions from your tax professional and use the approved private channel. General contact messages should not include taxpayer IDs, bank details or tax documents.'],
  ['Client access', 'Do you guarantee a refund?', 'No. Outcomes depend on your facts and applicable rules. Financial illustrations are not a promise of a result.'],
  ['Client access', 'How do I verify the person preparing my return?', 'Ask about the preparer’s qualifications, contact details, engagement terms and review process. Our resources link to the IRS guide to choosing a preparer.'],
];
