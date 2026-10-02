# Forkfolio coding instructions

Use Node 24.14+, npm, TypeScript, and SvelteKit 3. Configuration lives in `vite.config.ts`; imports use `#lib/*.ts`. Keep the app in one project.

- Read relevant callers before editing. Pure recipe calculations stay ordinary functions.
- Cooking and navigation read IndexedDB. No server loader may become a prerequisite for offline use. Keep `paths.relative=false` so the cached root shell works at deep routes.
- Commit local edits and outbox operations before displaying a saved state. Never rely on unload to save.
- Recipe versions are immutable. Cooking sessions/notes pin version IDs. Server acknowledgments must preserve later queued saves.
- Sync operation IDs deduplicate retries. Conflicting publication retains both complete versions; never pick a winner by timestamp.
- Imported/source content stays inert. Validate shared schemas and authorize private endpoints; no credentials in local recipes, exports, logs, or commits.
- Tests use separate server storage and credentials. Never point them at an owner's live collection.
- Run `npm run check`, `npm test`, `npm run build`, and relevant `npm run test:e2e` coverage for substantial changes. Service-worker checks use production builds.
- Use T3 collaborative preview for interactive browser inspection when available. Desktop emulation does not prove Android camera/installation behavior.
- Codex/Effect processing is deferred to the next increment. Before implementing Effect, pin its version and record/read a matching local upstream source checkout, examples, and tests. Do not mix v3/v4 APIs or import/edit the reference checkout.

Original `PLAN.md` and `recipe-page-features.md` remain local and excluded from commits. Do not add them to Git.
