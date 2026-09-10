# Reanudacion de fiabilidad ? 2026-09-10

Reanudado por peticion explicita del usuario desde `2026-09-10-reliability-pause.md`. El diseno ya estaba aprobado. No se han creado commits ni instalado la aplicacion en el perfil personal. Los cambios previos del arbol de trabajo se conservan.

## Correcciones y evidencia

- Corregida la directiva `use client` que habia quedado detras de los imports al extraer acciones y bloqueaba el build de Next.
- Snapshots nativos con nombres reservados de forma exclusiva; la retencion cuenta solo copias validas y se aplica tambien al destino externo. Las copias corruptas no expulsan a la ultima copia valida.
- La restauracion conserva el diario si falla el rollback, registra de nuevo el pool SQLite y reintenta de forma acotada los bloqueos de archivo 32/33 de Windows. Pruebas sobre DB/WAL reales verifican restauracion, reapertura y preservacion de la version original.
- SQLite incorpora un marcador de version sin sobrescribir los marcadores existentes; se rechazan versiones incompatibles y se aceptan bases anteriores sin marcador en el catalogo de copias.
- Copias web: validacion de estructura y version y nombres sin colisiones. Una copia preventiva solicitada espera a la copia anterior y vuelve a capturar el estado actual.
- Las confirmaciones destructivas y de importacion en DraftApp y SeasonHistoryView esperan a la copia preventiva, muestran sus fallos y conservan el dialogo para reintentar.
- Tras restaurar se descartan las colas sustituidas antes de que los handlers de recarga puedan sobrescribir la restauracion.
- Dialogo de restauracion por encima del bloqueo de carga; boton de pausa por encima del overlay de simulacion. Foco y teclado comprobados en navegador y captura de recuperacion revisada visualmente.
- No se inicia otro avance de anos mientras haya errores de persistencia.
- El motor genera jugadores inactivos con equipo anterior vacio. La importacion ahora acepta ese valor legitimo y mantiene el rechazo de valores no string.
- Una fixture real de 39 anos contiene 3.233.273 nodos y 37,58 MiB de JSON. Los limites de realidades se ajustaron a 128 MiB y 12 millones de nodos para permitir franquicias largas. Otros tipos de importacion conservan sus limites; profundidad maxima 64 y restricciones de claves peligrosas sin cambios.
- Retirado `scripts/extract-store-actions.cjs`, ya aplicado y sin referencias ejecutables. Corregidos separadores danados de los textos nuevos y la codificacion del plan.

## Verificaciones realizadas

- Lint y TypeScript: correctos. Vitest: 1.215 pruebas en 92 archivos.
- Rust: 8 pruebas correctas, con WAL, corrupcion, version incompatible, retencion local/externa, colisiones, interrupciones, rollback y reapertura real.
- Build web correcto. `npm run desktop:build` correcto con MSI y EXE generados en `src-tauri/target/release/bundle`.
- E2E ejecutados con Edge y puerto 41731. Windows deniega 4173 y no esta instalado el Chromium de Playwright. Los 11 escenarios pasan, incluida la pausa/reanudacion tras recarga y la restauracion con una escritura fallida en cola.
- Smoke de instalacion y actualizacion en cuenta Windows desechable: no ejecutado. Tampoco comprobacion manual con lector de pantalla.

## Benchmark y como continuarlo

`npx tsx scripts/benchmark-franchise.mts` genera con el motor completo, semilla inicial 20260910 y exportacion atomica de un checkpoint por ano. Conserva el estado del generador aleatorio y reabre mediante las acciones publicas de importacion y cambio de realidad. `--verify-checkpoint` permite comprobar la reapertura sin continuar simulando; comprobado con 22 y 40 anos.

Salida: `.benchmarks/franchise/`, ignorada por Git. Playwright usa `test-results/playwright/`; las dos salidas ya no interfieren. La primera reejecucion se interrumpio tras 17 anos porque Playwright limpio el antiguo directorio compartido. Se reinicio en el directorio independiente.

Fixture de 50 anos terminada; generacion de 100 detenida el 2026-09-10 para cerrar la sesion. Mediciones: `measurements.json`; fixture: `franchise-50.json`; checkpoint reanudable: `checkpoint.json`.

`scripts/benchmark-franchise-ui.mts 50` (y luego `100`) mide importacion, apertura, Hall frio/caliente y heap tras GC. Utiliza un adaptador Storage en memoria para evitar que la cuota web impida medir una franquicia grande: no mide durabilidad ni rendimiento de SQLite. Resultados y presupuestos finales pendientes.

