#!/bin/bash
# 生成 files.json（副屏 App 自动更新用）：版本号 = 当前 UTC 时间
cd "$(dirname "$0")"
V=$(date -u +%Y%m%d%H%M)
printf '{"v":"%s","files":["index.html","manifest.json","ofp.js","wx.js","land.json","vendor/pdf.min.js","vendor/pdf.worker.min.js"]}\n' "$V" > files.json
echo "files.json v=$V"
