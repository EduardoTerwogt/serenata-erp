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

Pendiente (se llena en R4): `preview-latency.yml` contra un Preview `sfo1` y
contra el Preview `cle1`, ambos sobre la misma base de test, para aislar el
efecto de la región (p95, mediana y máximo por ruta).
