# Plan: identidad visual en torneos, contexto de partidos y resúmenes de temporada

Estado: implementado, verificado y empaquetado localmente.

## 1. Objetivo y alcance

Mostrar de forma consistente logos de equipos, regiones, campeones y posiciones, junto con seeds y badges cuando corresponda. Corregir la presentación del KDA sin muertes, la falta de separación en Rookie of the Year y la posición variable de AI Difficulty al crear una temporada.

Este trabajo amplía la presentación existente y respeta `docs/typography.md`: Inter para interfaz y datos, Cinzel exclusivamente para la marca. Conservar los cambios locales anteriores de tipografía, estrellas Swiss y filtro de roles de Rookie Class, además de cualquier archivo ajeno como `training/`. No cambiar reglas de simulación, ganadores, premios ni probabilidades para resolver problemas visuales. Este plan no incluye publicar otro release.

## 2. Hallazgos comprobados

- `components/tournament/bracket/StreaksPanel.tsx`: Momentum desactiva el logo en las rachas de equipos; On fire/Slumping utiliza nombres de equipo en texto. `lib/streaks.ts` ya proporciona teamId para resolver la identidad correcta.
- `components/tournament/bracket/LiveChampionMetaPanel.tsx`: Meta Shifts presenta alias, rol y cambios de tier como texto, aunque el catálogo de campeones y los componentes de iconos ya existen.
- `components/tournament/recap/TeamBreakdownPanel.tsx`: Team Champion Pools ya presenta el seed, pero carece de logo en su encabezado de equipo.
- `components/tournament/recap/NotableGames.tsx`: el modelo de presentación conserva nombres de lados por partida. Al incorporar logos debe mantener esa resolución, porque los equipos intercambian lados dentro de la serie.
- `components/tournament/recap/AwardsPanel.tsx`: los premios contienen teamId, lane y, cuando existen, playerId/playerName. Algunos roles ya usan LaneIcon; falta completar la identidad del equipo y la región, sin duplicar iconos.
- `components/tournament/recap/PostTournamentRecap.tsx`: SummaryCard y la presentación del campeón son puntos adicionales de integración.
- `components/tournament/replay/MatchReplayModal.tsx`: el resumen de serie devuelve ratio nulo con cero muertes; el detalle de partida solo muestra el ratio cuando deaths > 0. Además, el agregado se inicializa a cero, lo que exige distinguir datos observados de datos ausentes.
- También hay formatos de KDA independientes en `components/betweenGames/MVPCard.tsx`, `components/player/PlayerHoverCard.tsx` y `components/SeasonHistoryView.tsx`.
- `components/SeasonDashboard.tsx`: MatchdayStageTag oculta explícitamente `regular`. `store/draftStore.ts` asigna regular a partidos sin bracket ni groupId, por lo que no distingue adecuadamente Swiss o play-ins. `SeasonMatchdayResult` es un resumen efímero, no persistido.
- `SeasonRecapPanel`, en el mismo archivo, coloca PlayerNameLink y TeamNameLink de Rookie of the Year sin un contenedor que garantice separación. El margen vertical del enlace inline no crea una nueva línea.
- `components/OffseasonView.tsx` ya usa algunos logos y roles: completar los titulares estadísticos, filas y resúmenes que faltan, en lugar de añadir iconos repetidos a los que ya los tienen.
- `components/SeasonSetup.tsx`: AI Difficulty es un label con select dentro del bloque que también contiene opciones de temporada y otros controles; su posición depende de cómo se envuelven esas opciones.

## 3. Reglas comunes de identidad y presentación

