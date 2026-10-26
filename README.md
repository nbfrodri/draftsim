# DraftSim

A Windows and Linux desktop simulator for **League of Legends drafts, matches, tournaments and multi-year franchises**. Play against the AI, follow a match live, or simulate entire seasons across six regions.

[Español](README.es.md) · [Download the latest release](https://github.com/nbfrodri/draftsim/releases/latest) · [Documentation](docs/README.md)

## What you can play

- **Drafts and matches:** player vs AI, player vs player or AI vs AI; best-of series, fearless drafting, strategies and match recaps.
- **Tournaments and seasons:** elimination brackets, round robin, Swiss and groups; LCK, LPL, LEC, LCS, CBLOL and LCP, plus First Stand, MSI, Worlds and Global Cup.
- **Realities:** multi-year careers with transfers, aging, academies, free agency and bulk simulation.
- **Live SS Race:** current worldwide SS players and contenders by role, with team logos, grades, gold differences, eligibility and estimated chances. Actual SS reviews happen at competitive phase boundaries.
- **History and customization:** player/team profiles, roster moves, records, Title Playground, historical lineups, editable champion meta and rosters.

See [v1.14.1 release notes](docs/releases/v1.14.1.md) for safer bulk-simulation saves with a crash log, the two-step Event Statistics picker, stacked role leaders and the SS badge, or the [game systems reference](docs/systems.md) for the rules.

## Install on Windows

Download the **x64 setup.exe** from [Releases](https://github.com/nbfrodri/draftsim/releases/latest), double-click it and follow the wizard. An **MSI** is also available for Windows Installer deployments. Both install the same app; WebView2 is handled by the installer when needed.

## Install on Linux

Published packages target **x86_64 / amd64**; ARM builds are not provided.

| Your system | Package |
|---|---|
| Debian, Ubuntu, Linux Mint | `.deb` |
| Fedora, openSUSE | `.rpm` |
| Arch, Omarchy and other compatible distributions | `.AppImage`, or a native build if incompatible |

The [installation guide](docs/installation.md) covers commands for each system, updates, FUSE and the Omarchy native-build fallback.

## Saves

Desktop saves use local SQLite. Use **Backups** for database snapshots and recovery, or export individual realities to share them. Browser previews use separate storage. See [persistence and recovery](docs/persistence-and-recovery.md).

The champion catalogue is bundled; remote artwork, audio and optional data refreshes need internet access.

## Develop locally

Requires **Node.js 22.12+**, npm, Rust stable and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
npm ci
npm run desktop:dev
```

| Command | Purpose |
|---|---|
| `npm run dev` | Browser UI development |
| `npm run check` | Versions, release-tool tests, dependency audit, lint, types, unit tests and build |
| `npm run test:e2e` | Browser tests; build first and install Playwright Chromium |
| `npm run test:desktop` | Native Rust/SQLite tests |
| `npm run desktop:build` | Windows NSIS and MSI installers |
| `npm run desktop:build:linux` | Linux deb, rpm and AppImage packages |

Built with Tauri 2, React 19, Next.js 16, TypeScript and Rust. The installed app embeds the static UI and does not run a Node.js server. Code and interface text are in English.

## Documentation

- [Installation (EN)](docs/installation.md) · [Instalación (ES)](docs/installation.es.md)
- [Documentation index](docs/README.md) · [Development, tests and releases (ES)](docs/development-and-release.md)
- [Game systems (EN)](docs/systems.md) · [Sistemas (ES)](docs/systems.es.md)
- [Architecture](docs/technical-design.md) · [Persistence and recovery](docs/persistence-and-recovery.md)
- [Title Playground](docs/title-playground.md) · [Reality sharing](docs/reality-sharing.md)

## Attribution

Unofficial fan-made project, not affiliated with Riot Games. League of Legends names, champion artwork, icons and sound effects belong to Riot Games. CommunityDragon and Meraki Analytics provide community data mirrors; roster reference data also uses Leaguepedia. Third-party assets retain their owners’ rights.

AI has been used to assist with the development and documentation of this project.
