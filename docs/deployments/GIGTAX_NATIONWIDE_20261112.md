# Nationwide discovery and territory expansion — November 12

Active scope: connect state business research nationwide using **free public
sources only**, then let the owner drill into every state and assign towns/cities
to sales agents. Full automatic registry coverage is not complete.

## Iowa and Alaska free-source expansion — November 13

Two additional official sources are connected: Iowa's monthly active-business
dataset and Alaska's partial business-license extract. Automatic selected-record
lookup covers nine states (AK, CO, CT, IA, NM, NY, OR, PA, TX); eight support local
registry discovery. The remaining 42 regions still need automatic connectors.
Town/city assignments remain available in all 50 states/DC, including all 169
Connecticut towns, independently of registry-source coverage.

Iowa uses the public data viewer for [dataset 554](https://data.iowa.gov/catalog/dataset/554).
The adapter resolves its current read-only query reference from bounded same-site
scripts without executing them. Fixed business fields and escaped literals limit
queries to 500 displayed rows; action rotation gets one refresh. The monthly feed
omits sole proprietors and some partnerships and supplies registered agents rather
than owners. Agent addresses are excluded. The interface preserves Iowa Secretary
of State/Data Hub attribution and the CC BY 4.0 license link.

Alaska uses the official [DCCED license layer](https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2).
Its state/city matching excludes roughly 12% of active licenses; it is not a
complete corporations registry. The source note and primary licensing link make
that limit explicit. Literal public name searches are bounded and locally filtered;
selected license IDs round-trip independently of corporate entity IDs. Published
owner fields may identify a person or an entity and remain unverified. Mailing
addresses and the layer's arbitrary community-centroid geometry are excluded.
Actual street-address geocoding remains the only source of displayed pins.

Direct source checks returned 65 Des Moines and 190 Anchorage tax/accounting
records, with selected-ID matches and the Alaska record source link verified.
All 201 focused sales/MCP checks and full TypeScript pass. The artifact guard
verified the current 449-file deployment and prepared 461 files, preserving all
88 protected static files and existing routes/headers/CSP. The prepared release is
`~/BuildCache/GigTaxNationwide-20261112/release-iowa-alaska-20261113`.
A fresh installed-MCP read verified all 51 deployed town catalogs, 44,456 locality
names and CT pagination/search; saved offices and agents remained unchanged.
Source changes are ready for deployment; post-deployment source checks remain.
No real office, contact, salesperson, message or payment is created by these checks.

## New Mexico selected-business lookup milestone

The free public Secretary of State search and filing-detail routes now provide
automatic legal-name lookup for a selected directory office in New Mexico.
`sales/registry-new-mexico.mjs` makes at most two bounded name queries and reads
up to six matching records. It returns published officers/directors and keeps
registered agents separate. Filing organizers are not owner findings. Only
selected business/name fields are cached; agent addresses are excluded.

The public response omits business addresses. The registry record remains
addressless, while contact research explicitly retains the selected directory
office as its context. Current town permissions and the saved office's contact
suppression therefore still apply. The interface labels a legal-name match as
address unconfirmed and explains the directory context before contact research.
Source review and saving remain explicit; no outreach is sent.

Coverage now distinguishes `automaticRecords` (seven states) from
`automaticLocalDiscovery` (six states). NM has selected-business lookup only;
town-wide registry discovery remains unavailable there. The other 44 regions
still need automatic connectors. Town assignment works across all 51 regions
independently of registry coverage.

All 195 focused sales/MCP checks and full TypeScript pass. Both actual shipped
DOM paths (records with and without business addresses) research a principal and
prepare/save only a reviewed synthetic office. Tests cover current town access,
saved do-not-contact enforcement, source schema failures, bounded queries and
excluding personal addresses. Direct free-source checks matched the real NM
Accounting Concepts record and its director without a business address. The exact
prepared module also round-tripped its internal registry ID. Test log:
`~/BuildCache/GigTaxNationwide-20261112/new-mexico-tests.log`.

Source `8b85cc95961145d373266c768b702d55c8dd2790` is GitHub-SHA-verified.
Prepared release: `~/BuildCache/GigTaxNationwide-20261112/release-new-mexico`.
Deployment `dpl_ApZduyiPvq2NcSYtpojGW9PVrroL` is Ready at https://gigtax.pro/sales.
All 449 uploaded artifacts and 104 static HTTP files match; all 88 protected
static files and existing routes/headers/CSP remain exact. Installed MCP verified
the existing Hartford search/map/principal path, published business contact reader,
commission plan and authentication. Saved offices/contacts/agents remain unchanged,
mail remains unconfigured and payments deferred. The separate installed New Mexico
check passed: 489 Albuquerque directory candidates; one selected legal record,
one published director and one separately labelled agent. Principal research kept
the selected office address and official name source. Website search returned zero
suggestions (`no_results`), so comprehensive website discovery is still unproven.
Evidence: `gigtax-new-mexico-live-20261112.json`; preservation/deployed receipts
are adjacent. Human Safari/phone acceptance remains
unverified; no prohibited browser runtime was used.

## Town assignment milestone

The existing Territories map now opens a complete selectable locality catalog for
any state. The owner chooses a salesperson, selects towns/cities, assigns a whole
state or removes that state's coverage, then explicitly saves. Search and paging
work before any offices are saved. Other explicitly assigned states are retained;
the first restricted assignment replaces legacy nationwide access. Empty restricted
coverage grants no states. Changes do not reassign existing pipeline records.

The reproducible Census 2026 Gazetteer catalog contains 44,456 unique locality
names across all 50 states/DC, including exactly 169 Connecticut towns. Source URLs
and SHA-256s are in `sales/territory-data/manifest.json`. Other states combine
municipal subdivisions, incorporated places and Census communities. Coverage uses
the office's recorded city/town name within its state, not a parcel boundary or
ZIP approximation. Same-named localities within a state share coverage. Postal
aliases that differ from the assigned town name require review; they are not
silently inferred. This matching basis is displayed in the product.

Backend enforcement covers directory/local search, result filtering, already
issued research/map tokens, saved-office visibility, creation and reassignment.
Every request reloads agent identity, so an existing signed-in session receives
the current restrictions. Only the owner can change territories. Revision and
conditional writes reject concurrent stale edits. Existing state-only agent
permissions remain compatible until the owner explicitly changes them.

All 190 focused sales/MCP checks and full TypeScript pass. The shipped DOM workflow
opens Connecticut without saved leads, pages all 169 towns, filters Hartford,
saves its selection through the actual handler, retains California and opens its
catalog. The exact prepared backend passed real D1 writes on four disposable
boards, including save/reload, stale rejection, access denial and clearing all
coverage; all four boards were archived and verified. No real salesperson or
office was created. Prepared release: `~/BuildCache/GigTaxNationwide-20261112/release-territories`.
Its guard matches 227 baseline artifacts and prepares 445 files; all 88 protected
static artifacts and existing routes/headers/CSP remain exact. The prior protected
count included the private console script that this requested interface changes.
Town source `177fc3f557bc7f145a9de5a22b1ba5d077d2e220` is GitHub-SHA-verified.
Ready deployment `dpl_HyZvLPudGv6MBqDG891gMxsUxWZK` serves https://gigtax.pro/sales.
All 445 uploaded artifacts, 104 static HTTP files and 88 protected static artifacts
match the tested release. Installed MCP checked all 51 deployed town catalogs
against the source records: 44,456 locality names, CT pagination 100 + 69, and four
Hartford-name search matches. Real saved offices/agents remained unchanged.
The existing Hartford map, principal/contact reader, commission card, authentication,
mail/payment deferral and public site checks still pass. Human Safari/phone
acceptance remains separate; no prohibited browser runtime was used.

Canonical checkout is `Worktrees/GigTaxProsSalesIntegrated-20261107`, branch
`feat/gig-tax-pros-sales-integrated`. The existing public GitHub remote is
`AgewellEPM/shuug-business`; private contacts and credentials are excluded.

## Registry milestone

Connecticut plus five additional official sources are implemented: Colorado,
New York, Oregon, Pennsylvania and Texas. The new sources are fixed Socrata
datasets documented in `sales/registry-socrata.mjs`. Real source reads returned
404 Denver, 351 Albany, 465 Portland, 214 Philadelphia and 418 Austin records;
each selected business ID round-tripped. These counts are bounded public tax/
accounting registration results, not counts of confirmed operating storefronts.

NY supplies chairman/CEO names where published. Oregon supplies authorized
representatives where published. Registered agents remain separate from
principals. Colorado's feed supplies registered agents; PA and TX supply no
principal names in the connected feeds. No role automatically establishes
ownership. Full-address and meaningful-name matching rejects unrelated property
companies that merely share a street number. State identity namespaces registry
IDs. Fixed field selections omit agent/officer residential fields and unnecessary
tax IDs.

All 50 states/DC have official registry routes and explicit automatic/manual
coverage in the UI and `sdr_read(state_coverage)`. Official links are not automatic
integrations. Current official-site links correct stale NASS entries; the federal
SkillBridge verification directory is a secondary directory source. Its erroneous
New Mexico-to-New Jersey link was not used. Coverage still has 45 manual regions.
The no-result website query gets one simpler business-name retry and reports a
remaining gap explicitly. This does not establish reliable automatic web search.

Verification: 185 focused sales/MCP checks pass; full project TypeScript passes.
The MCP test requires loopback access and was rerun outside the sandbox after
EPERM. Exact release preservation verifies all 211 current baseline artifacts,
227 candidate artifacts, all 89 protected public files, and unchanged routes,
headers and CSP. Prepared output:
`~/BuildCache/GigTaxNationwide-20261112/release-verified`. Baseline production is
`dpl_BhMbwN4EUNTwKDTtENNLJuYEwsZT`. Registry source `1053f464487aa999d2c7cd0bb32dff871af55947`
is GitHub-SHA-verified. Registry deployment `dpl_EKukpgvQsXR94f7qCWx9FbpbrafV` is
Ready at gigtax.pro. All 227 uploaded artifacts and 102 static HTTP files match.
The full installed-MCP nationwide probe passed 51/51 regions, verified 51 sourced
directory phones, mapped 370 sampled addresses and round-tripped all six connected
registry IDs. Saved offices and contacts stayed unchanged. A separate Hartford
contact proof returned five website suggestions and read the real business phone
from two official pages; the nationwide sample still returned zero website
suggestions with mixed no-result/unavailable outcomes. Website discovery remains
inconsistent. No visual acceptance or complete registry coverage claimed.

## Remaining work and evidence

- Luke reviews the live town assignment interface in Safari/phone. No real agents
  exist yet, so add the intended salesperson in Sales team before assigning their
  towns in Territories. No actual person's access or assignments were fabricated.
- Remaining official sources require individual free adapters. Iowa's public
  viewer adapter is described above; its bulk download ignored `limit=1` and
  exceeded the bounded probe. Its separate SOS API advertises paid subscriptions;
  none was purchased. Florida/California automated
  search probes were blocked; no challenge bypass was attempted. New Mexico's
  selected-name connector is described above. Similar public route probes for
  Idaho/North Dakota returned 404 and Montana returned 403 even outside the
  sandbox; those sources were not promoted to automatic coverage. Inspect each
  state's own current frontend/configuration before assuming the NM route works.
- Continue website-source discovery verification. Empty provider results are not
  proof that a business has no website or contact information.

Count-only deployed evidence is in `gigtax-nationwide-live-20261112.json` and
`gigtax-nationwide-preservation-live-20261112.json`. Territory D1 and preservation
receipts are adjacent, together with `gigtax-territories-live-20261112.json` and
`gigtax-territories-deployed-live-20261112.json`. Local source metadata and additional receipts are under
`~/BuildCache/GigTaxNationwide-20261112`. No real agent, CRM contact, contract,
message or payment was created. Mail remains unconfigured and payments deferred.
Preserve the unrelated untracked How It Works HTTP receipt and parallel work.
