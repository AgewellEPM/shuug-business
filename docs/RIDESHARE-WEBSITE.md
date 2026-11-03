# Rideshare client journeys and website scope

Luke's sequence: install and verify Shuug, finish the website for review, then
build the included driver app for mileage, income, expenses and receipts. Do not
describe the preparation planner as that app. Native background tracking versus
foreground web tracking is still an unresolved future platform choice.

## Research and design decisions

These are design inferences from published support material, not customer
interviews. The recurring jobs are to identify the right service, understand the
scope and fees, find platform records, resolve document questions, organize
vehicle/expense records, discuss tax payments, and know how private access works.

Primary sources reviewed November 2, 2026:

- [IRS gig-work guidance](https://www.irs.gov/businesses/small-businesses-self-employed/manage-taxes-for-your-gig-work): income, records and payment obligations.
- [IRS document preparation](https://www.irs.gov/filing/gather-your-documents): preparation checklist categories.
- [IRS record types](https://www.irs.gov/businesses/small-businesses-self-employed/what-kind-of-records-should-i-keep): supporting records.
- [IRS business vehicle guidance](https://www.irs.gov/taxtopics/tc510): method eligibility and record review; avoid a universal mileage-rate calculator.
- [IRS estimated taxes](https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes): professional payment/withholding review.
- [Uber US tax information](https://www.uber.com/us/en/drive/tax-information/) and [Lyft driver tax help](https://help.lyft.com/hc/en-us/all/articles/115012926967): source documents, annual summaries and driver-dashboard paths.
- [IRS Form 1099-K guidance](https://www.irs.gov/businesses/understanding-your-form-1099-k): form/context questions.
- [IRS preparer selection](https://www.irs.gov/taxtopics/tc254): identifying the actual preparer and engagement.

## Pages and their jobs

| Pages | Client's next useful action |
| --- | --- |
| Services and four service detail pages | Choose preparation, mileage/expenses, quarterly review or bookkeeping. |
| How it works | Understand preparation, engagement, review and follow-up. |
| Pricing & scope | Prepare the facts needed for a quote; no fabricated fees. |
| Get started | Choose help, tax year and platforms without entering personal data. |
| Document checklist | Mark record categories, print or download a preparation copy. |
| Resources and forms guide | Find original sources and platform instructions. |
| Searchable FAQ | Narrow questions by text and topic. |
| About and contact | Understand the firm and actual availability. |
| Client portal | Open only a configured HTTPS workspace; no fake password intake. |
| Privacy, terms and accessibility | Describe actual public-site behavior and feedback routes. |

The homepage and all inner pages share navigation and footer at build time.
The public site is static; customer account data stays out of its artifacts.
Year/platform/service preferences in checklist URL fragments are not sent in the
HTTP request. Checked items are not persisted. Download and print are explicit
visitor actions. No advertising or analytics dependency was added.

## Installed Shuug and acceptance

The macOS installer configures a separate persistent private data directory,
owner sign-in, the actual Rideshare Tax Pros business template and a loopback-only
LaunchAgent. It saves the generated credential to macOS Keychain without writing
the password to source, arguments or logs. Installation checks use the normal
CSRF-protected login and real authenticated Tax Firm routes.

Production build/TypeScript, the website journey checks and the public HTTP
verification establish compilation, interactions and publication. They do not
establish phone visual acceptance. Luke's screenshots remain required before a
claim that the site is visually accepted. Real contact details, reviewed fees,
staff credentials and public persistent client hosting remain activation work.