1. Reutilizar `TeamNameLink`, `TeamLogoLink`, `TeamIcon`, `LeagueIcon`, `LaneIcon`, `PlayerNameLink`, `TeamStars` y el estilo de `components/season/TierChip.tsx`. No añadir dependencias ni descargar datasets nuevos.
2. Resolver equipos mediante ID dentro del torneo mostrado. El seed será el seed de ese torneo, no la clasificación actual ni el seed doméstico de otra competición. Conservar el concepto de seed existente; no recalcularlo desde standings.
3. Mostrar región solo cuando exista procedencia válida. `TournamentTeam` no incluye actualmente una región: añadir un campo opcional tipado para copiarla desde SeasonTeam al crear el torneo, y validarlo en importación. Para torneos antiguos asociados a una temporada, permitir resolverla por teamId y pertenencia comprobada a esa temporada. No tomarla de otra realidad ni deducirla únicamente del nombre.
4. Los torneos independientes sin región siguen funcionando: mostrar su logo/icono disponible y omitir el logo regional desconocido. No crear una región ficticia. Un seed ausente o inválido tampoco se transforma en #0.
5. Usar el roster de la serie/torneo y los IDs del premio para representar jugadores históricos. Los fichajes posteriores no deben cambiar el equipo o rol del premiado.
6. Si una imagen falla, conservar texto e icono de respaldo sin deformar la fila. Reservar dimensiones para los logos, mantener nombres accesibles y evitar botones/enlaces interactivos anidados en encabezados desplegables.
7. Preparar un índice de equipos por torneo mediante memoización. Pasar identidades resueltas a los paneles; evitar escanear todas las temporadas o suscribirse al estado global completo para cada fila.

## 4. Tareas de implementación

### A. Componentes compartidos y procedencia

Archivos existentes: `components/team/TeamNameLink.tsx`, `components/team/TeamLogoLink.tsx`, `components/season/TierChip.tsx`, `lib/tournament.ts`, `lib/season/engine.ts`, `lib/importValidation.ts`.

- Extender las primitivas existentes o crear un pequeño componente de identidad de torneo, si hace falta, en `components/tournament/TournamentTeamIdentity.tsx` (nuevo). Debe poder representar logo, nombre, seed opcional y región opcional sin repetir lógica en cada panel.
- Añadir región opcional al snapshot de equipo de torneo y conservarla al crear/exportar/importar. Revisar también las rutas que añaden equipos directamente al playoff o procedentes del play-in.
- Para tiers de campeón reutilizar el aspecto de TierChip con semántica explícita de tier de meta. No convertir el valor en una valoración de jugador ni modificar su cálculo.

Aceptación: equipos ficticios, logos reales, regiones desconocidas y torneos importados se representan sin errores; same-name teams de distintas regiones no se mezclan.

### B. Completar todos los paneles de torneo

| Sección | Archivo | Resultado visible |
| --- | --- | --- |
| Momentum | `components/tournament/bracket/StreaksPanel.tsx` | Logo y seed en rachas, On fire y Slumping; mantener los iconos de rol existentes. |
| Meta Shifts | `components/tournament/bracket/LiveChampionMetaPanel.tsx` | Icono y nombre del campeón, icono de rol y badges de tier anterior → nuevo, conservando ronda y motivo. Resolver alias con el catálogo existente. |
| Team Champion Pools | `components/tournament/recap/TeamBreakdownPanel.tsx` | Logo junto al nombre y seed ya existente; conservar el comportamiento de expandir/contraer. |
| Notable Games | `components/tournament/recap/NotableGames.tsx` | Logos y seeds de ambos equipos, incluido el ganador correcto tras cambios de lado; conservar enlaces al replay y gameIdx. |
| Individual Awards y Tournament MVP | `components/tournament/recap/AwardsPanel.tsx` | Nombre del jugador con rol, identidad visual de equipo y región conocida; mantener rating, contexto y estadísticas. Aplicar también a All-Pro donde ya corresponda. |
| Tournament Summary y Champion | `components/tournament/recap/PostTournamentRecap.tsx` y encabezado en `components/TournamentDashboard.tsx` | Equipo campeón identificado por logo/nombre/seed y región conocida; iconos de rol en cualquier mención de jugador. |

Hacer una pasada final por encabezados, tablas, replay y paneles auxiliares del torneo para que no queden representaciones de las mismas identidades como texto desnudo por accidente. Mantener los tamaños compactos y no duplicar el logo regional en cada subelemento cuando ya está claro en su fila.

Aceptación: todas las secciones solicitadas están cubiertas, también en competiciones internacionales; no aparecen nuevos All-Pro específicos de eventos internacionales.

### C. Perfect KDA coherente en toda la aplicación

Nuevo helper puro propuesto: `lib/formatKda.ts`, con pruebas en `lib/formatKda.test.ts`.

