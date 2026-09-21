# Replay and season results

- Reuse team hover cards in replay key events, damage and MVP, with game-side identities.
- Highlight recorded pentakills in game tabs and the selected game's header; show player, lane and champion. Cover swapped sides and missing legacy data with deterministic fixtures and screenshots.
- Add a regular-season simulation scope beside Sim Matchday. Only split regular stages are eligible; stop before playoffs in every region, preserving cancellation, form, meta and persistence flush behavior.
- Pin Season Results identities and hover rosters to existing tournament snapshots, with phase-roster fallback. Do not reconstruct missing historical rosters from live teams. Existing tournaments already deep-clone entrants and persist them, so no save migration is required.
- Verify domain helpers, browser interactions and screenshots, types and lint. Build Windows installers locally using the existing Tauri scripts; document actual results and browser/native limits.

## Verification

- `npm test`: 120 files / 1,420 tests passed. The final positional-recap pentakill adjustment also passed its focused unit test.
- `npm run typecheck` and `npm run lint`: passed; subsequent changed test/helper files passed focused lint.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e -- e2e/tournament-presentation.spec.ts`: 19 browser cases passed against the final static export, including the regular/playoff boundary across six regions, team-card Escape handling, pentakills after side swaps, and Winter/First Stand roster snapshots after transfers. Chromium's bundled executable was unavailable, so these use installed Edge.
- SQLite preservation was tested using an in-memory database through the actual save/load executor, without personal AppData.
- Local packaging uses `npm run desktop:build -- --ci` and retains version 0.9.2. Artifacts: `src-tauri/target/release/app.exe`, `bundle/nsis/DraftSim_0.9.2_x64-setup.exe` and `bundle/msi/DraftSim_0.9.2_x64_en-US.msi` (bundle paths are relative to `src-tauri/target/release/`).
- UI screenshots are browser captures; desktop-only card behavior is enabled in the isolated fixtures. No installer was installed and no native WebView interaction was exercised.

Screenshots are regenerated locally by the browser tests in the ignored `test-results/playwright/` directory:

- `replay-pentakill-desktop.png` and `replay-pentakill-minimum.png`: deterministic pentakill fixture at normal and minimum desktop dimensions.
- `regular-season-complete.png`: regular simulation disabled at the playoff boundary.
- `season-results-winter-snapshot.png` and `season-results-first-stand-snapshot.png`: historical team cards after replacing the live roster.

## Follow-up: recap badges and completed-year roster moves

Most MVPs now keeps the team identity on the line below the player and renders the shared TierChip. The transfer digest no longer switches automatically to the Offseason filter at year end; all closing-year split groups remain accessible until Finalize Offseason advances the season. This is a display-filter change and leaves saved movement origins and carry boundaries intact.

Replay badges group repeated pentakills by side, stable player identity, lane and champion. A single penta keeps its original label; repeats show Pentakill ×N without repeating the player and icons. Different participants remain separate.

Validation: 64 focused unit tests and 27 Edge browser cases passed, plus TypeScript and lint on the changed files. Browser tests cover the year-advance button, all three post-split groups, Most MVPs identity/tier, and five replay tabs with ×3 and ×2 counters at 1440 and 1024 px. Screenshots inspected:
- `test-results/playwright-multiple-pentas/replay-penta-count-1024.png`
- `test-results/playwright-multiple-pentas/replay-penta-count-1440.png`
- `test-results/playwright/season-most-mvps-tier.png`
- `test-results/playwright/completed-year-roster-moves-0.png`

The local Windows build retains 0.9.2. Native WebView interactions and installer installation are not part of these browser checks.
