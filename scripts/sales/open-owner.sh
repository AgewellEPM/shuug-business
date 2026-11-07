#!/bin/zsh
set -eu
sales_script_root=${0:A:h}
if [[ ${1:-} == --status ]]; then
  if [[ -r "$HOME/.config/gigtax-sales/owner-code" ]]; then
    print 'GigTax owner access is configured. Portal: https://gigtax.pro/sales'
  else
    print 'GigTax owner access needs setup.'
    exit 1
  fi
  exit 0
fi
exec /usr/bin/osascript "$sales_script_root/open-owner.applescript"
