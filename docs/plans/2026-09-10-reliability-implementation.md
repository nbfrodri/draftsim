# Implementación del diseño aprobado

Diseño: [fiabilidad](2026-09-10-reliability-design.md). Autorizado por el usuario.

1. Estado durable en lib/persistenceStatus.ts, colas SQLite/JSON y PersistenceNotice; probar concurrencia, fallo y reintento.
2. Copias SQLite consistentes en src-tauri/src/backups.rs, adaptador lib/backups.ts y RecoveryPanel; retención y restauración con pruebas nativas sobre archivos temporales.
3. Analizador lib/importPreview.ts y confirmación en RealitiesHub; extraer acciones de importación conservando firmas y validación.
4. Catálogo empaquetado y caché versionada en communityDragon; probar ausencia de red, timeout y corrupción.
5. Checkpoints de simulación y extracción de acciones por dominio, con pruebas de pausa/reanudación y persistencia.
6. Benchmark reproducible con franquicias largas; registrar mediciones antes de decidir virtualización.
7. CI de build/instalador y script smoke en cuenta Windows desechable; nunca ejecutar instalación en el perfil personal.
8. Foco, teclado y movimiento reducido; pruebas E2E de flujos.

Validación de integración: npm run lint, npm run typecheck, npm test, npm run build, cargo test --manifest-path src-tauri/Cargo.toml --lib --locked y npm run desktop:build. Conservar formatos anteriores, hacer copias preventivas antes de reemplazo y documentar checks que requieran entorno externo.

## Evidencia

Evidencia de la reanudación: [estado y verificaciones](2026-09-10-reliability-progress.md). La pausa original se conserva como registro histórico.
