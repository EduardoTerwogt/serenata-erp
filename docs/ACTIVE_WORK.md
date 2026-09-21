# Trabajo activo

**Última actualización:** 2026-09-21

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución.** Sin cambios esta sesión: sigue
Bloque 4 (filtro de estado en Cuentas) como único bloque pendiente, diseño
sin cerrar. Bloques 1, 2 y 3 ya cerrados (PR #77 y #79). Detalle completo,
orden de ejecución, riesgos y validación de los 4 bloques: `docs/PLAN.md`.

## Completado en esta sesión — fix `POST /api/clientes` (PR #80, mergeado en `b1765a8`)

Fix puntual fuera de la iniciativa de `docs/PLAN.md` (a pedido explícito del
usuario, en vez de abrir Bloque 4). `POST /api/clientes` usaba
`.upsert({...}, {onConflict:'nombre'})`, pero `clientes.nombre` nunca tuvo
un `UNIQUE` real (hallazgo de `docs/decisions/014`) — `ON CONFLICT` fallaba
con `42P10` en cada ejecución, así que la ruta probablemente nunca creó un
cliente en producción.

Se confirmó que el único caller real hoy es el catálogo administrativo
(`ClienteModal` → "Nuevo cliente"); el uso de "crear/encontrar al vuelo por
texto libre desde Cotizaciones" que motivó el `upsert` ya no existe —
reemplazado por el selector de `cliente_id` real del Bloque 3. Se reemplazó
el `upsert` por un `insert` plano vía nueva `createCliente()` en
`lib/server/repositories/clientes.ts`, mismo patrón que `createProveedor`
(mismo catálogo administrativo, mismo comportamiento: permite nombres
duplicados, sin `UNIQUE` nuevo ni motor de deduplicación en paralelo). Test
agregado que cubre el bug real. Detalle completo:
`docs/decisions/014-cliente-id-fk-clasificacion.md` (adenda 2026-09-21).

## Tests ejecutados y resultado real

`tsc --noEmit` y `lint` limpios (solo warnings preexistentes, no
relacionados). `vitest`: 965/965 en verde (964 previos + 1 nuevo). CI del
PR #80 en verde (6/6 checks: `test`, `tracker-lint`, `smoke-and-critical`,
`fresh-db`, `live`, `Vercel Preview Comments`) y ambos Preview de Vercel
(`serenata-erp`, `serenata-erp-loadtest`) desplegados en `Ready` antes de
mergear.

## Problemas encontrados que siguen abiertos

Ninguno nuevo. El bug de `POST /api/clientes` documentado en
`docs/decisions/014` quedó resuelto esta sesión (ver arriba).

## Deuda técnica (arrastrada, sin cambios esta sesión)

Presence sin verificar en Preview, `SUPABASE_JWT_SECRET` distinto entre
Production/Preview en Vercel, `AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo
en producción, `tracker-lint` de `test.yml` sin generalizar fuera de EF-3,
verificación completa de Google OAuth pendiente, ramas remotas ya mergeadas
sin borrar por policy del proxy de egress. Detalle histórico de cada una en
`docs/archive/` y sesiones previas — sin novedad, no se investigaron de
nuevo esta sesión.

## Siguiente paso

1. Abrir **Bloque 4 — Cuentas: filtro de estado en vista principal** en una
   sesión futura (`/serenata-iniciar-fase`) — único bloque sin diseño
   cerrado; falta decidir agrupación de estados e integración con las vistas
   existentes (ver `docs/PLAN.md`, punto 4 de "Los sueltos"). Con esto
   cerraría la iniciativa completa de `docs/PLAN.md`.
