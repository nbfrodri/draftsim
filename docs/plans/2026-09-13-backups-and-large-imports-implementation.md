# Backup polish and large reality imports

Continue the approved backup flow recorded in `2026-09-10-backup-ux-implementation.md` and the reliability progress notes. The user requested closer alignment with the current app and support for reality exports larger than 128 MB.

1. Restyle `RecoveryPanel.tsx` and `PersistenceNotice.tsx` with the existing Rift palette, display typography, compact uppercase actions, framed surfaces, and responsive history rows. Preserve native dialog focus, restore confirmation, error recovery and simulation pause access. Correct damaged punctuation.
2. Give reality JSON and decoded REAL1 exports their own 512 MiB budget in `realityShare.ts`, leaving other formats and compressed input budgets unchanged. Apply the same budget during compression. Bound temporary allocations for UTF-8 measurement and tree traversal; raise the reality node budget to 64 million while retaining depth, unsafe-key, finite-number and schema checks.
3. Add regressions above the old byte and node limits, plus boundary and malformed-input coverage. Run affected unit tests, typecheck/lint, web build, and the existing reliability E2E with Edge on port 41731. Inspect desktop/mobile backup screenshots.

No data migration is required. Large-file tests verify the import parser/codec; they do not certify SQLite durability or remove browser storage quotas. Do not restart franchise benchmarks, install the app, or alter personal saves.

## Verification result

Completed the UI and import changes. Passed 50 focused tests, changed-file lint, TypeScript, web build and all 12 Edge reliability/smoke E2E. Desktop/mobile backup and restore screenshots were visually inspected. Desktop build produced both MSI and NSIS installers; neither was installed. See the 2026-09-13 follow-up in the reliability progress notes for test scope and remaining limitations.
