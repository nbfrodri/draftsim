# International match cards and player appearances

## Intended behavior

- A completed best-of-five reverse sweep in the MSI Swiss pairing row shows the same visible `Rev Sweep` badge used on bracket match cards. Pending matches and other results do not show it.
- Each team hover card opened from a match displays H2H against the other team in that exact match, including when the same team appears in multiple cards with different opponents. A card without an opponent does not inherit an earlier H2H. The fix covers the shared live, tournament, and completed phase card paths.
- The Search player profile shows total recorded international event appearances. Each event rostered counts once per archived season, using the existing stable-player-ID career aggregation. Older history is not inferred from current rosters.

## Implementation

1. Remove the live team-card snapshot cache in `components/team/TeamCardContext.tsx`. Its current key only includes the team and roster, while the cached card also contains opponent-specific H2H and live results; including the opponent alone would still leave scores stale. Resolve the current card on hover, then verify separate match cards cannot share another opponent's record or stale scores. Check the tournament and completed-phase providers still pass the correct opponent through.
2. In `components/tournament/bracket/FormatViews.tsx`, reuse `isReverseSweep` and show a compact badge in `SwissPairingRow`, alongside the score or result metadata, consistent with `components/tournament/bracket/MatchCard.tsx`. The helper already resolves game winners by team across side swaps.
3. In `components/SeasonHistoryView.tsx`, add `Intl Appearances` to the Search player profile's career stats, sourced from `p.career.intlAppearances` already aggregated by `computePlayerCareers`. Add or extend a focused history-search test for aggregation across seasons and stable IDs if existing tests do not prove it.
4. Add a focused regression for the H2H cache behavior and reverse-sweep visibility where practical with the repository's Vitest setup. Run focused tests, `npm run typecheck`, `npm run lint`, and `npm run build`. Report browser versus native verification accurately.

No save schema or migration changes are needed. Existing archived career fields and event-roster attribution remain authoritative.

## Verification performed

- Focused Vitest: H2H against two different opponents, no opponent, and an updated same-opponent result; player career appearances across two archived seasons; reverse-sweep detection including side swaps.
- Typecheck, lint, and static export build pass.
- MSI Swiss badge browser regression passes with the installed Chrome Playwright channel at 1440px and 1024px. It asserts the badge appears only on the completed comeback pairing, is centered beneath its score, and stays within the card. Full-page and cropped pairing screenshots are saved under `test-results/reverse-sweep-swiss/` as `full-1440.png`, `full-1024.png`, `pairing-1440.png`, and `pairing-1024.png`. The default bundled Chromium is not installed.
- `docs/systems.md` and `docs/player-identity-and-franchise.md` describe the badge, current-opponent H2H, Search appearance count, and stage-roster award attribution.
- Native Tauri WebView was not exercised because these changes are in shared React rendering and archive read paths.
