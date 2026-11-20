# Flight tools — handover (for a fresh session)

Owner: Emirates B777 pilot. Replies in Chinese, plain language. All times UTC. Everything is an awareness aid only.

## Repos and publishing
- `chunhua1780/flight-clock` = source. `chunhua1780/flight-cloch` = GitHub Pages site (published copy). Push both to `main`.
- `chunhua1780/flight-box` = PRIVATE cloud storage (OFPs, translations, DB). Only the backend writes it (via its GitHub token). Do not try to attach it.
- Never put passwords, API keys, company manuals/OFPs in the two public repos. Grep before pushing.
- Publish steps:
  - Home clock: `V=$(date -u +%Y%m%d%H%M%S); sed "s/__APP_VER__/$V/g" ../flight-clock/app.html > app.html; printf %s $V > version.txt` (in flight-cloch).
  - Flight Assist (iPad, `/assist/`): bump `APPV 'vNN'` in assist/index.html and `fa-vNN` in assist/sw.js, copy changed files.
  - Panel (phone, `/panel/`): bump `pnl-vNN` in panel/sw.js, run `./panel/mkfiles.sh`, then `node tools/mkeink.js` (builds `/panel-eink/`, ES5 for old Android), copy panel files + panel-eink dir.
  - Backend: copy `apps-script/Code.gs` to flight-cloch `apps-script/Code.gs` and `Code.txt`; bump `BACKEND_VER`. The user's Apps Script runs a small **loader** (`apps-script/Loader.gs`) that downloads Code.txt (cached 1 h). Force reload now: POST `{"action":"reload"}` with `?k=<password>`. Check: `GET …/exec?action=ver`.
- Android APKs: `android/build.sh <keystore> <pass> <out.apk> [presetPassword]`; `VARIANT=eink` builds the e-ink app (net.flightpanel.eink, minSdk 19). Public APKs go to flight-cloch/panel/. Personal APKs (with preset password) are sent to the user only.

## Components
- **Home clock** `app.html`: calendar + ADS-B modes (home / flight / layover / turnaround); bold styling; clock colour picker in ⚙︎ (solid / rainbow / gradients, optional slow flow) (2026-11-20).
- **Flight Assist** `assist/`: OFP parse, map, NOTAM translation (TR store, `s:<id>` = one-line summary), Today Brief (`brief.js`, uploads a copy for the phone via `CLOUD.sbUp`), logbook (`logbook.js`, Google Sheet sync), contingency (WAC), interview DB, upload pages `data.html` (JSON/CSV/Excel, formats: waypoints / areas / notams / procedures / reminders) and `fi.html` (review DB).
- **Panel** `panel/` (Hisense phone app + Yota e-ink app + iPad landscape): map with GPS (Android bridge `AndroidPanel.gps()`), FIR label, waypoint column, alert card, ZFW input + red max-fuel figure, timeline (STD−x), crew brief (STD−85…−80), reminder rules, briefing package (`pkg.js`, AI plain-Chinese per section, PDF via backend), logbook (CAAC / Jeppesen), shared flight state. Map colours: ⚙︎ → strong (default, for the Hisense A5 Pro CC colour e-ink, `html.cbold`) / light (old pale colours, same as the B/W e-ink palette). Crew brief: chip under the flight number from STD−113 to STD−60 with a countdown to STD−83 and a red `!`; tap → card with outbound + same-day return (flight time, levels, landing time, landing weather from the stored METAR/TAF). Flight-number bar stays plain black on white (user preference). Pre-departure timeline chip (`TLS` in panel/index.html, from STD−75 until off-block): current step with minutes since it (red −n) + next step countdown; tap → full list (−60 on board, −45 PRM/UM, −40 boarding + prelim loadsheet, −20 APU, −15 offload, −10 PA, −5 doors). Crew brief chip ends at STD−75 so the two don't overlap.
- **Backend** `apps-script/Code.gs`: mail OFP list, calendar, ADS-B, Gemini (several keys in Script Properties `GEMINI_KEY` + `GEMINI_KEYS`, 429/503 back-off, briefing uses flash-lite), translation queue (`trQueue_`/`trWork_` every minute), mailbox auto-reader (`autoOfp_`: AI extracts all NOTAMs from new OFP PDFs, retries), FI DB (`figet/fiput`), shared state (`stput`: atd/zfw/cs/ato, newest wins, ATD also to the clock), briefing (`pkgai`, `pkgpdf`, `sbsave`).

- Flight Assist map (2026-11-20): land canvas padding .15 (iPad Safari blanks canvases over ~16.7 M px); `mapHeal()` redraws after resize / return from background; `mapPad()` / `fitVis()` / `viewAt()` keep the route and aircraft out from under the waypoint column and the bottom cards; ⤢ Whole-route button; service worker caches files one by one (only core files block an update).

## Data formats for other AIs
- `flight-intel-format.md` (areas / notams / waypoints / procedures) and `提醒规则格式-reminders.md` (reminders: where + timed steps) — copies were sent to the user.

## Open items
- GPS sharing phone → iPad: options A (cloud relay, needs internet), B (phone hotspot + QR pairing, offline; need to confirm company iPad can join the hotspot), C (MFi Bluetooth GPS). Waiting for the user's choice.
- Mailbox OFP auto-reader verified only partially (Gemini was overloaded); check `?action=ver` → `mailOfp` after the next OFP arrives.
- The user's OFP attachment names are unknown (none matched in the last check) — ask for subject / file name if auto-reading misses them.
