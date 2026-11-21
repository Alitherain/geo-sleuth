#!/usr/bin/env bash
# Wraps the game page into the Android project and builds a debug APK.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p app/src/main/assets
if [ -f ../Drovoborn-offline.html ]; then
  cp ../Drovoborn-offline.html app/src/main/assets/index.html   # fonts embedded, works offline
else
{
  echo '<!doctype html><html lang="uk"><head><meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">'
  cat ../index.html
  echo '</html>'
} > app/src/main/assets/index.html
fi
gradle --no-daemon assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../Drovoborn.apk
echo "APK: $(cd .. && pwd)/Drovoborn.apk"
