# CalendarTravel

Standalone project: [github.com/tristantrobinson/CalendarTravel](https://github.com/tristantrobinson/CalendarTravel)

Local path: `/Users/tristan/Documents/CalendarTravel` (sibling to `ClaudeCodeTest`, not nested inside it).

Google Calendar + Google Maps integration that writes traffic-aware **"Drive to …"** travel blocks into a separate calendar. Each block ends when the event starts and is sized to the current drive time, so you know when to leave.

The origin is smart: it chains from the previous event's location when events are close in time, otherwise it uses your home address.

## One-time setup

1. **Google Cloud** — create or pick a project and enable the **Google Calendar API** and the **Routes API**.
2. **OAuth client** — create an OAuth client ID of type **Desktop app**, download it, and save it as `credentials/google-oauth.json`.
3. **API key** — create an API key restricted to the **Routes API**; put it in `.env`.
4. **Travel calendar** — in Google Calendar, create a second calendar (e.g. "Drive Times"). Copy its **Calendar ID** (Settings → that calendar → *Integrate calendar*) into `.env`.
5. **Config** — `cp .env.example .env` and fill in the values.
6. **Install + authorize**:

   ```bash
   cd /Users/tristan/Documents/CalendarTravel
   npm install
   npm run auth     # browser consent flow → credentials/token.json
   ```

`credentials/` and `.env` are gitignored — secrets never get committed.

## Run it

```bash
npm run sync       # sync events in the next LOOKAHEAD_DAYS days
```

Re-running is safe: blocks are tagged and **updated in place** (never duplicated). Blocks whose source event disappears are removed.

## Schedule it (macOS launchd)

```bash
cp scheduling/com.calendatravel.drivetimes.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.calendatravel.drivetimes.plist
launchctl start com.calendatravel.drivetimes   # run once now to test
```

Runs every **15 minutes** (and once at login); logs to `drive-sync.log`. To change frequency, edit `StartInterval` in the plist (seconds — e.g. `900` = 15 min, `1800` = 30 min, `3600` = 1 hour) and reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.calendatravel.drivetimes.plist
cp scheduling/com.calendatravel.drivetimes.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.calendatravel.drivetimes.plist
```

The plist calls `scripts/run-sync.sh`, which pins the Node path (edit it if your Node moves).

Prefer cron? Every 15 minutes:

```bash
*/15 * * * * /Users/tristan/Documents/CalendarTravel/scripts/run-sync.sh
```

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOME_ADDRESS` | — | Origin when there's no suitable prior event |
| `SOURCE_CALENDAR_ID` | `primary` | Calendar to read events from |
| `TRAVEL_CALENDAR_ID` | — | Calendar to write travel blocks into |
| `GOOGLE_MAPS_API_KEY` | — | API key restricted to the Routes API |
| `LOOKAHEAD_DAYS` | `7` | How many days ahead to sync |
| `MIN_DRIVE_MINUTES` | `5` | Skip travel blocks shorter than this |
| `ORIGIN_GAP_MINUTES` | `180` | Max gap to chain from a prior event's location |

## Directory layout

```
CalendarTravel/
├── credentials/                # OAuth client + token (gitignored)
├── scheduling/
│   └── com.calendatravel.drivetimes.plist
├── scripts/
│   ├── google-auth.js          # One-time OAuth consent
│   ├── sync-drive-times.js     # Main sync job
│   ├── run-sync.sh             # Wrapper for launchd / cron
│   └── lib/
│       ├── auth.js
│       ├── calendar.js
│       └── routes.js
├── .env.example
└── package.json
```
