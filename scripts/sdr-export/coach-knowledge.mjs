import { trainingCourses, trainingPlaybooks } from '../../sales/training-content.mjs';

const guides = [
  ['product', 'How TinkyTown works', 'https://tinkytown.com/faq.html', 'product pitch QR communication AAC access languages visitor front desk TinkySpeak', 'TinkyTown puts a venue-specific communication board at a service counter. Visitors scan a QR poster, open the board in a browser, choose a language and tap picture-and-word tiles. The device speaks their selection. Staff can reply across languages. A counter tablet can serve someone without a phone. An example conversation is asking where to check in.'],
  ['venues', 'TinkyTown venue guide', 'https://tinkytown.com/venues.html', 'venue industry restaurant library bank hotel airport municipal school retail hospital target discovery', 'Start with the actual counter and who staffs it. At a library, show asking for a card. At a restaurant, show placing an order. At a town hall, show finding the right service desk. At a hospital, show checking in or asking for directions. Ask what gets difficult today and who would evaluate a short demonstration.'],
  ['pricing', 'TinkyTown pricing', 'https://tinkytown.com/pricing.html', 'price pricing quote cost paid free tiers discount trial procurement contract fee dollars budget', 'Published guide checked November 23, 2026: public libraries and public K–12 schools have a free tier. Small food businesses are listed at $150–$300 per month. Standard public counters are $725 per entity per month. Healthcare and enterprise deployments depend on scope. Paid tiers list a 45-day trial. Direct a buyer to the current pricing page and confirm the venue and scope before quoting.'],
  ['families', 'TinkySpeak for families', 'https://tinkytown.com/families.html', 'family home caregiver parent TinkySpeak AAC pictures', 'TinkySpeak supports families with picture-based communication boards and spoken choices. Ask which routines need support and demonstrate a familiar everyday exchange using the person’s own words.'],
  ['schools', 'TinkySpeak for schools', 'https://tinkytown.com/schools.html', 'school classroom teacher district kids students multilingual routines', 'The schools offering includes classroom communication boards and language support. Ask educators which classroom routines to demonstrate and who coordinates communication supports.'],
  ['demo', 'TinkyTown and TinkyStroke demos', '#view=demo', 'stroke rehab senior care resident reception hospital TinkyStroke demo kiosk pain nursing home communication', 'In Tinky Team → Demo, select TinkyStroke for a nursing home, hospital ward or rehab walkthrough. A staff prompt leads to a resident reply. Tap a tile to speak it, replay a phrase, try larger tiles or switch scanning. TinkyTown Hospital demonstrates communication at reception. Use the sample walkthrough to demonstrate communication access. Clinical advice, outcome guarantees and compliance certifications are outside the demo.'],
  ['setup', 'Counter setup and visitor access', 'https://tinkytown.com/faq.html', 'setup install deploy print poster kiosk tablet smartphone phone device onboarding staff training sign', 'A venue can print its QR poster and place it where a visitor can see and reach it. Show staff how to introduce the board and replay a choice. Visitors use their browser. A counter tablet provides another way to use the same board. For a pilot, agree on who looks after the poster and tablet.'],
  ['languages', 'Language and accessibility options', 'https://tinkytown.com/faq.html', 'translate translation bilingual bilateral languages multilingual interpreter disability accessible AAC communication speech', 'TinkyTown publishes support for more than 120 languages and two-way translation. Use a venue-specific board for a routine request and a reply. Ask which languages and access methods matter to the buyer. Discuss qualified human interpretation for complex conversations and the person’s preferred communication aid.'],
  ['privacy', 'Privacy and security information', 'https://tinkytown.com/security.html', 'privacy security identifiers visitor data retention compliance HIPAA ADA consent BAA encryption contract legal', 'A rep can demonstrate a routine visitor exchange using sample information. Direct security and privacy questions to the official documentation. Bring the buyer’s exact data-flow, retention, accessibility or agreement requirements to the product team for written confirmation before making a commitment.'],
  ['pilot', 'TinkyTown pilots', 'https://tinkytown.com/pilots.html', 'pilot trial discovery adoption objection pitch success measure director decision maker value goals rollout', 'For a proposed pilot, ask which counter to start at, who manages it and which visitor requests recur. Demonstrate one of those exchanges. Suggest a staff owner, a success measure the buyer chooses, and a review date. Confirm the actual trial or procurement terms on the pricing page.'],
  ['today', 'Today’s Plan', '#view=today', 'today priority overdue calendar goals schedule next first plan tasks meetings pipeline metrics progress', 'Today’s Plan puts due follow-ups, meetings, replies and pending agreements in priority order for the signed-in rep. Open a task to work the record. Completing a checklist item records your personal check for the day. Booking or contacting the account uses its own workflow.'],
  ['coach-goal', 'My sales goal', '#view=coach', 'goal target quota period week month meetings prospects calls agreements signed progress achieve', 'In Ask Tinky, set a personal target, start date and deadline. The app counts prospects assigned to you and added in the interval, your confirmed meetings starting in the interval, calls you actually logged, or agreements credited to you and signed in the interval. The goal card shows live progress.'],
  ['chat', 'Staff channels and direct messages', '#view=chat', 'chat teammate staff direct DM online internal message private team channels', 'Tinky Team → Team chat has shared sales channels, private one-to-one DMs, and the Online now roster. Choose Message a teammate or an online name to open a DM. The AI conversation in Ask Tinky is private to the signed-in rep.'],
  ['calendar', 'Sales calendar', '#view=calendar', 'book appointment calendar meeting demo availability time booking link host', 'Tinky Team → Calendar manages host availability, booking links and confirmed appointments. Choose an available time, check the attendee details and confirm in Calendar. An outreach draft or a proposed meeting time does not book it.'],
  ['email', 'Sales email', '#view=email', 'email Zoho inbox mailbox sender message draft outreach send', 'Tinky Team → Email opens your workspace mailbox. Senders manages the assigned connection. Use a saved contact and review the recipient and draft before sending. Respect recorded do-not-contact preferences.'],
  ['territories', 'Territories', '#view=territories', 'county territory assignment street coverage map town territory market', 'Tinky Team → Territories shows assigned states, county coverage and local opportunities. Check county ownership and the assigned rep before planning outreach.'],
  ['pipeline', 'Pipeline and account activity', '#view=pipeline', 'pipeline saved accounts log call note next step followup follow-up reply stage account status CRM opportunity', 'Open an account in Pipeline. Record a follow-up logs an actual call, meeting, email or note. Plan the next follow-up saves a date. Record contact, a reply or the next step updates progress. Review the existing account and save the form.'],
  ['contracts', 'Contracts', '#view=contracts', 'agreement terms signature contract signed payment enrollment', 'Contracts shows agreement status. Review the saved business owner, evidence and current workspace terms on the account before preparing an agreement. Only recorded signatures and payments establish those statuses.'],
  ['campaigns', 'Campaigns', '#view=campaigns', 'campaign owner automation prospecting outreach list', 'The workspace owner manages campaign criteria and schedules in Campaigns. Reps use Prospects and Pipeline for their own accounts.'],
  ['care-pilots', 'Nursing-home campaigns and pilots', '#view=campaigns', 'nursing home facility pilot campaign sales kit measures workflow worksheet', 'In a senior-care workspace, Campaigns has the nursing-home sales kit, discovery conversation, demo and pilot worksheet. Agree on one unit, a staff lead, the baseline, a measure, and a review date. Open the saved facility to record the pilot. The example percentages in the kit are illustrative targets.'],
  ['training', 'Training Center', '#view=training', 'training curriculum lesson learn practice playbooks objection handling certifications demo lab pipeline', 'Training contains the course catalog, playbooks, Demo Lab, pipeline practice and your own training plan. Open a linked lesson to practice the skill, then apply it to an appropriate account in the live workspace.'],
  ['contacts', 'Contacts and Rolodex', '#view=contacts', 'contacts rolodex owner decision maker administrator name leadership', 'Tinky Team → Contacts or Owners & Rolodex holds business contacts. Confirm a person’s role, contact details and outreach preferences in the record.'],
  ['prospects', 'Prospects', '#view=prospects', 'prospect add create lead organization address office business facility research directory', 'Prospects lets staff research facilities and add a business by hand. The form requires an organization, street address, city and state. Fill verified details, then save the prospect.'],
  ['support', 'Support Center', '#view=support', 'help support question troubleshooting issue access help center', 'Open Support for workspace guides or send the support team a request describing the task and what happened.'],
].map(([id, title, href, tags, content]) => ({ id, title, href, tags, content }));