## Limites y trabajo todavia abierto

- Completar mediciones de 50/100 anos, comparacion de realidades y presupuestos; no se ha justificado ni aplicado virtualizacion nueva.
- Smoke en Windows desechable, con instalador anterior para probar una actualizacion real; reinstalar la misma version no prueba ese caso.
- Auditoria completa con lector de pantalla, contraste y todos los flujos: los E2E actuales no la sustituyen.
- Ensayos reales de falta de espacio y desconexion del destino externo; las pruebas de fallo actuales no abarcan toda la matriz del sistema operativo.
- Limitar el crecimiento de los archivos originales `before-restore-*` sin podar una restauracion aun no verificada; se conservan por seguridad.
- La proteccion preventiva de varios flujos esta en sus confirmaciones UI; revisar llamadas directas a acciones sincronas y otros reemplazos fuera de esos dialogos.
- No hay service worker del shell web: se ha probado arrancar con el servidor local accesible y los servicios remotos bloqueados, no reabrir una web sin servidor ni red. El escritorio lleva su shell empaquetado; falta ensayo de WebView aislado sin red.

No declarar las nueve mejoras completamente terminadas mientras permanezcan estos pendientes.

### Primera medicion de 50 anos

Generacion: 2.611,6 segundos; exportacion: 197,4 ms; JSON: 43.673.069 bytes; heap observado: 168.591.800 bytes. El runner Node usa la retencion web preexistente de 40 temporadas: la franquicia tiene 50 anos simulados, pero solo 40 entradas en el Hall. No extrapolar sus resultados a un Hall de escritorio con 50/100 archivos completos.

### Modo de historial de escritorio

Preparado `npx tsx scripts/benchmark-franchise.mts --desktop-history`, con salida separada `.benchmarks/franchise-desktop-history/`. Usa el mismo simulador y constructor de archivos; conserva hasta 200 entradas mediante el adaptador de acciones, sin abrir Tauri ni bases personales. Este modo requiere una generacion nueva: no puede recuperar las temporadas que la politica web ya podo. Todavia no se ha ejecutado de principio a fin. Para medir su UI, usar `BENCHMARK_DIRECTORY=.benchmarks/franchise-desktop-history` al ejecutar `benchmark-franchise-ui.mts`. La semilla del RNG se conserva, pero timestamps y contadores de identidad no garantizan equivalencia binaria entre ejecuciones.

### Medicion UI de 50 anos (40 archivos web)

Edge 152.0.4191.66, 1440x1000, movimiento reducido, dos copias de la franquicia generada. Importacion: 1.608 ms; primera apertura: 3.492 ms; Hall frio: 1.460 ms; Hall caliente (10 muestras): p50 198 ms, p95 224 ms; cambio entre realidades (10 muestras): p50 816 ms, p95 915 ms. Heap JS tras GC: 282,6 MB antes del ciclo del Hall, 283,3 MB despues, 280,1 MB tras los cambios de realidad; backing storage alrededor de 90,8 MB, medido por separado. No hubo errores de pagina. Son mediciones de interaccion y renderizado con Storage en memoria, mientras habia generacion de fixtures en segundo plano; no una certificacion de ausencia de fugas ni de durabilidad SQLite. Resultados reproducibles en `.benchmarks/franchise/ui-50.json`; captura `hall-50.png`.

El modo de historial de escritorio se inicio y posteriormente se detuvo, con ligas domesticas de eliminacion directa BO1 y torneos internacionales normales. Su configuracion se graba en las mediciones. No comparar sus tiempos de simulacion con el benchmark web de round-robin/playoffs sin considerar esa diferencia.

## Cierre de sesion: 2026-09-10

Se detuvieron los dos benchmarks tras indicar el usuario que la tarea estaba tardando demasiado. Se conservan los ultimos checkpoints completos en ambos directorios; el trabajo parcial del ano en curso puede haberse perdido al detener los procesos. No se lanzaran mas validaciones en esta sesion.

Correcciones guardadas: lint y typecheck correctos; 1.215 pruebas unitarias, 8 Rust y 11 E2E aprobadas; build de instaladores MSI y NSIS completado. No se han instalado, publicado ni creado commits. Los limites y trabajos abiertos de este documento siguen pendientes.