- Con datos registrados y cero muertes, mostrar exactamente **Perfect KDA**. Mantener visible el detalle kills/deaths/assists.
- Con muertes positivas, mantener el ratio `(kills + assists) / deaths` y la precisión que corresponda al contexto.
- Con datos ausentes, una partida sin jugar o un resumen sin participación registrada, conservar el estado de dato no disponible. No convertir ceros de inicialización en un KDA perfecto.
- Un 0/0/0 explícitamente registrado en una partida jugada también es Perfect KDA según la regla solicitada; un 0/0/0 inventado por ausencia no lo es.
- En series y carreras, calcular el ratio sobre los totales registrados. Añadir conteo/cobertura por jugador al agregado de replay cuando haga falta; no presentar un total incompleto como una serie perfectamente documentada.
- Aplicar la presentación compartida al recap por partida, resumen de serie, MVP de partida, perfiles y Hall. Auditar el resto de divisiones por deaths; los algoritmos de ratings y premios permanecen numéricos y no se cambian.

Archivos confirmados: `components/tournament/replay/MatchReplayModal.tsx`, `components/betweenGames/MVPCard.tsx`, `components/player/PlayerHoverCard.tsx`, `components/SeasonHistoryView.tsx`. Revisar consumidores restantes de KDA durante la implementación.

Aceptación: 8/0/12 muestra Perfect KDA; 8/2/12 muestra 10.0 KDA en una vista de un decimal; ausencia de recap no se confunde con perfección; sin Infinity, NaN ni textos duplicados como Perfect KDA KDA.

### D. Contexto completo y obligatorio en Latest Matchday

Nuevo helper puro propuesto: `lib/tournamentMatchContext.ts`, con `lib/tournamentMatchContext.test.ts`. Nuevo componente de badges propuesto: `components/tournament/MatchContextBadges.tsx`.

- Separar dimensiones: competición/fase exterior (por ejemplo play-in), formato/etapa (regular, grupos, Swiss, playoffs), ronda y cuadro. No comprimirlas en un único string `stage` ambiguo.
- Ampliar `SeasonMatchdayMatch`/`SeasonMatchdayRegion` en `store/types.ts` con contexto opcional tipado. Capturarlo en `simSeasonMatchday`, en `store/draftStore.ts`, antes de simular cada encuentro o de que la fase avance automáticamente.
- Swiss: calcular el balance **antes de la ronda** usando resultados de rondas anteriores, nunca el balance posterior al partido. Con emparejamientos excepcionales de distinto balance, mostrar los dos balances; no inventar un cuadro común. Un bye no debe aparecer como una partida jugada normal.
- Identificar play-in mediante el contexto de la temporada y las rutas existentes del engine. No clasificar únicamente por una coincidencia textual en el nombre.
- Resolver rondas eliminatorias con la estructura real del bracket: tamaño, byes, feeds, cuadro y ronda. Un round numérico no significa lo mismo en fase regular y playoffs.
- Conservar winners, losers, last-chance, consolation, grand final y reset cuando existan. Separar el número de ronda del nombre de la eliminatoria.
- El nombre del evento no impone el formato: si Worlds está configurado con grupos, mostrar grupos; si está configurado como Swiss, mostrar Swiss. Lo mismo para MSI y Global Cup.
- Sustituir `MatchdayStageTag` en `components/SeasonDashboard.tsx` y reutilizar el helper cuando las vistas del torneo necesiten el mismo contexto. Evitar dos cálculos contradictorios de ronda o balance.

Ejemplos de aceptación (copy de interfaz en inglés):

| Encuentro | Badges esperados |
| --- | --- |
| Winter round robin, jornada 4 | Regular Split · Matchday 4 |
| Clasificatorio internacional, segunda ronda | Play-In · Round 2, más su cuadro si corresponde |
| MSI Swiss, cuarta ronda, equipos 2-1 | Swiss Stage · Round 4 · 2-1 |
| Swiss, equipos 1-2 | Swiss Stage · Round 4 · 1-2 |
| Worlds por grupos | Group Stage · Group A · Matchday N |
| Playoffs de doble eliminación | Playoffs · Winners/Losers · Round N, y final cuando corresponda |
| Global Cup con 32 equipos en eliminación | Knockout · Round of 32; después Round of 16, Quarterfinals, Semifinals y Final |
| Torneo legado sin suficiente contexto | Badge general verificable, con número de ronda solo si es fiable; nunca ocultar la fila ni inventar la etapa. |

