# Architecture evolution implementation plan

## Objective

Implement all five proposals from the technical design: explicit market provenance, measured global-state partitioning, lazy inactive seasons, optional local diagnostics and safe Rust CI caching. Preserve existing saves and complete a new versioned release after v0.6.0 finishes. Update reference documentation and both README entry points. Commits use the configured identity without coauthor trailers.

## Starting point

Desktop persistence version 7 uses a global JSON blob, separate reality seasons and lazy histories. Inactive season blobs are still loaded at startup. Save writes are queued, reconciled and committed with native `persist_batch`. Offseason ownership uses event stamps and positional boundaries. Windows CI now drives the installed WebView using the host `--edge-webview-switches` argument; earlier environment-only attempts did not open CDP. Native install/reopen/reinstall checks passed on the v0.6.0 application code.

## Invariants

- Failed hydration never enables empty-state overwrite.
- Unloaded season/history never means deletion and cannot be serialized as a real empty season.
- Export includes the complete selected reality, even if inactive.
- New events have immutable season/year/window provenance. Legacy unknown provenance stays unknown; existing safe boundary fallback remains available.
- Global fragments and their root metadata commit atomically. Cache state advances only after commit.
- Diagnostics are opt-in, bounded and contain metrics, never SQL bindings, paths or game content.
- Release artifacts come from the exact tagged source and normal production build, never a diagnostic variant.

## Implementation sequence

### 1. Optional local save diagnostics

Create `lib/saveDiagnostics.ts` and behavior tests. Keep a bounded in-memory buffer with a session-only opt-in. Record phase durations, encoded byte counts, statement counts and success/failure, excluding payloads and errors containing private data. Add controls to an existing recovery/settings surface via a small component. Instrument `desktopSqlite.ts` and the queue without forcing serialization when disabled. Provide JSON export and clear controls. Benchmark fixture saves before changing storage layout.

Acceptance: disabled mode records nothing; enable/clear/disable work; exports contain no game fields or SQL parameters; representative no-op/settings/season changes expose different measured costs.

### 2. Explicit market provenance

Create a shared provenance helper under `lib/season/`. Add optional origin metadata to `PlayerTransfer` and roster news types: season ID, franchise year and a stable window ID. Stamp at creation in `transfers.ts`, `franchise.ts`, `franchiseAgency.ts` and engine-generated roster events. Carry and archive preserve origin. Readers prefer explicit origin and retain conservative legacy fallback. Validate imported optional provenance without inventing it.

Acceptance: Winter news, prior-year offseason and current offseason remain separate through save/reload and two rollovers; misbucketed rows retain origin; repeated completion does not relabel data; old saves retain all original rows.

### 3. Partition heavy global payloads

Use measurements from step 1 to identify heavy persisted branches. Add independently written fragments so settings changes do not serialize unchanged season/tournament payloads. Update schema/load/save/clear/footprint and backup validation together. Use an explicit storage-format migration and reject unsupported newer formats. Preserve recoverable pre-migration state and document downgrade/recovery. Migration markers and data changes must agree after rollback.

Acceptance: settings-only writes encode/write only changed settings, season changes update their fragment, every fragment/root update is atomic, corrupt/missing required fragments fail hydration, failed migration preserves the previous valid save, export and native reopen still work.

### 4. Lazy inactive seasons

Represent unloaded seasons explicitly in `SavedReality` instead of fake empty `SeasonState` objects. Add persisted summary metadata for hub cards, query inactive reality metadata without transferring their season blobs, and hydrate a season on switch/export. Update `store/draftStore.ts`, `store/persistenceEncoding.ts`, import actions, hub/Hall consumers and DB reconciliation. Coalesce loads where appropriate and protect switch races. New imports/realities remain fully loaded.

Acceptance: startup reads only active season bodies; hub shows correct year/status; inactive export contains its full season and history; settings/autosaves never overwrite unloaded rows; corrupt inactive data fails when opened without wiping other realities; switching during load cannot install stale state.

### 5. CI compilation cache

Add a vetted Rust cache action to Windows CI with a key derived from toolchain, manifest/lockfile and relevant build environment. Continue running the normal build and all native checks. Do not use cached installer assets as release outputs. Verify the action contract against official upstream documentation and pin its revision.

Acceptance: logs show cache restore/save or a clear cold miss; build, Rust tests and installer checks still run for the exact commit; NSIS/MSI publication stays behind successful checks.

### 6. Integration, documentation and release

Update `docs/technical-design.md`, domain/persistence/interaction/development guides and README as relevant, replacing implemented proposals with actual contracts and measured limits. Record executed checks separately from intended acceptance. Run focused tests, full types/lint/unit/build/E2E/native tests and CI. Synchronize the next application version, commit/push selected paths, tag only after pre-release validation, follow publication and verify both installer assets and tag SHA.

## Verification and safety

Use fixture databases and disposable GitHub-hosted installer tests. Do not open personal AppData or bypass installer-smoke environment guards. Preserve unrelated `training/`. SQL tests must exercise failure rollback and lazy-state preservation, not merely assert implementation strings. Profile representative multiple-reality saves with a substantial history and an active split. Keep v0.6.0 immutable; the new work receives a new tag.

## Completion record

Implemented all five proposals for 0.7.0. The fixture benchmark (three realities, 300 history entries, 12 simulated matches) reduced settings serialization from 337,738 bytes to 83 bytes; unchanged saves emit no statements. The benchmark uses a mock commit and does not measure native disk latency.

Local validation: lint, typecheck, 1,334 unit tests, six release-tool tests and static production build passed. Eleven Rust tests passed, including format-8 backup rejection for missing/corrupt fragments and a valid native snapshot. Focused schema/persistence tests passed after preserving version 7 until the migration transaction commits. All 34 browser E2E tests passed using the installed Edge channel; default Chromium is not installed locally.

New regression coverage verifies unfinished seasons with empty Hall history, inactive exports, missing-body refusal, late switch responses, and explicit market origin across serialization plus two rollovers. The CI upgrade fixture includes active and dormant unfinished realities. Existing user data is untouched.

Design limits: inactive bodies are lazy at startup but retained after opening; diagnostic commit time combines IPC and transaction; legacy missing metadata is not fabricated. Legacy inactive summaries can be extracted within SQLite until their catalog is written.

Windows preflight [35533598227](https://github.com/nbfrodri/draftsim/actions/runs/35533598227) built NSIS and MSI and passed installation, JSON migration, upgrade from checksum-pinned 0.6.0, format-8 verification, pre-migration snapshot verification and reopening. Native Escape checks passed for root, modal, held key, nested focus and season-exit SQLite commit with no page errors (57 ms exit in this fixture; not a general latency guarantee).

The final hydration hardening additionally rejects a missing manifest in a format-8 root instead of reinterpreting it as legacy. Its regression and the complete 1,334-test suite passed locally. The v0.7.0 release workflow repeats all checks for the exact tagged commit before publishing both installers. Publication status and assets are recorded on the [release page](https://github.com/nbfrodri/draftsim/releases/tag/v0.7.0).