const curriculum = [...trainingCourses, ...trainingPlaybooks].flatMap(item => item.sections.map(section => ({
  id: 'learn-' + item.id + '-' + section.id,
  title: item.title + ' · ' + section.title,
  href: item.category ? '#view=training&course=' + item.id + '&lesson=' + section.id : '#view=training&section=playbooks',
  tags: [item.title, item.category, item.description].filter(Boolean).join(' '),
  content: section.steps.join(' ').slice(0, 1100),
})));

export function learningContext(saved) {
  if (!saved) return undefined;
  const byId = id => trainingCourses.find(course => course.id === id)?.title;
  return { currentCourse: byId(saved.currentCourseId), plan: (saved.plan || []).map(byId).filter(Boolean).slice(0, 6),
    completed: Object.keys(saved.completed || {}).map(byId).filter(Boolean).slice(-6) };
}

const words = value => new Set(String(value).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(w => !['the','this','what','can','for','have','how','with','that','and','from','please','are','would','you','our','want','could','some','help','get','into','tinkytown'].includes(w)) || []);
export function knowledgeFor(question, articles, user, demo) {
  const requested = words(question);
  const entries = guides.concat(articles.map(article => ({ id: 'help-' + article.id, title: article.title, href: '#view=' + (article.view || 'support'),
    tags: article.topic + ' ' + article.title, content: [article.description, ...article.steps].join(' ') })), curriculum);
  const score = item => {
    let total = 0;
    for (const [value, weight] of [[item.title, 5], [item.tags, 3], [item.content, 1]]) {
      for (const word of words(value)) if (requested.has(word)) total += weight;
    }
    return total;
  };
  const ranked = entries.filter(item => (item.id !== 'campaigns' || user.role === 'owner') && (!['demo','care-pilots'].includes(item.id) || demo))
    .map(item => ({ item, score: score(item) })).filter(row => row.score).sort((a, b) => b.score - a.score).slice(0, 4).map(row => row.item);
  if (!ranked.some(item => item.id === 'product')) ranked.push(guides[0]);
  return ranked;
}
