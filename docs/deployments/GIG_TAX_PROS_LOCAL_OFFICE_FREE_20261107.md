# Nearby office message, approved map and free access

The restored artwork homepage now centers its supporting copy on a nearby office
where customers can stop in and talk with an expert throughout the year. The map
replaces “The right help. All year long.” exactly where Luke requested. Its new
heading is “An office nearby. An expert to talk to.”

The approved hero HTML, original global stylesheet and original artwork are
unchanged. The map asset is the same SVG Luke approved. Responsive styling is
limited to the map section. Office addresses and opening hours remain described
as pending confirmation; no current nationwide coverage or round-the-clock
opening hours are claimed.

Gig Tax Pros is free to use. Paid-plan, fee-quote and pricing wording was removed
throughout the 19-page public site. Free-access information replaces the pricing
page; /pricing and /pricing.html permanently redirect to /free.

Source commits: e1efd31 (map/free access), 675471d (local-office copy).
Branch: fix/gig-tax-pros-restore-original.
Deployment: dpl_HYorbttwLESmAdMk7NHWvDJaSeWa, Ready.
Public addresses: https://gigtax.pro and https://www.gigtax.pro.

Six existing interaction checks passed. Source and DOM checks verified the
unchanged hero/global CSS/approved SVG, requested section position and free-access
copy across all 19 pages. All 54 public HTTP checks passed, including exact page
and asset bytes. Apex and www homepages match the saved build. Both legacy
pricing URLs return 308 to /free, whose bytes were independently checked using
curl (the host Python 3.9 redirect handler does not follow 308 automatically).

Detailed receipt: gig-tax-pros-free-map-verification-20261107.json.
The updated page was opened visibly in Safari at /#services for Luke's review.
HTTP and DOM checks do not establish his visual acceptance.

Earlier company-guide/app-showcase/partner-page additions remain archived on the
Connections branch; they have not been reintroduced. Use this restoration branch
for the public site, rather than republishing the rejected branch.
