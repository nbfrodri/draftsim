# Application typography

## Family rules

DraftSim uses Inter for application text: page/section headings, team and player names, controls, labels, tables, scoreboards, tooltips and chart labels. `font-body` and `font-sans` both resolve to the same bundled Inter family. The existing `font-display` utility now denotes semibold Inter emphasis rather than a separate decorative typeface. Preserve hierarchy through size, weight, spacing and color instead of switching families.

Cinzel is reserved for the DraftSim wordmark using `font-brand`. Do not use it for data rows, team names, filters or everyday buttons. Monospace is limited to literal import/export codes and other technical text; use `tabular-nums` with Inter to align normal statistics and scores. Team/league artwork and decorative glyphs inside external images are assets, not interface typography.

The root layout loads Inter and Cinzel through `next/font`, which bundles the font files with the static export. No runtime Google Fonts request is required. Tailwind tokens, the root/body family and form-control defaults share that configuration. SVG text inherits its surrounding font. Avoid inline Arial/system-font overrides or new font families in individual components.

## Applying the rules

- Use inherited Inter for ordinary text and controls; `font-medium` or `font-semibold` gives emphasis.
- Existing `font-display` headings and prominent values use Inter at weight 600. Use `font-brand` only for the application name.
- Keep existing compact data layouts and responsive sizes; do not compensate for missing width by changing font family.
- Keep user-facing labels readable and title-cased where appropriate; role filters use Top, Jungle, Mid, Bot and Support.
- When adding charts, popovers or modal controls, verify computed font families as well as visual alignment.

Browser regression coverage checks the menu wordmark, controls, setup headings and inputs, alongside screenshots of Swiss pairing strengths and Rookie Class filters at the desktop minimum width. Native system dialogs use the operating system's typography.

## Verification (2026-09-21)

TypeScript, lint and all 49 browser regression cases passed against the production static export. The new cases cover computed font families, rookie role combinations with team filters (including academy), empty states and Swiss half-star display. Menu, rookie filters and Swiss pairing screenshots were inspected. `npm run desktop:build -- --ci` generated local Windows x64 NSIS and MSI installers successfully. This iteration built the native packages; it did not install them or exercise the new UI inside a native WebView. The local test builds retain version 0.8.0 and are not a new published release.
