<div align="center">

# ⚔️ DraftSim

**Simulador de draft y partidas de League of Legends con IA estratégica, motor de partidas basado en eventos, brackets de torneos y modo franquicia de temporada completa.**

Haz pick/ban contra la IA (o mira IA vs IA), define el **plan de juego** de tu equipo en la War Room y juega la partida como una línea temporal en vivo — KDA, oro, curva de probabilidad de victoria — terminando con una carta MVP, desglose de daño compartido y recap por partida / por torneo. Juega una serie suelta, arma un torneo de 32 equipos o simula un año competitivo entero en seis regiones con First Stand, MSI, Worlds y líneas temporales de franquicia opcionales que pueden abarcar décadas.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-443E38)
![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)

*Proyecto hobby / portfolio. Fan-made no oficial — sin afiliación con Riot Games.*

</div>

🇬🇧 **[English version](README.md)**

---

## ¿Qué es DraftSim?

DraftSim es un simulador **desktop-first** (Tauri) y **compatible con web** (export estático de Next.js) para el competitivo de League of Legends. En esencia son tres piezas conectadas:

1. **Motor de draft** — orden de pick/ban de torneo, series fearless, drafter IA con ~30 señales ponderadas, rosters y tier lists de meta.
2. **Simulador de partidas** — partidas basadas en eventos (~30 tipos), estrategias de War Room, curvas de probabilidad de victoria y recaps completos post-partida.
3. **Capa de temporada y franquicia** — seis ligas regionales (LCK, LPL, LEC, LCS, CBLOL, LCP), tres splits por año, eventos internacionales (First Stand, MSI, Worlds, Global Cup), ventanas de transferencias, gestión de roster en offseason y **Realities** multi-año con seguimiento de carrera.

**Desktop vs web:** La experiencia recomendada es la **app de escritorio Tauri** (`npm run desktop:dev` / `desktop:build`). Usa diálogos nativos de archivos, un tope mayor de historial de torneos, persistencia completa de replays y almacenamiento **SQLite** en AppData. El build web (`npm run dev`) ejecuta la misma UI desde `localStorage` con códigos de import/export por portapapeles — ideal para sesiones rápidas, pero las partidas de franquicia largas van mejor en desktop.

---

## Contenido

