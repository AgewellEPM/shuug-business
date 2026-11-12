# Deployed local tax-office map / business cross-reference — November 12

Luke supplied the live Find offices screenshot showing `hartord`, CT returning
zero. He wants a real local map of tax locations and cross-reference with business
information to understand owners. Existing tools-only/payment-deferral rules
persist: search/display public candidates, do not auto-save prospects or send mail.

Canonical checkout: `/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`,
branch `feat/gig-tax-pros-sales-integrated`. Implementation `bd0d54a65afed9c7746d5958967c0b3533474cbe`
is committed and GitHub SHA verified on `AgewellEPM/shuug-business` (public).
Ready deployment `dpl_2WQsrsQnLtjW89Ko5qqDS7Fp7ECn` serves https://gigtax.pro/sales.
It replaces baseline `dpl_Ao5ZuiPMG2opPtr3yjqGJwJLDG2u`, source/evidence `14a73c8`.
Baseline output remains `~/BuildCache/GigTaxEarnings-20261112/release-verified/.vercel/output`.

Before this change, `hartord` returned 0; `Hartford` returned 161 substring-matched,
chain-filtered IRS candidates. New code visibly resolves unambiguous city typos,
uses exact city/ZIP locality, includes chains and all paginated records, and
combines IRS providers with CT active tax/accounting registrations. Actual public
production check through the installed Shuug MCP found 93 exact-Hartford IRS rows
+ 85 CT registrations => 170 merged candidates. Every returned address was checked;
121 mapped and 49 remained unmatched, retained in the list without guessed pins.
A real CT record returned its linked principal. No real pipeline records changed.

New modules: sales/{local-discovery,business-registry,geocoding,public-data}.mjs,
local-offices.js/css, self-hosted Leaflet1.9.4 with required license/icons. Existing
service adds three authenticated read-only actions. Native Shuug MCP sdr_read
adds local_offices/business/map_addresses resources using the same backend.
Public-source candidate tokens are actor/territory/expiry bound; only signed
search results may be geocoded or cross-referenced. Principal residence/demographic
fields are excluded. Names/addresses must be reviewed; principals, managers,
registered agents and IRS contacts are never automatically called owners.

UI: full-width interactive local map and all-result list, chain/source/text filters,
co-located businesses sharing a pin, unplaced addresses retained without guessed
pins, incremental Census mapping and legal-record/principal panel. Prepare only
fills the existing office form; saving remains explicit and ownership unverified.
The approved green earnings card and other console tabs stay intact.

One private `/sales` CSP route permits OSM tile images; global public CSP/headers
stay exact. Tile images explicitly send origin-only Referer per OSM policy, with
visible attribution, normal caching and no prefetch/bulk tile access. No browser
runtime was installed/launched. Leaflet is a pinned static library, not a browser.

Verification: all 173 focused sales/MCP checks pass, including the real Leaflet
deep-link DOM check, native stdio MCP integration and release guard. The initial
sandbox run blocked the temporary localhost fixture; the permitted rerun passes.
Both full-project TypeScript and the strict changed-MCP check pass on the final
checkout. The earlier external-drive type dependency blocker no longer reproduces.
The guard verifies all 180 baseline artifacts, 89 unchanged static files, existing
public routes/CSP/headers and the approved earnings card. Candidate: 206 artifacts.
Final tested release: `~/BuildCache/GigTaxLocalMap-20261112/release-verified`.
Receipts: `gigtax-local-map-{checks,preservation,live}-20261112.json`.

Live verification: all 206 uploaded artifact hashes and 101 static HTTP responses
match. All 89 protected static files and their public headers remain exact. Both
`/sales` and `/sales.html` return the intended private tile policy; one actual OSM
tile returned a valid PNG. Production aliases were checked before/after the live
verifier. The installed `~/bin/gigtax-sales-mcp` reports owner access, the same
workspace/Rolodex/pipeline/contracts/senders, zero saved offices/agents/contacts/
contracts/senders, zero earned commissions and the confirmed commission plan.
Email and payments remain unconfigured. No outreach, provider setup, payment or
real prospect write occurred. The sandbox's first live-verifier attempt returned
an empty CLI response; the permitted network rerun passed all checks.

Safari was opened on the authenticated Hartford discovery view on the normal
desktop for Luke's review. No shared dependency tree was modified. Remaining:
Human visual acceptance and complete coverage of all operating tax businesses
remain unverified. Public IRS/registry records are partial/outdated and registered
addresses are not always storefronts. Other states get IRS maps; automatic registry
matching currently supports CT. Preserve unrelated How It Works receipt.
