# Nationwide discovery and territory expansion — November 12

Active scope: connect state business research nationwide using **free public
sources only**, then let the owner drill into every state and assign towns/cities
to sales agents. This work is not complete. State-only assignments must become
local territory assignments with backend enforcement, not just a visual filter.

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
`dpl_BhMbwN4EUNTwKDTtENNLJuYEwsZT`. Deployment/live verification is pending in this
checkpoint. No visual acceptance or complete nationwide registry coverage claimed.

## Remaining work and evidence

- Implement and verify state → towns/cities assignment in the existing Territories
  view. Currently it only lists cities already saved and stores agent states.
- Run `scripts/sales/verify-national-discovery.mjs` after deployment. It verifies
  one locality per state/DC, directory contact sources, sampled maps and connected
  registry IDs through the installed MCP, while comparing saved offices/contacts.
  Incremental receipts prevent losing long-running evidence. An earlier baseline
  attempt produced many successful state checks but no final saved receipt when
  storage filled; it is not a completed nationwide proof.
- Remaining official sources require individual free adapters. Iowa moved its
  public data to `idh-be.iowa.gov/api/v1/datasets/554/rows.json`; the documented
  download ignored `limit=1` and exceeded the bounded probe. Its separate SOS API
  advertises paid subscriptions; none was purchased. Florida/California automated
  search probes were blocked; no challenge bypass was attempted. New Mexico's
  public frontend exposes a business search endpoint and a bounded anonymous TAX
  query returned a `template`/`rows` response; it is not integrated yet.
- Continue website-source discovery verification. Empty provider results are not
  proof that a business has no website or contact information.

Local source metadata and count-only receipts are under
`~/BuildCache/GigTaxNationwide-20261112`. No real agent, CRM contact, contract,
message or payment was created. Mail remains unconfigured and payments deferred.
Preserve the unrelated untracked How It Works HTTP receipt and parallel work.
