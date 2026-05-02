# CBU Dashboard

Dark mode academic dashboard for **CBU Architecture Fall 2026**.

## Features

| Section | Description |
|---|---|
| **Assignments** | Canvas API sync — pulls upcoming assignments from all active courses |
| **To-Do List** | Tasks with High / Medium / Low priority, auto-sorted by priority and completion |
| **Studio Projects** | Track projects through Concept → Schematic → Design Dev → Const. Docs → Final |
| **Weekly Schedule** | Editable Mon–Fri grid; click Edit to add/remove events per time slot |
| **Notes** | Freeform note cards, auto-saved to localStorage |

All data persists in the browser via `localStorage` — no backend required.

## Quick Start

```bash
# Just open the file directly
open index.html
```

Or serve it locally (avoids CORS issues with Canvas API):

```bash
# Python
python3 -m http.server 8080
# then open http://localhost:8080
```

## Canvas API Setup

1. Log in to Canvas and go to **Account → Settings → New Access Token**
2. Copy the generated token
3. Open the dashboard and click **⚙ Canvas Settings** in the sidebar
4. Enter your Canvas URL (e.g. `https://cbu.instructure.com`) and paste the token
5. Click **Sync Canvas** — assignments are fetched and cached in `localStorage`

> **CORS note:** Some Canvas instances restrict cross-origin requests from browser clients.
> If you see a network error, serve the dashboard from a local server (see above) or
> contact your IT department about enabling CORS for the Canvas API.

## GitHub Pages Deployment

```bash
git init
git remote add origin https://github.com/aaronrn99/CBU-Dashboard.git
git add .
git commit -m "initial commit"
git push -u origin main
```

Then go to **Settings → Pages** in the GitHub repo, set the source to the `main` branch root, and the dashboard will be live at:

```
https://aaronrn99.github.io/CBU-Dashboard
```

## File Structure

```
CBU-Dashboard/
├── index.html        # App shell, all sections and modals
├── css/
│   └── style.css     # Dark mode styles, responsive layout
├── js/
│   └── app.js        # State, Canvas API, rendering, events
└── README.md
```

## Stack

- Vanilla HTML / CSS / JavaScript — zero dependencies, no build step
- Canvas REST API v1 (`/api/v1/courses`, `/api/v1/courses/:id/assignments`)
- `localStorage` for persistence
