# DraftSim

Simulador de escritorio para Windows de drafts, partidas, torneos y franquicias de League of Legends. Puedes hacer pick/ban contra la IA, definir una estrategia, seguir la partida o simular temporadas completas en seis regiones.

Desarrollado con **Tauri 2**, **React 19**, **Next.js 16**, **TypeScript** y **Rust**, con partidas guardadas en **SQLite** local. El código, los identificadores y la interfaz están principalmente en inglés.

[English](README.md) · [Descargar instaladores](https://github.com/nbfrodri/draftsim/releases) · [Sistemas de juego](docs/systems.es.md)

## Instalar en Windows

Abre [GitHub Releases](https://github.com/nbfrodri/draftsim/releases) y elige un instalador para Windows x64:

| Instalador | Archivo | Uso |
|---|---|---|
| NSIS | `DraftSim_<version>_x64-setup.exe` | Asistente de instalación habitual |
| MSI | `DraftSim_<version>_x64_en-US.msi` | Paquete de Windows Installer |

Ambos instalan la misma aplicación. Las releases se generan al subir un tag de versión, después de superar las comprobaciones automáticas. Si aún no hay ninguna, puedes compilar los instaladores siguiendo las instrucciones de abajo.

DraftSim utiliza Microsoft Edge WebView2. El instalador gestiona su instalación cuando hace falta; ese proceso puede necesitar internet. El catálogo de campeones viene incluido, mientras que las imágenes remotas, los sonidos y las actualizaciones opcionales de datos necesitan conexión. No hay un despliegue web público.

## Modos y funciones

- **Series:** pick/ban entre jugadores, contra la IA o IA contra IA; series al mejor de varias partidas, draft fearless y rosters opcionales.
- **Simulación de partidas:** estrategia en War Room, bajas, objetivos, oro, probabilidad de victoria, MVP y resúmenes.
- **Torneos:** eliminación simple o doble, round robin, suizo, suizo con playoffs y grupos con playoffs.
- **Temporadas:** LCK, LPL, LEC, LCS, CBLOL y LCP; Winter, Spring y Summer; First Stand, MSI, Worlds y Global Cup.
- **Franquicias / Realities:** múltiples años, fichajes, envejecimiento, academia, agentes libres, carreras de jugadores, Hall of Seasons y simulación masiva.
- **MVP internacionales:** Live Results muestra el MVP del equipo campeón de cada evento, su posición y valoración cuando hay estadísticas de partidas.
- **Resultados:** clasificación en directo de los splits con equipos desplegables e historial de equipos con posiciones registradas (`#1`, `#2`, etc.). Los archivos antiguos sin posición guardada indican que no está disponible.
- **Personalización:** tiers de campeones, rosters, identidades de equipo y ajustes de simulación.

La [referencia de sistemas](docs/systems.es.md) explica en detalle el draft, las partidas y las franquicias.

## Title Playground

Abre **Season History → elige una realidad → Title Playground** para explorar los títulos históricos de equipos y jugadores con barras apiladas y una evolución acumulada por año.

- Filtra por región, split o competición internacional y por un intervalo de años inclusivo.
- Alterna equipos y jugadores; filtra jugadores por la posición en la que ganaron cada título.
- Busca competidores, muestra Top 10 / Top 25 / todos o selecciona una comparación personalizada.
- Identifica competidores con logos de equipo, iconos de posición y competición; selecciona una fila para ver los años, clubes y regiones de cada título.
- Los títulos de jugadores se atribuyen a la región y posición en el momento de ganarlos. Los fichajes posteriores no cambian esa atribución.

Funciona con realidades existentes y mantiene separados sus historiales. Los archivos antiguos sin identidades de plantilla suficientes muestran un aviso, sin inventar ganadores. Los dropdowns oscuros admiten navegación por teclado. La [guía de Title Playground](docs/title-playground.md) detalla los controles y las reglas de cómputo en inglés.

El gráfico circular de equipos muestra su porcentaje de los títulos seleccionados, con logos o nombres en los sectores y porcentajes opcionales. Respeta los filtros de región, competición, años y comparación.

Los perfiles incluyen Most frequent teammates: temporadas compartidas contadas una vez por año, eventos compartidos y años desplegables con los títulos ganados juntos y accesos a Timeline. Ambos jugadores deben figurar en el roster ganador del evento para atribuirles un título compartido.

Los nombres de equipos y jugadores muestran sus cards. En el desglose, pulsa cantidades, competiciones, años, equipos o regiones para filtrar la tabla; el botón junto al año lo abre en Timeline.

Career History de jugadores y Results History de equipos incluyen snapshots desplegables del roster de cada evento registrado, con cards contextualizadas al evento y un botón Close roster. Las nuevas temporadas archivadas conservan todos los campeones jugados en los champion pools. Funciona en realidades existentes; los campeones descartados de resúmenes antiguos no se recuperan automáticamente.


## Galería

| Draft | Simulación de partida |
|---|---|
| ![Draft](docs/screenshots/draft.png) | ![Simulación](docs/screenshots/sim.png) |

| Comparación de equipos | Editor de roster | Resumen de serie |
|---|---|---|
| ![Comparación](docs/screenshots/comparison.png) | ![Editor](docs/screenshots/roster-editor.png) | ![Resumen](docs/screenshots/recap.png) |

## Desarrollo local

Requisitos en Windows:

- Node.js **22.12+** y npm.
- Rust estable con toolchain MSVC, instalado mediante [rustup](https://rustup.rs/).
- Visual Studio Build Tools con **Desarrollo para el escritorio con C++** y Windows SDK.
- Microsoft Edge WebView2. Consulta los [requisitos de Windows de Tauri](https://v2.tauri.app/start/prerequisites/#windows).

```powershell
npm ci
npm run desktop:dev
```

Tauri inicia el servidor de desarrollo de Next.js y abre una ventana nativa con recarga automática. La interfaz también se puede abrir en el navegador para desarrollar y ejecutar pruebas; su almacenamiento está separado de las partidas SQLite del escritorio.

```powershell
npm run dev       # Interfaz local en http://localhost:3000
npm run build     # Compila la interfaz y el worker en out/
npm run preview   # Vista previa local en http://127.0.0.1:3000
```

Next.js construye la interfaz que se incluye en Tauri. La aplicación instalada no ejecuta un servidor Node.js. El build usa el catálogo de campeones incluido y no consulta APIs externas para obtenerlo.

## Compilar instaladores

En un entorno de desarrollo Windows:

```powershell
npm run desktop:build
```

El comando comprueba las versiones, compila la interfaz una sola vez y genera ambos instaladores:

```text
src-tauri/target/release/bundle/nsis/DraftSim_<version>_x64-setup.exe
src-tauri/target/release/bundle/msi/DraftSim_<version>_x64_en-US.msi
```

Distribuye los instaladores. `src-tauri/target/release/app.exe` es un resultado de compilación, no una release portable empaquetada por separado. La distribución automática está configurada para Windows x64.

## Publicar una versión

El [workflow de releases](.github/workflows/release.yml) se ejecuta al subir un tag como `v0.2.0`. Valida las versiones, ejecuta las [comprobaciones del proyecto](.github/workflows/ci.yml) y publica una GitHub Release con ambos instaladores y notas generadas automáticamente. Los archivos se cargan primero en un borrador y la release completa se hace pública al finalizar.

Empieza con el árbol de trabajo limpio:

```powershell
npm version 0.2.0 --no-git-tag-version
npm run check
npm run test:desktop
npm run desktop:build
```

El hook `version` de npm sincroniza `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y la entrada de la aplicación en `src-tauri/Cargo.lock`. npm actualiza `package.json` y `package-lock.json`. Revisa y guarda los cambios en un commit; después etiqueta ese commit:

```powershell
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Release 0.2.0"
git tag v0.2.0
git push origin HEAD
git push origin v0.2.0
```

Usa versiones estables `X.Y.Z`. El tag debe coincidir exactamente con todos los archivos de versión. MSI admite valores major/minor hasta 255 y patch hasta 65535. El workflow utiliza el `GITHUB_TOKEN` del repositorio y concede permiso de escritura únicamente al job que publica; no necesita un token personal.

Si falla la carga de un borrador, puedes volver a ejecutar el workflow. Las releases públicas no se sobrescriben: los cambios necesitan una versión nueva. No están configuradas la firma de instaladores ni las actualizaciones automáticas dentro de la app.

## Comprobaciones y mantenimiento

| Comando | Función |
|---|---|
| `npm run check` | Versiones, pruebas de herramientas de release, lint, TypeScript, pruebas unitarias y build de interfaz |
| `npm run lint` / `npm run typecheck` | Comprobaciones estáticas |
| `npm test` / `npm run test:watch` | Pruebas unitarias de simulación y aplicación |
| `npm run test:release` | Pruebas de validación y sincronización de versiones |
| `npm run test:desktop` | Pruebas Rust/SQLite usando el lockfile de Cargo |
| `npm run test:e2e` | Pruebas de interfaz en navegador sobre `out/` |
| `npm run check:version` | Comprueba las versiones de npm, Tauri y Cargo |
| `npm run refresh-champions` | Actualiza el catálogo de campeones incluido |
| `npm run refresh-data` | Actualiza habilidades e ítems de Meraki incluidos |
| `npm run fetch-player-names` | Actualiza los nombres de jugadores profesionales |
| `npm run fetch-team-logos` | Descarga los logos de equipos |
| `npm run fetch-rookie-names` / `npm run fetch-coaches` | Actualiza datos de referencia de rosters |
| `npm run build:worker` | Genera el worker de simulación masiva; automático antes de dev/build |
| `npm run calibrate` | Compara fuerza de draft y porcentaje de victorias simuladas |

Las pruebas de navegador necesitan un build y un navegador de Playwright:

```powershell
npm run build
npx playwright install chromium
npm run test:e2e
```

También puedes usar Edge instalado con `$env:PLAYWRIGHT_CHANNEL='msedge'`. Estas pruebas ejercitan la interfaz compartida, no el IPC nativo. CI en Windows compila ambos instaladores y comprueba instalación NSIS, reapertura, migración desde JSON y persistencia al reinstalar en un runner desechable. El script de instalación rechaza equipos personales. MSI se compila y se adjunta, pero aún no tiene una prueba de instalación independiente.

Los scripts de actualización de datos necesitan conexión. Revisa los datos generados antes de guardarlos en un commit. Para calibrar la IA en PowerShell:

```powershell
$env:CALIB_DRAFTS='600'
$env:CALIB_SIMS_PER_DRAFT='40'
npm run calibrate
```

## Partidas guardadas y backups

Los datos de escritorio se guardan en:

```text
%APPDATA%\app.draftsim.desktop\draftsim.db
```

El identificador `app.draftsim.desktop` se mantiene entre versiones. Las partidas JSON antiguas se migran a SQLite y se conservan como archivos `.bak`. Más detalles en [almacenamiento de escritorio](docs/desktop-sqlite-storage.md).

- Exporta realities importantes como `.draftsim-reality.json` y temporadas como `.draftsim-season.json`.
- Los torneos usan `.draftsim.json`; los códigos compartidos utilizan `TOUR1:`, `REAL1:` y `META1:`.
- Para copiar toda la base de datos, cierra la aplicación antes de copiar `draftsim.db`.
- Utiliza el panel de backups antes de importar o borrar datos que quieras conservar.

## Guía del repositorio

| Ruta | Contenido |
|---|---|
| `app/`, `components/` | Entradas de Next.js e interfaz React |
| `lib/draftAI/`, `lib/sim/` | Scoring del draft y simulación de partidas |
| `lib/season/` | Temporadas, franquicias, rosters, posiciones e historial |
| `lib/desktopStorage.ts`, `lib/desktopSqlite.ts` | Adaptadores de persistencia y SQLite |
| `store/` | Estado y acciones de Zustand |
| `src-tauri/` | Shell Rust, comandos nativos y configuración de instaladores |
| `scripts/` | Datos, builds, versiones y comprobaciones de instalación |
| `e2e/` | Pruebas de la interfaz compartida en navegador |
| `.github/workflows/` | Comprobaciones y releases de Windows |
| `docs/` | Sistemas, arquitectura y notas de implementación |

Los resultados generados (`out/`, `.next/`, `src-tauri/target/`, informes de pruebas) están excluidos de Git.

## Más documentación

- [Sistemas (ES)](docs/systems.es.md) · [Game systems (EN)](docs/systems.md)
- [Formatos de torneo](docs/tournament-mode.md) · [Rosters](docs/players-feature.md)
- [Identidad de jugadores y franquicias](docs/player-identity-and-franchise.md)
- [Realismo de temporada](docs/season-realism.md) · [Compartir realities](docs/reality-sharing.md)
- [SQLite](docs/desktop-sqlite-storage.md) · [Rendimiento de guardados](docs/performance-franchise-saves.md)

## Uso de IA

Se ha utilizado IA como apoyo en el desarrollo y la documentación de este proyecto.

## Atribución

Proyecto no oficial de fans, sin afiliación con Riot Games. Los nombres de League of Legends, las ilustraciones de campeones, los iconos y los sonidos pertenecen a Riot Games. CommunityDragon y Meraki Analytics proporcionan datos de la comunidad; los datos de rosters también utilizan Leaguepedia. Los recursos de terceros conservan los derechos de sus propietarios.
