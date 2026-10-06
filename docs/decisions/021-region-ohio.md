# 021 — Producción y Vercel en Ohio (`us-east-2` / `cle1`)

**Estado:** en ejecución (#124). Reemplaza a `018-region-vercel-sfo1.md`.

## Contexto

La decisión 018 pineó Vercel en `sfo1` por cercanía a Supabase producción
(`us-west-2`, Oregon), sin notar que Vercel tiene `pdx1` en Oregon. La base de
test ya vive en `us-east-2` (Ohio). Producción solo tiene 17 filas: es el
momento más barato para moverla.

Medición del usuario desde la oficina (cloudping, 3 corridas):

| Región | Promedio |
|---|---|
| `us-east-2` Ohio | ~60 ms |
| `us-east-1` Virginia | ~64 ms |
| `us-west-1` California | ~77 ms |
| `us-west-2` Oregon (producción hasta ahora) | ~80 ms |
| `mx-central-1` México | ~14 ms, sin oferta de Supabase ni Vercel |

## Decisión

Todo en Ohio: `vercel.json` → `regions: ["cle1"]` y proyecto de producción
nuevo en `us-east-2`, creado desde `db/migrations/` (mismo motor que CI) con
copia solo de los 2 usuarios. Test no se mueve. Plan de ejecución y rollback
(ventanas A/B): `docs/PLAN.md` mientras dure la iniciativa.

## Medición antes y después

**Preview contra test (2026-10-05)**, `preview-latency.yml`, 5 + 40 peticiones
por ruta, misma base de test, solo cambia la región de Vercel
(`sfo1` → `cle1`; p95 / mediana):

| Ruta | `sfo1` | `cle1` |
|---|---|---|
| `/api/folio` | 463 / 323 ms | 271 / 176 ms |
| `/api/clientes` | 518 / 392 ms | 512 / 214 ms (pico aislado de 1134 ms) |
| `/api/productos` | 437 / 303 ms | 317 / 170 ms |
| `/api/proveedores` | 1148 / 1004 ms | 524 / 449 ms |

Las medianas bajan entre 45 % y 56 %.

**Producción con DevTools (línea base, 2026-10-05):** `/api/cuentas/periodo` en
`serenata-erp.vercel.app/cuentas`, 5 recargas: 1.38 s, 2.18 s, 438 ms, 443 ms,
427 ms; **mediana 443 ms** (las dos primeras, arranque en frío). Producción
tiene 0 filas: el tiempo es casi todo red. Pendiente (R4): repetir la misma
medición después de la migración y registrarla aquí.

**Distancia desde CDMX (línea recta):** Ohio ~2,750 km, Cleveland ~2,960,
San Francisco ~3,040, Oregon ~3,620. La ruta de red real la dio cloudping:
Ohio ~60 ms, Virginia ~64, California ~77, Oregon ~80.
