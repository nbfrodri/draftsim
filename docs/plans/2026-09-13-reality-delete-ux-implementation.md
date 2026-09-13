# Reality deletion: blocking progress and backup cost

Keep the existing preventive backup and retry behavior. From confirmation until deletion finishes or fails, block navigation, keyboard interaction with the background, and normal desktop close. Show the actual backup/deletion phase and elapsed time in a native modal styled with existing Rift tokens; no invented percentage or cancellation during writes.

1. Start a backing-up-reality operation before any flush/backup in store/draftStore.ts; transition to deleting-reality only after backup succeeds and always release the operation in finally. Reuse desktopStorage close protection.
2. Add the two-phase native dialog in AppDesktopOperationOverlay.tsx, preserving other operation overlays. Remove the redundant inline busy notice from RealitiesHub.tsx.
3. In backups.rs, skip retention inspection when filename-based retention already keeps every file. When any deletion is possible, retain the existing full validation and valid-copy retention.
4. Test navigation/keyboard blocking, phase order, error recovery, durable deletion and backup preservation with isolated fixtures; test native retention/corruption protections. Run targeted lint/typecheck, affected tests, web and desktop builds, and inspect dialog screenshots. Do not modify personal saves or install the app.

## Verification

- Targeted ESLint and production web build (including TypeScript) passed.
- 23 unit tests across reality deletion, reality transitions and desktop storage passed.
- All 8 Rust tests passed, including valid-copy retention amid corrupt snapshots and external retention.
- Edge regression passed with the backup boundary held open: native modal blocks background focus and Escape/Tab; backup failure unlocks and preserves the selected reality; retry deletes only that reality, preserves the backup and survives reload.
- Desktop and 390px mobile screenshots inspected. No overflow in the dialog.
- The performance change removes whole-database retention scans only when every file is already retained; copying and validating the new snapshot remain required. No timing claim is made for personal saves.
