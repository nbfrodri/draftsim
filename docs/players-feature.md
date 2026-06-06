# Feature: Identidad de Jugadores (Player Identities)

> **Estado:** ✅ COMPLETO — Fases 0–6 implementadas, testeadas y verificadas.

Plan de implementación por fases. Cada equipo pasa a tener **5 jugadores** (uno por
lane). Cada jugador tiene una **identidad persistente**: una **posición fija**, un
**tier fijo** (S/A/B/C/D) y un **pool de campeones** (máx. 3 que se le dan bien,
máx. 3 que se le dan mal). La IA y el simulador tienen en cuenta esta identidad.

## Decisiones ya tomadas

- **El `starRating` del equipo SE DERIVA del roster** (media de los tiers de sus 5
  jugadores). Deja de ser un valor independiente.
- **Tournament y Single Series**: el usuario puede **randomizar** el roster o
  **elegir a mano** tiers y pools, para **ambos** equipos.
- **Persistencia**: en torneo el roster se genera al crear el equipo y es el mismo
  en todas las partidas. En una serie, fijo durante toda la serie.
- **Pools**: máx. **3 campeones "buenos"** (bonus) y **3 "malos"** (penalty) por
  jugador, randomizables o manuales, elegidos de campeones jugables en su lane.
- **Flex picks**: la IA puede **reasignar roles** (flex) antes de simular para
  encajar mejor los campeones pickeados con la identidad de sus jugadores y el meta
  (ver Fase 4b).

---

## Modelo de datos

```ts
// lib/types.ts
export type PlayerTier = "S" | "A" | "B" | "C" | "D";

export interface Player {
  lane: Lane;                 // posición FIJA (identidad)
  tier: PlayerTier;           // tier FIJO (identidad)
  goodChamps: number[];       // championIds, máx 3 (bonus)
  badChamps: number[];        // championIds, máx 3 (penalty)
}

// Un roster es exactamente 5 jugadores, uno por lane, en orden posicional
// [top, jungle, middle, bottom, support] para casar con blueRoles/redRoles.
export type Roster = Player[]; // length 5
```

Campos nuevos (todos **opcionales** → estado legacy sigue válido, igual que ya se
hace con `blueStarRating?`, `blueWinStreak?`):

- `TournamentTeam.players?: Roster` — fuente de verdad persistente (`lib/tournament.ts`).
- `SeriesState.bluePlayers?: Roster` / `redPlayers?: Roster` (`lib/types.ts`).
- `SimulationSettings.bluePlayers?: Roster` / `redPlayers?: Roster` (single-series).

---

## Modelo de puntuación (cómo afecta a sim + IA, SIN doble conteo)

Hay tres efectos. La clave es separarlos para que el tier no se cuente dos veces
(una por el star derivado y otra por la lane).

| Canal | Qué captura | Dónde entra | Suma global |
|---|---|---|---|
| **Macro (star derivado)** | Nivel global del roster | `starRatingBias` → `scoreBias` del sim | (blueMean − redMean) |
| **Micro (lane)** | Quién es mejor lane a lane | resolución de lane en el sim | **0 por construcción** |
| **Pool de campeón** | Si el jugador tiene el campeón que le gusta/disgusta | per-pick en sim + scoring IA | nuevo, independiente del tier |

Valores de tier de jugador (centrados en B = 0):

```ts
const PLAYER_TIER_VALUE: Record<PlayerTier, number> = { S: 2, A: 1, B: 0, C: -1, D: -2 };
```

**Star derivado** (media → 1..5):
```ts
// media de PLAYER_TIER_VALUE ∈ [-2, 2]  →  star ∈ [1, 5]
deriveStar(roster) = clamp(round(3 + mean(tierValues)), 1, 5)
// 5×S → 5★ ; 5×B → 3★ ; 5×D → 1★
```

**Micro lane (zero-sum, evita doble conteo):** se usa la **desviación respecto a la
media del PROPIO equipo**, no el tier absoluto:
```ts
blueDev_lane = tierValue(bluePlayer[lane]) − blueMean
redDev_lane  = tierValue(redPlayer[lane])  − redMean
laneBias_lane = (blueDev_lane − redDev_lane) * MICRO_LANE_K
// Σ laneBias sobre las 5 lanes = 0  →  el nivel global ya lo lleva el macro.
```
Así un toplaner S en un equipo flojo **sobre-rinde en TOP** sin inflar el nivel del
equipo (que ya lo refleja el star). La diferencia de nivel entre equipos la lleva
**solo** el canal macro.

