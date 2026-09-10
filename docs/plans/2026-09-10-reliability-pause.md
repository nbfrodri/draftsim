# Pausa de implementación — DraftSim

Fecha: 2026-09-10. Trabajo pausado por petición del usuario. No reanudar automáticamente.

## Autorización y alcance

El usuario aprobó el diseño de las nueve mejoras de fiabilidad, rendimiento y accesibilidad. Después pidió guardar el estado en un .md y terminar los procesos.

Diseño: `docs/plans/2026-09-10-reliability-design.md`.
Plan: `docs/plans/2026-09-10-reliability-implementation.md`.
Hay numerosos cambios anteriores a esta tarea en el árbol de trabajo: no revertirlos ni atribuirlos todos a esta implementación. No se han creado commits.

## Procesos

- Se interrumpió el benchmark `npx tsx scripts/benchmark-franchise.mts` (sesión 46826); terminó con código 1 por interrupción.
- Último avance observado: 36 de los primeros 50 años; no llegó al primer checkpoint de exportación. No hay fixtures completas de 50/100 años ni mediciones finales.
- Tras la petición de terminar procesos, se comprobó Win32_Process: no quedaban procesos node/cargo/rustc/link/cmd cuya línea de comandos correspondiera al benchmark o al proyecto.
- No se instalaron aplicaciones ni se modificaron partidas personales para las pruebas.

## Cambios realizados, pendientes de validación integrada

1. **Enlace de Windows:** `src-tauri/build.rs` usa una única vía de manifiesto en MSVC, conservando Common Controls v6 para los tests. La compilación completa e instaladores pasaron antes de implementar las mejoras siguientes.
2. **Estado de guardado:** `lib/persistenceStatus.ts`, colas en desktopStorage/desktopSqliteStorage y `components/PersistenceNotice.tsx`: pendiente, guardando, guardado, error, hora y tamaño; lectura de tamaño SQLite + WAL mediante comando nativo.
3. **Copias y recuperación:** `src-tauri/src/backups.rs`, `lib/backups.ts`, `components/RecoveryPanel.tsx`. Snapshot con VACUUM INTO, validación de integridad/JSON, retención reciente/diaria/semanal, copia externa elegida por diálogo, importación externa, restauración con archivo preventivo y diario para interrupciones. Copias automáticas tras guardado y preventivas antes de borrar/reemplazar realidades. Navegador: copias separadas en localStorage con tratamiento de cuota.
4. **Vista previa:** `lib/importPreview.ts`; diálogos en RealitiesHub, DraftApp y SeasonHistoryView para realidades, temporadas, torneos e historial. Validación compartida y detección de cambios del destino durante la revisión.
5. **Datos offline:** catálogo empaquetado `lib/data/champions.json` (241 entradas obtenidas de la fuente existente), caché versionada y timeout en communityDragon/realTeams. Arranque con catálogo local; actualización para un lanzamiento posterior. Script de actualización `scripts/bundle-champions.mts`.
6. **Simulación:** checkpoints persistidos `bulkYearJobs`, botón para reanudar años pendientes, pausa al finalizar el partido actual y tratamiento de fallos de guardado. Controles en BulkYearsControl/PersistenceNotice.
7. **Store:** acciones extraídas a `store/actions/imports.ts`, `franchise.ts`, `simulation.ts`, conservando fachada `useDraftStore`. Algunas funciones compartidas siguen en draftStore y se inyectan como dependencias.
8. **Instalador:** script `scripts/windows-install-smoke.ps1`, fixture y verificador Python. CI compila instaladores y prepara smoke de instalación, reapertura, migración de JSON antiguo y reinstalación. Solo permite runner GitHub hospedado desechable. Acepta instalador anterior opcional para probar actualización real.
9. **Accesibilidad:** IDs únicos en Modal, foco inicial seguro en acciones peligrosas, retirada de captura global de Enter, reduced motion y foco visible global.

## Evidencia real

