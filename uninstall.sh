#!/bin/bash
# uninstall.sh — Remove lightspeed-cli
set -e

echo "Removing lightspeed-cli..."

rm -f "${HOME}/.local/bin/ols"
rm -f "${HOME}/.local/bin/oc-lightspeed"
rm -rf "${HOME}/.ols/src/lightspeed-cli"

echo "✅ lightspeed-cli removed."
echo "Config preserved at ~/.ols/ — remove manually if desired: rm -rf ~/.ols"
