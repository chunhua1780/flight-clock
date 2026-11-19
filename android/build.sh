#!/bin/bash
# 打包副屏 App：./build.sh <keystore> <密码> <输出.apk>   （需要 Android SDK：platforms;android-34 + build-tools;35.0.0）
set -e
SDK=${ANDROID_HOME:-/opt/android-sdk}; BT=$SDK/build-tools/35.0.0; JAR=$SDK/platforms/android-34/android.jar
cd "$(dirname "$0")"; rm -rf out && mkdir -p out/res out/classes out/assets/panel/vendor
cp ../panel/index.html ../panel/manifest.json ../panel/land.json ../panel/apt.json ../panel/intel.js ../panel/lb.js ../panel/pkg.js ../panel/fir.json ../panel/files.json ../assist/ofp.js ../assist/wx.js out/assets/panel/ && cp ../panel/vendor/pdf.min.js ../panel/vendor/pdf.worker.min.js out/assets/panel/vendor/
MAN=AndroidManifest.xml; MINSDK=26; RENAME=
if [ "$VARIANT" = eink ]; then rm -rf out/assets/panel && mkdir -p out/assets/panel && cp -r ../panel-eink/. out/assets/panel/ && echo eink > out/assets/variant.txt; MAN=AndroidManifest-eink.xml; MINSDK=19; RENAME="--rename-manifest-package net.flightpanel.eink"; fi
$BT/aapt2 compile --dir res -o out/res.zip
[ -n "$4" ] && printf %s "$4" > out/assets/preset.txt   # 个人版：第 4 个参数 = 口令（只放进私人 APK）
$BT/aapt2 link -o out/base.apk -I $JAR --manifest $MAN -A out/assets out/res.zip --java out/gen --min-sdk-version $MINSDK $RENAME --target-sdk-version 34
javac -nowarn -source 8 -target 8 -encoding UTF-8 -classpath $JAR -d out/classes $(find src out/gen -name '*.java') 2>&1 | grep -v "bootstrap\|^warning\|^1 warning\|^Picked" || true
$BT/d8 --release --lib $JAR --min-api $MINSDK --output out $(find out/classes -name '*.class')
cp out/base.apk out/u.apk && (cd out && zip -q u.apk classes.dex)
$BT/zipalign -f 4 out/u.apk out/a.apk
$BT/apksigner sign --ks "$1" --ks-pass pass:"$2" --out "$3" out/a.apk
$BT/apksigner verify "$3" && echo "OK: $3"
