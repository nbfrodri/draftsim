# DraftSim

Simulador de escritorio para Windows y Linux de **drafts, partidas, torneos y franquicias de League of Legends**. Juega contra la IA, sigue una partida en directo o simula temporadas completas entre seis regiones.

[English](README.md) · [Descargar la última versión](https://github.com/nbfrodri/draftsim/releases/latest) · [Documentación](docs/README.md)

## Qué puedes jugar

- **Drafts y partidas:** jugador contra IA, jugador contra jugador o IA contra IA; series al mejor de varias partidas, fearless, estrategias y resúmenes.
- **Torneos y temporadas:** eliminatorias, ligas, Swiss y grupos; LCK, LPL, LEC, LCS, CBLOL y LCP, además de First Stand, MSI, Worlds y Global Cup.
- **Realidades:** carreras de varios años con fichajes, envejecimiento, academias, agencia libre y simulación masiva.
- **SS Race en directo:** titulares SS mundiales y aspirantes por rol, con logos, notas, diferencias de oro, requisitos y probabilidades estimadas. Las plazas SS se revisan al cerrar cada fase competitiva.
- **Historial y personalización:** perfiles de jugadores y equipos, movimientos, récords, Title Playground, rosters históricos y edición de meta y plantillas.

Consulta las [notas de v1.14.0](docs/releases/v1.14.0.md) para los guardados más ligeros en simulaciones bulk, las Event Statistics históricas, los récords SS y el resumen de resultados del bulk, y los [sistemas de juego](docs/systems.es.md) para las reglas.

## Instalar en Windows

Descarga el **setup.exe x64** de [Releases](https://github.com/nbfrodri/draftsim/releases/latest), haz doble clic y sigue el asistente. También hay un **MSI** para despliegues con Windows Installer. Ambos instalan la misma aplicación; el instalador gestiona WebView2 si hace falta.

## Instalar en Linux

Los paquetes publicados son para **x86_64 / amd64**; no hay builds ARM.

| Tu sistema | Paquete |
|---|---|
| Debian, Ubuntu, Linux Mint | `.deb` |
| Fedora, openSUSE | `.rpm` |
| Arch, Omarchy y otras distribuciones compatibles | `.AppImage`, o compilación nativa si resulta incompatible |

La [guía de instalación](docs/installation.es.md) incluye los comandos por sistema, actualizaciones, FUSE y la alternativa nativa para Omarchy.

## Partidas guardadas

El escritorio guarda los datos localmente en SQLite. Usa **Backups** para copias y recuperación de la base de datos, o exporta realidades individuales para compartirlas. La vista del navegador utiliza otro almacenamiento. Consulta [persistencia y recuperación](docs/persistence-and-recovery.md).

El catálogo de campeones viene incluido; las imágenes remotas, el audio y las actualizaciones opcionales de datos necesitan conexión.

## Desarrollo local

Requiere **Node.js 22.12+**, npm, Rust estable y los [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/) para tu sistema.

```bash
npm ci
npm run desktop:dev
```

| Comando | Función |
|---|---|
| `npm run dev` | Desarrollo de la interfaz en navegador |
| `npm run check` | Versiones, pruebas de herramientas de release, auditoría de dependencias, lint, tipos, tests unitarios y build |
| `npm run test:e2e` | Tests de navegador; compila antes e instala Chromium de Playwright |
| `npm run test:desktop` | Tests nativos de Rust/SQLite |
| `npm run desktop:build` | Instaladores NSIS y MSI de Windows |
| `npm run desktop:build:linux` | Paquetes deb, rpm y AppImage de Linux |

Desarrollado con Tauri 2, React 19, Next.js 16, TypeScript y Rust. La aplicación instalada incluye la interfaz estática y no ejecuta un servidor Node.js. El código y los textos de la interfaz están en inglés.

## Documentación

- [Instalación (ES)](docs/installation.es.md) · [Installation (EN)](docs/installation.md)
- [Índice de documentación](docs/README.md) · [Desarrollo, pruebas y releases](docs/development-and-release.md)
- [Sistemas de juego (ES)](docs/systems.es.md) · [Game systems (EN)](docs/systems.md)
- [Arquitectura](docs/technical-design.md) · [Persistencia y recuperación](docs/persistence-and-recovery.md)
- [Title Playground](docs/title-playground.md) · [Compartir realidades](docs/reality-sharing.md)

## Atribución

Proyecto no oficial de fans, sin afiliación con Riot Games. Los nombres de League of Legends, las ilustraciones de campeones, los iconos y los sonidos pertenecen a Riot Games. CommunityDragon y Meraki Analytics proporcionan datos de la comunidad; los datos de rosters también utilizan Leaguepedia. Los recursos de terceros conservan los derechos de sus propietarios.

Se ha utilizado IA como apoyo en el desarrollo y la documentación de este proyecto.
