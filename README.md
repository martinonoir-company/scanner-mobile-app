# Martino Noir Scanner

Expo React Native app (iOS + Android) for store staff (`COMPANY_STAFF` and above). Scans product barcodes/QR codes for POS checkout, restocking, returns, dispatch, and lookup.

Customers do not use this app — they use `user-mobile-app/`.

## Quick start

```bash
npm install
npm run start       # Expo dev menu
npm run android     # Android emulator
npm run ios         # iOS simulator (macOS only)
```

## API URL

`app.json > expo.extra.apiUrl` defaults to `https://api.martinonoir.com/api/v1`. Override per-environment via the same key, or for local dev use a separate `app.config.js` build.

`expo.extra.wsUrl` defaults to `wss://api.martinonoir.com/pos` (used from PR #11+ once the realtime gateway lands).

## Roles

Only `SUPER_ADMIN`, `COMPANY_SUPER_ADMIN`, and `COMPANY_STAFF` can sign in. `CUSTOMER` accounts are rejected at login.

## Structure

```
app/
  (auth)/           login screen
  (home)/           landing — two big action cards + secondary row
  branch/           branch picker (skipped if user has only one assignment)
src/
  lib/              api client, auth context, branch context, token store
  theme/            design tokens (shared visual language with user-mobile-app)
  components/       reusable UI primitives
```

## Plan reference

See `SCANNER_APP_PLAN.md` at the monorepo root.