**Pool de campeón** (independiente del tier, info nueva del draft):
```ts
if (player.goodChamps.includes(pickId)) adj += GOOD_CHAMP_BONUS;   // p.ej. +1.5 tier-pts
if (player.badChamps.includes(pickId))  adj -= BAD_CHAMP_PENALTY;  // p.ej. -1.5 tier-pts
```

> **Calibración**: al introducir el micro lane hay que **recalibrar
> `STAR_RATING_BIAS_K`** (`lib/series.ts:79`, hoy 9.0) con `npm run calibrate`, porque
> el macro pasa a derivarse del roster en vez de un star elegido a dedo.

---

## Fases

### Fase 0 — Núcleo: tipos + utilidades puras (sin efecto todavía)
**Objetivo:** lógica framework-free y testeable, sin tocar UI ni gameplay.

- `lib/types.ts`: `PlayerTier`, `Player`, `Roster`.
- **Nuevo** `lib/players.ts`:
  - `PLAYER_TIER_VALUE`, `deriveStar(roster)`.
  - `randomizeRosterForStar(star, champions): Roster` — reparte un "presupuesto"
    de `(star−3)*5` puntos de tier entre las 5 lanes con jitter, clamped, de forma
    que `deriveStar(resultado) ≈ star` (evita el caso "5★ con 5 D").
  - `randomizeChampPools(player, champions): Player` — elige 0–3 good / 0–3 bad de
    los campeones jugables en `player.lane` (patrón `laneToChamps` de
    `metaRandomizer.ts`), sin solapamiento good/bad.
  - `randomizeRoster(star?, champions)` — combinación de los dos anteriores.
  - `normalizeRoster` (legacy-safe: rellena lanes faltantes, recorta pools a 3).
  - `playerForLane(roster, lane): Player | null`.
- **Tests** (`lib/__tests__/players.test.ts`): `deriveStar` en los extremos; que
  `randomizeRosterForStar` respeta el star objetivo (±tolerancia); pools ≤3 y sin
  solapamiento; `normalizeRoster` con entradas corruptas.

**Entregable testeable:** `npm test` verde sobre la lógica de jugadores.

---

### Fase 1 — Persistencia y cableado de datos (sin efecto en gameplay aún)
**Objetivo:** que el roster exista, viaje y persista de punta a punta.

- `lib/tournament.ts`: `TournamentTeam.players?: Roster`. Generarlo en la creación
  de equipos. **TOUR1 encode/decode**: incluir `players` explícitamente y
  **subir versión** del envelope para no romper códigos antiguos (decode rellena con
  `normalizeRoster`/`randomizeRoster` si falta). Revisar el slim-archive del history
  (los rosters son pequeños → se conservan).
- `lib/types.ts`: `SeriesState.bluePlayers/redPlayers`; `SimulationSettings.bluePlayers/redPlayers`.
- `lib/series.ts`: `createSeries` acepta y propaga `bluePlayers/redPlayers`. **El star
  se deriva aquí**: si vienen rosters y no viene star explícito, `blueStarRating =
  deriveStar(bluePlayers)`.
- `store/draftStore.ts`:
  - `startMatch` (~L1096) y `autoPlayMatch` (~L305): pasar `blueTeam.players` /
    `redTeam.players` a `createSeries`. El star deriva del roster (sustituye a
    `teamStarRating`).
  - `startSimulation` (~L716): los settings ya traen rosters → a `createSeries`.

**Entregable testeable:** crear torneo → guardar `TOUR1:` → recargar restaura
rosters idénticos; `deriveStar(roster) === series.blueStarRating`.

---

### Fase 2 — Simulador: tier de jugador (macro + micro lane)
**Objetivo:** que el tier de los jugadores mueva resultados, sin doble conteo.

- **Macro:** ya funciona vía star derivado → `starRatingBias` → `scoreBias` (sin
  cambios de mecanismo; solo recalibrar `STAR_RATING_BIAS_K`).
