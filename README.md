# Forkfolio

A private recipe book with an Android-first web app. Recipes and edits live in IndexedDB on the device; a Node server stores the synchronized collection in SQLite.

## Initial build

- Installable PWA with cached application assets and offline deep-route launch.
- Cinnamon Rolls example with linked ingredient/instruction quantities, fraction scaling, shaping guidance, ingredient/step checks, theme, printing, and standalone HTML snapshots.
- Local recipe editing, immutable versions, readable history, and restoration as a new version.
- Cooking notes and photos pinned to the version used.
- URL/text/photo source capture, including drafts saved locally before upload.
- Authenticated foreground/manual sync, stable operation receipts, monotonic snapshot sequencing, photo dependencies, and explicit version conflicts that retain both candidates.
- Complete device-data export, including drafts, pending operations, and photo bytes.

**Not implemented yet:** Codex extraction/conversations and improvement proposals, favorites/deletion, backup import/automated server backups, and native clients. Source capture displays that processing is unavailable; it does not pretend to run an agent. Actual Android installation/camera/process-recreation checks are still required.

This first server uses full library snapshots and SQLite photo blobs. That keeps recovery consistent and is suitable for a small personal collection. A paged change feed and filesystem attachments can replace those choices when library size warrants it. Nothing requires copying live database files between devices.

## Run

Requires Node 24.14 or later.

```sh
npm ci
npm run dev
```

Development is for interface work. Offline installation must be checked against the production build:

```sh
cp .env.example .env
# Set FORKFOLIO_SECRET to a random string of at least 24 characters.
# Set ORIGIN to the exact application address before building.
npm run build
npm start
```

The server binds to `127.0.0.1:3000` by default. Use a private HTTPS reverse proxy with a stable origin for phone access. Sign in through Settings with your owner secret. Sync fails closed until the secret is configured; local cooking/editing still works. Do not expose an unconfigured development server publicly. Configure the proxy request-body limit for photos as well.

Data is in `data/forkfolio.sqlite` (with WAL sidecars while running). No credentials, device exports, databases, or original planning/reference documents are committed. Node's built-in SQLite currently emits an experimental warning. Back up with SQLite's online backup tools, or stop the server before copying the database.

## Checks

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests create a separate production Node build in `.test-build` with an isolated database and test-only secret. They cover cold offline routes, local editing, notes/photos across tab closure, second-device replication, capture drafts, and private API validation. Pixel viewport emulation is not physical Android testing.

On the actual phone: install over trusted HTTPS, sign in and sync, close the app, reopen in airplane mode, edit a recipe and add notes/photos, restart, reconnect, and verify a single copy of the changes on another device. Camera handoff, app termination, large text, keyboard/Back, and storage denial also need device checks.

Sync runs on open, foregrounding, reachable-network hints, or “Sync now,” with bounded backoff. It does not promise uploads while Android has closed the app. Every acknowledged snapshot includes all retained notes/source photos; missing photo downloads resume on the next sync. Browser-managed storage can still be cleared or evicted. Request persistent storage and export unsynced work before clearing it.

The initial JSON/base64 device export is memory-bound. Very large photo collections will need a streamed archive; measure your intended library on the actual phone before relying on this as its only backup.
