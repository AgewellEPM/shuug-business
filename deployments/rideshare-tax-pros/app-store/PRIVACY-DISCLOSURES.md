# App privacy disclosure worksheet

Source audit for version 1.0.0, November 16, 2026. This is not a published policy
or a completed App Store Connect declaration. The website's existing /privacy
notice describes the website only and must not substitute for the app policy.

| Data | Purpose and handling |
| --- | --- |
| Name, client email, account identifier | Optional firm sign-in, profile display and account-scoped sharing. Linked to the account; app functionality. |
| Income, expenses, mileage totals, classifications and bank references | Local journal, then account-scoped sharing on connection. Linked financial information; app functionality. Raw GPS routes are excluded from journal uploads. |
| Chosen receipt images | Attached by the user and synced with their account. Linked user content; app functionality. |
| Notes, chat, entered ratings and written feedback | Local storage and account sharing. Guest chat and ratings copy require separate choices. Linked other user content; app functionality. |
| Offer screenshots and ReplayKit frames | Recognition on-device; full images, frames and transcripts are not retained or uploaded by the app. Parsed offer fields remain local. A source image in Photos is not deleted. |
| Precise location and motion | Mileage, optional driving assistance, requested office lookup and route comparisons. Raw route coordinates stay local. Apple Maps receives requested searches/endpoints; review the actual SDK/service flow when completing Apple's location answers. |
| Plaid LinkKit | Optional bank linking; the bundled SDK declares User ID for app functionality and UserDefaults CA92.1. Recheck Plaid's complete disclosure and the firm's selected environment before launch. |

Our manifests declare no advertising tracking. Do not add ATT or advertising
purposes that are not present. Include any additional provider data in the final
App Privacy answers after verifying the enabled integrations; a manifest alone
does not prove the complete provider's data handling.

Required reasons are declared where the app's executable uses them:

- Main app: C617.1 for app/App Group file metadata; CA92.1 for its own debug tour preference.
- Share extension: C617.1 for the App Group observation retention metadata.
- Broadcast extension: C617.1 for the same storage; 35F9.1 for the one-second frame-processing interval. Boot time is not transmitted.
- Plaid SDK: its own bundled manifest remains intact.

The app policy is https://gigtax.pro/app-privacy; support is support@gigtax.pro.
Verify publication and mailbox delivery. Align the public policy with the in-app
App privacy & data screen. Publisher confirmation and the final account-deletion
flow remain launch prerequisites; do not invent them or promise unimplemented deletion.

Sources: [Apple required-reason APIs](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype),
[account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
