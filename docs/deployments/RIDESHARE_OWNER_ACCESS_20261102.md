# Rideshare owner access and website search recovery

Implementation: `7d603c1`, branch `feat/rideshare-tax-firm-pack`.
Public site: https://rideshare-tax-pros.vercel.app
Production deployment: `dpl_HWHJKtxCouVR24AiFqu4kTE8brEc` (Ready).

## Delivered

The FAQ and resource searches now offer a clear/reset button. It clears search
and category filters, restores the results and moves keyboard focus back to the
search field. The controls wrap at narrower widths. The four existing website
journey checks passed, including empty results followed by reset and focus.

The macOS owner-access launcher is installed at
`~/Applications/Rideshare Tax Pros Workspace.app` and was opened on the normal
desktop. Its window showed the running-workspace status and all controls without
clipping in a targeted read-only window capture. Luke's visual acceptance remains
pending; this observation does not establish phone or browser appearance.

The launcher opens the public website and private workspace in Safari. Refresh
checks the actual installed build and sign-in response. Start requests the fixed
installed LaunchAgent without forcibly restarting an existing server. Copy owner
password reads the existing Keychain item only after a user presses the button;
the secret is not displayed, logged or placed in process arguments. An owned
clipboard copy expires after 30 seconds while the helper runs, or on normal quit,
and newer clipboard data is preserved.

## Verification

- All 49 live HTTP checks passed against production: 30 files match the saved
  build, 18 clean page aliases respond correctly, and the branded missing page
  returns HTTP 404. Receipt: `rideshare-owner-access-verification-20261102.json`.
- Four focused website journey checks passed. The static site was rebuilt before
  deployment. No backend application source changed in this pass; the previously
  verified Shuug production build was retained.
- The native launcher built, signed and installed successfully. Its checks cover
  loopback-only configuration, copy expiry, preservation of unrelated clipboard
  content, and cancellation of an earlier expiry when a newer copy is made.
  Those checks used synthetic text on a private named pasteboard; they did not
  read the real Keychain or touch the general clipboard.
- The installed binary's `--status-json` probe confirmed the actual private
  workspace at `http://127.0.0.1:3126` and build `SM8aG-ybAU32XDMQ-b4tE`.
  No actual owner password was copied in this pass. Human Keychain approval and
  sign-in through the launcher remain for Luke to exercise.

The launcher remains open for review and the persistent Shuug service remains
running. No browser testing runtime, isolated session or VM was used.

## Remaining work

The public site has 19 pages and a working private local Shuug installation.
Public client workspace hosting, real contact details, actual fees and verified
staff information remain pending. The static public portal must never point at
the local loopback address. The included driver mileage/income/expense/receipt
app remains the later phase, after website and workspace review.
