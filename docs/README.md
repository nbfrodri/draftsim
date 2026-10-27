# Documentación técnica de DraftSim

Esta documentación distingue contratos implementados de propuestas de evolución. Las notas de versión registran los cambios publicados; los planes y auditorías conservan su contexto histórico. Los resultados de CI y el estado de publicación deben consultarse en la ejecución correspondiente de GitHub.

## Recorridos de lectura

| Objetivo | Documentos |
|---|---|
| Instalar o actualizar la aplicación | [Instalación (ES)](installation.es.md), [installation (EN)](installation.md) |
| Comprender la arquitectura | [Diseño técnico](technical-design.md) |
| Modificar temporadas y premios | [Dominio e invariantes](domain-contracts.md), [sistemas de juego](systems.es.md) |
| Trabajar con guardados y recuperación | [Persistencia y recuperación](persistence-and-recovery.md) |
| Cambiar navegación o simulación asíncrona | [Interacción y ejecución](interaction-and-execution.md) |
| Desarrollar, diagnosticar y publicar | [Desarrollo y publicación](development-and-release.md) |

## Referencias especializadas

- [Plan de rankings por evento, estadísticas de campeones e historial SS](plans/2026-10-17-event-player-rankings.md) — implementado: rankings por rol, tablas de picks/bans e historial SS; incluye verificaciones y límites de compatibilidad.

- [Plan de integración histórica completa del tier SS](plans/2026-10-17-ss-history-integration.md) — propuesta para timeline, carreras, cards y rating de equipos.

- [Tipografía de la aplicación](typography.md).

- [Sistemas de juego en inglés](systems.md) y [en español](systems.es.md).
- [Formatos de torneo](tournament-mode.md), [plantillas](players-feature.md) e [identidad de jugadores](player-identity-and-franchise.md).
- [Realismo de temporadas](season-realism.md) y [Title Playground](title-playground.md).
- [Intercambio de realidades](reality-sharing.md).
- [Esquema SQLite](desktop-sqlite-storage.md) y [rendimiento de franquicias](performance-franchise-saves.md).
- [Instrucciones para contribuir](../AGENTS.md).

Los documentos de `plans/` y las auditorías registran objetivos y decisiones de un momento concreto; no certifican por sí solos el comportamiento actual. Si una descripción contradice el código, debe investigarse y actualizarse junto con las pruebas pertinentes.

## Versiones

- [v1.15.2: guardados más ligeros de la temporada en curso](releases/v1.15.2.md).

- [v1.15.1: comparación de trayectorias SS rediseñada, insignia SS alineada y guardados más ligeros](releases/v1.15.1.md).

- [v1.15.0: carga por partes de guardados grandes y comparación de trayectorias SS](releases/v1.15.0.md).

- [v1.14.2: cambios del bulk contra la ventana en blanco en Windows, insignia SS y cuadrícula de líderes por rol](releases/v1.14.2.md).

- [v1.14.1: guardados bulk más seguros con registro de fallos, selector de evento en dos pasos e insignia SS](releases/v1.14.1.md).

- [v1.14.0: guardados bulk más ligeros, estadísticas de evento históricas y récords SS](releases/v1.14.0.md).

- [v1.13.0: selectores de estadísticas de evento con logos de región, split y evento](releases/v1.13.0.md).

- [v1.12.0: estadísticas de evento y SS plegables, roles, regiones y equipos unificados](releases/v1.12.0.md).

- [v1.11.0: rankings por evento, picks/bans e historial SS mejorado](releases/v1.11.0.md).

- [v1.10.0: historial SS por fase, Career History y cards históricas](releases/v1.10.0.md).

- [v1.9.2: icono alineado y sin badge de tier en la cabecera SS Race](releases/v1.9.2.md).

- [v1.9.1: SS Race plegable e integrada con el dashboard; README breve](releases/v1.9.1.md).

- [v1.9.0: titulares y aspirantes SS en directo](releases/v1.9.0.md).
- [v1.8.0: tier SS, evolución del meta y tarjetas de equipos](releases/v1.8.0.md).

- [v1.3.1: pantalla de carga centrada al continuar y abrir vistas](releases/v1.3.1.md).

- [v1.3.0: rosters compartidos, logos históricos y resultados de compañeros](releases/v1.3.0.md).

- [v0.9.1: logos y badges de Latest Matchday](releases/v0.9.1.md).

- [v0.9.0: presentación de torneos, destacados y tipografía](releases/v0.9.0.md).
- [v0.8.0: historial de movimientos, medias estrellas y fiabilidad](releases/v0.8.0.md).
