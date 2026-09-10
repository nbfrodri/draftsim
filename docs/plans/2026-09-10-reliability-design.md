# Fiabilidad y evolución de DraftSim

Fecha: 2026-09-10. Estado: diseño aprobado por el usuario; implementación reanudada el 2026-09-10. No representa funcionalidad implementada ni pruebas superadas.

## Alcance y enfoque

Implementar las nueve propuestas del informe de auditoría conservando partidas, formatos públicos y fachada Zustand. Los rangos originales son 2–4, 1–2, 2–4, 2–3, 1–2, 2–4, 3–5, 2–3 y 2–4 días; rendimiento con 50–100 años.

Recomendado: entregas incrementales con pruebas de transición, partiendo de persistencia e importación. Alternativa: extraer primero todo el store, con mayor superficie de regresión y recuperación retrasada. Alternativa: limitar recuperación a exportaciones manuales, con menor esfuerzo pero sin cumplir copias automáticas.

## Bases comprobadas

- `lib/desktopSqliteStorage.ts` serializa escrituras y conserva snapshots fallidos; `lib/desktopSqlite.ts` divide realidades e historiales.
- `lib/persistenceStatus.ts` y `components/PersistenceNotice.tsx` notifican errores y permiten reintentar; no muestran confirmación de guardado.
- `store/draftStore.ts` contiene importaciones, franquicias y simulación; `store/types.ts` ya define su interfaz.
- `lib/importValidation.ts` y `lib/shareCodec.ts` validan estructura y límites; `components/RealitiesHub.tsx` aplica importaciones directamente.
- `lib/communityDragon.ts` y `lib/season/realTeams.ts` consultan datos remotos; existen datos empaquetados en `lib/data`.
- `lib/season/bulkYears.ts` limita solicitudes a 50 años; dos avances permiten preparar 100 años sin elevar ese límite.
- `.github/workflows/ci.yml` comprueba Rust, pero cargo check no verifica enlace ni instaladores.

## Diseño y aceptación

### 1. Copias rotatorias y recuperación (alta)

Crear un servicio nativo de copias en `src-tauri/src/backups.rs` (nuevo), con operaciones expuestas desde `src-tauri/src/lib.rs` y adaptador `lib/backups.ts` (nuevo). Obtener snapshots SQLite consistentes mediante la API de backup o VACUUM INTO; no copiar el archivo principal con un WAL activo. Serializar con persistencia y restauración. Validar integridad, versión y contenido antes de incorporar una copia al catálogo. Escribir temporalmente y publicar por rename; limpiar retención solo después de confirmar la nueva copia.

Propuesta de retención: 5 recientes, 7 diarias y 4 semanales, deduplicadas; creación tras cambios confirmados, como máximo cada 15 minutos y antes de operaciones destructivas. No crear copias de un guardado fallido. Añadir destino externo opcional elegido por el usuario; una copia en el mismo dispositivo no protege frente a su avería. Si no está disponible, conservar copias locales e informar del fallo de réplica.

Restauración guiada desde RealitiesHub y desde el bloqueo de carga: fecha, tamaño, versión y resumen de contenido; confirmar reemplazo, crear copia preventiva, cerrar conexiones, restaurar atómicamente, reabrir y rehidratar. Rollback si falla. No podar la copia preventiva antes de verificar la restauración. En navegador usar snapshots separados con control de cuota y exportación externa explícita; distinguir limitaciones del almacenamiento del navegador.

Pruebas: corrupción/truncado, WAL con cambios, espacio insuficiente, destino desconectado, retención con reloj controlado, restauración y reapertura de franquicias generadas por el motor, protección de la última copia válida. No usar partidas personales sin necesidad.

### 2. Vista previa de importación (alta)

Extraer decodificación y validación a `lib/importPreview.ts` (nuevo). Producir un plan inmutable con formato, realidad, años, equipos, colisiones, sustituciones y avisos. Integrarlo en RealitiesHub y flujos de temporadas, historial y torneos. Aplicar exactamente el payload validado; volver a comprobar conflictos si cambia el store. Cancelar no modifica nada. Explicar rechazos por tamaño, compresión, versión, estructura o referencias inválidas sin mostrar trazas internas.

Verificar preview/aplicación, duplicados, cambio de realidad mientras está abierta, archivos inválidos y cancelación. Mantener compatibilidad con códigos y archivos antiguos válidos.

### 3. Datos esenciales sin conexión (alta)

Crear `lib/versionedDataCache.ts` (nuevo) y catálogo local completo a partir de las fuentes existentes. Arrancar con datos empaquetados validados; preferir caché válida compatible y actualizar en segundo plano con timeout, validación y publicación atómica. Conservar última versión buena ante errores o respuesta corrupta. Fijar la versión de datos de una simulación en curso. Iconos, retratos y audio remotos serán opcionales.

