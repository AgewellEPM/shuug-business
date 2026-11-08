# Google driver routes implementation

Google is the selected Android mapping provider. Native directions handoff
opens the Google Maps app; automatic in-app comparisons use the Google Maps
SDK and the firm's authenticated Google Routes endpoint. Android configuration
and renderer details are in [ROUTING_SETUP.md](../ROUTING_SETUP.md).

The workspace owner can save a dedicated driver server key and enable lookups
under Settings → Driver app connections → Google Maps route comparisons.
Blank password fields retain the encrypted key. Disabling lookups retains the
key but stops provider requests. Settings responses disclose flags only.
The staff Visits Google credential is never substituted for the driver key.

`GET /api/website/customer/driver/routes` requires an invited driver session and
returns provider/readiness/reason. Readiness means configured and enabled,
not successful billing, API restrictions or verified provider availability.
`POST` authenticates before consuming its body; it accepts4KiB of strict JSON
with origin/destination latitude/longitude and an optional alternatives Boolean.
It sends only those endpoints to Google's fixed computeRoutes endpoint.

Comparisons have a15second timeout,30requests per minute per account in this
workspace process,3routes,50,000combined points and4MiB provider/result bounds.
Google's encoded polyline and fractional protobuf duration are validated and
decoded. Returned endpoints must correspond to the requested places. Account
revocation and configuration changes are checked again after the provider call.
The service saves neither coordinates nor route results and returns private,
no-store responses. Provider diagnostics and credentials are not forwarded.

Verification:26 focused route/setup tests passed using isolated real customer
accounts and SQLite stores with a stub Google transport; TypeScript checking
and focused source lint passed. A read-only second-agent review found no
blocking issue. This is not an independent-provider or live Google review.

No dedicated server key, Android Maps SDK key or Google billing configuration
was supplied. No live Google Routes request was made or paid service enabled.
Server activation and configured-device route/attribution checks remain open.
The installed workspace still uses its existing Next build; source verification
does not imply the new endpoint is installed. Do not rebuild that serving source
in place: use a separately built checkout and the guarded workspace updater.

Primary references: [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started),
[Routes setup](https://developers.google.com/maps/documentation/routes/get-api-key),
[computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes),
and [Google display/cache policy](https://developers.google.com/maps/documentation/routes/policies).
