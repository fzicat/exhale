# Breath Pacer SPEC

## Goal

Build a simple, installable web app that acts as a breath pacer for long breathing sessions. The app must provide a minimal gruvbox-dark visual breathing guide, configurable inhale/exhale durations, and sound cues that continue working during long-running use.

## Source Note

Derived from: `_inbox/Breath pacer.md`

## MVP Scope

### Core Behavior

The app runs a continuous two-phase breathing cycle:

1. **Inhale**
   - Duration is configurable in seconds.
   - Default duration: `4.0` seconds.
   - The visual column should fill upward during inhale.
   - A high-pitch chime plays at the start of inhale.
   - A medium-pitch chime plays 1 second before inhale ends.

2. **Exhale**
   - Duration is configurable in seconds.
   - Default duration: `6.0` seconds.
   - The visual column should drain downward during exhale.
   - A low-pitch chime plays at the start of exhale.
   - A medium-pitch chime plays 1 second before exhale ends.

The cycle repeats indefinitely until the user stops or closes the app.

## Functional Requirements

### 1. Timing Inputs

The app must expose two user-configurable settings:

- `inhaleTimeSeconds`
  - Unit: seconds
  - Precision: 1 decimal place
  - Default: `4.0`

- `exhaleTimeSeconds`
  - Unit: seconds
  - Precision: 1 decimal place
  - Default: `6.0`

Input requirements:

- Values must be numeric.
- Values must support 1 decimal place.
- Values should be positive.
- Invalid input should not break the running pacer.
- If a user changes either setting, the app must save the setting in local browser storage.
- On future visits, saved settings must be restored automatically.

### 2. Visual Display

The main screen must be intentionally simple and distraction-free.

Required layout:

- A single vertical column that takes the full height of the screen.
- The column represents the breath phase visually.
- During inhale, the column fills upward from bottom to top.
- During exhale, the column drains downward from top to bottom.
- The animation timing must match the configured inhale/exhale durations.
- The app must use a gruvbox dark theme.

Required controls:

- A simple, discreet gear icon must be available to open settings.
- Settings are only required to modify inhale and exhale timing for MVP.

### 3. Sound Cues

The app must play sound cues during the breathing cycle.

Required cues:

- Start of inhale: high-pitch chime.
- Start of exhale: low-pitch chime.
- One second before the end of inhale: medium-pitch chime.
- One second before the end of exhale: medium-pitch chime.

Sound requirements:

- Sounds should be short, calm, and non-intrusive.
- Sound playback must remain synchronized with the breathing cycle.
- The user may need to interact with the app once before audio can start, due to browser autoplay restrictions.

### 4. PWA / Installability

The app must be installable as a Progressive Web App.

Required PWA behavior:

- Provide a valid web app manifest.
- Provide required app icons.
- Provide a service worker.
- Support install prompts where supported by the browser.
- Run full-screen or standalone when installed, where supported.

### 5. Long-Running Operation

The app is intended for long breathing sessions.

Requirements:

- The pacing cycle should remain stable over long periods.
- Timing should avoid cumulative drift as much as practical.
- The app should continue running when the phone screen is locked or off, if technically possible on the platform.
- Sound cues should continue when the phone screen is locked or off, if technically possible on the platform.

Important implementation note:

- Mobile browsers and PWAs often throttle timers, suspend pages, or restrict audio when the screen is locked. The implementation must explicitly investigate and document platform limitations, especially on iOS Safari and Android Chrome.
- If reliable locked-screen operation is not possible with standard web/PWA APIs on a target platform, the app should clearly document that limitation and provide the best available fallback.

## Non-Functional Requirements

### Simplicity

- The UI should be minimal.
- No unnecessary text or visual clutter.
- Settings should stay out of the way during use.

### Accessibility

- Controls should be keyboard accessible where practical.
- Settings fields should have clear labels.
- Sound cues should not be painfully loud or harsh.
- Visual contrast should be acceptable in gruvbox dark colors.

### Performance

- The animation should be smooth on modern mobile devices.
- The app should avoid excessive CPU usage during long sessions.
- The app should not require a backend server after install.

### Privacy

- Settings must be stored locally in the browser only.
- No account, network API, telemetry, analytics, or cloud storage is required for MVP.

## Suggested Technical Approach

A lightweight static web app is sufficient for the MVP.

Suggested stack:

- HTML, CSS, and JavaScript/TypeScript.
- Web Audio API for generated chimes.
- CSS transitions or requestAnimationFrame for visual fill/drain.
- LocalStorage or IndexedDB for persisted settings.
- Web App Manifest and Service Worker for PWA installability/offline support.

Timing approach:

- Use absolute timestamps rather than incrementing counters to reduce drift.
- Derive current phase and progress from elapsed time within the cycle.
- Schedule chimes relative to phase boundaries.
- Avoid duplicate chimes when the page is hidden, resumed, or throttled.

## Acceptance Criteria

### Settings

- [ ] On first launch, inhale is `4.0` seconds and exhale is `6.0` seconds.
- [ ] User can change inhale time with 1 decimal precision.
- [ ] User can change exhale time with 1 decimal precision.
- [ ] Changed settings persist after page reload.
- [ ] Invalid settings do not crash the app.

### Visual Pacer

- [ ] The app displays one full-height vertical pacing column.
- [ ] The column fills upward during inhale.
- [ ] The column drains downward during exhale.
- [ ] The visual transition duration matches the configured phase duration.
- [ ] The theme is gruvbox dark.
- [ ] A discreet gear icon opens settings.

### Audio

- [ ] A high-pitch chime plays at the start of inhale.
- [ ] A low-pitch chime plays at the start of exhale.
- [ ] A medium-pitch chime plays 1 second before inhale ends.
- [ ] A medium-pitch chime plays 1 second before exhale ends.
- [ ] Chimes are not duplicated during normal operation.

### PWA

- [ ] The app has a valid manifest.
- [ ] The app has a registered service worker.
- [ ] The app can be installed on supported browsers.
- [ ] The app loads without a backend after installation.

### Long-Running Use

- [ ] The app can run continuously for an extended session without visible timing drift beyond acceptable browser limits.
- [ ] Behavior when screen is locked/off is tested and documented for target devices/browsers.
- [ ] If locked-screen audio is not reliably possible on a platform, the limitation is documented.

## Out of Scope for MVP

The following features are explicitly deferred:

- Changing individual chime sounds.
- Background music.
- Free music collection integration.
- Separate volume controls for music and chimes.
- Session timer.
- User accounts.
- Cloud sync.
- Analytics.

## Later Features

Potential future enhancements:

1. Allow the user to customize each chime.
2. Add optional background music from free music collections.
3. Add separate volume controls for background music and chimes.
4. Add a configurable session timer.
5. Add presets for common breathing patterns.
6. Add optional visual themes beyond gruvbox dark.

## Open Questions

1. What target platforms matter most: iOS Safari, Android Chrome, desktop browsers, or all of them?
2. Should the app include an explicit Start/Stop button, or should it start immediately after first user interaction?
3. Should the app keep the screen awake while running using the Screen Wake Lock API where supported?
4. What is the minimum and maximum allowed inhale/exhale duration?
5. Should sound be enabled by default after user activation, or should there be a sound toggle?
6. Should the breathing column fill color change between inhale and exhale, or remain the same?
