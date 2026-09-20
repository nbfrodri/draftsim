# Desarrollo, diagnóstico, pruebas y publicación

Esta guía explica cómo trabajar en DraftSim y qué evidencia se necesita para publicar una versión. No certifica una ejecución concreta de CI. Consultar también [AGENTS.md](../AGENTS.md), el [diseño técnico](technical-design.md) y la [guía de persistencia](persistence-and-recovery.md).

## 1. Preparar el entorno

Windows requiere Node.js 22.12 o posterior, npm, Rust stable con toolchain MSVC, Visual Studio Build Tools con desarrollo C++ y Windows SDK, y WebView2. Las versiones de paquetes se resuelven mediante el lockfile: para una instalación reproducible usar `npm ci`.

```powershell
npm ci
npm run desktop:dev
```

`desktop:dev` ejecuta Tauri, que inicia el frontend mediante `beforeDevCommand`. `npm run dev` permite trabajar solo con el navegador. Sus datos no son los de SQLite desktop, por lo que una prueba de guardado web no sustituye la nativa.

No modificar manualmente `.next/`, `out/`, el worker empaquetado ni `src-tauri/target/`. Son resultados de build. No regenerar catálogos o datasets como efecto secundario de una corrección ordinaria.

## 2. Mapa de comandos

| Comando | Finalidad |
|---|---|
| `npm run build:worker` | Empaquetar el worker de simulación |
| `npm run dev` | Worker y servidor Next de desarrollo |
| `npm run build` | Worker y exportación estática |
| `npm run preview` | Servir el frontend exportado |
| `npm run typecheck` | Comprobar TypeScript |
| `npm run lint` | Comprobar reglas de código |
| `npm test` | Suite Vitest |
| `npm run test:e2e` | Playwright sobre `out/` |
| `npm run test:desktop` | Tests Rust con lockfile |
| `npm run check:version` | Coherencia de versiones |
| `npm run test:release` | Tests del verificador de versiones |
| `npm run check` | Versiones, tests de release, lint, tipos, unitarios y build |
| `npm run desktop:build` | Generar NSIS y MSI con Tauri |

`npm run check` no incluye toda prueba posible: E2E, instalación nativa y auditoría de dependencias son controles adicionales. No debe describirse como validación completa de un instalador.

## 3. Elegir verificaciones según el cambio

Una corrección de regla necesita tests de dominio. Una modificación de guardado necesita errores, reintentos, hidratación y transacciones. Una nueva interacción necesita comprobar teclado y foco. Un cambio de empaquetado necesita un build nativo y pruebas del instalador.

```powershell
npm test -- lib/season/rosterNews.test.ts lib/season/franchise.test.ts
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:desktop
```

En Windows puede usarse un canal instalado con `PLAYWRIGHT_CHANNEL`, por ejemplo `msedge`. La configuración del proyecto lee esa variable. Se debe declarar qué navegador se probó, no asumir que sustituye todas las variantes WebView2.

Después de cambiar la aplicación, reconstruir antes de E2E: Playwright sirve `out/`, no los archivos TypeScript en vivo. Si solo cambió el test, puede reutilizarse la exportación correspondiente al mismo código de aplicación.

## 4. Datos de prueba

No probar restauración, reinstalación o migración sobre AppData personal. `scripts/create-install-fixture.mts` genera la realidad de prueba y `verify-install-save.py` verifica la base resultante.

`scripts/windows-install-smoke.ps1` exige un runner GitHub-hosted desechable y rechaza datos de aplicación preexistentes. Instala, abre, comprueba navegación y guardado, cierra normalmente, reabre y reinstala. El parámetro opcional de instalador anterior permite otro escenario; sin proporcionarlo, una reinstalación de la misma versión no prueba actualización desde todas las versiones antiguas.

Las carpetas de resultados son diagnósticos, no código fuente. No deben añadirse accidentalmente al commit. Lo mismo se aplica a trabajo local ajeno como `training/`.

## 5. Diagnóstico por síntomas

| Síntoma | Investigación inicial |
|---|---|
| Saving prolongado | Codificación, cola, número de escrituras y cachés invalidadas |
| Datos ausentes al reabrir | Commit real, error de persistencia y ruta AppData |
| Historial vacío | Carga perezosa frente a borrado confirmado |
| Movimiento repetido en offseason | Sello del evento, frontera y rollover |
| Esc cierra demasiado | Listeners duplicados, prioridad y repetición de tecla |
| Meraki fetch failed | Petición de catálogo y fallback, separadamente del guardado |
| Warning de dimensiones de gráfico | Visibilidad y tamaño del contenedor |
| CDP ECONNREFUSED | Proceso WebView y argumentos reales de depuración |

Para un guardado lento, registrar tamaño y forma de la partida: años, torneos simulados y realidades cargadas. El tiempo total no identifica la fase lenta. Antes de modificar SQL, comprobar si el coste está en JSON o en trabajo redundante.

No añadir logs que vuelquen partidas completas o rutas personales en CI. Los informes útiles incluyen fase de operación, duración, número de filas y errores concretos.

## 6. Prueba automatizada del WebView

`scripts/desktop-navigation-smoke.mjs` usa Playwright con `connectOverCDP` contra el WebView de la aplicación instalada. No lanza una página web equivalente: interactúa con la ventana Tauri y comprueba estado SQLite mediante IPC.

