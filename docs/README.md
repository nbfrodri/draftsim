# Documentación técnica de DraftSim

Esta documentación describe el código de la versión 0.8.0. Distingue contratos implementados de propuestas de evolución. Los resultados de CI y el estado de publicación deben consultarse en la ejecución correspondiente de GitHub.

## Recorridos de lectura

| Objetivo | Documentos |
|---|---|
| Comprender la arquitectura | [Diseño técnico](technical-design.md) |
| Modificar temporadas y premios | [Dominio e invariantes](domain-contracts.md), [sistemas de juego](systems.es.md) |
| Trabajar con guardados y recuperación | [Persistencia y recuperación](persistence-and-recovery.md) |
| Cambiar navegación o simulación asíncrona | [Interacción y ejecución](interaction-and-execution.md) |
| Desarrollar, diagnosticar y publicar | [Desarrollo y publicación](development-and-release.md) |

## Referencias especializadas

- [Tipografía de la aplicación](typography.md).

- [Sistemas de juego en inglés](systems.md) y [en español](systems.es.md).
- [Formatos de torneo](tournament-mode.md), [plantillas](players-feature.md) e [identidad de jugadores](player-identity-and-franchise.md).
- [Realismo de temporadas](season-realism.md) y [Title Playground](title-playground.md).
- [Intercambio de realidades](reality-sharing.md).
- [Esquema SQLite](desktop-sqlite-storage.md) y [rendimiento de franquicias](performance-franchise-saves.md).
- [Instrucciones para contribuir](../AGENTS.md).

Los documentos de `plans/` y las auditorías registran objetivos y decisiones de un momento concreto; no certifican por sí solos el comportamiento actual. Si una descripción contradice el código, debe investigarse y actualizarse junto con las pruebas pertinentes.

## Versiones

- [v0.9.1: logos y badges de Latest Matchday](releases/v0.9.1.md).

- [v0.9.0: presentación de torneos, destacados y tipografía](releases/v0.9.0.md).
- [v0.8.0: historial de movimientos, medias estrellas y fiabilidad](releases/v0.8.0.md).