- [¿Qué es DraftSim?](#qué-es-draftsim)
- [De un vistazo](#-de-un-vistazo)
- [Galería](#-galería)
- [Inicio rápido](#-inicio-rápido)
- [Modos y pantallas principales](#-modos-y-pantallas-principales)
- [Sistemas de juego centrales](#-sistemas-de-juego-centrales) · [referencia completa](docs/systems.es.md)
- [Funcionalidades](#-funcionalidades)
- [Stack técnico e infraestructura](#-stack-técnico-e-infraestructura)
- [Arquitectura](#-arquitectura)
- [Scripts](#-scripts)
- [Fuentes de datos](#-fuentes-de-datos)
- [Archivos de datos, exports y backup](#-archivos-de-datos-exports-y-backup)
- [Ajustar la IA](#-ajustar-la-ia)
- [Desktop (Tauri)](#desktop-tauri)
- [Desarrollo](#-desarrollo)
- [Documentación de diseño](#-documentación-de-diseño)
- [Atribución y licencias](#-atribución-y-licencias)

---

## ✨ De un vistazo

No es solo una herramienta de draft — el draft alimenta un **plan de juego**, y el plan alimenta una partida real. El simulador ejecuta un juego basado en eventos (kills, ganks, drakes, baron, soul, elder, ace, shutdowns, power-spikes…), y la lógica de picks de la IA considera identity targeting, lane prio, lookahead, anticipación del rival, awareness del estado de la serie, **scouting del roster enemigo** y draft consciente del lado.

| | |
|---|---|
| 🧠 **IA estratégica** | Puntúa cada pick/ban legal con ~30 señales ponderadas, muestrea del top-N y juega distinto según **dificultad**, **lado**, **marcador de serie**, **adaptación a partidas previas** y el **roster rival**. |
| 🗺️ **Estrategias de equipo** | Una **War Room** post-draft con 16 palancas de plan de juego (jungla, weakside, splitpush, objetivos, tempo, riesgo…) que moldean la partida. Elegir un plan que encaje con tu draft da un tailwind de win-prob; la IA elige un plan **variado y consciente del contexto** que se adapta al draft/roster enemigo y al marcador de la serie. |
| 🎲 **Sim de partida real** | ~30 tipos de eventos con oro de lane impulsado por kills, KDA con forma por rol, resolución de combate por builds de items, ventanas de power-spike, payoffs de scaling en late y mecánicas de comeback, más curva de probabilidad de victoria. |
| 🏆 **Torneos** | Seis formatos (single/double-elim, round-robin, Swiss, Swiss+playoffs, groups+playoffs), hasta 32 equipos, guardar/cargar, historial y recap completo post-torneo. |
| 🌍 **Modo temporada** | Año competitivo completo: 6 ligas × 3 splits, First Stand / MSI / Worlds, meta cambiante, ventanas de transferencias, All-Pro, power rankings y campeón mundial. |
| 📜 **Franquicia / Realities** | Líneas temporales continuas donde equipos y jugadores persisten entre años — transferencias en offseason, envejecimiento, academy, free agency, Hall of Seasons, sim masivo y exports portables. |
| 📚 **Datos curados a mano** | 172 campeones · 300+ sinergias · 250+ counters · 11 perfiles de comp-identity · meta tiers por lane — todo etiquetado de parches 2024–2026. |
| 👥 **Rosters de jugadores** | Rosters opcionales de 5 jugadores con skill tiers y champion pools que sesgan tanto el draft de la IA como el resultado de la partida. |

---

## 📸 Galería

| Tablero de draft | Simulación de partida |
|---|---|
| ![Vista de draft](docs/screenshots/draft.png) | ![Simulación de partida](docs/screenshots/sim.png) |
| Asignación de roles en vivo, badges de sinergia, hover + rationale de la IA y pools de campeones por equipo. | Reproducción basada en eventos con curva de win-prob, oro/KDA, comp identities y controles de playback. |

| Comparación de equipos | Editor de roster | Recap de serie |
|---|---|---|
| ![Comparación de equipos](docs/screenshots/comparison.png) | ![Editor de roster](docs/screenshots/roster-editor.png) | ![Recap de serie](docs/screenshots/recap.png) |
| Scouting tipo tug-of-war + pull por métrica. | Tiers de jugador y champion pools; la estrella se deriva en vivo. | MVP por partida + narrativa del mayor swing. |

---

## 🚀 Inicio rápido

> Requisitos: **Node 22.12+** y **npm 10+**.

```bash
npm install
npm run dev        # http://localhost:3000  (Turbopack)
```

Build estático de producción (usado por el empaquetado Tauri):

```bash
npm run build      # emite a out/
```

**Desktop (recomendado para franquicia):**

```bash
npm run desktop:dev    # servidor dev Next.js + ventana Tauri
npm run desktop:build  # export estático + instalador NSIS/MSI
```

Ver [Desktop (Tauri)](#desktop-tauri) para requisitos de Rust y rutas del instalador.

<details>
<summary><b>Advertencia de build conocida (inofensiva)</b></summary>

```
Failed to set Next.js data cache for https://cdn.merakianalytics.com/...
items over 2MB can not be cached (~17 MB)
```

El `champions.json` de Meraki supera el límite de 2 MB del data-cache de Next. Cosmético — `/` se prerenderiza estáticamente con ISR diario, así que Meraki se obtiene como máximo una vez por día por instancia de servidor; simplemente no se guarda en la caché cross-request.
</details>

---

## 🎮 Modos y pantallas principales

El menú principal enruta a modos de juego distintos. Cada modo reutiliza el mismo flujo draft → War Room → partida → recap para series individuales.

| Modo | Entrada | Qué puedes hacer |
|---|---|---|
| **Single Series** | Menú → Single Series | Bo1/Bo3/Bo5 rápido entre dos equipos. PvP, PvAI o IA vs IA. Fearless, side-swap, timer, editor de roster. |
| **Tournament** | Menú → Tournament | Crear un bracket (hasta 32 equipos, seis formatos). Simular partidas restantes, overrides por partida, guardar/cargar (códigos `TOUR1:`), recap post-torneo y visor de replay. |
| **Season** | Menú → Season Mode | Un año competitivo en seis ligas. Seguir un equipo, jugar o simular splits e internacionales, ventanas de transferencias, All-Pro, power rankings, season story. Guardar/cargar slots de temporada. |
| **Realities** | Menú → Realities | Hub de franquicia: crear, reanudar, cambiar, borrar, importar/exportar líneas temporales. Cada reality es un save multi-año independiente con su propio Hall of Seasons. |
| **Hall of Seasons** | Menú → Hall (o clic en cualquier carta de jugador/equipo/coach) | Récords históricos, tablas de carrera, rivalidades, dynasty tiers, búsqueda, export XLSX. Acotado a la reality activa en modo franquicia, o global para temporadas sueltas. |
| **Meta Library** | Menú → Meta Tier Lists | Crear, editar, randomizar, importar/exportar (`META1:`) tier lists. Aplicar presets antes de serie/torneo/temporada. |
| **Pairings Library** | Menú → Synergies & Counters | Pares de sinergia y relaciones de counter personalizadas usadas por IA y simulador. |

**Season dashboard** (en temporada): timeline de fases, standings, match cards, panel de ventana de transferencias, free agents, team browser, franchise panel, control de bulk-years, feed en vivo de resultados de sim, vista de offseason (demandas de agency, compras FA/academy, contratación de coach).

**Desktop vs web — matices:**

| Funcionalidad | Desktop (Tauri) | Web |
|---|---|---|
| Persistencia | SQLite `draftsim.db` en AppData | `localStorage` (~5 MB de cuota) |
| Guardar/cargar torneo | Diálogos nativos `.draftsim.json` | Códigos `TOUR1:` en portapapeles |
| Export de reality | Diálogos nativos `.draftsim-reality.json` | File picker o códigos `REAL1:` |
| Export de meta | Diálogos nativos de archivos | Códigos `META1:` en portapapeles |
| Tope de historial de torneos | 200 entradas, replay completo | 5 entradas, recaps slim al persistir |
| Sim masivo de franquicia | Flush completo al cerrar ventana | Misma lógica, menos margen de almacenamiento |

---

## 🏗 Sistemas de juego centrales

Mapa técnico pero legible de cómo DraftSim modela el LoL competitivo. Para detalle exhaustivo — tablas de scoring, fórmulas de transferencias, cableado del calendario, límites de abstracción — ver **[`docs/systems.es.md`](docs/systems.es.md)** (también en inglés: [`docs/systems.md`](docs/systems.md)).

### Filosofía de diseño y objetivos de realismo

DraftSim es un **sandbox de simulación**: hacer que draft, macro, fuerza de roster y estructura del calendario importen como en el LoL pro, sin clonar un cliente específico de parche.

| Principio | En la práctica |
|---|---|
| Realismo opt-in | Flags de temporada (`playerTransfers`, `formDrift`, …) **off** por defecto — comportamiento clásico y saves intactos. |
| Palancas neutrales | Sin plan de War Room, sin roll de chemistry, meta desactivada → bit-idéntico a builds pre-feature. |
| Un solo choke point de sim | Estrellas de roster, skill por lane, forma, clutch, motivación del coach y presets de varianza se fusionan en `starRatingBias()` antes de que corra la timeline de eventos. |
| Nombres reales, reglas abstractas | Equipos/jugadores pro de APIs + snapshots empaquetados; sin salary caps, visas ni horarios de scrims. |

**Refleja esports real:** seis ligas regionales, internacionales alimentados por splits (First Stand / MSI / Worlds), play-ins, Swiss y groups, series fearless, ventanas de transferencias, pipelines academy → FA, career IDs en un Hall, meta que deriva como parches.

**Abstraído:** mecánicas click a click, actives exactos de items, economía de orgs y latencia geográfica.

### Drafter heurístico de IA

La IA incluida (`lib/draftAI/`) puntúa cada pick/ban legal con **~30 componentes etiquetados** y muestrea del top-N (temperatura + dificultad controlan exploración).

| Capa | Qué hace |
|---|---|
| **Scoring** | Meta tier, sinergias, balance de daño, lane counters (250+ hard matchups), completado de comp identity, adaptación cross-game, comfort/denial de roster. |
| **Anticipación** | Lookahead 1-ply (Normal) / 2-ply (Hard); predice picks enemigos para target de bans. |
| **Contexto de serie** | Partidas de eliminación/closeout, prior picks fearless, identidades previas del rival, W/L de campeones en torneo en vivo. |
| **Reglas de lado** | Blue favorece flex + meta S+; Red busca counter edge; R5 rechaza hard lane counters. |
| **Personalidad** | Vectores de peso por equipo (`meta-slave`, `comfort-first`, `counter-picker`, `cheese`, …) + rating de coach → dificultad. |

La UI de rationale muestra el desglose de score del campeón elegido y top-3 alternativas. Knobs de tuning: `lib/draftAI/data.ts`, `scoring.ts`; validar con `npm run calibrate`.

> **Política neuronal (opcional):** la rama `feat/neural-draft-policy` añade pesos aprendidos (`public/models/draft-policy.json`) + Python `training/` — no está en `main` por defecto; el drafter heurístico de arriba es la experiencia incluida.

### Simulador de partidas

`lib/matchSimulator.ts` + `lib/sim/timeline/` — **~30 tipos de eventos** (ganks, objetivos, teamfights, power spikes, ace, elder, backdoor…).

- **Oro de lane impulsado por kills** y KDA con forma por rol; sparkline de win-probability desde rolls de eventos.
- **Combate** desde daño/EHP de builds de items, arquetipos, meta tier; **ventanas de power-spike** desde `championBuilds.ts`.
- **War Room** (16 palancas, `lib/sim/strategies.ts`) — encaje de plan ±~10pp tailwind; sesga qué eventos ocurren y la duración del juego.
- **Multiplicadores de identity** (`lib/sim/identities.ts`) — Wombo vs sin disengage, Dive vs carry desprotegido, etc.
- **Stack de bias** — estrella de equipo, micro de roster por lane, encaje de pool, chemistry de jugadores, estrategias → sin doble conteo.

### Toma de decisiones: franquicia, transferencias, agency

La lógica de temporada (`lib/season/`) envuelve el motor de torneos — cada split e internacional **es** un `TournamentState`.

| Sistema | Módulo | Resumen |
|---|---|---|
| **Calendario** | `engine.ts` | Winter → First Stand → Spring → MSI → Summer → Worlds (+ Global Cup cuatrienal). Seis ligas × 10 equipos. |
| **Transferencias** | `transfers.ts` | Ventanas auto tras First Stand / MSI + offseason pesado. Valor = tier + notas de split + **encaje de pool bajo meta actual**. Cross-region limitado para S/S+. |
| **Agency** | `playerAgency.ts` | Jugadores A+ exigen mejores orgs / call-ups; el usuario puede override; la IA respeta cuando el gap es grande. |
| **FA / academy** | `faMarket.ts`, `playerLifecycle.ts` | Starter → academy (2–4a) → FA (4a) → retirado; fills de vacantes, caps de graduados, pases de mercado IA. |
| **Año de franquicia** | `franchise.ts` | Reality = equipos + carreras persistentes; envejecimiento en offseason, drift de pool/chemistry, movimientos de coach, sim masivo de N años. |
| **Flags de realismo** | `types.ts` `SeasonConfig` | Form drift, player dev, meta adaptability, clutch, region tides, patch/live meta, variance preset — todo opt-in. |

Equipo controlado por usuario: ventana de transferencias interactiva + shop de offseason (firma FA, recall/release academy, demandas de agency, contratación de coach).

### Estructura competitiva de LoL en la app

| Real | DraftSim |
|---|---|
| LCK / LPL / LEC / LCS / CBLOL / LCP | `LeagueId` — 10 equipos, formato de split configurable (RR, groups, Swiss + playoffs). |
| First Stand (líderes de winter) | Top 2 por liga → evento de 12 equipos; seeds #1 bye, #2s play-in. |
| MSI (líderes de spring) | Top 3 por liga; region #1 pre-calificada al bracket DE; play-in trim opcional. |
| Worlds (líderes de summer) | Top 4 por liga; play-in de 6 equipos → groups (4×5) o main Swiss. |
| Global Cup | Años de franquicia cuatrienales; top 32 ranking global. |
| Fearless draft | Serie + config de temporada. |
| Swiss + Buchholz | Torneo + stages de MSI/Worlds. |

Los conteos de clasificación y feeds de split están fijados en `lib/season/types.ts` (`QUALIFIER_COUNTS`, `QUALIFYING_SPLIT`).

### Realismo competitivo — datos y Hall

- **Equipos/logos reales** — LoL Esports API + `realTeamNames.json`; `npm run fetch-team-logos`.
- **Handles reales de jugadores** — fetch de Leaguepedia (`fetch-player-names`, ~68%+ cobertura, re-ejecutar para llenar gaps); pool de rookies por lane (`fetch-rookie-names`).
- **`Player.id` estable** — las carreras sobreviven transferencias y décadas; Hall agrega kills/MVPs/títulos por id.
- **Placements** — etiquetas de finish de split + internacional (campeón, finalista, play-ins-exit, …) desde résumés archivados.
- **Hall of Seasons** — dynasty tiers, rivalidades, fuerza regional, matrices H2H, export XLSX.
- **Persistencia** — desktop SQLite normaliza realities + historial Hall por fila ([`docs/desktop-sqlite-storage.md`](docs/desktop-sqlite-storage.md)); franquicias largas ver [`docs/performance-franchise-saves.md`](docs/performance-franchise-saves.md).

### Sistemas de meta

Baseline curado a mano: **172** campeones, **340+** sinergias, **250+** counters, **11** perfiles de identity (`lib/championMeta.ts`).

- **Editor de meta** + códigos `META1:`; toggle maestro desactiva influencia de tier.
- **Randomizer** (`lib/metaRandomizer.ts`) — distribuciones realistas de tier por rol; generación de pares sinergia/counter.
- **Drift de temporada** — `patchShift` entre fases, `liveMeta` dentro de eventos; `initialMeta` vs `currentMeta` en archivos.
- **Player chemistry** (`lib/chemistry.ts`) — valores almacenados de pares de compañeros, separado de sinergias de campeón; deriva en modo franquicia.

---

## 🧩 Funcionalidades

### Single series

- Orden de draft de torneo estándar de LoL — 20 acciones (6 bans → 6 picks → 4 bans → 4 picks).
- **Bo1 / Bo3 / Bo5** con umbrales de victoria correctos y scoring a prueba de side-swap.
- **Fearless Draft** — los picks se bloquean entre partidas; los bans se resetean.
- **Auto side-swap** — el perdedor de la partida anterior juega blue (convención pro; override manual disponible).
- **Timer de 30s por acción** (activable) — bans se saltan al timeout, picks se rellenan al azar.
- **Tres modos:** P-vs-P · P-vs-AI · AI-vs-AI.
- **Tres dificultades de IA:** Easy / Normal / Hard — distinta temperatura de muestreo, profundidad de lookahead y set de features. **Override por lado** en IA vs IA para partidas con handicap.

### Drafter de IA

La IA puntúa cada candidato legal con ~30 señales ponderadas y muestrea del top-N.

<details>
<summary><b>Señales estratégicas</b></summary>

- **Identity targeting** — se fija en una forma de comp (Wombo, Pick, Dive, Protect, Splitpush…) cuando hay 2+ picks comprometidos y premia completarla.
- **Lookahead** — 1-ply en Normal, 2-ply (predice respuesta enemiga *y* nuestro follow-up) en Hard.
- **Anticipación** — predice qué campeones es probable que el enemigo elija, usado para target de bans.
- **Awareness de lane-matchup** — 250+ relaciones de counter-pick entran en lane fit; la magnitud escala con la ventaja de info de last-pick.
- **Draft consciente del lado** — first-picks de Blue favorecen flex / multi-lane y meta tier S+ (resistente a counter); Red pondera más el edge de matchup y R5 rechaza hard lane counter.
- **Awareness del estado de serie** — cuando vas perdiendo, prioriza picks de meta tier; partidas de eliminación / closeout eliminan la penalización "guardar para después" de S+.
- **Adaptación cross-game** — lee identidades de partidas previas del rival, reserva bans en arquetipos habilitadores, elige arquetipos counter contra ellos.
- **Scouting de roster enemigo** *(cuando hay rosters)* — **target-bans de comfort picks enemigos ponderados por skill tier**, **niega mains enemigos** en sus picks, **respeta el skill del laner enemigo** en el término de matchup, y no desperdicia ban en un campeón donde el enemigo es débil.
- **Pocket picks** — pequeño presupuesto de randomización para que la IA sorprenda a veces.
- **UI de rationale** — cada decisión muestra un desglose de score etiquetado en tiempo real, más lista de top-3 alternativas.

</details>

### Estrategias (War Room)

Tras cerrar el draft y antes de simular la partida, cada equipo compromete un **plan de juego**. Un plan son **16 palancas en tres grupos**, y cambia el juego simulado de verdad.

<details>
<summary><b>Las 16 palancas</b></summary>

- **Team Plan** — Game Plan (early-snowball / teamfight / scaling) · Tempo (aggressive / standard / passive) · Risk (safe / standard / high-roll) · Macro (group / splitpush 1-3-1 / pick / siege) · Teamfight Style (front-to-back / flank / poke / balanced) · Objectives (dragon / herald / atakhan / baron / balanced) · Vision (proactive / standard / reactive)
- **Map & Resources** — Jungle (invade / counter-jungle / gank / balanced / farm) · Weakside Lane (top / bottom / none) · Win Condition (funnel into a carry lane) · **Pick Target** (cazar el carry más fuerte enemigo) · **Lane Swap** (esquivar un matchup perdedor de top)
- **Lane Assignments** — Top (group / splitpush / rotate) · Mid (hold / roam / push-prio) · Bot (trade / dive / scale) · Support (lane / roam / protect)

</details>

<details>
<summary><b>Cómo afecta al sim</b></summary>

Dos canales:

- **Encaje de comp → probabilidad de victoria.** Un plan que encaja con tu draft da un pequeño tailwind; uno desajustado se vuelve en contra (scaling con comp all-early, splitpush sin splitpusher, funnel a un tank…). Buen vs mal plan vale ~±10pp — significativo, pero por debajo de roster/draft. Un medidor **Plan Fit** en vivo (Strong / Balanced / Poor) se actualiza al togglear.
- **Flujo de timeline.** Los planes remodelan *qué* eventos ocurren y *quién tiende a ganarlos* — frecuencia de ganks y lado, roams mid, tilt de dragon/baron/atakhan, backdoors splitpush, **probabilidades de robo de objetivo + varianza de pelea de cierre** (dial Risk), y duración (scaling/passive alarga hacia el cap 24–50 min; aggressive acorta). Pick Target niega oro al lane cazado; Lane Swap suaviza un top perdedor.

Neutral en cada palanca por defecto: un juego sin plan simula exactamente igual que antes.

</details>

<details>
<summary><b>Planes de IA variados y conscientes del contexto</b></summary>

Los lados IA no eligen el mismo plan cada partida. `chooseAIStrategy` pondera cada palanca por encaje de comp **y** contexto de partida, luego *muestrea* — dos equipos difieren y el mismo equipo se adapta en una serie:

- **Risk consciente de serie** — frente a eliminación → `high-roll` (abrazar varianza); en match point → `safe` (cerrarlo).
- **Scouting enemigo** — Pick Target caza al jugador de tier más alto / carry más fuerte; Lane Swap cuando tu toplaner tiene hard counter o está outmatched en tier.
- Los planes se muestran **solo lectura** para lados IA (para contra-planear) y **editables** para humanos con la sugerencia de la IA marcada. Torneos usan el mismo selector consciente del contexto para partidas auto-simuladas.

</details>

### Simulador de partidas

<details>
<summary><b>Timeline de eventos y modelo de combate</b></summary>

- **Timeline basada en eventos** de ~30 tipos (level-1 invade, scuttle, gank, counter-gank, plates, drake, herald, grubs, atakhan, soul, baron, elder, teamfight, skirmish, pick, vision, outplay, objective-trade, wave-crash, power-spike, ace, shutdown, backdoor, nexus…).
- **KDA por campeón** con atribución con forma por rol (carries anotan kills, supports assists, ADCs mueren más).
- **Oro de lane impulsado por kills** — el `kdaDelta` de cada evento fluye a oro por lane vía `kdaToLaneGold` (300g/kill, 100g/assist), así un lane 8/0 va visiblemente por delante.
- **Ventanas de power-spike** — el minuto de spike de item clave de cada carry (build paths de `championBuilds.ts`) abre ventana "online"; el equipo con más carries online inclina mid-game (la pelea real "en tu timing de item"). Hasta dos beats de spike por lado en comps multi-carry.
- **Payoff de scaling en late** — la pelea decisiva tiene término ramped por duración; una comp scaling que arrastra pasado ~30 min supera de verdad a una early (partidas cortas favorecen early; largas al scaler).
- **Flujo impulsado por estrategia** — planes de War Room de ambos equipos sesgan frecuencia de eventos, tilt de objetivos, probabilidades de robo, varianza de pelea de cierre y duración (ver [Estrategias](#estrategias-war-room)).
- **Resolución de combate** usa daño / EHP por campeón estimados de builds, arquetipo y meta tier — el resultado de la pelea de cierre emerge del estado, no de un ganador predeterminado.
- **Multiplicadores de identity** — Wombo amplificado sin disengage enemigo, Dive vs carries desprotegidos, Tank Stack muro a comps mono-daño, etc.
- **Mecánicas de comeback** — momentum, shutdowns, pivot baron, efectos atakhan (Voracious +20% kill gold, Ruinous revive one-shot).

</details>

### Post-partida

- **Sparkline en vivo de win-probability** (Recharts) — area chart con gradiente por lado, ReferenceDots en eventos definitorios, **eje Y consciente del lado** (perspectiva blue arriba, red abajo — nunca porcentajes negativos).
- **Franja Lane Gold** con KDA por campeón y highlights flash de eventos (kill = glow de lado, death = rojo, objetivo = oro).
- **Carta MVP** — **Player of the Game siempre va al equipo ganador** (convención broadcast); dentro de ganadores se ordena por `K + 0.7·A − 0.5·D + laneGoldDiff/1000`.
- **Barras de damage-share** por campeón (daño sintético de KDA × perfil de daño de arquetipo).
- **Panel Team Comparison** — vista tug-of-war única: cada métrica ancla al centro y tira hacia el equipo más fuerte, con **Scouting Report** por lado (playstyle / win condition / debilidad) y veredicto **Identity Matchup** (ej. "Pick Comp hard-counters Protect the Carry").
- **Recap narrativo de fin de serie** — storyline de 1–3 líneas por partida desde MVP persistido + mayor swing de win-prob.

### Modo torneo

<details>
<summary><b>Formatos, controles y recap</b></summary>

- **Seis formatos** al crear:
  - **Single Elimination** (2–8 equipos, soporte bye, re-seeding opcional entre rondas)
  - **Double Elimination** (4 / 8 / 16 / 32 equipos, bracket-reset obligatorio O toggle "True GF")
  - **Round Robin** (3–10 equipos)
  - **Swiss** (4–16 equipos, ceil(log₂N) rondas, emparejamiento dinámico evitando rematches, tiebreakers Buchholz + Median Buchholz)
  - **Swiss + Playoffs** (stage Swiss → top-N seeded a single-elim)
  - **Groups + Playoffs** (1–8 grupos de 3–4, snake-seed a playoff single-elim)
- **Hasta 32 equipos** con nombre, seed, icono (set Tabler 64 + custom), color (paleta 64 + custom), **rating 1–5★** (sesga win-prob por partida) y **override de dificultad IA por equipo**.
- **Controles Sim cross-formato** — `Sim All Remaining`, `Sim Round` / `Sim Day` / `Sim Stage`, `Sim This Match`. Todo corre IA vs IA tras overlay de carga diferido para no congelar la UI.
- **Overrides por partida** — cambiar formato/modo/fearless/dificultad IA antes de lanzar.
- **IA consciente de torneo** — capa de "meta de torneo en vivo" desde W/L observados de campeones (Bayesian-shrink para que outliers de 1 partida no dominen).
- **Guardar / Cargar** torneo activo completo (draft en curso, snapshot de meta, historial) como código `TOUR1:` deflate-base64 — pégalo para retomar exactamente donde lo dejaste.
- **Historial** — últimos 5 torneos completados archivados localmente con recaps slim (200 en desktop).
- **Recap post-torneo** — tiles resumen, campeón más disputado, mejor WR (≥3 partidas), tablas presencia + win-rate, movers de meta-shift, lookup de campeón con atribución por equipo, pools por equipo, visor de replay por partida.

</details>

### Meta tier list

- **Editor de tier custom** con drag-and-drop por rol.
- **Meta tiers por lane** `S+ S A B C D` como badges en champ select (el badge refleja la posición que filtras; en "All" muestra el rol *mejor* del campeón).
- **Fallback off-position** — cuando un campeón se juega en lane sin tier explícito, el tier efectivo se deriva de los tiers que *sí* tiene (mediana − 1 notch). Forzado a lane que no puede jugar, piso en **D**. Simulador y badges usan la misma regla.
- **Export / Import** como códigos `META1:...` (deflate-compressed, URL-safe; también acepta JSON crudo).
- **Randomize meta** — tier list randomizada plausible con forma real por rol.
- **Toggle maestro** para desactivar el sistema meta por completo (IA / sim tratan todos los campeones iguales en sus lanes jugables).

### Rosters de jugadores

Rosters opcionales por equipo de **5 jugadores** (uno por lane), cada uno con **tier (S–D)** fijo y **champion pools** (≤3 bien jugados, ≤3 mal jugados). Randomizables (con animación slot-machine) o editados a mano, y **persistentes** durante la serie y — en torneos — en cada partida.

- **Rating de equipo derivado del roster** — la estrella 1–5★ es la media de los cinco tiers; un equipo 5★ nunca puede ser cinco D-tier. Pon una estrella para generar roster acorde, o edita el roster y la estrella sigue.
- **Visible en vivo durante el draft** — cada panel lista good/bad pools (y agregado de equipo), y los pools **reaccionan al tablero**: campeones baneados, picked o fearless-locked se atenúan para ver qué sigue drafteable.
- **El simulador lo factoriza tres vías, sin doble conteo** — bias **macro** de equipo desde la estrella derivada; bias **micro por lane** suma cero (toplaner fuerte over-performa en top *específicamente*); **encaje de champion pool** (laner en champ liked over-performa; en disliked under-performa).
- **La IA draftea para ambos rosters** — comfort propio sesga picks, y scoutea el **roster rival** para target-ban mains y negar signatures (ponderado por tier) — siempre *junto a*, nunca reemplazando, meta tier / matchup / sinergia.
- **Optimización de rol flex-pick** — antes de simular, equipos IA reasignan sus cinco campeones a lanes que maximizan meta tier + comfort de jugador.

> Validado end-to-end (sims reales): rosters **5★ vs 1★ ganan ~83%**, draft all-comfort gana **~57%** vs neutral a rating igual, rosters iguales ~50%. Doc de diseño: [`docs/players-feature.md`](docs/players-feature.md).

### Persistencia

<details>
<summary><b>Detalles de almacenamiento</b></summary>

**Web (`localStorage`):**

- Serie activa + torneo + temporada + realities sobreviven reload vía Zustand `persist`.
- **Wrapper quota-safe** — al llegar al techo ~5 MB elimina `tournamentHistory` y reintenta; segundo fallo borra la key.
- **Archivo slim al persistir** — payloads de replay completos se eliminan antes del write a localStorage pero se mantienen en memoria en la sesión activa. Un `Save` de torneo (código TOUR1:) preserva el payload completo.
- **Writes lazy debounced** (500 ms) coalescen ráfagas de bulk-sim.

**Desktop (SQLite — actual):**

- Estado del juego en `%APPDATA%\app.draftsim.desktop\draftsim.db` (ver [Almacenamiento SQLite desktop](docs/desktop-sqlite-storage.md)).
- Datos de franquicia **normalizados**: una fila por reality, filas separadas por entrada Hall-of-Seasons — 69+ años archivados ya no reescriben un blob JSON gigante.
- **Carga lazy de historial** — solo el historial Hall de la reality activa se hidrata al inicio; cambiar realities trae el resto async.
- **Migración automática** desde `draftsim-store.json` legacy al primer launch (renombrado a `.bak`, no destructivo).
- Config de meta espejada en tabla `meta_config` (reemplaza `draftsim-meta-config.json`).

**Ambos:**

- Campeones no se persisten — re-fetch de CommunityDragon cada carga.
- Meta actual se snapshot en cada torneo/temporada al crear.

Notas de rendimiento para franquicias largas: [`docs/performance-franchise-saves.md`](docs/performance-franchise-saves.md).

</details>

### Sonido

- SFX reales de champ-select de Riot (lock-in, ban, click, timer tick) desde CommunityDragon.
- **Blips de eventos sintetizados** en playback — tres severidades vía WebAudio (eventos mayores: acorde A-major escalonado; mid tono único más alto; minor blip suave).
- Toggle mute único + slider de volumen. Quirks Safari/iOS `.ogg` y AudioContext retrasado manejados con gracia.

### UX y accesibilidad

- Totalmente responsive (mobile / desktop).
- Lock-ins animados con GSAP, transiciones de fase draft, reveal de serie completa y flourish de randomize de roster.
- Lenguaje visual Rift: esquinas doradas ornamentadas, pips de score diamante, glows por lado, backdrop rune-grid. Todos los iconos de eventos son **Tabler Icons**.
- A11y: banner de fase `role="status"`, `role="dialog"` + focus trap en modal de confirmación, `aria-label` en controles interactivos.

---

## 🛠 Stack técnico e infraestructura

| Capa | Elección |
|---|---|
| Framework | **Next.js 16** (App Router + Turbopack, `output: "export"` para Tauri) |
| UI | **React 19** + **TypeScript 5.7** (strict) |
| Estilos | **Tailwind CSS 3.4** |
| Estado | **Zustand 5** con middleware `persist` (v7 en desktop) |
| Desktop | **Tauri 2** + `@tauri-apps/plugin-sql` (SQLite), `plugin-fs`, `plugin-dialog` |
| Gráficos | **Recharts 3** (curva win-probability) |
| Iconos | **Tabler Icons React** |
| Animación | **GSAP 3.12** |
| Export | **ExcelJS** (export XLSX Hall) |
| Tooling | **tsx** (calibración) · **Vitest** (tests unitarios) · **esbuild** (worker bulk-sim) |

**Pipeline de build:**

- `npm run dev` — servidor dev Turbopack + `bulkSim.worker.js` empaquetado.
- `npm run build` — export estático a `out/` (campeones fetch en build time).
- `npm run desktop:build` — `tauri build` empaqueta `out/` en NSIS/MSI/portable `.exe`.

**Arquitectura de persistencia:**

| Plataforma | Backend | Ubicación |
|---|---|---|
| Web | `localStorage` vía JSON lazy debounced | Perfil del navegador |
| Desktop | SQLite (`draftsim.db`) | `%APPDATA%\app.draftsim.desktop\` |

Zustand persist versión **7** en desktop marca backend SQLite. Shape de estado compatible con v6; archivos JSON migran automáticamente al primer launch.

---

## 🏗 Arquitectura

Todo el core `lib/` es **libre de framework y testeable en unit** — scoring IA, simulador, motor de draft, series, temporada y lógica de torneo sin deps React/DOM.

<details>
<summary><b>Layout del repositorio</b></summary>

```
draftsim/
├── app/                          Next.js App Router (export estático)
├── components/                   UI React (DraftApp, SeasonDashboard, RealitiesHub, …)
├── lib/
│   ├── draftAI/                  Drafter heurístico IA + scoring
│   ├── sim/                      Eventos sim partidas, estrategias, identities
│   ├── season/                   Motor temporada, franquicia, transferencias, historial, bulk years
│   ├── tournament.ts             Formatos bracket, avance, códigos TOUR1:
│   ├── matchSimulator.ts         Timeline eventos + combate + recaps
│   ├── desktopStorage.ts         Adaptador archivos Tauri + lazy storage web
│   ├── desktopSqlite.ts          Schema SQLite, migración, read/write split
│   └── recapCompression.ts       Encoding compacto torneo/recap para saves
├── store/draftStore.ts           Store Zustand único (serie, torneo, temporada, realities)
├── public/workers/bulkSim.worker.js   Bulk sim franquicia off-main-thread
├── scripts/                      Fetchers de datos, calibración, bundler worker
├── src-tauri/                    Shell Rust Tauri v2
├── training/                     Training PyTorch draft-policy opcional (rama separada)
└── docs/                         Docs de diseño (ver abajo)
```

</details>

<details>
<summary><b>Flujo de datos</b></summary>

1. `app/page.tsx` (server component) fetch campeones + lanes de CommunityDragon + Meraki en build time. Campeones pending-release ausentes en CDragon se inyectan desde tabla fallback local.
2. `<DraftApp>` puebla el store Zustand y enruta por modo (single series, torneo, temporada, hub realities, Hall).
3. Todas las transiciones de estado pasan por el store; lógica pura vive en `lib/`.
4. Decisiones IA: `chooseAIActionWithRationale(...)` → muestrea de top-N de `scorePick` / `scoreBan`.
5. Planes de juego: `confirmStrategies(...)` guarda `TeamStrategy` de cada lado; fit + mods de timeline alimentan el sim.
6. Sim partida: `simulateMatch(game, champions)` ejecuta el generador de timeline de eventos.
7. Temporada/franquicia: `lib/season/engine.ts` conduce el calendario anual; `lib/season/franchise.ts` avanza años; historial archivado al Hall.

</details>

<details>
<summary><b>Decisiones de diseño clave</b></summary>

- **Core de funciones puras.** Todo en `lib/` libre de framework y testeable.
- **Store Zustand único con persist.** Serie + torneo + temporada + realities hidratan desde storage; campeones reset al reload.
- **Score por nombre de equipo, no por lado.** Side swaps no parten victorias de un equipo.
- **MVP sigue al ganador.** Player of the Game solo del lado ganador.
- **Estrategias neutrales por defecto.** Sin plan = bit-idéntico a builds pre-estrategia.
- **Normalización SQLite desktop.** Historial Hall franquicia como inserts por fila — fix principal para lag de save 69+ años (ver doc de rendimiento).
- **Trabajo de sim diferido para feedback UI.** Acciones `Sim *` pintan overlay de carga, luego difieren loops pesados vía `setTimeout(0)`.

</details>

---

## 📜 Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor dev Turbopack en `http://localhost:3000` |
| `npm run build` | Export estático de producción a `out/` |
| `npm start` | Sirve build de producción (solo web) |
| `npm run lint` | ESLint CLI (Next.js + React Hooks) |
| `npm test` | Suite unitaria Vitest (`lib/**/*.test.ts`) |
| `npm run test:watch` | Vitest en modo watch |
| `npm run desktop:dev` | Ventana dev Tauri + hot reload Next.js |
| `npm run desktop:build` | Export estático + bundle instalador Tauri |
| `npm run refresh-data` | Pull últimos datos ability + item Meraki a `lib/data/*.json` |
| `npm run fetch-player-names` | Refresca handles pro reales de Leaguepedia (~68%+ cobertura, re-ejecutar para llenar gaps) |
| `npm run fetch-team-logos` | Descarga assets de logos de equipos |
| `npm run fetch-rookie-names` | Fetch pool de nombres rookie |
| `npm run fetch-coaches` | Fetch datos de nombres de coaches |
| `npm run calibrate` | Corre N drafts × M sims; reporta correlación TeamScore↔win-rate. Ajustar vía `CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40`. |
| `npm run build:worker` | Empaqueta `public/workers/bulkSim.worker.js` (automático antes de dev/build) |

---

## 🔌 Fuentes de datos

| Fuente | Propósito |
|---|---|
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json) | Roster campeones, aliases, class tags, URLs iconos |
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/sounds/) | SFX draft |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json) | Posiciones de lane por campeón |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/abilities.json) | Descripciones de habilidades (parsing CC) |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/items.json) | Stats de items para daño de progresión de build |
| Leaguepedia (vía `fetch-player-names`) | Handles pro de starters precisos para rosters de temporada |
| Curado a mano | 172 metas campeón, 340+ sinergias, 250+ counters, 11 perfiles identity |

> Variantes Doom Bot (`Ruby_*`) filtradas en fetch time; campeones pending-release ausentes en CDragon inyectados desde tabla fallback local.

---

## 💾 Archivos de datos, exports y backup

### Rutas desktop Windows

Todos los datos persistentes de la app Tauri viven bajo:

```
%APPDATA%\app.draftsim.desktop\
```

| Archivo | Propósito |
|---|---|
| `draftsim.db` | **Store principal** — estado global, realities, historial Hall, config meta |
| `draftsim-store.json.bak` | Store JSON legacy (creado tras migración SQLite) |
| `draftsim-meta-config.json.bak` | Config meta legacy (tras migración) |

macOS: `~/Library/Application Support/app.draftsim.desktop/`  
Linux: `~/.local/share/app.draftsim.desktop/`

### Formatos de export

| Extensión / código | Contenido |
|---|---|
| `.draftsim.json` | Torneo activo completo (draft en curso, meta, historial) |
| `.draftsim-reality.json` | Línea temporal franquicia: temporada en vivo + historial Hall + metadata |
| `.draftsim-season.json` | Slot save de temporada única |
| `TOUR1:…` | Código torneo deflate-base64 (portapapeles-friendly) |
| `REAL1:…` | Código share reality deflate-base64 |
| `META1:…` | Meta tier list deflate-base64 |

### Borrar reality

Desde **Realities → Saved realities → Delete**: elimina la reality del store y SQLite. Si era la **activa**, se limpia la temporada en vivo y vuelves al hub. Es permanente — exporta antes si quieres backup.

### Recomendaciones de backup

1. **Exporta realities** que te importen como `.draftsim-reality.json` (Realities hub → Export).
2. **Copia `draftsim.db`** con la app cerrada para backup full-fidelity (todas las realities, torneos, meta).
3. Tras migración SQLite, conserva los `.bak` JSON hasta verificar que tus saves cargaron bien.
4. Para timelines muy largas (50+ años), prefiere desktop sobre web — `localStorage` chocará con límites de cuota.

---

## 🎛 Ajustar la IA

Knobs de muestreo y dificultad en `lib/draftAI/data.ts` (`PICK_TOP_N`, `PICK_TEMPERATURE`, …) y `lib/draftAI/index.ts` (`knobsFor()`). Pesos de score inline en `lib/draftAI/scoring.ts` — cada `add(...)` tiene comentario con rationale.

Para validar un cambio de tuning:

```bash
CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40 npm run calibrate
```

Reporta correlación Pearson entre diff de draft-strength y win-rate simulada, más análisis leave-one-out que marca componentes cuya eliminación *mejora* correlación (ruido) vs load-bearing (no tocar).

> **Política de draft neuronal (opcional):** Rama separada (`feat/neural-draft-policy`) añade política aprendida con pesos ONNX/JSON (`public/models/draft-policy.json`) y pipeline Python bajo `training/`. No está en `main` por defecto — el drafter heurístico de arriba es la experiencia incluida.

---

## Desktop (Tauri)

DraftSim se distribuye como app de escritorio nativa vía [Tauri v2](https://tauri.app/).

### Requisitos

- **Node 22.12+** y **npm 10+** (igual que build web).
- **Rust 1.77+** — instalar desde [rustup.rs](https://rustup.rs/).
- **Windows**: Visual Studio Build Tools 2022 (workload C++) o VS 2022.
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev` (por distro).

### Dev (hot-reload)

```bash
npm run desktop:dev
```

Arranca servidor dev Next.js en `:3000` y abre ventana Tauri apuntando ahí.

**Consola en dev — aviso IPC (inofensivo):** Puede aparecer:

```text
IPC custom protocol failed, Tauri will now use the postMessage interface instead TypeError: Failed to fetch
```

Es normal en desarrollo. Tauri intenta primero el canal rápido `http://ipc.localhost`; si la UI se carga desde el servidor de desarrollo de Next.js (`http://localhost:3000`) en lugar de los assets empaquetados, ese `fetch` puede fallar y Tauri pasa automáticamente a `postMessage`. SQLite, diálogos nativos y la persistencia de franquicias siguen funcionando. Ignora el mensaje si la app arranca bien. Los builds de producción (`desktop:build`) sirven archivos estáticos desde `out/` y normalmente no muestran esto. Si la app queda bloqueada (splash infinito, `invoke()` colgado, errores de SQLite), en Windows prueba borrar `%LOCALAPPDATA%\app.draftsim.desktop\EBWebView` y volver a abrir — una caché corrupta de WebView2 puede romper ambos caminos IPC.

### Build de producción

```bash
npm run desktop:build
```

Ejecuta `npm run build` (export estático Next.js a `out/`) y empaqueta con Tauri.

El build produce (rutas relativas a la raíz del repo; no commiteadas — `src-tauri/target` está en gitignore):

| Artefacto | Ruta |
|---|---|
| Instalador NSIS (recomendado) | `src-tauri/target/release/bundle/nsis/DraftSim_<version>_x64-setup.exe` |
| Instalador MSI | `src-tauri/target/release/bundle/msi/DraftSim_<version>_x64_en-US.msi` |
| Ejecutable portable (sin install) | `src-tauri/target/release/app.exe` |

### Dónde viven los datos (SQLite)

Estado persistente en base **SQLite** embebida:

| Plataforma | Ruta |
|---|---|
| Windows | `%APPDATA%\app.draftsim.desktop\draftsim.db` |
| macOS | `~/Library/Application Support/app.draftsim.desktop/draftsim.db` |
| Linux | `~/.local/share/app.draftsim.desktop/draftsim.db` |

**Primer launch tras actualizar** a build con SQLite migra automáticamente desde `draftsim-store.json` legacy (renombrado a `.bak`). Ver [`docs/desktop-sqlite-storage.md`](docs/desktop-sqlite-storage.md) para schema, flujo de migración y comportamiento lazy-history.

Ventajas desktop sobre web:

- Tope historial torneos de 5 → **200** entradas con replay completo.
- Diálogos nativos Save/Open para torneos, realities, temporadas y meta.
- Almacenamiento franquicia normalizado — filas Hall-of-Seasons escritas individualmente en lugar de reescritura JSON monolítica.
- `flushPendingSqliteWrites()` al cerrar ventana y en límites bulk-year.

### Export / Import (desktop)

- **Tournament Save** — diálogo Save nativo → `.draftsim.json`.
- **Tournament Import** — diálogo Open nativo.
- **Reality Export/Import** — `.draftsim-reality.json` desde hub Realities.
- **Season Save/Import** — `.draftsim-season.json` desde dashboard temporada / menú.
- **Meta Export / Import** — diálogos nativos en Meta Editor.

Builds web usan copy/paste portapapeles para códigos `TOUR1:` / `REAL1:` / `META1:` e import textarea/file-input.

---

## 🔧 Desarrollo

```bash
npm install
npm run dev          # servidor dev web
npm test             # tests unitarios Vitest
npx tsc --noEmit     # typecheck
npm run desktop:dev  # desktop con hot reload
```

**Datos de roster:** Ejecuta `npm run fetch-player-names` periódicamente para refrescar handles pro usados al crear temporada. El script está throttled y acumula entre runs — re-ejecuta hasta la cobertura que necesites.

**Worker bulk sim:** `npm run build:worker` empaqueta `public/workers/bulkSim.worker.js` (auto antes de dev/build). Edita fuente y rebuild si cambias sim off-thread de franquicia.

**Calibración:** Usa `npm run calibrate` tras cambios de scoring IA para verificar que draft-strength sigue correlacionando con win rate.

**Type safety:** TypeScript strict en todo; tipos temporada/franquicia en `lib/season/types.ts`, tipos core en `lib/types.ts`.

---

## 📚 Documentación de diseño

| Doc | Tema |
|---|---|
| [`docs/systems.es.md`](docs/systems.es.md) · [`docs/systems.md`](docs/systems.md) | **Referencia profunda de sistemas** — scoring IA, sim, temporada, realismo (ES / EN) |
| [`docs/tournament-mode.md`](docs/tournament-mode.md) | Formatos torneo, emparejamiento Swiss, códigos save |
| [`docs/players-feature.md`](docs/players-feature.md) | Rosters, skill tiers, scouting IA |
| [`docs/player-identity-and-franchise.md`](docs/player-identity-and-franchise.md) | IDs jugador, carreras, realities, envejecimiento, transferencias |
| [`docs/season-realism.md`](docs/season-realism.md) | Seed byes, meta drift, region tides, flags realismo |
| [`docs/reality-sharing.md`](docs/reality-sharing.md) | Códigos REAL1, galería comunitaria |
| [`docs/desktop-sqlite-storage.md`](docs/desktop-sqlite-storage.md) | Schema SQLite, migración, lazy history |
| [`docs/performance-franchise-saves.md`](docs/performance-franchise-saves.md) | Causas raíz lag save y optimizaciones |

---

## 📄 Atribución y licencias

Simulador fan-made no oficial. League of Legends y todos los nombres de campeones, splash art, iconos y efectos de sonido son propiedad de **Riot Games, Inc.** Fuentes de datos (CommunityDragon, Meraki Analytics) son mirrors comunitarios de assets públicos del cliente Riot. Sin afiliación ni respaldo de Riot Games.

## Comprobaciones y auditoría

- `npm run check`: lint, TypeScript, pruebas y exportación de producción.
- `npm run build` seguido de `npm start`: sirve `out/` en localhost con CSP; no necesita un servidor Next.
- `npx playwright install chromium` y `npm run test:e2e`: flujos de navegador contra la exportación de producción.
- En Windows con Edge instalado: `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e`.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`: pruebas nativas de rollback y comando IPC con SQLite en memoria.
- `npm audit`: avisos publicados para dependencias npm.

Los fallos de guardado conservan la copia anterior y permiten reintentar. Un fallo de carga bloquea escrituras hasta recuperar la partida. La compactación se ejecuta desde mantenimiento, no en cada cierre. La exportación de una realidad carga también el historial de slots inactivos.

[Informe de auditoría y mejoras propuestas](docs/audit-2026-09-10.md).
