# Native road routing configuration

The Android implementation is connected to an OSRM-compatible road service:
selected current/pickup/drop-off/destination coordinates, four actual road legs,
alternate routes, duration/distance, full geometry, bounded responses, fresh
account-scoped caches and explicit advice guards. It does not substitute straight
lines or guessed travel times when a service is unavailable.

Publish an approved HTTPS base in the site's public `site-config.json`:

```json
{"androidRoadRouterUrl":"https://your-approved-routing-service.example"}
```

The base must support
`GET /route/v1/driving/{lon},{lat};{lon},{lat}?overview=full&geometries=geojson&steps=false&alternatives=true`
and standard OSRM `code`, `routes[].distance`, `duration` and GeoJSON coordinates.
It must be suitable for the app's actual usage and geographic coverage. This
public configuration cannot contain credentials. Any provider authorization,
capacity, abuse controls and service deployment need a proper separately scoped
design; a public demo is not silently promoted into release routing.

The DEBUG-only OSRM demo path is visibly identified as a demonstration without
live traffic. Release builds require the approved endpoint and fail explicitly
when it is absent. OSRM travel estimates do not automatically become live traffic.

## Observed readiness — 2026-11-08

Read-only checks found no configured `androidRoadRouterUrl` or
`androidMapsApiKey` in the live public site configuration. The installed workspace
vault and service environment had no Google server, browser or Android Maps keys,
and no recorded Google Maps readiness check. No secret values were printed, no
keys/accounts were created and no billing or routing service was enabled.

The existing `src/lib/visits/google.ts` is a staff Visits optimizer, called from
staff workspace server actions with prospect IDs. It is not an authenticated
driver route API. Its unconfigured `GOOGLE_MAPS_SERVER_KEY` cannot establish a
working Android route service.

## If Google is selected later

A separate driver endpoint would authenticate `driverToken` and `driverAccount`
before any provider call, validate bounded coordinates/alternatives, use a fixed
Google Routes destination, enforce account quotas/timeouts and return normalized
ephemeral results with private no-store headers. It must not borrow Visits action
permissions, prospect IDs or accept arbitrary provider URLs. Sending coordinates
through the firm would change the current direct-provider privacy boundary.

Google Routes content cannot be overlaid on the existing OSM map. A Google option
needs a native Google Maps renderer plus a correctly restricted Android SDK key,
or attributed results without a geographic map. Google server/browser keys are
not substitutes for an Android key restricted to this application ID and its
actual signing certificate. Billing/API enablement, key restrictions, provider
terms, Google response storage and attribution must be configured deliberately.
The existing OSRM cache is not automatically a compliant Google cache. These
requirements come from the [Google Routes policies](https://developers.google.com/maps/documentation/routes/policies),
[service-specific terms §19.2](https://cloud.google.com/maps-platform/terms/maps-service-terms#19.-routes-api)
and [Android Maps API key setup](https://developers.google.com/maps/documentation/android-sdk/get-api-key).

The remaining release boundary is actual approved service provisioning and
configuration. Source/tests and debug-demo results do not prove that boundary.