- **Micro lane:** en `lib/matchSimulator.ts`, en la resolución por-lane (gold/outcome
  por lane; ver `laneAdvantages` y el reparto de gold por lane), añadir
  `laneBias_lane` (desviación respecto a la media del equipo, fórmula de arriba).
  Pasar los rosters al simulador como nueva opción (`SimulationOptions.bluePlayers/
  redPlayers`).
- **Calibrar:** `CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40 npm run calibrate` y ajustar
  `STAR_RATING_BIAS_K` + `MICRO_LANE_K`.

**Entregable testeable:** con equipos de star igual, el lane con mejor jugador gana
su lane con más frecuencia; el winrate de equipo sigue correlando con el star derivado.

---

### Fase 3 — Simulador: pools de campeones (good/bad) ✅
**Objetivo:** que importe *qué* campeón acaba jugando cada jugador.

**Implementado:** el pool va en `computeLaneAdvantages` (gold de lane), vía la
función pura exportada `playerLanePoolBias(...)` (constante `POOL_LANE_K = 15`
g/min por punto de pool). Decisión de diseño: **absoluto, no cero-suma** (a
diferencia del tier micro). Razón: estar cómodo con tu campeón no empeora a tus
compañeros (no hay trade-off de recursos), así que un bonus zero-sum sería
incorrecto. El efecto a nivel de equipo (un draft bien ajustado a sus jugadores)
emerge solo del mayor oro total de lane → snowball, sin un canal aparte → sin
doble conteo. Se descartó tocar `metaStrengthScore`/`champCombatProfile` para no
duplicar el efecto sobre la probabilidad global.

**Hecho:** un laner en su campeón "bueno" sobre-rinde en su lane; en uno "malo"
rinde por debajo; neutral → 0. Tests en `lib/matchSimulator-players.test.ts`.

---

### Fase 4 — La IA draftea para sus jugadores ✅
**Objetivo:** que la IA prefiera los campeones "buenos" del jugador de esa lane y
evite los "malos" — **sin** que eso le haga forzar un pick malo de meta.

**Implementado:**
- `SeriesAIContext.myPlayers` (roster del lado de la IA), poblado en
  `seriesAIContextFrom` con un simple lookup por lado (correcto tras side-swap
  porque `blue*/red*` siempre describen el lado actual).
- En `scorePick`, un término aditivo "Player comfort": `poolBias(jugador de la
  lane, candidato) * 4` (±4 ≈ un escalón de tier; `Lane fit` abarca 3–18). Al ser
  **un signo más entre muchos** (Lane fit/tier, sinergias, `laneMatchup`/counters,
  identidad…), la IA **pondera** la comodidad contra el meta y los matchups: un
  campeón cómodo pero tier D o con mal counter pierde frente a una opción mejor.
  Solo en `normal`/`hard`; en `easy` se ignora.
- **Bug latente corregido:** `startNextGame` no intercambiaba los rosters al
  cambiar de lado entre partidas (sí lo hacía con star/dificultad). Ahora sí, así
  que las Fases 2/3 también quedan correctas tras un side-swap.

**Hecho:** test que confirma +4/−4/neutral, ignorado en Easy, y que el término de
comodidad **nunca supera** al `Lane fit` (`lib/draftAI/players.test.ts`).

- `lib/draftAI/`: pasar el roster por el contexto (`SeriesAIContext` →
  `PickContext.series`, que ya transporta info de torneo).
- En `bestLaneTierValue`/`scoring.ts` (donde hoy hace `add("Lane fit", tierValue*3)`):
  sumar bonus si el candidato está en `goodChamps` del jugador de esa lane, restar si
  está en `badChamps`. Magnitud calibrable (no debe dominar al meta-tier, solo
  inclinar).
- Coherente con la dificultad: que solo aplique en `normal`/`hard` (en `easy` la IA
  ignora la identidad, manteniéndola "beatable").

**Entregable testeable:** sobre N drafts, la IA elige campeones del pool "bueno" del
jugador de la lane con frecuencia notablemente mayor que el azar; casi nunca los "malos".

---

### Fase 4b — Reasignación de roles / flex picks por la IA
**Objetivo:** que la IA, antes de simular, coloque sus 5 campeones en las lanes que
maximizan el valor del equipo dada la identidad de sus jugadores (flex picks), en
vez de quedarse con la auto-asignación por defecto.