Cada resultado tendrá al menos un badge de contexto. Si una región solo muestra clasificados del play-in, conservar también el contexto de Play-In. No utilizar una etiqueta global de jornada para asumir que todas las regiones están en la misma etapa.

### E. Offseason, Season Recap y Rookie of the Year

Archivos: `components/OffseasonView.tsx`, `components/SeasonDashboard.tsx` (`SeasonRecapPanel` y chips), y comprobación del resumen archivado equivalente en `components/SeasonHistoryView.tsx`.

- Completar logos en líderes de temporada, equipos destacados, campeón y resultados; roles junto a jugadores y regiones junto a su identidad regional.
- Revisar las filas de roster principal, academia, altas/bajas y estadísticas alrededor de Finalize Offseason. Reutilizar lo existente, sin duplicar iconos ni modificar el botón, sus guardas o el rollover.
- Representar los datos del año que acaba de terminar; no sustituir el equipo del resumen por el destino del jugador tras el mercado.
- Rookie of the Year: usar una estructura con filas explícitas o `flex-col` y `gap` para separar rol, jugador, equipo y estadísticas. El espacio no debe depender de un margen aplicado a un span inline. Probar nombres largos y vista estrecha.

Aceptación: ningún nombre de jugador queda pegado al equipo; los premios conservan participación y atribución histórica; Finalize Offseason mantiene su comportamiento y no introduce duplicados en noticias del mercado.

### F. AI Difficulty estable en New Season

Archivo: `components/SeasonSetup.tsx`.

- Separar visualmente el grupo de opciones activables de la fila de ajustes AI Difficulty / Spectate or Follow a Team, usando una rejilla responsive con alineación explícita de labels y controles.
- Mantener alturas de control consistentes. Centrar el selector dentro de su celda/fila; no desplazarlo mediante márgenes negativos ni offsets dependientes del estado de las opciones.
- Mantener sus valores, label accesible y orden de tabulación. Los cambios de opciones no deben alterar su alineación relativa con los controles de la misma fila.

Aceptación: activar/desactivar opciones no descuadra la dificultad; layout correcto a 1440, 1024 y en el preview estrecho de 480 px, sin superposición ni scroll horizontal de la página.

## 5. Orden de trabajo y comprobaciones

1. Introducir resolución compartida de identidad y procedencia opcional; probar export/import y compatibilidad antigua.
2. Implementar los helpers puros de KDA y contexto de partido con casos de borde antes de integrar sus vistas.
3. Completar paneles de torneo y Latest Matchday; probar especialmente lados intercambiados, seeds y balances Swiss previos.
4. Completar Offseason/Season Recap y separar la fila de dificultad.
5. Revisar visualmente en anchos de escritorio y estrecho, incluyendo imágenes rotas, nombres largos, datos ausentes y controles con teclado.
6. Actualizar documentación y ejecutar verificaciones finales.

Pruebas de dominio:

- Nuevo formatter: KDA perfecto, ratio finito, cero explícito frente a ausencia, agregados parciales y series con cambios de lado.
- Nuevo contexto: todos los formatos de `lib/tournament.ts`, transiciones regular → playoff y play-in → main event, byes, grupos desiguales, Swiss con balances distintos, double/triple elimination, stepladder y reset.
- Identidad: equipos homónimos de diferentes regiones, roster histórico frente al actual, seed ausente y región opcional en import/export.
- Conservar regresiones existentes en `lib/tournament.test.ts`, `lib/awards.test.ts` y las pruebas de MVP internacional. No recalcular premios para acomodar los nuevos iconos.

Pruebas de interfaz:

