# Local office business-contact research — November 12

The private Find offices view now researches public business contact channels for
directory offices and listed registry principals. Select a result, use Find contact
sources, review the official business website, read its contact pages, then select
the evidence to prepare the existing office form. Saving remains explicit. Each
finding carries its source and check time; a downloadable report preserves evidence.
Business inboxes/phones and listed principals are not automatically verified direct
contacts or owners. Missing data stays unknown. Research never sends outreach.

Canonical checkout: `/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`,
branch `feat/gig-tax-pros-sales-integrated`. Source
`0d83bbff6c05691c8408d1b4153f099e5b8d9285` is GitHub-SHA-verified on the existing
public `AgewellEPM/shuug-business` remote. Production deployment
`dpl_BhMbwN4EUNTwKDTtENNLJuYEwsZT` serves https://gigtax.pro/sales.
Prepared artifact: `~/BuildCache/GigTaxContactResearch-20261112/release-verified`.
Previous production baseline: `dpl_2WQsrsQnLtjW89Ko5qqDS7Fp7ECn` and
`~/BuildCache/GigTaxLocalMap-20261112/release-verified/.vercel/output`.

The screenshot exposed unrelated property companies matched by street number.
Registry matching now requires a meaningful business name or full tax-business
address match before fetching principals. Production verification excludes those
unrelated matches. Exact business IDs remain strongest; related names and differing
addresses are explicitly unconfirmed. CT is still the only automatic state registry;
IRS office search and the business-website reader work independently of CT support.

Implementation reuses the existing bounded, DNS-pinned public website reader and
TinkySDR search endpoint. It honors robots policies, stops at challenges, and does
not guess addresses or use personal-lookup databases. The service uses actor-bound,
territory-bound, expiring research tokens and checks saved office suppression.
No new vendor accounts or credentials were configured. The installed Shuug MCP
exposes the same flow through `sdr_read`, resource `contact_research`; see
`../GIGTAX_CONTACTS_MCP.md` for its arguments.

Verification: all 177 focused sales/MCP checks pass, including real Leaflet DOM,
reviewed contact preparation and explicit synthetic save, principal-token isolation,
suppression and registry false matches. Six final focused checks and full-project
TypeScript pass. No browser runtime was used. The exact release guard verifies all
206 baseline artifacts; 211 final artifacts and 102 static HTTP files match deployed
bytes. All 89 protected static files, public headers and existing routes/CSP remain
exact. Public pages, media, payments and the confirmed earnings card are preserved.

Installed production MCP checks: Hartford still has 170 candidates, 121 mapped and
49 unmatched. Public directory rows include 93 phones and 77 business emails; these
counts overlap and do not establish deliverability or current operation. The contact
reader returns a real directory person/phone and independently extracts the same
office phone from two checked official business pages. Saved offices, contacts,
agents, contracts and senders stay at zero. Email and payments remain unconfigured.
Receipts: `gigtax-contact-research-{checks,preservation,live}-20261112.json`.

Limits: the tested automatic website-search query returned zero candidate links
without a provider error. Manual business/professional search links and explicit
official-website entry remain available; website extraction works live. Do not
describe automatic website discovery as comprehensively verified. No exact Liberty
Eagle or Golden Eagle project was found in accessible GitHub repository/code search;
no similarly named social-recon tool was installed or executed. Source coverage,
ownership, mailbox deliverability and new UI visual acceptance remain unverified.
No real CRM population, outreach, provider setup or payments occurred. Private local
CSV/JSON research exports are excluded from this public repository. The pre-existing
untracked How It Works HTTP receipt remains untouched.