- Hoy, al completar el draft, `assignLanesToPicks` (`lib/draftEngine.ts`) fija
  `blueRoles`/`redRoles` y el usuario puede intercambiar dos picks a mano.
- **Optimizador (nuevo, `lib/draftAI/roleAssign.ts`):** búsqueda sobre las
  asignaciones válidas campeón→lane (cada campeón solo a lanes de `playableLanes`),
  puntuando cada asignación por Σ (valor de meta-tier en esa lane + micro tier del
  jugador + `poolBias` del jugador con ese campeón). Espacio pequeño (≤120
  permutaciones de 5×5, podadas por jugabilidad) → fuerza bruta o húngaro; trivial
  en rendimiento.
- **Aplicación:** solo para equipos controlados por IA, justo antes de simular
  (en `autoPlayMatch` y en el `handleSimulate` de `BetweenGamesView` cuando el lado
  es IA). El equipo humano conserva el swap manual.
- **Coherencia con la dificultad:** en `easy` se omite (auto-asignación simple);
  `normal`/`hard` aplican el flex óptimo.
- **Durante el draft:** la IA ya valora flex/multi-lane (`bestLaneTierValue` elige la
  mejor lane abierta). Se refuerza para que, al elegir, tenga en cuenta que un
  campeón flexeable podrá recolocarse después hacia el pool del jugador (sinergiza
  con Fase 4).

**Entregable testeable:** dados 5 picks con solapamiento de lanes, el optimizador
devuelve la asignación de mayor valor respetando jugabilidad; un campeón flex va a la
lane del jugador que lo tiene en su pool "bueno" cuando eso maximiza el total.

**Implementado:** `lib/draftAI/roleAssign.ts` → `optimizeRoleAssignment(picks,
champions, roster)` hace fuerza bruta sobre las 120 permutaciones, puntuando cada
lane con `TIER_VALUE(getMetaTier) + poolBias*1.5` y una penalización de −100 si el
campeón no puede jugar esa lane (jugabilidad blanda → siempre devuelve una
asignación completa; nunca peor que el greedy). Se aplica en `finalizeRoles`
(store), que ahora recibe la `series`: solo para lados controlados por IA y
dificultad ≠ `easy` (vía `isAISide` + `difficultyForSide`); los humanos conservan
el greedy + swap manual. Como se aplica al completar el draft, la comp mostrada ya
refleja el flex "antes de simular". Tests en `lib/draftAI/roleAssign.test.ts` (5
casos, incluido que la jugabilidad manda sobre el pool).

### Fase 5 — UI: editor de roster + badges en draft ✅
**Objetivo:** randomizar/editar a mano y ver la identidad.

**Implementado:**
- **`components/RosterEditor.tsx`** (modal por portal, estilo `MetaEditor`): tabs por
  lane, selector de tier S–D, pools good/bad (clic en el grid de campeones jugables de
  esa lane cicla neutral→good→bad→neutral, cap 3/3, rings verde/rojo), **star derivado
  en vivo** y botón **Randomize**.
- **Single series** (`CreateSimulationForm`): sección "Player Rosters (optional)" con
  una `RosterCard` por equipo (Edit/Random/Clear + star derivado); se cablea
  `bluePlayers/redPlayers` en `startSimulation`. Sin tocar → comportamiento clásico.
- **Torneo** (`TournamentSetup`): botón "Players" por equipo que abre el `RosterEditor`
  (siembra un roster acorde al star si no existe); cambiar el star resetea el roster,
  guardar el roster sincroniza el star.
- **Draft** (`TeamPanel`/`PickSlot`): badge con el tier del jugador por slot + punto
  verde/rojo cuando el campeón pickeado está en su pool good/bad.

**Verificado end-to-end con Playwright** (RosterEditor renderiza pools y star; los
badges de tier aparecen en el draft). tsc limpio.

- **Editor de roster** (componente reutilizable `RosterEditor`):
  - 5 filas (lanes) × (selector de tier S–D + multiselect de campeones con dos
    cubetas: "good" máx 3 / "bad" máx 3, filtrado a campeones jugables en la lane).
  - Botón **Randomize roster** (usa `randomizeRoster`) y edición manual.
  - Muestra el **star derivado** en vivo a partir de los tiers.
