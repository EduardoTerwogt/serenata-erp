# Trabajo activo

**Última actualización:** 2026-09-11

## Estado

**Ninguna iniciativa activa.** Fase 8.7.1 (Serializar mutaciones de partidas contra
Generar/Aprobar) cerró completa y se mergeó a `main` en el commit `2a04241` (PR #24)
— las 4 suites de CI real en verde (`test`, `fresh-db`/Migrations,
`smoke-and-critical`, `live`) y el Preview de Vercel desplegando bien. Detalle
completo: [`docs/archive/fase-8.7.1-estado-guard-partidas.md`](archive/fase-8.7.1-estado-guard-partidas.md).

Una auditoría sobre el cierre de Fase 8.7 encontró que `flushPendingSaves` solo
cubría cuatro de las nueve vías de mutación de partidas (seleccionar producto,
cambiar responsable, alta/baja de fila e importar partidas quedaban fuera) y que
ninguna escritura de partidas revisaba el `estado` de la cotización dueña — se podía
seguir editando, creando, borrando o importando partidas de una cotización ya
`APROBADA`/`CANCELADA`. Corregido con un guard transaccional (`FOR SHARE` sobre
`cotizaciones`) en `patch_item_cotizacion`/`upsert_items_cotizacion`/
`delete_item_cotizacion` (nueva) + las cinco vías que faltaban ahora pasan por
`trackMutation`.

El job `live` del PR encontró una regresión real (no del bug que se estaba
arreglando, sino del propio cambio): `upsert_items_cotizacion` cambió su forma de
retorno (`setof items_cotizacion` → `jsonb`, necesario para poder devolver el
rechazo por estado), y `tests/e2e/live/items-cotizacion-uuid-guard.spec.ts` llamaba
la RPC directo vía `supabase-js` esperando el array crudo de antes. Corregido en el
mismo PR antes de mergear.

Fase 8.7 (Cierre real de Collaboration) sigue cerrada, mergeada a `main` en el
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
