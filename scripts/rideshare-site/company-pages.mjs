import { companies, companyCategories, companyRoute } from './companies.mjs';
import { escape as e, button, textLink } from './layout.mjs';

function companyCard(company) {
  return `<a class="company-card" href="/${companyRoute(company)}" data-search-card data-category="${e(company.category)}" data-search-text="${e([company.name, company.audience, company.category, ...company.searchTerms].join(' '))}">
    <span class="card-kicker">${e(company.category)}</span>
    <h3>${e(company.name)} <span aria-hidden="true">↗</span></h3>
    <p>${e(company.description)}</p><span class="company-card-action">Explore ${e(company.name)} taxes</span>
  </a>`;
}

function directoryPage() {
  return {
    slug: 'gig-companies', label: 'Gig company tax guides', nav: '/gig-companies',
    title: 'Your company.', accent: 'Your tax questions.',
    seoTitle: 'Gig Company Tax Guides: 1099s & Records | Gig Tax Pros',
    eyebrow: 'RIDESHARE · DELIVERY · LOCAL SERVICES · FREELANCE WORK',
    description: 'Find tax-form guidance, expense records and preparation checklists for Uber, DoorDash, Instacart, Amazon Flex and other U.S. gig companies.',
    companyPage: true,
    heroActions: `<div class="hero-actions-row">${button('Find my company', '#company-directory')}${button('Prepare for tax time', '/get-started', false)}</div>`,
    body: `<section id="company-directory" class="company-directory" data-search-library data-search-noun="company" data-search-plural="companies" aria-label="Find your gig company">
      <div class="search-controls"><label for="company-search">Company or tax question<input id="company-search" type="search" data-search-input placeholder="Try DoorDash, 1099 or pet care"></label><label for="company-category">Kind of work<select id="company-category" data-search-category><option value="all">All kinds of work</option>${companyCategories.map(category => `<option value="${e(category)}">${e(category)}</option>`).join('')}</select></label></div>
      <p class="search-result-count" data-search-count role="status" aria-live="polite">${companies.length} company guides</p>
      <div class="company-grid">${companies.map(companyCard).join('')}</div>
      <p class="empty-results" data-search-empty hidden>No matching company. Clear the filters or try a company name.</p>
      <noscript><p>All company guides are listed below the search controls. Open any guide without using search.</p></noscript>
    </section>
    <section class="article-section company-multiple"><p class="eyebrow">MORE THAN ONE APP?</p><h2>Bring the whole picture.</h2><p>Keep each company’s statements together, then bring all of them to the same tax conversation. Flag overlapping trips, shared expenses, refunds and transfers so the same amount is not counted twice.</p><div class="related-links">${textLink('Prepare your records', '/document-checklist')}${textLink('Review mileage and expenses', '/mileage-and-expenses')}${textLink('Plan a quarterly review', '/quarterly-taxes')}</div></section>
    <p class="company-disclosure">Independent Gig Tax Pros guides for U.S. workers. Company names identify the work discussed; they do not imply a partnership, endorsement or account connection.</p>`,
  };
}

function preparationLink(company) {
  return `/get-started#${new URLSearchParams({ company: company.id, need: 'filing' })}`;
}

function companyPage(company) {
  const related = company.related.map(id => companies.find(item => item.id === id));
  return {
    slug: companyRoute(company), label: `${company.name} taxes`,
    nav: '/gig-companies', parent: { slug: 'gig-companies', label: 'Gig company guides' },
    title: `${company.name} taxes.`, accent: 'A clearer starting point.',
    seoTitle: `${company.name} Taxes, Forms & Records | Gig Tax Pros`,
    eyebrow: `${company.category.toUpperCase()} · U.S. TAX PREPARATION`,
    description: company.description, companyPage: true,
    heroActions: `<div class="hero-actions-row">${button('Build my preparation plan', preparationLink(company))}${button('Find tax documents', '#company-documents', false)}</div><p class="company-audience">For ${e(company.audience)}</p>`,
    body: `<div class="reading-layout company-reading"><article>
      <section class="company-intro"><h2>Start with your ${e(company.name)} work.</h2><p>${e(company.intro)}</p></section>
      <section class="article-section" id="company-documents"><p class="eyebrow">TAX FORMS & EARNINGS</p><h2>Your ${e(company.name)} document checklist.</h2><ol class="company-records">${company.documents.map((item, index) => `<li><span class="step-number" aria-hidden="true">0${index + 1}</span><div><h3>${e(item.title)}</h3><p>${e(item.text)}</p></div></li>`).join('')}</ol></section>
      <aside class="company-watchout"><p class="eyebrow">A DETAIL WORTH CHECKING</p><h2>${e(company.watchout.title)}</h2><p>${e(company.watchout.text)}</p></aside>
      <section class="article-section" id="company-expenses"><p class="eyebrow">EXPENSES & PREPARATION</p><h2>Bring records behind the numbers.</h2><p>Use these prompts to organize a review. An expense record alone does not establish that a deduction is allowed.</p><div class="company-expenses">${company.expenses.map(item => `<section><h3>${e(item.title)}</h3><p>${e(item.text)}</p></section>`).join('')}</div>${textLink('Understand mileage and expense records', '/mileage-and-expenses')}</section>
      <section class="article-section" id="company-questions"><p class="eyebrow">${e(company.name.toUpperCase())} TAX QUESTIONS</p><h2>Get your next step clear.</h2><div class="faq-list inner-faq">${company.faqs.map(item => `<details><summary>${e(item.question)}<span aria-hidden="true">+</span></summary><div><p>${e(item.answer)}</p></div></details>`).join('')}</div></section>
      <section class="source-note" id="company-sources"><h2>Go to the official sources.</h2><p>Platform resources reviewed November 7, 2026. Check the instructions for your account, role and tax year.</p><ul>${company.sources.map(source => `<li><a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.label)} ↗</a></li>`).join('')}<li><a href="https://www.irs.gov/businesses/small-businesses-self-employed/manage-taxes-for-your-gig-work" target="_blank" rel="noopener noreferrer">IRS · Manage taxes for your gig work ↗</a></li></ul></section>
    </article><aside class="reader-aside company-guide-nav"><span class="brand-symbol" aria-hidden="true"></span><p class="eyebrow">YOUR TAX PREPARATION GUIDE</p><h2>One company.<br>Clear next steps.</h2><nav aria-label="On this company guide">${textLink('Tax forms and earnings', '#company-documents')}${textLink('Expense records', '#company-expenses')}${textLink('Company tax questions', '#company-questions')}${textLink('Official source links', '#company-sources')}</nav>${button('Prepare for my review', preparationLink(company))}<p class="field-hint">Confirm the preparer, availability, scope and fees before an engagement.</p></aside></div>
    <section class="inner-cta"><div><p class="eyebrow">${e(company.name.toUpperCase())} TAX PREPARATION</p><h2>Your work. A plan for your records.</h2><p>Organize the questions and documents you want to discuss with a tax professional.</p></div>${button('Create my preparation plan', preparationLink(company))}</section>
    <section class="article-section"><p class="eyebrow">WORKING ACROSS APPS</p><h2>Explore another company.</h2><div class="company-grid company-related">${related.map(companyCard).join('')}</div>${textLink('Browse every company guide', '/gig-companies')}</section>
    <p class="company-disclosure">Gig Tax Pros is independent of ${e(company.name)} and is not endorsed by it. This guide provides general U.S. preparation information, not individualized tax advice or access to your platform account.</p>`,
  };
}

export function companyPages() { return [directoryPage(), ...companies.map(companyPage)]; }
