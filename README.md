# Exhale — Breath Pacer

A minimal, installable breath pacer PWA. A single full-height column fills upward
during inhale and drains downward during exhale, with calm chimes marking phase
boundaries. Built with Next.js (App Router) and deployed as a static site on Vercel.

The full product spec lives in [`SPEC.md`](./SPEC.md).

## Features

- Two-phase breathing cycle with configurable inhale and exhale durations
  (default 4.0s / 6.0s, 1 decimal precision).
- Visual: full-height column, gruvbox-dark theme, aqua during inhale,
  orange during exhale.
- Audio chimes via the Web Audio API:
  - high pitch at start of inhale,
  - low pitch at start of exhale,
  - medium pitch one second before the end of each phase.
- Drift-resistant timing: chimes scheduled on the `AudioContext` clock with a
  12-second lookahead; visuals derived from absolute time via `requestAnimationFrame`.
- Settings persisted to `localStorage` (key: `exhale.settings.v1`).
- Optional Screen Wake Lock toggle (where the browser supports it).
- Installable PWA: web app manifest, icons, and an offline service worker.

## Getting started

Requirements: Node.js 18.18+ (Node 20+ recommended) and npm.

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Then open <http://localhost:3000>. Tap or click the stage to start the pacer
(browsers require a user gesture before audio can play). Click the gear in the
top-right to change inhale/exhale durations or toggle the wake lock.

The service worker is intentionally **not** registered in development to avoid
stale caches while iterating. To exercise it locally, run a production build:

```bash
npm run build
npm run start
```

## Project layout

```
app/
  layout.tsx     # metadata, manifest link, theme color, viewport
  page.tsx       # entry; renders the client Pacer
  Pacer.tsx      # all timing, audio, and UI logic
  globals.css    # gruvbox-dark styles
public/
  manifest.webmanifest
  sw.js          # offline cache; skips /_next/* and dev requests
  icon.svg, icon-192.png, icon-512.png
SPEC.md
```

## Scripts

- `npm run dev` — start the Next.js dev server on port 3000.
- `npm run build` — produce a production build (statically prerendered).
- `npm run start` — serve the production build locally.
- `npm run lint` — run Next.js lint.

## Deploying to Vercel

This app prerenders to static HTML/JS — no server runtime is required.

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Import the project in the Vercel dashboard, or run `npx vercel` from the
   project root.
3. Accept the defaults: framework "Next.js", build command `next build`,
   output handled automatically. No environment variables are required.

## Privacy

All settings are stored locally in your browser. The app makes no network
requests after install and ships no analytics or telemetry.

## Platform notes

Mobile browsers throttle background timers and may suspend audio when the
screen is locked. On iOS Safari in particular, reliable locked-screen audio is
not currently achievable with standard PWA APIs. The Wake Lock toggle helps on
platforms that support it (recent Chrome, Edge, and Safari 16.4+); on iOS the
most reliable approach is to install the app and keep the screen awake.
