# Android Google Maps and road comparisons

Google is the default routing provider. Directions opens the native Google Maps
app with the explicit package `com.google.android.apps.maps`; it never falls back
to a browser. This handoff needs Google Maps installed, and does not require the
firm's API keys or create an in-app comparison.

In-app road comparisons use a separate authenticated Google Routes service and
the native Google Maps SDK renderer. Missing Android SDK setup, Google Play
services, client sign-in or server readiness stops the comparison before route
coordinates are posted. A configured key is not proof that its restrictions,
billing or enabled APIs work: those require an actual configured-device check.

## Android renderer configuration

The project uses the official Google Maps SDK for Android `20.1.0` through
Google's Maven repository. Its minimum requirements are satisfied by the app's
minSdk 26 and compileSdk 36. Dependency resolution and builds use the established
external-output workflow; no SDK download happens merely by editing source.

Supply the Android Maps SDK key through one of these **local/CI** inputs:

- Gradle property `gigtaxGoogleMapsApiKey` in an untracked user Gradle configuration.
- Environment variable `GIGTAX_GOOGLE_MAPS_ANDROID_KEY`.

The build writes the SDK's required `com.google.android.geo.API_KEY` manifest
metadata and a Boolean readiness flag. Never commit an API key. An Android Maps
key is restricted to Maps SDK for Android, application ID
`com.ridesharetaxpros.driver` and the actual signing certificate SHA-1. Development,
release and Play app-signing certificates can differ. A server or browser key is
not a replacement for the restricted Android SDK key.

The renderer forwards MapView lifecycle and low-memory events, uses native pan,
pinch, zoom and fit controls, and leaves Google's built-in attribution visible.
Google route geometry is provider-tagged and cannot enter the OSM renderer. A
mixed-provider journey must be recalculated. Local saved GPS sections retain
their gaps and use the existing OSM preview without requiring paid routing setup.
Previewing them does not upload a journal to the firm. Returned Google road
geometry always uses the native Google renderer.

## Driver Routes contract

The server owner provisions and enables the **dedicated** driver service:

- `GOOGLE_MAPS_DRIVER_SERVER_KEY`: server credential, never included in Android.
- `GOOGLE_MAPS_DRIVER_ROUTES_ENABLED=true`: explicit owner opt-in; default off.
- Appropriate Google project billing, API enablement, server-key restrictions,
  account quotas, timeout/cancellation handling and operational readiness checks.

The native client uses its existing workspace origin and Bearer driver session.
The server authenticates `driverToken` and `driverAccount` before any provider
call; it does not accept account IDs or arbitrary provider URLs in the body.

`GET /api/website/customer/driver/routes` returns:

```json
{"provider":"googleRoutes","ready":false,"reason":"In-app Google comparisons need setup by your firm."}
```

On an explicit comparison request, the client checks the Android map setup and
this status before posting coordinates. `ready` means owner-enabled/configured,
not verified successful Google billing or traffic availability.

`POST /api/website/customer/driver/routes` accepts only:

```json
{"origin":{"latitude":41.7,"longitude":-72.7},"destination":{"latitude":41.8,"longitude":-72.8},"alternatives":false}
```

The exact body is limited to 4 KiB, two finite coordinate pairs and one Boolean.
The protected-workspace client policy permits this explicit operational request;
legacy journal/profile/receipt uploads remain blocked by their existing policy.

The bounded response has this shape:

```json
{"provider":"googleRoutes","measuredAt":"2026-11-08T12:00:00Z","routes":[{"distanceMeters":1609.344,"durationSeconds":300,"name":"Main Street","points":[{"latitude":41.7,"longitude":-72.7},{"latitude":41.8,"longitude":-72.8}]}]}
```

The service returns at most 3 routes, 50,000 points total and 4 MiB. Distances are meters,
durations seconds, and timestamps must be current. Routes are evaluated using the
existing cost, deadline, freshness, uncertainty and accepted-work guards. The
client makes no promise of live traffic; the provider response must determine any
future traffic-specific claims.

Google responses are not placed in the OSRM route cache or persisted to journals.
They remain only in active comparison/short-lived advice state. The service uses
private no-store responses and must not log or persist coordinate payloads.
Requested Google comparisons send selected endpoints through the firm's service
to Google, including selected historical job starts/drop-offs when the driver
requests waiting-area analysis. This boundary is stated in route/privacy copy.
Staff Visits actions and prospect IDs are a separate feature and permission path.

## Explicit OSRM mode

The existing OSRM implementation remains available only when selected explicitly
in public `site-config.json`:

```json
{"androidRoutingProvider":"osrm","androidRoadRouterUrl":"https://approved-routing-service.example"}
```

The approved HTTPS base serves standard OSRM
`/route/v1/driving/{lon},{lat};{lon},{lat}` responses with distance, duration and
GeoJSON geometry. It needs appropriate geographic coverage, capacity and provider
terms. Public configuration contains no credentials. Release OSRM mode requires
an approved endpoint. Only an explicitly selected DEBUG OSRM mode can use the
clearly labeled public demonstration; it is never a fallback for failed Google
configuration. Its OSM map and bounded five-minute account-scoped cache stay
separate from Google data.

If `androidRoutingProvider` is absent, Google remains selected even when a legacy
OSRM URL is present. Use `"google"` to select Google explicitly. An invalid
provider value fails rather than selecting a different service.

## Verification boundary

JVM coverage checks provider selection, strict route readiness and payload types,
provider-tagged response validation, stale/invalid geometry rejection, mixed
provider advice, and native-handoff URL encoding. SDK rendering and actual Google
Maps activity handoff need a configured Android device; live Google Routes needs
approved server setup. Tests and source wiring do not establish provisioning,
billing readiness, release availability or pixel-level visual parity.

Primary references: [Android Maps setup](https://developers.google.com/maps/documentation/android-sdk/config),
[MapView lifecycle](https://developers.google.com/android/reference/com/google/android/gms/maps/MapView),
[native Google Maps intents](https://developer.android.com/guide/components/google-maps-intents),
[Maps URL encoding and limits](https://developers.google.com/maps/documentation/urls/get-started),
[Routes attribution/cache policy](https://developers.google.com/maps/documentation/routes/policies)
and [Google service terms §19](https://cloud.google.com/maps-platform/terms/maps-service-terms#19.-routes-api).
