# Nationwide discovery and territory expansion — November 12

Active scope: connect state business research nationwide using **free public
sources only**, then let the owner drill into every state and assign towns/cities
to sales agents. Full automatic registry coverage is not complete.

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
Town interface deployment and deployed catalog checks remain pending in this
source checkpoint. Human Safari/phone acceptance remains separate.

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

- Publish and verify the prepared territory interface. Run
  `scripts/sales/verify-territories-live.mjs` against the deployed portal; it checks
  every state's actual first-page records against the saved Census catalog,
  Connecticut pagination/search and unchanged real offices/agents.
- Remaining official sources require individual free adapters. Iowa moved its
  public data to `idh-be.iowa.gov/api/v1/datasets/554/rows.json`; the documented
  download ignored `limit=1` and exceeded the bounded probe. Its separate SOS API
  advertises paid subscriptions; none was purchased. Florida/California automated
  search probes were blocked; no challenge bypass was attempted. New Mexico's
  public frontend exposes a business search endpoint and a bounded anonymous TAX
  query returned a `template`/`rows` response; it is not integrated yet.
- Continue website-source discovery verification. Empty provider results are not
  proof that a business has no website or contact information.

Count-only deployed evidence is in `gigtax-nationwide-live-20261112.json` and
`gigtax-nationwide-preservation-live-20261112.json`. Territory D1 and preservation
receipts are adjacent. Local source metadata and additional receipts are under
`~/BuildCache/GigTaxNationwide-20261112`. No real agent, CRM contact, contract,
message or payment was created. Mail remains unconfigured and payments deferred.
Preserve the unrelated untracked How It Works HTTP receipt and parallel work.
