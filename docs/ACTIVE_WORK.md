# Trabajo activo

**Última actualización:** 2026-09-11

## Estado

**Ninguna iniciativa activa.** Fase 8.7 (Cierre real de Collaboration) cerró
completa y se mergeó a `main` en el commit `887af1d` (PR #23) — los 5 bloques
verdes en CI real, incluido el propio `main` tras el merge. Cotizaciones queda
declarado READY en `ARCHITECTURE.md`. Detalle completo de los 5 bloques:
[`docs/archive/fase-8.7-cierre-collaboration.md`](archive/fase-8.7-cierre-collaboration.md).

## Deuda técnica conocida (sin resolver, intencional)

- **Capa genérica `base`/`conflict`:** el protocolo de conflictos por campo sigue
  siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos
  exista como segundo consumidor real, no antes.

## Siguiente paso

Ver `docs/ROADMAP.md` — **Engineering Hardening** es la siguiente iniciativa
comprometida, sin arrancar todavía. Auditar primero (`/serenata-iniciar-fase`)
antes de definir bloques.
