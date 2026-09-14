# Title Playground

Open **Season History → select a reality → Title Playground**. Season Mode and each reality keep their own archive scope. Switching sources resets the playground filters.

- Switch between teams and players.
- Click a region icon to isolate it from the initial all-regions view; then toggle additional regions. All regions restores the global view.
- Choose all titles, domestic splits, internationals, or individual competitions, including Global Cup.
- Select inclusive start/end years; Beginning and Latest include the full archive by default.
- For players, select a position to count titles won in that position; All positions restores the full career.
- Year and count pickers use themed menus with arrow keys, Home/End, Enter, Escape and outside-click dismissal.
- Comparison choices include team, position and region icons; title breakdown rows show the winning club and region logos.
- Search competitors, choose Top 10 / Top 25 / All, or include known participants with zero titles.
- Expand the comparison selector to pick specific competitors. Clear selection returns to all matches.
- Bars stack the selected competition counts. The cumulative timeline plots up to eight competitors and starts counting inside the selected year range, not before it.
- Select a bar or timeline legend with mouse or keyboard to open exact counts and the winning year, competition, club and region.

## Counting rules

Only archived results are included. Team identity is name plus league, matching the Hall convention. Player identity is the stable player ID, so two people sharing a name remain separate. A player earns a title only when a phase roster records them on the champion team. Regional filters use the winning club's region at the event; subsequent transfers cannot move that title to a different region. Repeated phases of one event and duplicate archive IDs do not duplicate credits. The legacy Worlds headline is a fallback, never an extra trophy.

Old archives without enough roster identities still support team counts. The player view reports incomplete coverage and does not guess winners from the end-of-year team. A player's club icon represents their latest selected title, or an archived appearance when they have no selected title. Generated teams and failed remote logos use the existing team-icon fallback.

Reality years come from the final Year N label. Other season names fall back to chronological archive position with an explanatory note. Missing years are not fabricated as additional archived seasons.

This view is read-only, lazily loaded, and needs no save migration or new runtime dependency. Filter choices stay local to the mounted view.

## Visual direction and validation

Reference inspected on 2026-09-15: [Horizontal bar chart with gradient by smknstd on Dribbble](https://dribbble.com/shots/11352990-Horizontal-bar-chart-with-gradient). Adapted the aligned identity column, common baseline and visible end totals. Competition colors replace the decorative gradient so segments encode actual data; DraftSim's existing dark/gold theme, region icons and team assets remain in use.

Unit tests cover winning-region attribution, shared names, phase and archive deduplication, inclusive years, Global Cup, zero-title participants and missing legacy rosters. The browser test exercises source isolation, filtering, comparison selection, keyboard breakdown access and the cumulative view, with captures at desktop and the 1024px minimum window width.
