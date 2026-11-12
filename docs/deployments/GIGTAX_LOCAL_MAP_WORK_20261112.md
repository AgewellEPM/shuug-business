# Active local tax-office map / ownership cross-reference — November 12

Luke supplied the live Find offices screenshot showing `hartord`, CT returning
zero. He wants a real local map of tax locations and cross-reference with business
information to understand owners. Existing tools-only/payment-deferral rules
persist: search/display public candidates, do not auto-save prospects or send mail.

Canonical SalesIntegrated checkout/branch unchanged. Current live baseline is
`dpl_Ao5ZuiPMG2opPtr3yjqGJwJLDG2u`, source/evidence `14a73c8`. Baseline output
is `~/BuildCache/GigTaxEarnings-20261112/release-verified/.vercel/output`.
This new work is not committed or deployed yet.

Observed live: `hartord` returned 0; `Hartford` returned 161 substring-matched,
chain-filtered IRS candidates. New code visibly resolves unambiguous city typos,
uses exact city/ZIP locality, includes chains and all paginated records, and
combines IRS providers with CT active tax/accounting registrations. Actual public
source test found 93 exact-Hartford IRS rows +85 CT registrations =>170 merged
candidates. 22 of the first25 addresses mapped with exact Census address matches.
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
Receipts: `gigtax-local-map-{checks,preservation}-20261112.json`.

Remaining: source commit/GitHub SHA backup; deploy and verify real HTTP/CSP,
Hartford pins/principal results via installed MCP, then refresh normal Safari
for Luke's screenshot. No shared dependency tree was modified.
Human visual acceptance and complete coverage of all operating tax businesses
remain unverified. Public IRS/registry records are partial/outdated and registered
addresses are not always storefronts. Other states get IRS maps; automatic registry
matching currently supports CT. Preserve unrelated How It Works receipt.
