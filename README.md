# EA Dashboard

A personal executive assistant dashboard that consolidates emails, calendars, weather, academic deadlines, and finances into a single AI-powered daily briefing. Built to solve the problem of managing multiple email accounts and calendar events where things often get lost in the noise.

This is a work-in-progress personal project — not built with public use in mind. If you want to run it yourself, it's a BYOK (bring your own key) system via the Claude API.

Built with the help of Claude Opus 4.6.

## What it does

The dashboard fetches data from multiple sources, sends it through Claude for analysis, and produces a structured briefing that surfaces what actually matters:

- **Email triage** — Pulls from multiple Gmail and iCloud accounts, classifies emails as actionable/FYI/noise, extracts urgency, and groups by account
- **Bill & transaction detection** — Extracts financial data (payee, amount, due date) from emails with optional one-click logging to Actual Budget
- **Calendar consolidation** — Aggregates Google Calendar events across all connected accounts with color coding and conflict detection
- **Academic deadlines** — Fetches Canvas LMS assignments and deadlines via [Canvas-LMS-Task-Manager](https://github.com/ansidian/Canvas-LMS-Task-Manager)
- **Weather** — Hourly forecasts for your configured location
- **AI insights** — Claude generates 2-4 actionable insights connecting information across emails, calendar, and deadlines
- **Delta refresh** — On subsequent refreshes, only new emails are sent to Claude and merged with previous triage to save tokens
- **Scheduled generation** — Cron-based briefing generation at user-defined times and timezones
- **Briefing history** — Browse and compare past briefings

## Tech stack

| Layer | Tech |
|-|-|
| Frontend | React 19, Vite, React Router |
| Backend | Express.js (Node.js) |
| Database | Turso (LibSQL) |
| AI | Claude API (Haiku/Sonnet/configurable) |
| Email | Gmail (OAuth 2.0), iCloud (IMAP) |
| Calendar | Google Calendar API |
| Weather | WeatherAPI |
| Finances | Actual Budget API |
| Academic | Canvas LMS via CTM (Turso read-only) |

## Setup (BYOK)

This project requires your own API keys and credentials. Environment variables needed:

```
# Auth
EA_PASSWORD=
EA_USER_ID=

# Database
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# Canvas LMS deadlines (optional)
CTM_TURSO_DATABASE_URL=
CTM_TURSO_AUTH_TOKEN=

# Encryption key for stored credentials
EA_ENCRYPTION_KEY=

# Claude API
ANTHROPIC_API_KEY=

# Gmail OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Weather (optional)
WEATHER_API_KEY=
```

```bash
npm install
npm run dev        # frontend (Vite)
npm run server     # backend (Express)
```

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to use and adapt for non-commercial purposes with attribution.