- **Tournament** (`components/TournamentSetup.tsx` ~L641): el `StarPicker` actual pasa
  a **derivarse** (read-only o "set star → randomiza roster a ese star"); añadir botón
  "Editar jugadores" por equipo que abre `RosterEditor`.
- **Single Series** (`components/CreateSimulationForm.tsx`): añadir sección de roster
  para **Blue y Red** (randomize o manual). Threading: `handleSubmit` mete
  `bluePlayers/redPlayers` en `startSimulation`.
- **Draft** (`components/TeamPanel.tsx` / `PickSlot`): badge con el tier del jugador
  de esa lane y un indicador cuando el campeón pickeado está en su pool good/bad.

**Entregable testeable (Playwright):** randomizar roster, comprobar que el star se
actualiza; jugar una serie y ver los badges; round-trip de single-series.

---

### Fase 6 — Calibración final, docs y pulido ✅
- **Validación end-to-end con sims reales** (no hizo falta recalibrar
  `STAR_RATING_BIAS_K`: el macro deriva del star, que coincide con el elegido →
  idéntico al sistema ya calibrado; el micro es cero-suma; el pool es ortogonal):
  - Macro star→WR: 5★vs1★ **82.8%**, 4vs2 71.0%, 3vs3 51.2%, 2vs4 36.3%, 1vs5 18.1%.
  - Pool: draft todo-comodidad vs neutral (3★) → **57.0%**.
  - Sanity: rosters iguales 3★ → 50.3% (solo el bonus de lado azul).
- **README** actualizado (subsección "Player identities" en Features + captura
  `docs/screenshots/roster-editor.png`).
- **Migración revisada y segura:** estado persistido y `TOUR1:` antiguos (sin
  rosters) degradan con elegancia — `teamStarRating` cae a `starRating`,
  `decodeTournament` rellena rosters, y todos los helpers (`deriveStar`,
  `playerForLane`, `poolBias`, `playerLane*Bias`) son null-safe. Sin crashes; el
  estado nuevo persiste rosters como JSON plano. No hizo falta código de migración.

## Constantes (fijadas, calibrables)
| Constante | Fichero | Valor |
|---|---|---|
| `PLAYER_TIER_VALUE` | `lib/players.ts` | S2 A1 B0 C-1 D-2 |
| `STAR_RATING_BIAS_K` | `lib/series.ts` | 9.0 (sin cambios) |
| `PLAYER_LANE_BIAS_K` | `lib/matchSimulator.ts` | 8 (micro lane, cero-suma) |
| `POOL_LANE_K` | `lib/matchSimulator.ts` | 15 (pool en gold de lane) |
| `POOL_W` (flex) | `lib/draftAI/roleAssign.ts` | 1.5 |
| comodidad IA | `lib/draftAI/scoring.ts` | ±4 (≈ 1 escalón de tier) |

---

## Persistencia y migración (resumen)
- Campos nuevos **opcionales** → estado/`localStorage` legacy sigue cargando.
- `TOUR1:` **versionado**; decode rellena rosters ausentes con `normalizeRoster`/
  `randomizeRoster`.
- Roster generado **una vez** al crear el equipo (torneo) o la serie (single) y
  **congelado** desde ahí (identidad persistente).

## Knobs / defaults iniciales (a calibrar)
| Constante | Dónde | Valor inicial |
|---|---|---|
| `PLAYER_TIER_VALUE` | `lib/players.ts` | S2 A1 B0 C-1 D-2 |
| `STAR_RATING_BIAS_K` | `lib/series.ts` | recalibrar (hoy 9.0) |
| `MICRO_LANE_K` | `lib/matchSimulator.ts` | ~2.0 (calibrar) |
| `GOOD_CHAMP_BONUS` / `BAD_CHAMP_PENALTY` | sim + IA | ~1.5 tier-pts |
| pools | `lib/players.ts` | 0–3 good, 0–3 bad |

## Riesgos a vigilar
- **Doble conteo** tier↔star: resuelto con micro lane *zero-sum* (desviación intra-equipo).
- **Calibración**: la feature cambia la fuente del macro bias → re-correr `calibrate`.
- **Campeones sin lane** (recién salidos/off-meta) al construir pools → usar el patrón
  `playableLanesFor`/Meraki ya existente.
- **Compatibilidad** de estado persistido y `TOUR1:` → opcionales + versión + normalize.