El arranque del proceso de test pasa `--edge-webview-switches=--remote-debugging-port=9333`. WebView2 documenta que el argumento del proceso anfitrión se procesa después de las opciones del entorno. Se usa únicamente en el runner de prueba, no como puerto permanente del producto. Referencia: [AdditionalBrowserArguments de Microsoft](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2environmentoptions.additionalbrowserarguments).

La prueba cubre Esc en raíz, modal, tecla mantenida, confirmación anidada y retorno de foco; después guarda, sale de temporada y consulta el estado persistido. Los errores de conexión se registran aparte de los fallos de interacción.

Si CDP no conecta, no se ha probado Esc. Antes de reintentar, revisar los argumentos de `msedgewebview2.exe`, el proceso padre y el error de conexión. Aumentar un timeout sin saber si el puerto se abrió puede consumir más tiempo sin aportar evidencia.

## 7. Pipeline de CI

`.github/workflows/ci.yml` ejecuta dos trabajos:

| Trabajo | Controles |
|---|---|
| Interfaz y simulación, Ubuntu | Dependencias, versiones, lint, tipos, unitarios, auditoría, build y E2E |
| Windows | Dependencias, versiones, build de instaladores, tests Rust, fixture e instalación/reapertura/reinstalación |

Tauri llama al build frontend mediante `beforeBuildCommand`. No es necesario duplicarlo antes de `desktop:build` dentro del mismo trabajo.

La prueba de instalación exige un NSIS y un MSI generados. El smoke automatiza el instalador NSIS; la existencia del MSI prueba generación del paquete, no la ejecución de una instalación MSI independiente. No ampliar la afirmación más allá de la evidencia.

Los diagnósticos nativos se conservan como artefactos. Un fallo posterior al build puede significar que los instaladores se generaron, pero no superaron validación. Eso debe impedir su publicación como versión validada.

## 8. Versionado

La versión debe coincidir en `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `Cargo.lock` y `tauri.conf.json`. El hook `version` llama a `scripts/desktop-version.mjs --sync`.

```powershell
npm version 0.6.0 --no-git-tag-version
npm run check:version
npm run test:release
```

La versión del ejemplo no es una instrucción para reutilizar un tag existente. Elegir una versión nueva según el estado del repositorio. No incrementar versiones para cualquier cambio ordinario si no se está preparando una publicación.

## 9. Procedimiento de release

1. Revisar branch, remote, identidad Git, cambios y tags existentes.
2. Separar cambios autorizados de archivos locales ajenos; stagear rutas concretas.
3. Sincronizar metadatos y ejecutar comprobaciones pertinentes.
4. Crear commit con la identidad configurada. No añadir coautores ni atribuciones no solicitadas.
5. Hacer push y comprobar CI del SHA exacto.
6. Crear un tag nuevo que coincida con los metadatos y subirlo.
7. Seguir `.github/workflows/release.yml` hasta su resultado final.
8. Verificar que el release público corresponde al tag y contiene NSIS y MSI de la versión prevista.

El workflow de tags `v*` valida la versión, reutiliza CI y publica los instaladores primero en un borrador, que se hace público tras adjuntar ambos. Un release público no se sobrescribe silenciosamente; un fallo de carga del borrador puede reintentarse tras diagnosticarlo.

Push correcto significa disparador enviado, no instaladores publicados. Verificar commit, tag, ejecución y assets. Si falla CI, corregir la causa antes de reintentar; no saltarse las pruebas para producir una release verde aparente.

Las notas deben describir cambios de comportamiento, compatibilidad y limitaciones relevantes. No anunciar firma de código o actualizaciones automáticas sin configuración y artefactos verificados.

## 10. Mantener la documentación

El [índice](README.md) organiza documentos de referencia. Los planes y auditorías conservan contexto histórico; no deben usarse como certificado de implementación actual.

Al cambiar un contrato, actualizar código, tests y la sección correspondiente. Revisar enlaces relativos, ejemplos de comandos y diferencias web/desktop. Evitar duplicar detalles que cambian con frecuencia en muchos documentos: el código y el lockfile siguen siendo la autoridad sobre versiones exactas.

Una mejora propuesta debe estar identificada como propuesta y tener criterios de aceptación. La documentación no debe presentar una intención como una característica ya entregada.


## Caché y actualización desde 0.6.0

El job Windows utiliza `Swatinem/rust-cache` fijado a un commit, con `cache-workspace-crates: false`. Guarda caché en `main`; los tags pueden restaurarla. Un acierto ahorra compilación de dependencias, pero el build normal, tests Rust y pruebas del instalador siguen siendo obligatorios. Un fallo o un miss no autoriza reutilizar instaladores de otra revisión.

CI descarga el NSIS público 0.6.0 y verifica su SHA-256 fijado antes de ejecutarlo. El runner desechable prueba JSON legado → SQLite 7 → formato 8, reapertura y copia previa a la migración. El MSI se genera como artefacto; la instalación ejercitada usa NSIS. Esta cobertura prueba esa ruta concreta, no todas las versiones antiguas posibles.

Para perfilar sin partidas personales: `npx tsx scripts/benchmark-save-pipeline.mts current`. El informe en `.benchmarks/` mide el frontend con commit simulado; no atribuirlo a latencia nativa. Para medir IPC y disco reales, activar Save diagnostics en Backups y exportar el buffer local.


La validación previa de 0.7.0 está registrada en [CI 35533598227](https://github.com/nbfrodri/draftsim/actions/runs/35533598227): instalación NSIS, actualización desde 0.6.0, migración y copia anterior verificadas, reapertura y navegación nativa sin errores. El tag vuelve a ejecutar el workflow completo antes de publicar sus propios artefactos.
