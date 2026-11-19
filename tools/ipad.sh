#!/bin/sh
# Builds the iOS app (iPad only) for the owner's iPad Air (M1, the target) unless another device's id is given (xcrun
# devicectl list devices), installs it, and launches it:
#   npm run build && npx cap sync ios && sh tools/ipad.sh [device id]
# CONFIG=Release builds the release configuration (Debug by default: Capacitor passes the page's console to the native
# log, and Safari's Web Inspector can attach). CONSOLE=1 stays attached after the launch, printing the app's output (the
# page's console lines, in Debug: its `load` stages among them) until the app quits or the wait is cut short.
# The launch fails (and the install stands) if the device is locked.
set -e
DEVICE=${1:-00008103-000249563621A01E}
CONFIG=${CONFIG:-Debug}
cd "$(dirname "$0")/../ios"
xcodebuild -project App/App.xcodeproj -scheme App -configuration "$CONFIG" -destination "id=$DEVICE" \
  -derivedDataPath DerivedData -allowProvisioningUpdates build 2>&1 | tail -3
xcrun devicectl device install app --device "$DEVICE" "DerivedData/Build/Products/$CONFIG-iphoneos/App.app" 2>&1 | tail -3
if [ -n "$CONSOLE" ]; then
  xcrun devicectl device process launch --terminate-existing --console --device "$DEVICE" com.dhruvakumar.portolan 2>&1
else
  xcrun devicectl device process launch --terminate-existing --device "$DEVICE" com.dhruvakumar.portolan 2>&1 | tail -2
fi
