# Trabajo activo

**Última actualización:** 2026-09-11

## Estado

**Fase 8.7.1 (Serializar mutaciones de partidas contra Generar/Aprobar)
implementada, pendiente de push/PR/CI verde y merge a `main`.** Una auditoría
sobre el cierre de Fase 8.7 encontró que `flushPendingSaves` solo cubría cuatro de
las nueve vías de mutación de partidas (seleccionar producto, cambiar responsable,
alta/baja de fila e importar partidas quedaban fuera) y que ninguna escritura de
partidas revisaba el `estado` de la cotización dueña — se podía seguir editando,
creando, borrando o importando partidas de una cotización ya `APROBADA`/`CANCELADA`.
Corregido con un guard transaccional (`FOR SHARE` sobre `cotizaciones`) en
`patch_item_cotizacion`/`upsert_items_cotizacion`/`delete_item_cotizacion` (nueva) +
las cinco vías que faltaban ahora pasan por `trackMutation`. Trabajo hecho en la
rama `claude/epic-davinci-hdimmg`: tipos, lint y unit tests (428) en verde, y el
critical mockeado (`tests/e2e/critical/`, incluidos 8 casos nuevos) verde localmente
— el test live nuevo (orden peligroso Aprobar-vs-edición) no se pudo correr en este
entorno por falta de credenciales de `serenata-erp-test`; queda para el job `live`
de CI real antes de mergear. Bitácora completa:
[`docs/archive/fase-8.7.1-estado-guard-partidas.md`](archive/fase-8.7.1-estado-guard-partidas.md).

Fase 8.7 (Cierre real de Collaboration) sigue cerrada y mergeada a `main` en el
commit `887af1d` (PR #23). Detalle:
[`docs/archive/fase-8.7-cierre-collaboration.md`](archive/fase-8.7-cierre-collaboration.md).

## Deuda técnica conocida (sin resolver, intencional)

- **Capa genérica `base`/`conflict`:** el protocolo de conflictos por campo sigue
  siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos
  exista como segundo consumidor real, no antes.

## Siguiente paso

Ver `docs/ROADMAP.md` — **Engineering Hardening** es la siguiente iniciativa
comprometida, sin arrancar todavía. Auditar primero (`/serenata-iniciar-fase`)
antes de definir bloques.