- Añadir `e2e/tournament-presentation.spec.ts` (nuevo) con fixtures que hagan visibles Momentum, Meta Shifts, pools, Notable Games y premios. Verificar logos, seeds, tiers, roles, accesibilidad y enlace a la partida correcta.
- Ampliar `e2e/season-ui-navigation.spec.ts` con los badges por etapa y captura antes de avanzar; extender la cobertura de offseason y separación de Rookie of the Year.
- Fixture de recap con 0 muertes por partida y por serie, más un registro legado sin KDA.
- Comprobar alineación de AI Difficulty con distintas combinaciones de opciones y anchos mediante bounding boxes y capturas.

Comandos previstos: pruebas unitarias focalizadas, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` y `npm run test:e2e` (build previo y navegador instalado; localmente puede usarse `PLAYWRIGHT_CHANNEL=msedge`). Un instalador local, si se solicita al implementar, se genera con `npm run desktop:build -- --ci`; compilar no equivale a validar interacciones en el WebView nativo.

## 6. Compatibilidad, documentación y cierre

- Latest Matchday es efímero: sus nuevos campos no requieren migrar SQLite.
- La región opcional de equipos de torneo es una ampliación aditiva: validar el campo nuevo y aceptar guardados sin él. No reescribir masivamente archivos históricos ni usar partidas personales para pruebas.
- Mantener IDs, callbacks de navegación, guardas de operaciones y comportamiento de Escape. Las pruebas de presentación no deben debilitar las de persistencia.
- Actualizar `docs/interaction-and-execution.md` con la matriz de iconos y badges; `docs/domain-contracts.md` con procedencia, KDA y balances previos; `docs/typography.md` si se añaden patrones reutilizables; README solo para cambios relevantes de uso.
- Registrar en este plan los archivos finales, comprobaciones ejecutadas, capturas revisadas y límites de verificación. No presentar las pruebas previstas como ya realizadas.

## 7. Implementación y verificación

Implementados `TournamentTeamIdentity`, `MatchContextBadges`, `formatKda` y `tournamentMatchContext`, junto con las integraciones previstas en torneos, Latest Matchday, offseason, Season Recap y New Season. Se conserva el trabajo local anterior de tipografía, estrellas Swiss y filtros de rookies.

Decisiones concretas:

- `leagueId` opcional en equipos de torneo y `seasonSubStage: "play-in"` opcional en clasificatorios nuevos. El lector acepta archivos anteriores. La identidad regional de torneos antiguos solo se completa para presentación desde su temporada propietaria.
- El resumen de serie muestra cobertura parcial de KDA. En agregados de carrera antiguos no se puede probar que 0/0/0 sea observado: sigue siendo desconocido. Los registros explícitos de partidas con 0/0/0 sí muestran Perfect KDA.
- Los contextos se guardan únicamente en el resumen efímero Latest Matchday. Las rondas de eliminación se calculan para presentación sin alterar el cálculo de presión del simulador.
- Los badges se colocan encima de cada marcador para no comprimir los nombres. No se cambia el formato competitivo a partir del nombre MSI/Worlds/Global Cup.

Verificación completada: 59 pruebas focalizadas; suite completa de 1.398 pruebas unitarias en 115 archivos; typecheck y lint correctos; 54 pruebas de navegador correctas, incluidas cinco nuevas para paneles/replay, Latest Matchday, alineación responsive, recaps sin KDA y offseason/rookie anual. Capturas revisadas: `tournament-perfect-kda.png`, `tournament-meta-shifts.png`, `season-control-alignment.png`, `rookie-year-spacing.png` y `latest-matchday-context.png`.

`npm run desktop:build -- --ci` completó el export estático y los dos paquetes Windows:

- `src-tauri/target/release/bundle/nsis/DraftSim_0.8.0_x64-setup.exe` (24.561.988 bytes).
- `src-tauri/target/release/bundle/msi/DraftSim_0.8.0_x64_en-US.msi` (25.894.912 bytes).

Son instaladores del trabajo local, no nuevos artefactos publicados en GitHub. No se instalaron sobre la aplicación del usuario ni se usaron sus guardados personales para pruebas.

Documentación actualizada: `docs/interaction-and-execution.md` y `docs/domain-contracts.md`. No se solicita publicar un release ni cambiar versión. El build local conserva 0.8.0. Las pruebas de navegador no acreditan una instalación ni una sesión del WebView nativo.

## 8. Refinamiento de cards y alineaciones

Aplicados los ajustes posteriores: badges de Latest Matchday centrados; identidades Swiss ancladas a los extremos; ganador de Notable Games centrado; Golden Road separado; Momentum con nombres reales, cards de jugadores y roles; cards de equipos en paneles de torneo. Franchise Timeline expande el detalle desde el nombre, sitúa el detalle a la izquierda y reserva la navegación al perfil para la card.

Se corrigieron dos casos detectados al verificar: jugadores de torneos independientes con pools vacíos no abrían su card, y el cambio de foco del nombre a una card podía cerrarla antes del clic de navegación. Las cards de torneo conservan su roster y solo incorporan estadísticas de la temporada propietaria.

Verificación de este refinamiento: 38 pruebas focalizadas en cuatro archivos; lint correcto; compilación TypeScript y export estático correctos durante el build; suite completa de 56 pruebas de navegador correcta. Revisadas las capturas `momentum-team-card.png` y `latest-matchday-context.png`. Las pruebas incluyen navegación desde la card, alineación Swiss, centrado de badges/ganador y separación de Golden Road.

Build local final completado con `npm run desktop:build -- --ci`; sustituye los paquetes locales de la comprobación anterior:

- `src-tauri/target/release/bundle/nsis/DraftSim_0.8.0_x64-setup.exe` (24,563,820 bytes).
- `src-tauri/target/release/bundle/msi/DraftSim_0.8.0_x64_en-US.msi` (25,894,912 bytes).

Se mantiene la versión 0.8.0. No se publica un release ni se instala sobre los datos personales. La verificación de interacciones se realizó en navegador; generar los instaladores no equivale a probarlos en el WebView nativo.

## 9. Notable Games, Momentum y Meta Shifts

Refinamiento completado: Notable Games presenta métricas destacadas, equipos apilados, ganador y acción explícita de replay; Momentum separa rachas y forma en tres columnas responsive con escala de forma visible; Meta Shifts agrupa rol y tiers con centrado vertical. Los nombres de los emparejamientos Swiss usan un color neutro y el ganador tiene badge explícito. Se mantienen los colores de los grupos de balance y no cambia la simulación.

Verificación: lint correcto; TypeScript y export estático correctos durante `npm run desktop:build -- --ci`; 10 pruebas de interfaz correctas en `tournament-presentation.spec.ts` y `typography-rookies-swiss.spec.ts`. Incluyen navegación a replay, cards, distancia/centrado de rol y tiers, colores Swiss y vista estrecha. Revisadas capturas de Notable Games en escritorio/480 px, Momentum y Meta Shifts. Documentado en `docs/interaction-and-execution.md`.

Instaladores locales 0.8.0 regenerados (sustituyen los anteriores):

- `src-tauri/target/release/bundle/nsis/DraftSim_0.8.0_x64-setup.exe` (24,564,334 bytes).
- `src-tauri/target/release/bundle/msi/DraftSim_0.8.0_x64_en-US.msi` (25,894,912 bytes).

No se instalaron sobre la app del usuario. Las pruebas de interacción fueron de navegador, no una sesión nativa de WebView.

## 10. Ganador Swiss sin desplazamientos y nuevos destacados

Se sustituye el badge Winner por un fondo dorado tenue y una línea inferior dibujada dentro del slot mediante sombra interna. El tooltip y el texto accesible identifican al ganador sin añadir espacio. La prueba Swiss simula un partido y verifica que ambos slots conservan exactamente su altura.

Notable Games incorpora Most Kills, Closest Kill Score, Biggest Momentum Swing y Largest Gold Lead. Este último mide el máximo absoluto de las muestras de oro guardadas, no necesariamente la ventaja final ni la del ganador. La selección se extrae a `lib/notableGames.ts`; cada categoría conserva su enlace al partido y juego. Las definiciones y la compatibilidad con datos antiguos están documentadas en `docs/domain-contracts.md` y `docs/interaction-and-execution.md`.

Validación: seis pruebas unitarias del selector y diez pruebas de interfaz correctas; lint y TypeScript correctos. Cobertura de lados intercambiados, empates, cero observado, KDA parcial, datos antiguos ausentes y ventajas de oro del equipo perdedor. Revisadas las capturas de destacados y del ganador Swiss sin badge. La validación de interfaz se realiza en navegador y no implica una prueba nativa de instalación.

Build final completado con `npm run desktop:build -- --ci`, incluyendo Largest Gold Lead. Instaladores locales 0.8.0 regenerados:

- `src-tauri/target/release/bundle/nsis/DraftSim_0.8.0_x64-setup.exe` (24,564,556 bytes).
- `src-tauri/target/release/bundle/msi/DraftSim_0.8.0_x64_en-US.msi` (25,894,912 bytes).

## 11. Colores definitivos de resultados Swiss

A petición del usuario, los nombres de equipos ganadores se muestran en verde y los perdedores en rojo; antes de jugar ambos son neutros. Se eliminan el fondo y subrayado dorados de la iteración anterior. Los tooltips y textos accesibles identifican el resultado sin ocupar espacio. La tarjeta Biggest Momentum Swing explica que pp significa puntos porcentuales.

Lint y compilación TypeScript correctos. La prueba focalizada de Swiss pasa: verifica neutralidad previa, colores del resultado, ausencia de fondo/sombra y alturas sin cambios. Captura del enfrentamiento revisada. Prueba de interfaz en navegador, no instalación sobre la app del usuario.

Build local final completado con `npm run desktop:build -- --ci`. Paquetes 0.8.0 regenerados:

- `src-tauri/target/release/bundle/nsis/DraftSim_0.8.0_x64-setup.exe` (24,566,520 bytes).
- `src-tauri/target/release/bundle/msi/DraftSim_0.8.0_x64_en-US.msi` (25,894,912 bytes).


## 12. Identidad en partidos, MVP coherente y borde de First Stand

Replay y simulación comparten la presentación de equipos y participantes: logos de equipo, nombres de jugadores y roles en eventos, contribuciones/daño y Game MVP. Se respetan los lados de cada juego y las identidades registradas; una plantilla actual no sustituye a un jugador histórico conocido. Las referencias ambiguas mantienen su texto original. El daño del replay sigue siendo una estimación derivada de KDA, señalada en la interfaz.

El MVP mostrado dentro de los torneos de una realidad utiliza la misma selección que la temporada: MVP de la final para splits y MVP del campeón durante todo el evento para internacionales. Los torneos independientes conservan su criterio existente. No se reescriben premios archivados ni se modifica la persistencia.

First Stand limita el ancho de las cards y permite desplazamiento dentro del bracket, evitando que el main event recorte su borde derecho después de los play-ins. La prueba de layout usa una fixture con ambos paneles a 1024 y 1440 px.

Validación final: 1411 pruebas unitarias en 117 archivos; suite completa de 63 pruebas de navegador correcta; lint, TypeScript y export estático correctos. Las pruebas cubren identidades históricas, cambios de lado, MVP por ámbito, eventos en vivo y límites del bracket. Revisadas capturas de daño y Game MVP. Contratos y comportamiento documentados en `docs/domain-contracts.md` y `docs/interaction-and-execution.md`.

Build local completado con `npm run desktop:build -- --ci`, manteniendo 0.9.1:

- `src-tauri/target/release/bundle/nsis/DraftSim_0.9.1_x64-setup.exe` (24,564,688 bytes).
- `src-tauri/target/release/bundle/msi/DraftSim_0.9.1_x64_en-US.msi` (25,903,104 bytes).

Las interacciones se verificaron en navegador; no se instalaron los paquetes sobre los datos personales ni se verificó esta iteración en el WebView nativo. Este build local no publica un nuevo release.


## 13. Follow-up: alignment and visible right-hand frames

The earlier viewport-only assertion did not establish that the frame was visibly painted. Season cards now paint an inset overlay frame, constrain content overflow and omit content-visibility on the card itself. Added Worlds alongside First Stand, elimination-bracket fixtures and normal/hover screenshots. Replay player/team rows share flex center alignment.

Validation: three focused browser tests pass in installed Microsoft Edge; screenshots of the main-event frame in both states and replay identities inspected. Lint, TypeScript and the Windows desktop build pass. NSIS and MSI local 0.9.1 installers regenerated. This is browser verification and successful packaging, not a native WebView interaction test or a new published release.