- Antes de las mejoras: `npm run desktop:build` pasó; MSI y EXE generados. No demuestra que el estado actual completo compile.
- TypeScript pasó tras integrar las acciones y corregir incidencias de importación/catch. Repetir al reanudar, pues hubo cambios posteriores en pruebas y scripts.
- Una ejecución intermedia de `npm run lint` pasó; repetir sobre el estado final.
- Grupo de pruebas: importPreview, versionedDataCache, persistenceStatus, backups, realityStore y desktopSqliteStorage: **20 pruebas / 6 archivos pasaron**.
- simulationResume: **2 pruebas pasaron** (reanudar años pendientes y fallo de guardado sin dejar busy activo).
- Rust: **5 pruebas pasaron**, incluyendo snapshot con WAL, rechazo de corrupción, retención e interrupción de restauración; las otras dos son pruebas de persistencia/IPC preexistentes.
- Parser PowerShell del script de instalación: sin errores sintácticos. **No se ejecutó el instalador ni el CI remoto.**
- No se ha ejecutado la suite completa ni los E2E de las funciones nuevas.

## Pendientes y revisión necesaria

1. Ejecutar lint, typecheck, toda la suite Vitest, build web, tests Rust y build desktop sobre el estado actual. Corregir cualquier regresión.
2. Añadir/ejecutar E2E de importación (cancelar/aplicar/conflictos), recuperación (incluido bloqueo de carga), teclado y offline. Verificar diseño visual en navegador.
3. Profundizar en restauración completa: reapertura real, rollback, errores de copia/rename/espacio, bloqueo de cierre y escrituras concurrentes. Revisar el diario ante todas las interrupciones y los archivos originales retenidos.
4. Revisar retención de copias externas (la implementación actual replica, pero no aplica allí toda la política local), validación de versiones/contenido, posibles IDs de copia coincidentes y poda de copias corruptas. Revisar límite de crecimiento de archivos preventivos.
5. Revisar cobertura de copias preventivas en operaciones destructivas distintas de borrar/reemplazar realidades; todavía no está completada para todos los flujos.
6. Revisar simulación: todos los caminos largos, errores, cambios de realidad, checkpoint después de reapertura, persistencia del estado de pausa y cancelación del trabajo actual. Las pruebas actuales de reanudación usan helpers controlados; no equivalen a E2E real.
7. Completar modo offline web si se requiere reabrir la página sin servidor/red: todavía no hay service worker para el shell. Validar actualización/caché y datos esenciales en un WebView real sin red.
8. Retomar benchmark de 50 y 100 años. El script actual solo exporta al llegar a 50/100; añadir checkpoints intermedios y manejo de interrupción antes de repetir para evitar perder el avance. Medir Hall, cambios de realidad, heap y simulación; aún no hay presupuestos finales ni virtualización justificada.
9. Ejecutar smoke en cuenta/runner Windows desechable. Reinstalar la misma versión no demuestra actualización desde una versión anterior: suministrar `PreviousInstaller` para ese caso. Revisar las rutas y fixture de migración en ejecución real.
10. Completar auditoría de accesibilidad de flujos y lector de pantalla; los cambios de Modal/CSS no equivalen a una auditoría completa.
11. Revisar caracteres dañados por codificación de PowerShell/Python en documentación y textos nuevos (algunos quedaron como `?`). Usar UTF-8 correctamente o escapes Unicode; no reemplazar operadores `?` globalmente.
12. `scripts/extract-store-actions.cjs` es un script temporal de transformación ya aplicado: **no volver a ejecutarlo**. Revisarlo y retirarlo cuando no haga falta, sin tocar otros archivos preexistentes.

## Cómo continuar

Leer este documento y el diseño, revisar `git diff`, ejecutar checks concretos y completar los pendientes. El diseño está aprobado: no volver a pedir su aprobación. Mantener las limitaciones de las verificaciones explícitas y no declarar las nueve mejoras terminadas antes de comprobarlas.

## Reanudacion posterior

El usuario solicito reanudar el 2026-09-10. Estado actualizado en [reliability-progress](2026-09-10-reliability-progress.md). Este documento conserva la fotografia de la pausa original.
