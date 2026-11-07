import { appFeatures } from './app-features.mjs';
import { appScreens } from './app-screens.mjs';
import { escape as e, textLink } from './layout.mjs';

// Plain-language benefits accompany every feature, alongside its actual behavior.
const context = {
  offers: {
    name: 'Offer review & decisions', where: 'Offers → Read an offer or Enter → open the saved offer',
    why: 'Compare the work behind two payouts before committing your time. Review the miles, waiting, costs and missing information together.',
    example: 'A larger payout may involve a longer pickup and a drive away from home. Enter both jobs’ details and compare their time and cost assumptions before choosing in the original app.',
    screen: 'offer-detail',
    benefits: ['Keep offers from different supported sources in one review instead of remembering each quote.', 'Choose the reader for the platform you are actually using.', 'Review an offer without retaining a full screenshot of everything on your screen.', 'Spot an incomplete estimate before treating it as money you will keep.', 'Include the drive after the job when judging whether it fits your shift.', 'Avoid planning overlapping jobs or counting a quote as completed income.', 'Understand why an offer was not read or why advice needs more information.', 'Learn the controls with examples before working with your own records.'],
  },
  routes: {
    name: 'Go Home, Shift Mission & positioning', where: 'Go Home for your mission and route comparison; Position for personal waiting-area history',
    why: 'Work toward a money goal while keeping your finish time and destination in view. Include unpaid travel in the decision.',
    example: 'You want to finish near home by the end of your shift. Compare going directly with completing a job and then driving home, including the pickup, waiting and onward miles.',
    benefits: ['See progress from recorded, priced work toward the shift target you set.', 'Compare the complete journey instead of looking only at the paid portion.', 'Check the payout needed to meet your own hourly target.', 'Use your own past jobs to investigate where you might wait next.', 'See what it would cost to reach a waiting area before driving there.', 'Bring your own pickup experience into a future offer comparison.', 'Find return and repositioning miles that affect your working costs.', 'Choose the places used for route comparisons and understand when maps need them.'],
  },
  trips: {
    name: 'Trip recording & mileage', where: 'Home to start a drive; Trips to review, classify, edit or export it',
    why: 'Keep the distance, purpose and actual earnings behind a drive together, so you have a useful record to revisit.',
    example: 'Finish a delivery, end the drive, mark its purpose and add the fare and fees. If you drive back without a paid job, record that separately so the extra travel remains visible.',
    screen: 'alerts',
    benefits: ['See the time and miles being recorded while a drive is in progress.', 'Fill a missing record or log completed work that did not use GPS.', 'Review what a completed job left after its known fees and estimated vehicle cost.', 'Recognize gaps in a route before relying on the mileage total.', 'Get a reminder to start, end or complete a record when you enable the relevant permissions.', 'Keep working records on the phone and see which changes still need to be shared.', 'Correct mistakes and take a CSV copy of the records you have saved.'],
  },
  earnings: {
    name: 'Earnings, costs & goals', where: 'Home for today; Earnings for charts, periods, comparisons and goal settings',
    why: 'Understand what your recorded work earned after costs, where time went and which details are still missing.',
    example: 'After a week of mixed gig work, compare recorded results by platform, area and start hour. Open weaker jobs to check their fees, unpaid miles and missing details before changing your routine.',
    screen: 'home',
    benefits: ['Start the day with your saved work, rather than sample earnings presented as your own.', 'Avoid adding the same money twice when a platform payout covers trips already recorded.', 'Inspect the days behind a trend instead of relying only on a period total.', 'See how priced work compares with the targets you chose.', 'Compare the work you actually logged across platforms, areas and times.', 'See how unpaid travel changes the cost of a shift.', 'Explore historical patterns with the sample size and assumptions in view.', 'Plan an amount to set aside while keeping the choice under your control.'],
  },
  money: {
    name: 'Expenses, receipts & banking', where: 'Expense or Income on Home; Money for spending and bank-statement review',
    why: 'Turn purchases and deposits into organized records with supporting evidence, rather than a pile of unreviewed transactions.',
    example: 'You already entered a fuel purchase and attached its receipt. When a matching bank transaction arrives, link it to that record instead of adding the expense again.',
    benefits: ['Organize the different costs of your work in consistent categories.', 'Keep the reason for a purchase alongside its amount for later review.', 'Find the evidence attached to an expense without hunting through loose photos.', 'Notice incomplete records or possible duplicates while the purchase is still familiar.', 'Bring a supported bank statement into review without retyping every row.', 'Choose whether a transaction matches an existing record, needs a new entry or should be ignored.', 'Use an available approved bank connection to bring transactions into the same review process.', 'Keep a deposit distinct from a job fare so your income review makes sense.'],
  },
  coach: {
    name: 'Tax & Goals coach, ratings & feedback', where: 'Tax & Goals from Home tools; Ratings & Reviews in newer preview builds',
    why: 'Ask practical questions about saved work, find missing preparation records and keep the evidence behind an answer available.',
    example: 'Ask which recorded jobs earned the least after your costs. Follow the answer back to the trips, complete missing fields and discuss tax-treatment questions with your preparer.',
    benefits: ['Ask useful questions about your own journal even when shared account guidance is unavailable.', 'Check the recorded trips behind an answer and correct their inputs.', 'See which preparation tasks still need your attention.', 'Continue an account conversation with your firm when that workspace is connected.', 'Tell whether guidance came from phone records, the workspace or another configured source.', 'Keep your own dated rating snapshots together for like-for-like review.', 'Turn feedback you saved into specific strengths and improvement steps.', 'Choose whether personal feedback history joins your client account.'],
  },
  shopping: {
    name: 'Gig apps, delivery & in-store shopping', where: 'Home’s publisher app row, Universal Delivery and In-store Shopper',
    why: 'Keep records for different kinds of gig work in one journal, including work without a dedicated integration.',
    example: 'Record an in-store shopping job with its actual working time, payout and fees. If it involved no driving, enter zero miles so the calculation reflects that job.',
    screen: 'home',
    benefits: ['Reach the listed publisher apps or their official destinations from a familiar place.', 'Understand where the launcher will take you when an installed app link is unavailable.', 'Record work for a direct client or another delivery app under a label you recognize.', 'Include time spent shopping as well as any driving the job actually required.', 'Avoid inventing mileage or vehicle cost for a job with no driving.', 'Use consistent goals and cost assumptions across your different work profiles.'],
  },
  connections: {
    name: 'Your profile, tax team & privacy', where: 'Account to connect your invited client profile; the client portal for shared tax work',
    why: 'Keep your own records attached to the correct client identity and see what your tax team has actually received or requested.',
    example: 'After your firm invites you, sign in to that client account, choose whether to copy phone-only records and check the sharing status before assuming your preparer has them.',
    benefits: ['Keep the records for different client identities from appearing in the wrong account.', 'See pending changes and resolve competing versions before assuming sharing is complete.', 'Confirm which firm and client profile you are using.', 'Follow shared preparation stages and respond to a specific document request where configured.', 'Choose an authorized connection without confusing it with simply opening a gig app.', 'Review your own referral claims and reward history under the program’s terms.', 'Control permissions and understand which records stay on the device or are shared.', 'Understand the planned client-key and separate firm-recovery-key model before enabling protected Journal tools.'],
  },
};

