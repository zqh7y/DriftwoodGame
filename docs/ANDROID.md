# Driftwood Dock on your phone

Two ways to play on a phone: install the **Android app** (an APK file), or open the **web version**
and add it to your home screen. GitHub builds both for you automatically every time code is pushed.

## Install the Android app (APK)

1. On GitHub, open the repo **zqh7y/DriftwoodGame**, then the **Actions** tab.
2. Click the newest green run of **Android APK**.
3. At the bottom, under **Artifacts**, download **DriftwoodDock-debug-apk**. It's a `.zip`;
   unzip it to get `app-debug.apk`.
   - Tagged versions are easier: push a tag like `v0.1.0` and the APK is attached to a
     **Release** (repo page, then **Releases**). Download the `.apk` there straight from your phone.
4. Send the `.apk` to your phone (or download it on the phone directly) and tap it.
5. Android asks to **allow installing unknown apps** for your browser or file manager the first time.
   Allow it, go back, and tap **Install**. Play Protect may warn about an unknown developer; that's
   normal for a home-made app, so choose **Install anyway**.
6. Find **Driftwood Dock** in your app drawer. Have a calm fishing session.

**Updating:** install the new APK over the old one. If Android says *"App not installed"*, the new build
was signed with a different debug key. Uninstalling first works, but it clears your save. To keep the
same key across all builds (only needed once):

```bash
keytool -genkeypair -v -keystore debug.keystore -storepass android -alias androiddebugkey \
  -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
base64 -w0 debug.keystore   # macOS: base64 -i debug.keystore
```

Copy the output into a repository secret named **`ANDROID_DEBUG_KEYSTORE_BASE64`**
(Settings, then Secrets and variables, then Actions). Don't commit the keystore file itself.

## Play in the browser (GitHub Pages)

1. One-time setup: repo **Settings**, then **Pages**, then under *Build and deployment* set **Source** to **GitHub Actions**.
2. Every push to `master` publishes the game to **https://zqh7y.github.io/DriftwoodGame/**
   (the **Web (GitHub Pages)** workflow shows the link when it's done).
3. On your phone, open that link:
   - **Android (Chrome):** menu (three dots), then **Add to Home screen**.
   - **iPhone (Safari):** Share button, then **Add to Home Screen**.

## Building it yourself (optional)

You need Node 22, Java 21 and Android Studio (for the Android SDK).

```bash
npm ci
npm run android:icons   # regenerate app icons + splash from resources/*.png
npm run android:apk     # build the web game, copy it into android/, build the debug APK
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`. `npx cap open android` opens
the project in Android Studio. If `./gradlew` says "permission denied", run `chmod +x android/gradlew`
(or commit it as executable once: `git update-index --chmod=+x android/gradlew`).

## Later: a signed release for Google Play

1. Create an upload key once and keep it safe and backed up. If you lose it, you can't publish updates:
   `keytool -genkeypair -v -keystore driftwood-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. Add a `signingConfigs.release` block to `android/app/build.gradle` that reads the keystore path and
   passwords from `android/keystore.properties` (git-ignored) or from CI secrets, and use it in `buildTypes.release`.
3. Raise `versionCode` (and `versionName`) in `android/app/build.gradle` for every upload.
4. Build the bundle: `npm run android:sync && cd android && ./gradlew bundleRelease`, which writes
   `android/app/build/outputs/bundle/release/app-release.aab`.
5. In the [Google Play Console](https://play.google.com/console), create the app, turn on Play App Signing,
   upload the `.aab` to an internal testing track first, then fill in the store listing (the
   `resources/feature-graphic.png` image fits there) and roll out.
