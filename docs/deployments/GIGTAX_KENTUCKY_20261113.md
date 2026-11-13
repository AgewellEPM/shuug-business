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
matched its official legal name and full principal address through the new
adapter; two current members and one separate agent were returned. Both name
lookup and native profile-ID lookup round-tripped. The real Current Officers tab
removes the general-information panel; its hidden business IDs and visible
business heading are verified instead of assuming that panel remains present.

Six focused source checks cover native read-only forms, omitted personal
addresses/initial organizers, exact name and business identity, source limits,
challenge/outage handling, retryable officer failures and safe result caching.
All 223 sales/MCP checks and full TypeScript pass. A real empty native query also
returned an available zero-match result, separately from a source outage.
Deployment and installed acceptance for the new adapter remain pending.
Work and source receipts: /private/tmp/gigtax-kentucky-20261113.

Intended automatic selected-record coverage: 12 regions, with ten supporting
local registry discovery and 39 remaining manual. Town assignments still cover
all 51 regions independently of source coverage. No office, contact, salesperson,
message or payment is created by live verification. Mail is unconfigured,
payments deferred and human visual acceptance remains pending.
