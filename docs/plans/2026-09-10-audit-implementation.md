# Auditoría y correcciones

Autorización: revisión y corrección integral solicitada por el usuario, con crítico independiente e iteraciones hasta 9/10 en todas las áreas, siempre que la evidencia lo justifique.

## Enfoque

Conservar formatos y partidas existentes. Corregir primero las fronteras de confianza y persistencia, después reducir carga y separar responsabilidades. Una reescritura completa aumentaría el riesgo de regresiones; limitarse a cambios cosméticos dejaría los fallos de datos sin resolver.

## Trabajo y aceptación

1. Actualizar dependencias vulnerables y reemplazar `next lint` por ESLint. Añadir typecheck y CI. Verificar audit, lint, tipos y build.
2. Unificar codec comprimido en `lib/shareCodec.ts`, limitar bytes de entrada/salida, validar temporadas/torneos antes de mutar el store. Probar datos truncados, corruptos y round trips.
3. Reparar cola SQLite: serializar, esperar operaciones en vuelo, conservar fallos para reintento y bloquear cierre si no guarda. Recuperar apertura tras fallo transitorio. Verificar con inyección de fallos y escrituras demoradas.
4. Implementar atomicidad compatible con conexión SQL real y evitar escribir snapshots inalterados. No usar BEGIN/COMMIT independientes sobre el pool del plugin.
5. Limpiar worker ante fallos, clonación y timeout. Separar carga de pantallas con importación dinámica y extraer responsabilidades de módulos grandes.
6. Activar CSP de Tauri compatible con sus hashes de scripts estáticos, IPC, imágenes y worker. Validar build y, si el entorno lo permite, ejecución real.
7. Repetir revisión crítica con resultados reales y registrar notas, comprobaciones y limitaciones en `docs/audit-2026-09-10.md`.

## Estado inicial

Crítico: rendimiento 6, seguridad 5, optimización 6, estructura 5, calidad 6, pruebas/fiabilidad 6. Pruebas: 1140 pasan, 3 timeout con concurrencia por defecto. TypeScript sin errores. npm audit: 13 alertas (1 crítica). `training/` preexistente no rastreado, fuera de los cambios.

## Cierre

Los siete pasos se completaron. Quinta revisión del crítico: 9/10 en las seis áreas. Resultados, evidencias, límites y propuestas en [el informe](../audit-2026-09-10.md).
