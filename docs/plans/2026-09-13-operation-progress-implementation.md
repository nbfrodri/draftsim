# Long-running operation progress

Extend the existing blocking deletion UI to restoration, manual backup creation, imports, opening realities and maintenance. Show elapsed time, actual current stage, completed and pending stages, and a clearly labelled remaining-time estimate only when a successful prior run provides timing data. No invented byte percentages or first-run countdown. Native backup/restore stages arrive through per-invocation Tauri channels to avoid stale/background progress.

1. Add a small shared progress store and reusable native modal with bounded local timing history. Connect existing operation phases and actual JS/native boundaries.
2. Restore starts blocking before validation, keeps the overlay through reload and bypasses only the confirmed post-restore reload's beforeunload warning/exit writes, after pending writes are discarded. Normal close protection remains active.
3. Allow outside-click dismissal of an idle backup panel; retain blocking during any active backup action. Manual creation uses the shared progress screen.
4. Extend detailed stages to compact/import/open/leave. Add elapsed time to startup/shutdown shells and correct outdated compaction wording on close.
5. Verify progress ordering and estimates, restoration failure and retry, no reload prompt, outside dismissal and busy blocking, native tests, targeted lint/typecheck, production builds and isolated desktop/mobile screenshots. Generate installers; do not install or alter personal data.

## Completed implementation and verification

- Added native-channel stages for snapshot creation, validation, retention, external replication, restoration, reopen and cleanup. The frontend ignores stale operation IDs and backward progress messages.
- Shared modal covers deletion, restore, manual backups, archive preparation, imports, opening, leaving and compaction. Timing history is optional and separate for web/desktop; failed runs do not train estimates. Startup/shutdown shells show elapsed time, and closing no longer claims to compact.
- Reality review uses archive facts, a new/replacement notice and a collapsible team list. The archive reader and validator show progress before the review appears.
- Confirmed restores skip only their own unload prompt/exit writes after discarding pending saves; normal operation close protection remains. The browser recovery test observed no dialogs and preserved the damaged original.
- Successful native restore/reopen keeps the latest known before-restore folder and removes older known original DB/WAL/SHM files. Interrupted journals and unknown contents are preserved. Web originals are limited to the latest successful restore. Normal imported backups now use the existing retention policy; failed temporary snapshots/copies are cleaned through scoped guards.
- Targeted TypeScript, ESLint and production builds passed. Unit tests cover operation timing and stale events plus affected persistence/import/deletion flows. All 9 Rust tests passed, including channel ordering, failed temporary cleanup, original retention and interruption protections.
- The 10 reliability browser scenarios were exercised. A restore test was corrected to wait for actual navigation; restore and the expanded import flow passed targeted reruns. Native progress modals were held at paint boundaries to verify pending steps, keyboard/background blocking, failure/retry and outside-click behavior.
- Desktop/mobile restore and import review screenshots were inspected. Personal saves were not modified and the application was not installed. Installer compilation is recorded separately when finished.
