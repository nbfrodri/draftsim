# Desktop distribution cleanup

Scope: conservative cleanup approved by the user. Distribute Windows x64 NSIS and MSI installers through a GitHub Release on each vX.Y.Z tag. Keep the existing interface development and browser regression tests because Tauri uses the same frontend. No gameplay or save-format changes.

1. Reuse project CI from the release workflow, rename the misleading web job, avoid duplicate frontend builds, and upload installers only after native checks and installation smoke pass.
2. Verify npm, Tauri, Cargo and lockfile versions before building. Add an npm version hook to synchronize desktop metadata and tests for mismatches and invalid release tags.
3. Publish both verified installers with generated release notes after all checks succeed. Keep write permissions in the publishing job only.
4. Make installer targets explicit, remove unused Android bundling configuration and placeholder Cargo metadata. Preserve the application identifier and executable name for existing installs.
5. Rewrite English and Spanish READMEs around Windows installation, core modes, development, saves and releases. Keep detailed system documentation linked. Correct obsolete comments about remote build-time data fetching and document the bundled catalogue.
6. Validate release tooling, YAML, documentation links, lint, TypeScript, unit tests, frontend build, browser regressions and native tests/build where available. Installer smoke must run on a disposable GitHub-hosted Windows runner, never against personal saves.

No commit, tag or release is created as part of preparing these changes. The existing untracked training directory is outside the cleanup scope.

## International MVP addition

The user also requested tournament MVPs in each international Live Results card. The feed now freezes the existing champion-team tournament award for First Stand, MSI, Worlds and Global Cup. It displays player, lane, team and average rating in compact and expanded layouts. Results without enough rated games omit the award. A final champion-id guard prevents a play-in winner or runner-up from being displayed as the event MVP.

## Verification completed

- Full Vitest suite: 95 files, 1,242 tests passed after the MVP change.
- Release version tooling: 6 Node tests passed.
- Rust/SQLite: 9 tests passed.
- Browser regression suite: 17 tests passed using Edge against the final production export.
- ESLint, TypeScript/build, YAML parsing, README local links and git diff checks passed.
- npm audit: 0 vulnerabilities.
- Release publication script exercised with mocked gh: new release, existing draft, already public release, failed upload and missing MSI cases passed. No GitHub publication was performed.
- Local Windows build produced both 0.1.0 x64 installers successfully.
- Native installer smoke was not run on this personal workstation; it remains restricted to disposable GitHub-hosted Windows CI. MSI installation itself is not covered by the existing NSIS smoke.
