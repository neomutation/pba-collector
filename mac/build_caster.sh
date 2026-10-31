#!/bin/zsh
# 캐스터 버전(경기 기록지 포함) 앱을 만들어 바탕화면에 놓는다.   ./mac/build_caster.sh
set -e
cd "$(dirname "$0")"
APP="$HOME/Desktop/프바 캐스터.app"
BUILD=$(mktemp -d)
mkdir -p "$BUILD/icon.iconset"

swiftc -O -o "$BUILD/PBA" main.swift -framework Cocoa -framework WebKit

swift make_icon.swift "$BUILD/icon.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$BUILD/icon.png" --out "$BUILD/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$BUILD/icon.png" --out "$BUILD/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$BUILD/icon.iconset" -o "$BUILD/AppIcon.icns"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BUILD/PBA" "$APP/Contents/MacOS/PBA"
cp "$BUILD/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>프바 캐스터</string>
  <key>CFBundleDisplayName</key><string>프바 캐스터</string>
  <key>CFBundleIdentifier</key><string>kr.local.pba-caster</string>
  <key>PBAPath</key><string>/?caster</string>
  <key>CFBundleExecutable</key><string>PBA</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>
PLIST
codesign --force --deep -s - "$APP" 2>/dev/null || true
touch "$APP"
rm -rf "$BUILD"
echo "만들었습니다: $APP"
