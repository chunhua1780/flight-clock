#!/bin/bash
# 打包副屏 App：./build.sh <keystore> <密码> <输出.apk>   （需要 Android SDK：platforms;android-34 + build-tools;35.0.0）
set -e
SDK=${ANDROID_HOME:-/opt/android-sdk}; BT=$SDK/build-tools/35.0.0; JAR=$SDK/platforms/android-34/android.jar
cd "$(dirname "$0")"; rm -rf out && mkdir -p out/res out/classes out/assets/panel/vendor
cp ../panel/index.html ../panel/manifest.json ../assist/ofp.js ../assist/wx.js out/assets/panel/ && cp ../panel/vendor/pdf.min.js ../panel/vendor/pdf.worker.min.js out/assets/panel/vendor/
$BT/aapt2 compile --dir res -o out/res.zip
$BT/aapt2 link -o out/base.apk -I $JAR --manifest AndroidManifest.xml -A out/assets out/res.zip --java out/gen --min-sdk-version 26 --target-sdk-version 34
javac -nowarn -source 8 -target 8 -encoding UTF-8 -classpath $JAR -d out/classes $(find src out/gen -name '*.java') 2>&1 | grep -v "bootstrap\|^warning\|^1 warning\|^Picked" || true
$BT/d8 --release --lib $JAR --min-api 26 --output out $(find out/classes -name '*.class')
cp out/base.apk out/u.apk && (cd out && zip -q u.apk classes.dex)
$BT/zipalign -f 4 out/u.apk out/a.apk
$BT/apksigner sign --ks "$1" --ks-pass pass:"$2" --out "$3" out/a.apk
$BT/apksigner verify "$3" && echo "OK: $3"