function group(feature, index) {
  const detail = context[feature.id];
  if (detail.benefits.length !== feature.features.length) throw new Error(`Missing feature benefit: ${feature.id}`);
  const screen = appScreens.find(item => item.id === detail.screen);
  return `<section class="feature-chapter" id="${e(feature.id)}" data-feature-group aria-labelledby="${e(feature.id)}-title">
    <header class="feature-chapter-heading"><span class="feature-number">0${index + 1}</span><div><h2 id="${e(feature.id)}-title">${e(detail.name)}</h2><p>${e(detail.why)}</p><p class="feature-location"><strong>Where to find it:</strong> ${e(detail.where)}</p></div></header>
    <div class="feature-explanation"><div><h3>How you use it</h3><ol>${feature.steps.map(step => `<li><strong>${e(step.title)}.</strong> ${e(step.text)}</li>`).join('')}</ol><aside class="feature-example"><h3>A working-day example</h3><p>${e(detail.example)}</p></aside></div>${screen ? `<figure class="feature-reference"><a href="${e(screen.src)}" target="_blank" rel="noopener noreferrer"><img src="${e(screen.src)}" width="${screen.width}" height="${screen.height}" loading="lazy" decoding="async" alt="${e(screen.alt)}"></a><figcaption>Actual app preview · sample records<br>${e(screen.label)} · tap to enlarge</figcaption></figure>` : ''}</div>
    <div class="feature-entries">${feature.features.map((item, i) => `<article class="feature-entry" id="${e(feature.id)}-${i + 1}" data-feature-entry data-feature-search="${e(`${detail.name} ${item.title} ${item.text} ${detail.benefits[i]}`)}"><h3>${e(item.title)}</h3><p><strong>What it does</strong>${e(item.text)}</p><p class="feature-benefit"><strong>Why it helps you</strong>${e(detail.benefits[i])}</p></article>`).join('')}</div>
    <details class="feature-setup"><summary>Setup and availability for ${e(detail.name.toLowerCase())}</summary><ul>${feature.conditions.map(item => `<li>${e(item)}</li>`).join('')}</ul></details>
    </section>`;
}

