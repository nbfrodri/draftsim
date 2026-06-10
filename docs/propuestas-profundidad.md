# Propuestas de profundidad — DraftSim

**Dirección decidida (junio 2026):** llevar el juego hacia un *simulador de drafts cada vez más inteligente*. Completar primero el núcleo draft + simulación + IA + torneo. La capa de management de esports (temporadas, fichajes) queda para más adelante porque supone un cambio de alcance grande.

Estados: ✅ implementado · 🔨 en implementación · 📋 backlog corto plazo · 🔮 futuro (management)

---

## Núcleo draft / simulación / torneo

### 1. ✅ IA estratégica real
**Qué:** la IA elige su plan de juego con `chooseAIStrategy()` (ya implementado en `lib/sim/strategies.ts` pero sin usar — la IA juega siempre con `DEFAULT_STRATEGY`), y además **adapta su estrategia entre juegos de una serie**: si perdió yendo a scaling, en el siguiente juego presiona early; si ganó, mantiene el plan con variaciones.
**Por qué:** el sistema de estrategias tiene 10+ palancas (game plan, macro, weakside, riesgo...) que hoy solo usa el humano. Cada partido contra la IA se sentirá distinto y la serie tendrá sensación de rival que aprende.
**Anclaje:** `chooseAIStrategy`, `strategyFit`, `SeriesAIContext` (ya rastrea identidades/picks rivales para el draft).

### 2. ✅ Personalidades de draft por equipo
**Qué:** perfiles de drafteo asignables a cada equipo (meta-slave, comfort-first, counter-picker, cheese/pocket-picks, arquitecto de sinergias...) implementados como multiplicadores sobre los componentes etiquetados de `scorePick`/`scoreBan` + parámetros de sampling (temperatura, top-N).
**Por qué:** hoy todos los equipos IA draftean idéntico (la dificultad es un dial global). Con personalidades, los equipos tienen carácter draftero reconocible y banear/anticipar se vuelve más interesante.
**Anclaje:** el scoring ya está descompuesto en componentes etiquetados — un perfil es un vector de pesos.

### 3. ✅ Selección de lado en series
**Qué:** regla competitiva estándar — el perdedor del juego anterior elige lado para el siguiente. El humano elige por UI; la IA elige con heurística.
**Por qué:** el lado azul tiene ventaja real en el simulador (`BLUE_SIDE_BONUS` + prioridad de draft), así que la elección tiene peso táctico de verdad. Decisión barata que añade textura entre juegos.

### 4. ✅ Forma y notas de actuación por jugador
**Qué:** cada jugador recibe una **nota 1–10 por partido** derivada de su actuación simulada (KDA, oro, participación, resultado de lane), y una **forma** que evoluciona entre partidos (racha caliente/fría con regresión a la media) y modula su rendimiento en la simulación y el valor de comfort en el draft.
**Por qué:** los jugadores hoy son estáticos (tier + pools). La forma crea narrativa emergente ("el midlaner está en llamas este torneo") y habilita MVP de torneo, equipo All-Pro, premios.
**Anclaje:** el simulador ya genera KDA por pick por juego; falta derivar nota y acumular.

### 5. ✅ Meta vivo durante el torneo
**Qué:** toggle "meta evolutivo" en la creación de torneo: entre rondas, los tiers de campeones se mueven de verdad según presence/winrate del propio torneo. Lo que dominó en grupos llega priorizado/baneado a playoffs.
**Por qué:** el `MetaShiftPanel` del recap ya *proyecta* estos movimientos (`projectTier`) pero solo como visualización a posteriori. Hacerlo real cambia la estrategia de drafteo a lo largo del torneo.
**Anclaje:** `projectTier`/`computeMetaMovers` (recap), `metaSnapshot` en `TournamentState`.

### 6. ✅ Adaptación in-game (pivote estratégico)
**Qué:** checkpoint estratégico hacia el minuto ~20: el equipo que va claramente perdiendo puede pivotar de plan (forzar picks, jugar a barón, splitpush a la desesperada), con eventos visibles en la timeline.
**Por qué:** hace los comebacks legibles ("cambiaron el plan y les funcionó") y da uso a las estrategias a mitad de partida.
**Anclaje:** la timeline ya está descompuesta en fases (`lib/sim/timeline/`) tras el refactor de junio 2026.

---

## Backlog corto plazo

### 7. 📋 Torneos reproducibles y compartibles por seed
**Qué:** correr un torneo entero con semilla fija (el RNG sembrado ya existe en `lib/rng.ts`) y exportarlo como archivo "torneo + seed" compartible y re-jugable ("¿y si hubiera baneado Yasuo?").
**Anclaje:** `createRng`, `encodeTournament`, precedente de export/import del meta.

### 8. 📋 Scouting con información imperfecta
**Qué:** modo donde los pools y tendencias rivales no se ven de inicio: se revelan viendo sus partidos del torneo o con informes de scouting limitados por ronda.
**Por qué:** convierte el fearless draft en un juego de información real. Pospuesto porque cambia el paradigma de UI (hoy toda la información es visible).

---

## Futuro — capa management (pospuesto deliberadamente)

### 9. 🔮 Modo temporada / circuito (franchise lite)
Liga regular → playoffs → varios splits con persistencia: palmarés, head-to-head, estadísticas de carrera por jugador. Casi todos los formatos ya existen (`round robin`, `groups+playoffs`, `swiss`, `double elim`, `tournamentHistory`); falta la capa que los encadena y da memoria. **Es el multiplicador de todo lo demás** — forma, personalidades y meta vivo se vuelven 10× más significativos con continuidad.

### 10. 🔮 Off-season: mercado de fichajes + desarrollo de jugadores
Presupuesto por equipo, valor de jugador (tier + forma + edad), IA que ficha según huecos de roster, jóvenes que crecen y veteranos que declinan. El ciclo narrativo de un management game (dinastías, rebuilds). El sistema más caro de la lista.

### 11. 🔮 Parches entre splits con notas generadas
Empaquetar `randomizeMeta()` (ya hace el ~80% del trabajo) como "Parche X.Y" con notas legibles ("Jinx: S → A") entre splits del modo temporada. Obliga a readaptar pools; las personalidades reaccionarían distinto.
