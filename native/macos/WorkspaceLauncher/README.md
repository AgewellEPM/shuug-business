# Shuug owner workspace launcher

A small macOS entry point for the installed Rideshare Tax Pros Shuug workspace.
This is an owner-access helper, separate from the planned driver mileage app.

```sh
npm run workspace:rideshare:launcher
```

The build compiles the Swift sources using the installed Xcode toolchain, checks
credential clipboard behavior using a private named pasteboard, signs the bundle
locally, installs it in `~/Applications`, and verifies the real local sign-in
page. The existing server and client data are not restarted or changed.

The launcher opens the website and private workspace explicitly in Safari. It
checks that installation metadata names only the expected loopback endpoint,
LaunchAgent and Keychain entry. Refresh reloads the installed metadata. Start
uses `launchctl kickstart` without forcibly restarting an existing process.

Copy owner password reads exactly the existing `owner` credential from macOS
Keychain, only after the user presses the button. The read runs off the main
thread. The password is never displayed, logged or placed in process arguments.
Its clipboard copy clears after30seconds while the launcher runs, or on normal
quit, and only if that copy still owns the clipboard. Later copied data is left
alone. macOS remains responsible for granting Keychain access.

The build's checks never read the real Keychain and never touch the general
clipboard. `ShuugWorkspace --status-json` checks the actual installed build and
sign-in response without reading a credential or opening a window. Neither check
establishes successful human sign-in or visual acceptance.

Updates preserve the previous owned app bundle under the ignored project build
directory. A different app identity or a running launcher prevents replacement.
The installed Shuug data, password and LaunchAgent are retained. The external
source drive must be mounted for Shuug itself to run.
