#!/bin/zsh
set -eu
sales_mcp_root=${0:A:h:h:h}
export SHUUG_SALES_ONLY=true
export GIGTAX_SALES_ORIGIN=${GIGTAX_SALES_ORIGIN:-https://gigtax.pro}
export GIGTAX_SALES_CODE_FILE=${GIGTAX_SALES_CODE_FILE:-$HOME/.config/gigtax-sales/owner-code}
exec node --import "$sales_mcp_root/node_modules/tsx/dist/loader.mjs" "$sales_mcp_root/scripts/mcp-server.ts"
