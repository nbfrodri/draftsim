# Working in DraftSim

## Project and layout

DraftSim is a Windows Tauri 2 desktop app with a statically exported Next.js 16 / React 19 frontend, TypeScript simulation logic, Zustand state, and SQLite desktop persistence. UI copy and code are in English.

- `app/`: Next.js entry points and global styles.
- `components/`: interface; `season/`, `hall/`, and `tournament/` contain feature-specific views.
- `lib/season/`: season engine, franchise lifecycle, awards, archived histories, and record aggregation.
- `lib/sim/`: simulation orchestration and bulk worker support.
- `store/`: Zustand actions, state types, and persistence integration.
- `src-tauri/`: Rust native commands, desktop configuration, and SQLite support.
- `public/` and `data/`: bundled assets/catalogues. Reuse existing team, league, lane, and champion artwork.
- `e2e/`: Playwright tests. Unit tests live beside source as `*.test.ts`.
- `docs/plans/`: implementation plans; `docs/systems.md` documents simulation behavior.

## Workflow

Read relevant code and tests before changing behavior. Preserve unrelated work and untracked data, including `training/`. Keep changes scoped; do not refresh datasets, regenerate unrelated artifacts, add dependencies, or publish releases unless the task requires it. Do not edit generated `out/`, `.next/`, or worker bundles directly; use the build scripts.

Use existing components and styling conventions. Prefer pure domain helpers with behavior-focused tests. Avoid broad store subscriptions and repeated history scans on each render. Coordinate keyboard dismissal so one Escape closes only the topmost active surface; use existing close/back callbacks and retain operation/unsaved-change guards.

## Domain invariants

- Player history joins use stable player IDs. Team identity in archives includes region and name; do not merge same-named teams across regions.
- Resolve winners using each game's blue/red teams: sides can swap within a series.
- Awards require actual recorded participation. Distinguish domestic split, global split, and annual All-Pro selections; international events do not grant event-specific All-Pro honors.
- Preserve roster-move origin windows and season ownership. Current roster membership/current screen phase does not determine when a move happened.
- Missing legacy information is unknown, not evidence of zero. Prefer additive optional archive fields and read-time normalization; do not fabricate historical awards or identities.
- Keep region display order consistent with `LEAGUE_IDS` unless a view explicitly ranks regions by a metric.

## Save safety

Desktop saves use SQLite; browser previews use the web persistence path. Inspect hydration, mutation, write queues, import/export, and restore owners before changing persistence. Never let failed hydration overwrite valid saves. Preserve transactional restore/flush boundaries and import validation. Test save changes on disposable fixtures, never personal AppData. Do not copy a live WAL database as a backup; use the existing backup/snapshot workflow. A migration must preserve a recoverable original and have a rollback strategy.

## Checks

Use Node >=22.12.0 and the lockfile (`npm ci` when installing).

- `npm run dev`: builds the bulk worker and starts Next.js development mode.
- `npm test -- <test paths>`: focused Vitest checks; `npm test`: full unit suite.
- `npm run typecheck` and `npm run lint`: type and lint checks.
- `npm run build`: builds the worker and static frontend export.
- `npm run test:e2e`: Playwright against the exported `out/` directory. Build first; requires installed Chromium or `PLAYWRIGHT_CHANNEL`.
- `npm run test:desktop`: native Rust unit tests; requires the Rust toolchain.
- `npm run desktop:dev`: native WebView testing when desktop behavior changes.
- `npm run check`: version/release checks, lint, types, unit tests, and build.

Run checks appropriate to the change, report actual results and limitations, and distinguish browser verification from native WebView verification. Do not bump versions or create release tags for ordinary fixes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
