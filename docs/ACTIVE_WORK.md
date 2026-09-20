# Trabajo activo

**Última actualización:** 2026-09-20

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución.** Bloque 1 (Portal: simulador de
factura) cerrado — PR [#77](https://github.com/EduardoTerwogt/serenata-erp/pull/77),
mergeado a `main` en `647686b`. **Bloques 2 (Cuentas: utilidad de proyecto) y
3 (Clientes: `cliente_id` FK) cerrados** — PR
[#79](https://github.com/EduardoTerwogt/serenata-erp/pull/79), mergeado a
`main` en `578f53b` (ambos quedaron en el mismo PR por ser sesión en la nube
sobre una sola rama asignada). Bloque 4 (filtro de estado en Cuentas) sigue
pendiente, diseño sin cerrar. Detalle completo, orden de ejecución, riesgos y
validación de los 4 bloques: `docs/PLAN.md`.

**Engineering Hardening (EF-1+EF-2+EF-3)** y **Agrupar Cuentas por Pagar por
proveedor+proyecto** siguen cerrados de sesiones anteriores — sin cambios,
ver `docs/ROADMAP.md` → "Cerrado" para el historial completo de ambas.

## Completado en esta sesión — Bloques 2 y 3 (PR #79, mergeado en `578f53b`)

**Bloque 2 — Cuentas: utilidad de proyecto y cierre fiscal.** Régimen fiscal
`resico` agregado (persona física RESICO, Art. 113-J LISR) y unificadas las 3
reimplementaciones binarias moral/física en `obtenerRetencionesPorRegimen`
(`lib/shared/factura-fiscal.ts`). RPC `cuentas_por_proyecto()` extendida con
margen/fee/utilidad/IVA por proyecto + nuevo módulo puro
`lib/shared/cierre-proyecto.ts` (`calcularCierreProyecto`, agrupa por grupo
de facturación, nunca tasa plana). UI: chip "Utilidad" + sección "Cierre del
proyecto" en `CuentasPorProyecto.tsx`, con tokens del design system.

**Bloque 3 — Clientes: `cliente_id` como FK real.** Esquema aditivo +
backfill clasificado en 3 cubetas (`safe_match`/`ambiguous`/`no_match`,
nunca asignación forzada — ver `docs/decisions/014`); 100% clasificado y
verificado en `supabase-test` (6594 filas) y producción (168 filas, 100%
`safe_match`). Dual-write en `save_cotizacion`, `patch_cotizacion_general`,
`approve_cotizacion`, `buscar_cotizaciones`, `buscar_cuentas_cobrar`,
`cuentas_por_proyecto` + selector de cliente real en Cotizaciones (único
lugar con texto libre) + mirror de Sheets (4 tablas).

**Hallazgo fuera de alcance, documentado:** `POST /api/clientes` usa
`upsert(onConflict:'nombre')` sin que exista ningún `UNIQUE` real sobre esa
columna en ningún ambiente — probablemente falla siempre en producción. Ver
`docs/decisions/014-cliente-id-fk-clasificacion.md`.

## Decisiones tomadas en esta sesión

- **Clasificación en 3 cubetas para el backfill de `cliente_id`**
  (`safe_match`/`ambiguous`/`no_match`, nunca asignación forzada por
  similitud) — ver `docs/decisions/014-cliente-id-fk-clasificacion.md`.
- **Régimen fiscal RESICO y fórmula de Utilidad de proyecto** agregados como
  reglas de negocio invariables — extensión de
  `docs/decisions/006-reglas-de-negocio-invariables.md`.

## Tests ejecutados y resultado real

`tsc --noEmit` y `lint` limpios. `vitest`: 964/964 en verde. e2e critical
80/80 y smoke 26/26 en verde. CI del PR #79 en verde (6/6 checks) y Preview
de Vercel desplegado correctamente antes de mergear. Migraciones aplicadas y
verificadas con `execute_sql` en `supabase-test` (`ozrtsludmcguvgqdjicn`) y
producción (`fwmyoqokcjtldiofuxdg`).

## Problemas encontrados que siguen abiertos

- **`POST /api/clientes` con `upsert(onConflict:'nombre')` sin `UNIQUE` real
  respaldándolo** — ver `docs/decisions/014-cliente-id-fk-clasificacion.md`.
  Fuera de alcance de esta sesión, no corregido.

## Deuda técnica (arrastrada, sin cambios esta sesión)

Presence sin verificar en Preview, `SUPABASE_JWT_SECRET` distinto entre
Production/Preview en Vercel, `AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo en
producción, `tracker-lint` de `test.yml` sin generalizar fuera de EF-3,
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
2. Considerar como fix rápido, fuera de esta iniciativa: el bug de
   `POST /api/clientes` documentado en `docs/decisions/014`.
