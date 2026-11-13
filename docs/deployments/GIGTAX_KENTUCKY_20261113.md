# Kentucky free selected-business lookup — November 13

Objective: continue free state sources in the existing GigTax sales portal. Source
checkout: Worktrees/GigTaxProsSalesIntegrated-20261107, branch
feat/gig-tax-pros-sales-integrated, existing AgewellEPM/shuug-business remote.

## Behavior and limits

The [Kentucky public business search](https://sosbes.sos.ky.gov/BusSearchNProfile/search.aspx)
now has a selected-business adapter. It reads the native public business-name form
and profile's Show Current Officers view without an account or browser runtime.
Downloaded scripts are never executed. The separate paid commercial bulk service,
filing actions, certificate purchases and searches across a person's businesses
are not used.

At most two bounded name searches return up to 100 rows each. Only exact
normalized legal-name matches open profiles, with a maximum of three profiles.
Each native profile and Current Officers view is bounded to 2 MB per response,
15 seconds per request and 40 seconds overall. The adapter checks the native
profile number, business organization number and visible business heading before
accepting current names. A challenge or unexpected page format fails closed.
Only sanitized successful results enter the bounded one-hour cache; transient
officer errors retain the business record and are retried rather than cached.

The principal business office and its unit are retained. Registered-agent address
lines are discarded. Current officer/member/manager names retain their published
roles and official profile source; initial organizers and agent names never become
owner findings. Officers' source links point to the same official business record;
choose Show Current Officers there to review the names. The latest annual-report
date is displayed as a source note, not a verification of current ownership.

Kentucky's [official FAQ](https://www.sos.ky.gov/bus/businessrecords/Pages/FAQs.aspx)
explains that its records list officers/directors/managers/members rather than
establishing entity ownership and exclude sole proprietors. This adapter does not
provide Kentucky town-wide registry discovery. The existing IRS directory,
contact-place catalogue and nationwide territory controls remain separate.

## Verification and release state

The installed portal before this change returned 31 Elizabethtown directory
candidates and manual Kentucky registry status. A real selected directory office
matched its official legal name and principal-office address through the new
adapter; two current members and one separate agent were returned. Both name
lookup and native profile-ID lookup round-tripped. The real Current Officers tab
removes the general-information panel; its hidden business IDs and visible
business heading are verified instead of assuming that panel remains present.

Six focused source checks cover native read-only forms, omitted personal
addresses/initial organizers, exact name and business identity, source limits,
challenge/outage handling, retryable officer failures and safe result caching.
All 223 sales/MCP checks and full TypeScript pass. A real empty native query also
returned an available zero-match result, separately from a source outage.
Source 915d6f7aa6e097e3d660d186bd13633a925d770f is GitHub-SHA-verified. Ready
deployment dpl_Drhia69AYchHpEQRCmsLvm7TkyyA serves https://gigtax.pro/sales.
Prepared release: /private/tmp/gigtax-kentucky-20261113/release.
The guard verifies the complete 686-file current baseline and prepares 690 files,
with eight backend replacements and four copies of the new Kentucky module.
Every existing static file, town-data record, route, header and CSP stays exact.

The installed MCP selected the actual Elizabethtown directory office, matched its
name and principal-office address, round-tripped the native profile ID, and
compared both current members' names/roles with a fresh public-source lookup.
The separate agent and annual-report date were retained. Principal contact
research retained its official source and returned one website suggestion.
Saved offices, agents, contacts, contracts and mailboxes remained unchanged.
All 690 deployed artifact hashes and 105 static HTTP files match the prepared
release. All 87 protected public files and their headers remain exact. The
installed Hartford map still returns 170 candidates / 121 address pins, and its
official-site contact reader, authentication, pipeline and commission checks pass.
The final deployment also rechecked both Delaware and D.C.: their 22 / 137 source
records and selected official IDs still resolve, including D.C.'s owner-source
name in contact research. D.C.'s sampled automatic website search remains
unavailable; catalogue and website coverage are still partial.

Evidence: gigtax-kentucky-live-20261113.json,
gigtax-kentucky-deployed-live-20261113.json,
gigtax-kentucky-preservation-20261113.json and
gigtax-delaware-dc-recheck-20261113.json. All owned verifier children closed.

Live automatic selected-record coverage: 12 regions, with ten supporting
local registry discovery and 39 remaining manual. Town assignments still cover
all 51 regions independently of source coverage. No office, contact, salesperson,
message or payment is created by live verification. Mail is unconfigured,
payments deferred and human visual acceptance remains pending.

Remaining source investigation: 39 regions are manual. Current Rhode Island
search includes a Turnstile challenge script; Massachusetts returned HTTP 403.
Hawaii's old page redirects to its new business portal with challenge scripts.
None was bypassed or promoted to automatic coverage. Continue checking current
official free selected-record or licensed open-data routes per state; an open
homepage or official link is not an integration.