Verificar arranque de escritorio sin red y sin caché previa, creación y simulación, caché antigua/corrupta, timeout y actualización. Para web, cachear también el shell y assets esenciales si se exige reabrir sin conexión tras primera visita; un primer acceso web sin ninguna descarga no es posible.

### 4. Presupuestos de rendimiento (media)

Generar franquicias de 50 y 100 años con el motor real y semilla/repetibilidad donde exista soporte; registrar configuración y conservar fixtures anónimas de prueba. Crear script de medición en `scripts/benchmark-franchise.mjs` (nuevo), cubriendo Hall, cambio de realidad, heap antes/después de varios ciclos y simulación. Separar primera apertura y caché caliente; registrar p50/p95, hardware, versión y tamaño. Definir umbrales a partir de la línea base medible y justificar cualquier virtualización en `components/hall` o historiales. No declarar rendimiento de partidas reales a partir de objetos sintéticos repetidos.

### 5. Estado visible de guardado (media)

Ampliar persistenceStatus y PersistenceNotice a pendiente/guardando/guardado/error, última confirmación durable y tamaño medido. Solo marcar guardado tras finalizar la cola completa; escrituras nuevas mantienen pendiente. Para SQLite mostrar tamaño de base y WAL con etiqueta clara; para navegador bytes serializados. Exportaciones muestran su propia confirmación, sin actualizar la hora del autoguardado. Lectura accesible mediante status sin anuncios por cada mutación.

Probar escrituras solapadas, fallo/reintento, estado inicial, no confundir exportación con autoguardado y cierre con cola pendiente.

### 6. Cancelación y reanudación (media)

Definir estado persistente de trabajo por realidad: objetivo, años completados, checkpoint y estado pausado/error. Revisar simulación de partidos, torneos, temporadas y múltiples años. Cancelar en fronteras coherentes; no publicar resultados parciales del worker ni aceptar respuestas de un trabajo cancelado. Guardar temporadas completadas antes de confirmar pausa. Reabrir ofrece continuar el objetivo pendiente; nunca reinicia años completados. Si falla el guardado, conservar datos en memoria y bloquear continuación destructiva.

Probar cancelación durante partido, transferencia, cambio de año, error del worker, cierre/reapertura, cambio de realidad y fallo de escritura.

### 7. Acciones por dominio (media)

Crear `store/actions/franchise.ts`, `store/actions/imports.ts` y `store/actions/simulation.ts` (nuevos), con StoreGet/StoreSet existentes. Extraer cada bloque al desarrollar su dominio manteniendo nombres, firmas, orden de efectos y formato persistido. Mantener `useDraftStore` como fachada. Usar pruebas de transición de `lib/realityStore.test.ts`, `lib/persistenceLifecycle.test.ts` y nuevas pruebas de cancelación/importación. No convertir la extracción completa en requisito previo de todas las funciones.

### 8. Instalador y actualización nativa (media)

Ampliar CI Windows para ejecutar `npm run desktop:build` y conservar instaladores. Crear `scripts/windows-install-smoke.ps1` (nuevo) para instalación, inicio, cierre, reapertura y actualización sobre fixture de versión anterior. Ejecutar únicamente en runner/VM y cuenta desechables con perfil de datos verificado. Comprobar preservación de partidas, versión y migraciones. No instalar ni desinstalar en la cuenta personal actual. Probar actualización del instalador; un actualizador automático firmado requeriría canal y claves y no se presupone existente.

### 9. Accesibilidad (baja)

Revisar Modal y flujos completos de importación/restauración, realidad, Hall y simulación: foco inicial/restaurado, Tab/Shift+Tab, Escape cuando sea seguro, controles etiquetados, navegación sin ratón, contraste y reduced-motion. Añadir escenarios Playwright en `e2e/` y verificación manual con lector de pantalla en Windows. Documentar por separado automatización y comprobaciones manuales realmente realizadas.

## Orden y validación

1. Reparar enlace nativo y verificar build completo y tests Rust.
2. Introducir estado de persistencia como base compartida; desarrollar copias/recuperación y vista previa con extracción del dominio importación.
3. Garantizar catálogo offline y probar fallos remotos.
4. Completar checkpoints/cancelación y extracción de franquicias/simulación.
5. Generar franquicias largas, medir y optimizar según evidencia.
6. Automatizar instalación/actualización aislada y completar accesibilidad de los flujos.

Por entrega ejecutar pruebas específicas de fallo y transición; al integrar ejecutar lint, typecheck, Vitest, build web, pruebas Rust y build escritorio. E2E sobre datos de prueba aislados. Los checks remotos, uso de lector de pantalla y smoke en cuenta desechable solo se declararán completados si se ejecutan y queda evidencia. Ninguno de los resultados de la auditoría anterior prueba estas funciones nuevas.