export function howItWorksPage() {
  const total = appFeatures.reduce((sum, item) => sum + item.features.length, 0);
  return {
    slug: 'how-it-works', label: 'How it works', nav: '/how-it-works', featuresPage: true,
    title: 'How the app works.', eyebrow: 'GIG TAX PROS · IPHONE APP PREVIEW',
    seoTitle: 'How It Works: Gig Tax Pros App Features & Real Screens',
    description: 'What each Gig Tax Pros app feature does, why it helps your gig work, where to find it and how to use it. Read every feature below or jump to a topic.',
    body: `<div class="features-layout"><aside class="features-index"><nav aria-label="Feature topics"><h2>Jump to a topic</h2>${appFeatures.map(feature => `<a href="#${e(feature.id)}">${e(context[feature.id].name)} <span>${feature.features.length}</span></a>`).join('')}</nav><p>${total} explained features · 8 topics</p>${textLink('See real app images', '#app-images')}</aside><div class="features-content" data-feature-browser><div class="features-search" hidden><label for="feature-query">Search the actual features<input type="search" id="feature-query" data-feature-query placeholder="Try receipts, mileage, go home or bank"></label><button type="button" data-feature-clear>Clear search</button></div><p class="features-count" data-feature-count role="status" aria-live="polite">${total} features explained below</p><p class="features-empty" data-feature-empty hidden>No matching features. Clear your search or try a different word.</p>${appFeatures.map(group).join('')}<section class="feature-image-gallery" id="app-images"><h2>Real app images</h2><p>Actual iPhone app preview captures with empty or demonstration records. Select an image to see it at full size.</p><div>${appScreens.map(screen => `<figure><a href="${e(screen.src)}" target="_blank" rel="noopener noreferrer"><img src="${e(screen.src)}" width="${screen.width}" height="${screen.height}" loading="lazy" decoding="async" alt="${e(screen.alt)}"></a><figcaption>${e(screen.label)}</figcaption></figure>`).join('')}</div></section><aside class="features-availability"><h2>App availability</h2><p>This guide describes the iPhone app preview. Phone permissions are optional and depend on the tool you choose. Shared tax-team services, bank connections and provider access require their own setup. Each topic’s setup notes explain the details.</p>${textLink('Check client access', '/client-portal')}</aside></div></div>`,
  };
}
