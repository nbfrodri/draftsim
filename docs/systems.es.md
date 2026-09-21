# Sistemas de juego centrales — referencia técnica

Documentación profunda de la IA, capa temporada/franquicia, estructura competitiva y modelo de realismo de DraftSim. Para notas UX a nivel feature ver el [README](../README.es.md); para docs de diseño de subsistemas ver [Documentación de diseño](../README.es.md#-documentación-de-diseño).

🇬🇧 **[English version](systems.md)**

**Mapa de código:** `lib/draftAI/` · `lib/matchSimulator.ts` · `lib/sim/` · `lib/season/` · `lib/championMeta.ts` · `lib/metaRandomizer.ts` · `lib/chemistry.ts`

---

## Filosofía de diseño y objetivos de realismo

DraftSim es un **sandbox de simulación**, no un clon del cliente Riot. El objetivo es hacer el LoL competitivo *legible*: draft, planes macro, fuerza de roster y estructura del calendario deben importar como al ver (o jugar) LoL pro — sin reproducir mecánicas específicas de parche que quedarían obsoletas cada dos semanas.

| Principio | Qué significa en código |
|---|---|
| **Core de funciones puras** | `lib/` sin deps React/DOM. Draft, sim, temporada y torneo son testeables en unit y deterministas dado un seed RNG. |
| **Realismo opt-in** | Flags de temporada (`formDrift`, `playerTransfers`, …) **off** por defecto. Con todos off, serialización y comportamiento de sim coinciden con el modelo clásico. |
| **Palancas neutrales por defecto** | Estrategias War Room, chemistry y overrides de meta aportan **cero** sin configurar — saves viejos y partidas "sin plan" siguen bit-idénticos. |
| **Score por nombre de equipo** | Victorias de serie agregan por identidad de equipo, no blue/red, así el auto side-swap nunca parte el récord de un equipo. |
| **Bias en capas, un choke point** | Estrellas roster, skill por lane, forma, clutch, momentum, motivación coach y presets de varianza se combinan en `starRatingBias()` (`lib/series.ts`) antes de que la timeline de partida lance eventos. |
| **Datos + heurísticas sobre ML** | El drafter incluido es scoring afinado a mano (`lib/draftAI/scoring.ts`). Una política aprendida existe en rama opcional (ver abajo). |
| **Nombres reales, reglas abstractas** | Nombres de equipos pro, logos y handles se obtienen o empaquetan; salary caps, visas y horarios de scrims no se simulan. |

**Cómo se ve "asimilar la realidad":** ligas regionales y nombres de eventos reales, clasificación internacional alimentada por splits, formas play-in / Swiss / groups, fearless draft en series, convenciones loser-side, ventanas de transferencias entre majors, pipelines academy, career IDs en un Hall, meta que deriva como parches, y movimientos de roster impulsados por rendimiento + encaje de champion pool bajo meta actual.

**Qué se abstrae deliberadamente:** clicks individuales de jugador, juegos de píxeles de visión, timings exactos de actives de items, VOD review de coach, economía de orgs, deadlines de roster lock con multas, y ping/latencia geográfica.

---

## Sistemas heurísticos de IA (draft)

La IA por defecto es un **ensemble de scoring**, no una fórmula única. Cada candidato pick/ban legal recibe una suma ponderada de componentes etiquetados; la IA muestrea del top-N (temperatura controlada) para que las partidas varíen mientras dominan elecciones fuertes.

### Pipeline

```
chooseAIActionWithRationale(game, champions, fearlessLocked, seriesCtx)
  → build PickContext / BanContext (lanes, archetypes, identity, series state)
  → scorePick / scoreBan for each candidate (pure, explain=true for rationale)
  → optional lookahead penalty (1-ply Normal, 2-ply Hard)
  → sampleTopN(total scores, temperature, topN)
  → return champion id + breakdown + alternatives
```

Entry points: `lib/draftAI/index.ts`. Scoring: `lib/draftAI/scoring.ts`. Tablas: `lib/draftAI/data.ts`. Lookahead / anticipación: `lib/draftAI/anticipation.ts`.

### Tipos de componentes de scoring

Los presets de personalidad re-pesan estos buckets (`lib/draftAI/personalities.ts`). Peso ausente = 1.0 (bit-idéntico al comportamiento histórico).

| Kind | Comportamiento pick | Comportamiento ban |
|---|---|---|
| **metaTier** | Lane fit, valor S+ first-pick, "jugar meta cuando vas perdiendo" | Negar flex, target amenazas high-tier |
| **synergy** | Bonos de pares `CHAMPION_SYNERGIES` | Romper pares de sinergia enemigos |
| **archetypeSynergy** | Refuerzo implícito de forma de comp | — |
| **damageBalance** | Relleno gap AP/AD, penalizaciones stack | — |
| **playerComfort** | Sesgos pool propio | — |
| **laneMatchup** | 250+ hard counters + lane fit heurístico | Counter-deny en lanes enemigas |
| **identity** | Completar comp convergente (Wombo, Pick, Dive…) | — |
| **crossGameCounter** | Counter identity / perfil arquetipo última partida | Ban arquetipos habilitadores |
| **lookahead** | Penalización si mejor respuesta enemiga nos duele | — |
| **targetBan** | — | Bans comfort / anticipados / deny-main |
| **threatBan** | — | Proteger comp de hard counters |

### Señales estratégicas (detalle)

- **Identity targeting** — Tras dos picks, `identityTarget()` fija etiqueta de comp desde `IDENTITIES` en `data.ts`. Picks siguientes ganan bonos por arquetipos `needed` (Wombo necesita `wombo` + `engage`, etc.).
- **Draft consciente del lado** — Blue favorece flex y meta S+ resistente a counter; Red pondera edge de matchup y rechaza R5 en hard lane counter (`scoring.ts` + `helpers.laneMatchup`).
- **Estado de serie** — `SeriesAIContext` alimenta flags eliminación/closeout, diff de victorias, prior picks fearless e identidades previas del rival. Perdiendo serie → prioridad meta más fuerte; en match point → menos riesgo pocket-pick.
- **Meta de torneo en vivo** — Mapa opcional `tournamentChampionWR` aplica nudges W/L Bayesian-shrink por id de campeón (picks observados en el bracket hasta ahora).
- **Scouting roster enemigo** — Con rosters: target-ban mains enemigos ponderados por `PLAYER_SKILL_WEIGHT`, negar comfort en picks propios, respetar tier laner enemigo en término matchup, saltar bans en champs bad-pool enemigos.
- **Pocket picks** — `POCKET_PICK_PROB` amplía pool de muestreo ocasionalmente; personalidades como `cheese` lo multiplican mucho.

### Dificultad y muestreo

| Dificultad | Lookahead | Anticipación | Temperatura |
|---|---|---|---|
| Easy | Off | Off | Mayor (top-N más aleatorio) |
| Normal | 1-ply | On | `PICK_TEMPERATURE` por defecto |
| Hard | 2-ply | On | Más aguda |

Knobs: `PICK_TOP_N`, `BAN_TOP_N`, `PICK_TEMPERATURE`, `BAN_TEMPERATURE` en `lib/draftAI/data.ts`; `knobsFor()` en `index.ts`.

### Personalidades de draft

Perfiles por equipo multiplican pesos de componentes y knobs de muestreo. Asignados en `SeasonTeam.personalityId` y `Coach.personalityId`.

| ID | Estilo |
|---|---|
| `balanced` | Por defecto — pesos vacíos, comportamiento histórico |
| `meta-slave` | Maximalista tier-list, muestreo casi determinista |
| `comfort-first` | Pools de jugador sobre meta; target-ban alto en signatures |
| `counter-picker` | Lane counters, lookahead, adaptación cross-game |
| `cheese` | Alta temperatura, top-N amplio, comerciante pocket-pick |

### Coaches (fuerza de draft)

`Coach.rating` (1–5) mapea a dificultad IA por equipo (`coachDifficulty`). `adaptability` alimenta swings de forma en meta-shift; `motivation` escala form drift con resultados (`lib/season/coach.ts`).

### Política de draft neuronal (rama opcional)

**No en `main` por defecto.** La rama `feat/neural-draft-policy` añade:

- `lib/draftAI/neural/` — encoder de estado + inferencia de política en TypeScript puro (sin deps ML runtime).
- `public/models/draft-policy.json` — pesos exportados (JSON grande).
- `training/` — pipeline training PyTorch (`dataset`, `model`, checkpoints).

Patrón de integración: `chooseAIActionWithRationale` prueba política neuronal primero, fallback silencioso a scoring heurístico. La experiencia incluida en `main` es el drafter heurístico de arriba.

Validar tuning heurístico: `npm run calibrate` (correlación TeamScore ↔ win-rate).

---

## Simulador de partidas

`simulateMatch()` en `lib/matchSimulator.ts` orquesta módulos de fase bajo `lib/sim/timeline/` (laning, objectives, fights, closing). Tipos y sabores de evento: `lib/sim/types.ts`, `lib/sim/descriptions.ts`.

### Modelo de timeline

~30 valores `EventType` (level-1 invade, scuttle, gank, plates, drakes, grubs, herald, atakhan, soul, baron, elder, teamfight, pick, vision, power-spike, ace, shutdown, backdoor, nexus…). Cada evento:

1. Tira ventaja de lado desde diff de comp, leads de lane, momentum, estado de objetivos, estrategias.
2. Aplica `kdaDelta` a KDA de lane y fluye oro vía `kdaToLaneGold` (300g/kill, 100g/assist).
3. Actualiza timeline win-probability para sparkline UI.

Duración de partida acotada (~24–50 min simuladas); estrategias scaling/passive alargan; tempo aggressive acorta.

### Resolución de combate

Peleas de cierre usan **daño y EHP** por campeón estimados desde:

- Build paths de items (`lib/championBuilds.ts`, minutos spike de `getKeyPowerSpike`).
- Perfil de daño de arquetipo y meta tier (`TIER_VALUE`).
- Perfiles lockdown de habilidades (`lib/championAbilities.ts`) para cadenas CC.

**Power spikes** — Cuando el item clave de un carry entra online, rolls de pelea mid-game inclinan hacia ese lado (hasta dos beats spike por lado en comps multi-carry).

**Late scaling** — Pelea decisiva añade término ramped por duración para que comps que peak late ganen partidas largas de verdad.

**Multiplicadores identity** — `lib/sim/identities.ts` — Wombo vs sin disengage, Dive vs carry desprotegido, etc. Visibles en scouting reports de Team Comparison.

### Stack de bias pre-pelea (sin doble conteo)

| Fuente | Efecto |
|---|---|
| `starRatingBias()` | Gap estrella equipo, forma, clutch, racha, variance preset |
| Roster por lane | Micro suma cero: laner fuerte over-performa solo en esa lane |
| Encaje champion pool | Comfort / discomfort en champ elegido |
| Lane chemistry | Sinergias de pares almacenadas + nudges bot-duo / same-region (`lib/chemistry.ts`) |
| Encaje plan War Room | Tailwind ±~10pp cuando plan encaja con draft (`strategyFit`) |
| Mods timeline estrategia | Frecuencia eventos, tilt objetivos, steal chance, varianza riesgo |

Palancas War Room (`lib/sim/strategies.ts`): 16 ajustes neutrales por defecto en Team Plan, Map & Resources y Lane Assignments. IA selecciona vía `chooseAIStrategy()` muestreado (riesgo consciente de serie, pick target en carry enemigo, lane swap en hard counter).

### Recaps y ratings

`buildGameRecap()` persiste MVP (solo equipo ganador), KDA por pick, swing win-prob, `perPickIds` para stats de carrera. `computeGameRatings()` produce ratings 1–10 usados por valor de transferencia y All-Pro.

---

## Toma de decisiones más allá del draft (capa franquicia)

Lógica temporada y franquicia en `lib/season/`. El store (`store/draftStore.ts`) conduce UI; funciones engine son puras.

### Calendario de temporada (estructura competitiva)

Seis ligas regionales (**LCK, LPL, LEC, LCS, CBLOL, LCP**), 10 equipos cada una. Orden de poder inter-liga fijo para seeding con region tides off: LCK > LPL > LEC > LCS > CBLOL > LCP.

**Orden anual de fases** (`buildSeasonPhases` en `lib/season/engine.ts`):

| Fase | Evento / split | Feed de clasificación |
|---|---|---|
| Winter split | 6 torneos de liga | → First Stand (top 2 por liga) |
| Ventana transferencias | (opcional) | Tras First Stand |
| First Stand | 12 equipos, play-in para seeds #2 | Campeón puede añadir slot MSI |
| Spring split | 6 ligas | → MSI (top 3 por liga) |
| Ventana transferencias | (opcional) | Tras MSI |
| MSI | 18 (+1) equipos, Swiss + DE o play-in trim | Campeón afecta seeding Worlds |
| Summer split | 6 ligas | → Worlds (top 4 por liga) |
| Worlds | Play-in + groups/Swiss main | Campeón mundial |
| Global Cup | Años franquicia cuatrienales | Top 32 ranking global (no alimentado por split) |

Cada stage es un `TournamentState` normal — brackets, series fearless, drafts, replays y snapshots meta reutilizan el motor de torneos al completo.

**Controles de simulación:** `Sim Regular Season`, junto a `Sim Matchday`, termina únicamente la fase regular pendiente del split doméstico actual en todas las regiones (round-robin, grupos o Swiss). Se deshabilita fuera de los splits o cuando no quedan partidos de fase regular. No juega ningún partido de playoffs; `Sim Matchday` o la acción de fase completa permiten continuarlos. Reutiliza la cancelación, la forma de jugadores, la evolución del meta y el guardado final de la simulación existente.

**Season Results completados:** los enlaces del campeón, las posiciones y las estadísticas fijan la identidad y los rosters de las tarjetas a los participantes guardados de esa fase, con `phaseRosters` como alternativa para datos antiguos. Los participantes se clonan al crear el torneo y se conservan en SQLite, navegador y exportaciones. Los fichajes o cambios de nombre posteriores no modifican estas tarjetas. Si falta el roster histórico, no se sustituye por los jugadores actuales. No requiere migración de base de datos.

**Season recap y movimientos:** Most MVPs muestra al jugador sin duplicar el logo del equipo junto al nombre y utiliza el badge de tier compartido. Roster Moves muestra todos los splits por defecto también al terminar la temporada, de modo que los movimientos post-split siguen accesibles hasta avanzar al siguiente año. Se mantienen los filtros de ventana y la exclusión del offseason arrastrado del año anterior.

**Match replay:** los equipos de Key Events, Damage Dealt y Game MVP abren las tarjetas existentes. Las pentakills registradas resaltan en dorado la pestaña del game y muestran el badge Pentakill, nombre registrado del jugador, posición y campeón, además de una banda en el game seleccionado. Las pentakills repetidas del mismo jugador/campeón en un game comparten un único badge `Pentakill ×N`; los participantes distintos conservan su identificación. La identidad sigue los lados de ese game y las posiciones del recap. No se deducen pentakills del total de kills en recaps antiguos; un nombre no registrado aparece como `Unknown player`.


**Formatos de liga configurables:** round-robin (+ playoffs DE / triple-elim / stepladder opcionales), groups + playoffs, Swiss (+ playoffs). Conteo playoff por liga, longitudes de serie (regular / semis / finals), legs double round-robin, true grand final, modo threshold Swiss.

**Formatos internacionales** (`SeasonIntlConfig`): First Stand SE con byes seeds #1; MSI Swiss a DE 12 equipos con region #1 pre-calificada; Worlds play-in (6 equipos) alimentando groups (4×5) o main event Swiss; toggles play-in y overrides de serie opcionales.

Ver [`season-realism.md`](season-realism.md) para detalle seed-bye y badges UI (Direct to Playoffs / Pre-Qualified).

### Ventanas de transferencias

`lib/season/transfers.ts` — free agency automática entre splits (y offseason pesado tras Worlds).

**Valor de transferencia** combina:

```
value ≈ skill tier + W_PERF×(split grade − 5.5) + W_META×pool fit bajo meta actual
```

- **Pool fit** usa snapshot meta con patch-shift (`SeasonMetaSnapshot`) — una estrella cuyos mains están fríos en el parche actual puede perder asiento ante jugador equal-tier con comfort picks S-tier.
- **Movimientos cross-region** limitados: jugadores S/S+ no se mueven auto al extranjero (`CROSS_REGION_TIER_CAP`); sí pueden moverse dentro de región.
- Volumen limitado por lane por ventana (`MAX_MOVES_PER_LANE`, `VALUE_GAP_MIN`). Ventana offseason más laxa (`OFFSEASON_GAP_MIN`, cap mayor).

Equipo controlado por usuario: propuestas swap interactivas en UI transferencias; IA auto-resuelve otros equipos.

### Player agency

`lib/season/playerAgency.ts` — tier A y superior (más piso valor transferencia) pueden **exigir** movimientos en ventanas transferencias y offseason.

| Demanda | Disparador |
|---|---|
| **leave** | Mejor org / rol starter en otro sitio (preferencias rankeadas) |
| **call-up** | Prospect academy quiere slot roster principal |
| **depart-academy** | Atascado en academy de org débil |

Demandas soft-scored (estrella org, starter vs academy, región, bono vacante). Usuario puede **override** (jugador se queda); IA auto-honra cuando gap es grande. Caps por equipo y liga-wide evitan colapso de roster (`AGENCY_MAX_LEAVES_*`).

### Mercado free-agent y academy

`lib/season/faMarket.ts` — pool inactivo liga-wide y fills de vacantes roster.

**Ruta lifecycle jugador** (`lib/season/playerLifecycle.ts`):

```
Starter activo → (racha underperform) → Academy (tenure 2–4a) → FA (4a) → Retirado si unsigned
```

- **Checkpoints de demotion** tras cada split y offseason post-Worlds — no retiro forzado por edad.
- **Tenure academy** varía por valor jugador (depth débil sale antes; estrellas permanecen más).
- **Cap fin de año** graduados academy (`ACADEMY_GRADUATE_CAP_PER_YEAR`) evita olas sincronizadas.
- **Fills vacantes** prefieren returnees scored sobre rookies; FA abierto reemplaza cuando roster tiene placeholders `__vacancy__`.
- **Mercado IA** — rookies academy mid-split, firmas FA, stash academy de FAs deseables, releases; límites usuario en firmas FA manuales y demotes.

**News feed** — cada movimiento etiquetado (`fa-sign`, `agency-leave`, `became-fa`, `retired`, …) para dashboard y archivos Hall.

### Bucle anual franquicia / Realities

`lib/season/franchise.ts` — líneas temporales multi-año.

1. Jugar año `SeasonState` (splits + internacionales).
2. `buildSeasonHistoryEntry` → archivo Hall (placements, carreras, transferencias, meta drift).
3. Offseason: `runOffseasonLifecycle` (envejecimiento, demotions, pool drift, chemistry drift), `offseasonTransferPass`, expiración agency, reasignación coach, `createSeason` año siguiente con rosters evolucionados.
4. **Bulk years** opcional (`lib/season/bulkYears.ts`) — sim N años en worker con ETA (`lib/sim/simEta.ts`) y feed resultados en vivo.

Persistencia: desktop SQLite normaliza realities + historial Hall por fila ([`desktop-sqlite-storage.md`](desktop-sqlite-storage.md), [`performance-franchise-saves.md`](performance-franchise-saves.md)).

### Flags de realismo de temporada (opt-in)

| Flag config | Comportamiento |
|---|---|
| `formDrift` | Modificador hot/cold por equipo desde resultados; badge trending |
| `playerDevelopment` | Drift tier entre splits (regresión a media) |
| `playerTransfers` | Ventanas transferencias + mercado offseason |
| `metaAdaptability` | Patch shifts premian equipos adaptables (necesita `patchShift`) |
| `clutchFactor` | Tilt rondas eliminación + momentum serie |
| `regionTides` | Resultados internacionales reordenan seeding inter-liga |
| `patchShift` | Nudges meta entre fases en tiers/sinergias/counters |
| `liveMeta` | W/L campeón dentro de evento alimenta micro meta shifts |
| `variancePreset` | Dial upset `chalky` / `balanced` / `chaotic` |

Todos mapean vía `tagSeason` → `TournamentTeam.form` / `.clutch` → `tournamentSeriesContext` → `starRatingBias`.

---

## Realismo competitivo — datos reales y formatos

### Equipos y jugadores reales

| Asset | Fuente | Script |
|---|---|---|
| Nombres + logos equipos | LoL Esports API + `realTeamNames.json` empaquetado | `npm run fetch-team-logos` |
| Handles starters | Leaguepedia vía `fetch-player-names` (~68%+ cobertura, acumula) | `npm run fetch-player-names` |
| Pool rookie / sub | Nombres bucketed por lane | `npm run fetch-rookie-names` |
| Nombres coaches | Empaquetado + fetch | `npm run fetch-coaches` |

`lib/season/realTeams.ts` — fetch live recorre standings de liga newest-first hasta 10 equipos; snapshot empaquetado para botón "Real Names" offline. `realPlayersForTeam()` mapea handles a lanes cuando hay; si no, `playerNames.ts` genera handles auténticos por posición.

**Continuidad franquicia** — `Player.id` estable (`makePlayerId`) sobrevive transferencias y años; Hall agrega por id (`lib/season/historyRecords.ts`).

### Formatos de torneo reflejados del pro play

| Estructura real | Análogo DraftSim |
|---|---|
| Fearless draft en series | `fearless` en serie / config temporada |
| Bo1 groups, Bo3/Bo5 playoffs | `SeriesFormat` por ronda vía `FormatOverrides` |
| Swiss + Buchholz | formato `swiss`, tiebreakers en `tournament.ts` |
| Worlds play-in → groups | `createWorldsPlayIn` + `createWorldsMain` |
| Byes region #1 MSI / Worlds | `swissByeTeamIds`, `firstStandUsesSeedByes` |
| First Stand play-in #2 | Seis seeds #2 clasifican; seeds #1 bye in |
| Groups 4×5 → bracket 8 equipos | default groups-playoffs-de Worlds |
| Double elim + bracket reset | toggle `trueGrandFinal` |

**No simulado:** coin toss elección de lado (app usa loser-blue o `SideRule` configurable), reglas rematch más allá de evitación Swiss, y delays broadcast FPTV.

### Standings, placements y Hall

- **Standings en vivo** — `computeStandings`, vidas triple-elim, records Swiss en motor torneo.
- **Placements temporada** — `splitResults`, `intlResults` en `SeasonState`; etiquetas derivadas en `lib/season/placements.ts` (play-ins-exit vs playoffs-exit vs finalist).
- **Hall of Seasons** — résumés `SeasonHistoryEntry`: campeones, arrays placement completos, All-Pro, `playerCareers`, logs transferencias, rosters por fase, meta inicio vs fin, matrices H2H, dynasty tiers, rivalidades.
- **Tablas de carrera** — kills cross-season, MVPs, títulos regionales, apariciones/títulos internacionales por `playerId`.
- **Exports** — XLSX (`historyExport.ts`), `.draftsim-reality.json`, códigos `REAL1:` ([`reality-sharing.md`](reality-sharing.md)).

### Premios y narrativa

Equipos All-Pro, MVPs split, Rookie of the Year, elites S+, power rankings (`lib/season/powerRankings.ts`), generador season story (`lib/season/seasonStory.ts`), notas temporada equipo desde ratings de partida.

---

## Sistemas de meta

Baseline curado a mano en `lib/championMeta.ts`:

- **172** metas campeón con tiers por lane `S+` … `D`
- **340+** pares sinergia explícitos (`CHAMPION_SYNERGIES`)
- **250+** relaciones hard counter (`lib/data/hardCounters.json`)
- **11** perfiles comp identity para sim + scouting UI

### Overrides y persistencia

| Mecanismo | Código |
|---|---|
| UI editor tier | Mapa `MetaOverride`, export `META1:` |
| Librerías sinergia / counter | UI Pairings Library → overrides reemplazan defaults |
| Toggle maestro | `metaEnabled` — IA/sim tratan todas las lanes tier igual |
| Fallback off-position | `getEffectiveTier()` — mediana tier lane − 1 notch; injugable → D |
| Espejo meta desktop | Tabla SQLite `meta_config` |

### Meta randomizer

`lib/metaRandomizer.ts`:

- **Randomización tier** — fill bucket por lane con proporciones realistas `S+/S/A/B/C/D` (±25% jitter por run); baseline off-meta C/D excluido de pools.
- **Randomización sinergia / counter** — conteos plausibles por arquetipo; puede exportarse como parte de preset meta.
- **Integración temporada** — `patchShift` y `liveMeta` derivan tiers/sinergias/counters en `SeasonMetaSnapshot`; `initialMeta` vs `currentMeta` muestra drift anual en archivos.

### Chemistry (pares jugador)

Separado de sinergias campeón: `lib/chemistry.ts` tira valores de pares almacenados en primer uso roster, más nudges bot-duo y same-region. Deriva en años franquicia (`driftSynergiesOverTime`, pasos preseason). Alimenta bias lane en sim solo como diferencia blue−red.

---

## Documentación relacionada

| Doc | Tema |
|---|---|
| [`systems.md`](systems.md) | Versión en inglés de esta referencia |
| [`players-feature.md`](players-feature.md) | Rosters, tiers, validación pool fit |
| [`player-identity-and-franchise.md`](player-identity-and-franchise.md) | IDs, carreras, hub realities |
| [`season-realism.md`](season-realism.md) | Seed byes, detalle flags realismo |
| [`tournament-mode.md`](tournament-mode.md) | Formatos bracket, códigos TOUR1 |
| [`desktop-sqlite-storage.md`](desktop-sqlite-storage.md) | Schema DB, migración |
| [`performance-franchise-saves.md`](performance-franchise-saves.md) | Optimizaciones saves largos |

## Fuerza de equipo con medias estrellas

La fuerza del equipo va de 1 a 5 en pasos de 0,5. `normalizeTeamStars` centraliza el redondeo y `deriveStar` calcula la fuerza del roster principal. Tres jugadores S y dos A producen 4,5 estrellas; la academia no interviene. Configuración, generación, tarjetas actuales e históricas, simulación, rankings de fuerza y atractivo en el mercado comparten este contrato. El sesgo clásico sigue siendo nueve puntos por estrella: una diferencia de media estrella aporta 4,5 puntos antes de los demás modificadores. La simulación interactiva y el worker conservan los decimales, incluso al intercambiar lados.

Los objetivos iniciales regionales incluyen medias estrellas sin alterar su fuerza total objetivo. Los tiers de jugadores y las valoraciones de entrenadores mantienen sus escalas propias. Los guardados enteros siguen siendo compatibles y los resultados históricos terminados no se recalculan. Consulta el [diseño técnico](technical-design.md#half-star-team-strength) para el mapa de consumidores y compatibilidad.
