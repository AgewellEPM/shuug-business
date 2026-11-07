-- The code stays in a local private file. The URL fragment never goes in the
-- HTTP request; the portal removes it before signing in over HTTPS.
set ownerPath to (POSIX path of (path to home folder)) & ".config/gigtax-sales/owner-code"
set ownerCode to read POSIX file ownerPath as «class utf8»
tell application "Safari"
    activate
    open location ("https://gigtax.pro/sales#owner-code=" & ownerCode)
end tell
