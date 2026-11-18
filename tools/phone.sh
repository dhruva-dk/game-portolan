#!/bin/sh
# Builds the iOS app for one of the owner's devices (the iPhone unless another's id is given; xcrun devicectl list
# devices), installs it, and launches it:
#   npm run build && npx cap sync ios && sh tools/phone.sh [device id]
# The iPad Air (M1, the target): 00008103-000249563621A01E.
# The launch fails (and the install stands) if the device is locked.
set -e
DEVICE=${1:-00008140-000268A80140801C}
cd "$(dirname "$0")/../ios"
xcodebuild -project App/App.xcodeproj -scheme App -configuration Debug -destination "id=$DEVICE" \
  -derivedDataPath DerivedData -allowProvisioningUpdates build 2>&1 | tail -3
xcrun devicectl device install app --device "$DEVICE" DerivedData/Build/Products/Debug-iphoneos/App.app 2>&1 | tail -3
xcrun devicectl device process launch --device "$DEVICE" com.dhruvakumar.portolan 2>&1 | tail -2
