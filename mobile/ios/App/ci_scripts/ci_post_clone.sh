#!/bin/sh
# Xcode Cloud runs this right after it clones the repo, before it resolves the Swift packages (the folder has to be
# called ci_scripts and sit next to App.xcodeproj). A fresh clone can't build: the Capacitor and Adapty Swift packages
# are local paths into mobile/node_modules, and the game itself (mobile/www, copied to App/App/public) and the app's
# capacitor.config.json are made by `npm run ios`. This does what the README's "On the Mac" step does by hand.
set -e
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# Xcode Cloud's machines have Homebrew but no Node (Capacitor's CLI needs 22; node@22 is not linked into PATH by brew)
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
node --version

npm ci
npm run ios
