# DraftSim

Simulador de escritorio para Windows y Linux de drafts, partidas, torneos y franquicias de League of Legends. Puedes hacer pick/ban contra la IA, definir una estrategia, seguir la partida o simular temporadas completas en seis regiones.

Desarrollado con **Tauri 2**, **React 19**, **Next.js 16**, **TypeScript** y **Rust**, con partidas guardadas en **SQLite** local. El código, los identificadores y la interfaz están principalmente en inglés.

[English](README.md) · [Descargar instaladores](https://github.com/nbfrodri/draftsim/releases) · [Sistemas de juego](docs/systems.es.md)

## Instalar en Windows

Abre [GitHub Releases](https://github.com/nbfrodri/draftsim/releases) y elige un instalador para Windows x64:

| Instalador | Archivo | Uso |
|---|---|---|
| NSIS | `DraftSim_<version>_x64-setup.exe` | Recomendado para uso normal: doble clic, sigue el asistente y abre DraftSim desde Inicio |
| MSI | `DraftSim_<version>_x64_en-US.msi` | Alternativa para Windows Installer / despliegues administrados: doble clic o `msiexec /i "ruta\al\instalador.msi"` |

Ambos instalan la misma aplicación. Las releases se generan al subir un tag de versión, después de superar las comprobaciones automáticas. Si aún no hay ninguna, puedes compilar los instaladores siguiendo las instrucciones de abajo.

DraftSim utiliza Microsoft Edge WebView2. El instalador gestiona su instalación cuando hace falta; ese proceso puede necesitar internet.

## Instalar en Linux

Elige según la distribución, no según el fabricante del ordenador. Los paquetes publicados de Linux son para x86_64 (también llamado amd64); no se ofrecen compilaciones ARM/aarch64. Si tienes dudas, ejecuta `cat /etc/os-release` y `uname -m`.

| Paquete | Archivo | Uso |
|---|---|---|
| deb | `DraftSim_<version>_amd64.deb` | Debian, Ubuntu, Linux Mint y derivadas compatibles |
| rpm | `DraftSim-<version>-1.x86_64.rpm` | Fedora, openSUSE y derivadas compatibles; las dependencias deben estar disponibles para esa distribución y versión |
| AppImage | `DraftSim_<version>_amd64.AppImage` | Arch, Omarchy, EndeavourOS, Manjaro y otras distribuciones Linux compatibles; se ejecuta sin instalación en el sistema |

Descarga el paquete de [GitHub Releases](https://github.com/nbfrodri/draftsim/releases) y abre una terminal en la carpeta donde lo guardaste. Estos ejemplos usan la versión 1.8.0; sustituye el nombre por el archivo que hayas descargado.

**Debian / Ubuntu / Linux Mint:**

```bash
sudo apt install ./DraftSim_1.8.0_amd64.deb
```

**Fedora:**

```bash
sudo dnf install ./DraftSim-1.8.0-1.x86_64.rpm
```

**openSUSE:**

```bash
sudo zypper install ./DraftSim-1.8.0-1.x86_64.rpm
```

Tras instalar deb/rpm, abre DraftSim desde el menú de aplicaciones o ejecuta `draftsim`. Para actualizar, cierra la aplicación e instala el paquete nuevo con el mismo comando. Documentación de los gestores: [APT](https://ubuntu.com/server/docs/tutorial/managing-software/), [DNF](https://dnf.readthedocs.io/en/stable/command_ref.html#install-command-label), [Zypper](https://manpages.opensuse.org/Leap-15.6/zypper/zypper.8.en.html).

**Arch / Omarchy y demás usuarios de AppImage:**

Guarda el AppImage en una ubicación permanente, como `~/Applications`, dale permiso de ejecución y ábrelo, siguiendo la [guía de AppImage](https://docs.appimage.org/introduction/quickstart.html):

```bash
chmod +x ./DraftSim_1.8.0_amd64.AppImage
./DraftSim_1.8.0_amd64.AppImage
```

No necesita `sudo`. Para actualizar, cierra DraftSim, sustituye el AppImage por el nuevo y vuelve a darle permiso de ejecución. Un AppImage no crea automáticamente una entrada en el menú de aplicaciones. La compatibilidad sigue dependiendo de las bibliotecas del sistema; no garantiza que funcione en cualquier distribución.

### Omarchy / Arch: usar una compilación de este repositorio

Omarchy está basado en Arch: utiliza el AppImage cuando esté disponible; deb/rpm no son paquetes nativos de pacman. El intento local de empaquetado de esta rama generó deb/rpm, pero AppImage falló porque el plugin GTK de linuxdeploy espera rutas antiguas de cargadores GdkPixbuf que ya no existen en este equipo. Consulta el [registro de verificación del empaquetado](docs/plans/2026-10-16-season-ss-tier-meta-and-team-cards.md#local-installer-results). La CI de releases compila el AppImage en Ubuntu.

En el mismo equipo donde se haya compilado correctamente la versión de producción y estén instaladas las dependencias de ejecución de Tauri, puedes abrir el binario desde la raíz del repositorio:

```bash
./src-tauri/target/release/draftsim
```

Para instalarlo manualmente solo para tu usuario, cierra DraftSim y copia ese binario:

```bash
install -Dm755 ./src-tauri/target/release/draftsim "$HOME/.local/bin/draftsim"
"$HOME/.local/bin/draftsim"
```

Esto instala solo el ejecutable, sin registro en el gestor de paquetes ni entrada en el menú. Para actualizarlo, repite la copia tras compilar una versión nueva correctamente. Esta alternativa sirve para el equipo donde se compiló; no es una release portable para distribuir a otros ordenadores.

Los paquetes deb y rpm dependen de WebKitGTK 4.1, que instala el gestor de paquetes. Las partidas se guardan en `~/.local/share/app.draftsim.desktop/`. Las instalaciones de Windows y Linux no comparten partidas; se trasladan con la exportación e importación de copias del panel de backups.

El catálogo de campeones viene incluido, mientras que las imágenes remotas, los sonidos y las actualizaciones opcionales de datos necesitan conexión. No hay un despliegue web público.

## Modos y funciones

Consulta [v1.8.0](docs/releases/v1.8.0.md) para los jugadores SS exclusivos, la corrección de evidencias del meta vivo, los logos del MSI y las tarjetas de equipo del recap.

El guardado de escritorio incluye temporadas sin terminar. Las realidades inactivas se cargan bajo demanda; Backups ofrece diagnósticos locales optativos. Consulta la [guía de persistencia](docs/persistence-and-recovery.md) para la migración al formato 8 y su recuperación.

**Continue playing** y las demás vistas muestran la pantalla de carga centrada de DraftSim, con un spinner, mientras se carga su interfaz. Comparte la presentación del arranque y desaparece cuando la vista solicitada está lista. Consulta la [carga de vistas](docs/interaction-and-execution.md#carga-de-vistas).

El Hall incluye **Roster Moves**: historial cronológico de mercado por realidad, también del año en curso, con filtros por año, ventana, equipo, región y rol, e insignias de estado del jugador. Los archivos antiguos muestran únicamente los eventos que conservaron. Dentro de una ventana, los movimientos siguen el orden de la simulación: primero los transfers de mitad de temporada y luego fichajes, promociones y releases; en el offseason, los releases y fichajes de fin de año van antes que el pase de transfers de la IA, y los cambios de coach al final. Un titular enviado a la academy por una promoción, un fichaje o la subida de un rookie aparece como demotion justo antes de su sustituto, cuando el archivo registró ese destino. Las salidas por agency del main roster a free agency aparecen como releases, y las demotions de checkpoint aplazadas a una ventana de transfers se fechan en esa ventana. Los movimientos por agency de una academy a otra muestran la academy de origen si se registraron desde la v1.1.2; en los anteriores sigue siendo desconocida.

Timeline → By Season muestra también **International Placements**: el orden final completo de First Stand, MSI, Worlds y la Global Cup, con la región y el logo de cada organización según el snapshot de ese evento y las eliminaciones en play-in marcadas. Los archivos antiguos muestran solo campeón y subcampeón.

Consulta las [notas de v1.3.1](docs/releases/v1.3.1.md) para la carga visual uniforme, y las de [v1.3.0](docs/releases/v1.3.0.md) para los rosters compartidos con compañeros, los logos históricos y los resultados por split o evento.

La fuerza de los equipos admite **medias estrellas (de 1 a 5)** en la configuración, las tarjetas, los rankings, el mercado y la simulación normal y masiva. Los guardados anteriores siguen siendo compatibles y los resultados terminados se conservan. Consulta el [contrato técnico](docs/technical-design.md#half-star-team-strength).

- **Series:** pick/ban entre jugadores, contra la IA o IA contra IA; series al mejor de varias partidas, draft fearless y rosters opcionales.
- **Simulación de partidas:** estrategia en War Room, bajas, objetivos, oro, probabilidad de victoria, MVP y resúmenes.
- **Torneos:** eliminación simple o doble, round robin, suizo, suizo con playoffs y grupos con playoffs.
- **Temporadas:** LCK, LPL, LEC, LCS, CBLOL y LCP; Winter, Spring y Summer; First Stand, MSI, Worlds y Global Cup.
- **Franquicias / Realities:** múltiples años, fichajes, envejecimiento, academia, agentes libres, carreras de jugadores, Hall of Seasons y simulación masiva.
- **MVP internacionales:** Live Results muestra el MVP del equipo campeón de cada evento, su posición y valoración cuando hay estadísticas de partidas.
- **Resultados:** clasificación en directo de los splits con equipos desplegables e historial de equipos con posiciones registradas (`#1`, `#2`, etc.). Los archivos antiguos sin posición guardada indican que no está disponible.
- **Personalización:** tiers de campeones, rosters, identidades de equipo y ajustes de simulación.

La [referencia de sistemas](docs/systems.es.md) explica en detalle el draft, las partidas y las franquicias.

## Récords de campeones

Abre **Records & Dynasties → Most played champions** para ver las partidas, victorias, derrotas y WR global de cada campeón en la realidad seleccionada. Filtra Top 10 / 25 / 50 / todos y despliega un campeón para ver su Top 3 / 5 / 10 jugadores, con iconos de posición y cards. El WR es azul por encima del 50 %, rojo por debajo y neutro al 50 %. Los champion pools históricos incompletos muestran un aviso.

## Title Playground

Abre **Season History → elige una realidad → Title Playground** para explorar los títulos históricos de equipos y jugadores con barras apiladas y una evolución acumulada por año.

- Filtra por región, split o competición internacional y por un intervalo de años inclusivo.
- Alterna equipos y jugadores; filtra jugadores por la posición en la que ganaron cada título.
- Busca competidores, muestra Top 10 / Top 25 / todos o selecciona una comparación personalizada.
- Identifica competidores con logos de equipo, iconos de posición y competición; selecciona una fila para ver los años, clubes y regiones de cada título.
- Los títulos de jugadores se atribuyen a la región y posición en el momento de ganarlos. Los fichajes posteriores no cambian esa atribución.

Funciona con realidades existentes y mantiene separados sus historiales. Los archivos antiguos sin identidades de plantilla suficientes muestran un aviso, sin inventar ganadores. Los dropdowns oscuros admiten navegación por teclado. La [guía de Title Playground](docs/title-playground.md) detalla los controles y las reglas de cómputo en inglés.

El gráfico circular de equipos muestra su porcentaje de los títulos seleccionados, con logos o nombres en los sectores y porcentajes opcionales. Respeta los filtros de región, competición, años y comparación.

Los perfiles incluyen **Most frequent teammates**: las temporadas compartidas cuentan una vez por año archivado y los empates se resuelven por eventos compartidos. Despliega un compañero para ver los títulos de cada año y su acceso a Timeline, además de los splits e internacionales registrados juntos. Cada evento muestra el club, la región, el logo histórico y la posición final; al desplegarlo aparecen el roster completo de ese momento, los tiers, las edades registradas y el coach. **Close roster** devuelve el foco a la fila del evento. Los transfers dentro del año conservan la alineación de cada fase. Un título exige ambos IDs en el roster ganador; se excluyen los equipos cuya no participación internacional está registrada, y los resultados desconocidos muestran **Placement unavailable**. Consulta las [reglas de historial compartido](docs/title-playground.md#shared-career-history) para los detalles de cómputo y los límites de los archivos antiguos.

Los nombres de equipos y jugadores muestran sus cards. En el desglose, pulsa cantidades, competiciones, años, equipos o regiones para filtrar la tabla; el botón junto al año lo abre en Timeline.

Career History de jugadores y Results History de equipos incluyen snapshots desplegables del roster de cada evento registrado, con cards contextualizadas al evento y un botón Close roster. Las nuevas temporadas archivadas conservan todos los campeones jugados en los champion pools. Funciona en realidades existentes; los campeones descartados de resúmenes antiguos no se recuperan automáticamente.


## Best Rosters of All Time

El Hall clasifica combinaciones de los mismos cinco jugadores por títulos internacionales y, en caso de empate, por títulos de split. Permite filtrar por región al ganar y rango de años, consultar el snapshot de los cinco jugadores con sus cards y filtrar el historial de títulos por Winter, Spring, Summer, First Stand, MSI, Worlds o Global Cup. Los accesos a la timeline abren el año de la victoria. Los títulos sin un roster completo del evento quedan excluidos con un aviso.

## Búsqueda de jugadores en el live y controles de backups

Abre **Find a player** en Live Results para buscar jugadores, consultar su card y equipo/estado actual, y ver los movimientos conservados en el feed. Las sugerencias y los movimientos utilizan iconos de equipos y badges de Academy, FA y Retired. El índice se construye solo al buscar y reutiliza los movimientos cuando cambia el roster.

El panel de backups permite borrar copias locales individualmente con confirmación y desactivar el destino externo sin eliminar sus archivos existentes. Al abrir o importar una realidad existente, su registro permanente de nombres se completa con el historial conservado para evitar reutilizarlos en futuros jugadores; los duplicados ya existentes no se renombran.

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

Distribuye los instaladores. `src-tauri/target/release/app.exe` es un resultado de compilación, no una release portable empaquetada por separado. 

En un entorno de desarrollo Linux, `npm run desktop:build:linux` genera los paquetes deb, rpm y AppImage en `src-tauri/target/release/bundle/`. Requiere WebKitGTK 4.1 y el resto de [requisitos de Linux de Tauri](https://v2.tauri.app/start/prerequisites/#linux). La distribución automática está configurada para Windows x64 y Linux x86_64.

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

También puedes usar Edge instalado con `$env:PLAYWRIGHT_CHANNEL='msedge'`. Estas pruebas ejercitan la interfaz compartida, no el IPC nativo. CI en Windows compila ambos instaladores y comprueba instalación NSIS, reapertura, migración desde JSON y persistencia al reinstalar en un runner desechable. El script de instalación rechaza equipos personales. MSI se compila y se adjunta, pero aún no tiene una prueba de instalación independiente. CI en Linux compila los paquetes deb, rpm y AppImage, ejecuta los tests Rust e instala el deb para comprobar que la app arranca y crea su base de datos; rpm y AppImage se compilan y adjuntan sin prueba de instalación.

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
| `.github/workflows/` | Comprobaciones y releases de escritorio |
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

## Documentación técnica del proyecto

- [Índice de documentación](docs/README.md).
- [Diseño técnico y arquitectura](docs/technical-design.md).
- [Dominio, premios y offseason](docs/domain-contracts.md).
- [Persistencia y recuperación](docs/persistence-and-recovery.md).
- [Interacción y ejecución asíncrona](docs/interaction-and-execution.md).
- [Desarrollo, diagnóstico, pruebas y releases](docs/development-and-release.md).
