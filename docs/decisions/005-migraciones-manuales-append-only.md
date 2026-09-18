# 005 — Migraciones manuales, numeradas y append-only

## Contexto

No hay CLI de Supabase aplicando migraciones automáticamente. El SQL se ejecuta a
mano en el SQL Editor, primero en `serenata-erp-test` y luego en producción.

## Decisión

Todo cambio de esquema aplicado a producción se guarda **siempre** como migración
numerada en `db/migrations/` y se commitea. Las migraciones ya aplicadas son
**append-only**: no se modifican, se agrega una nueva encima. Toda función
`SECURITY DEFINER` fija su `search_path`.

## Razón

Es lo único que mantiene el historial del repo sincronizado con lo que la base
tiene de verdad. Modificar una migración ya aplicada rompe la reproducibilidad: el
job `Migrations` de CI reconstruye el schema completo desde un Postgres vacío en
cada push, y esa reconstrucción es el único gate que detecta la divergencia.

## Alternativas descartadas

- **Aplicar cambios solo en el dashboard sin archivo** — el historial se
  desincroniza en silencio y nadie puede reconstruir la base.
- **Editar la migración existente para cambiar comportamiento** — rompe el gate
  de reproducibilidad.

## Consecuencias

- `npm run check-migrations` solo lista y valida nombres; no aplica nada.
- Cambio aditivo o de mejora en producción: pre-aprobado. Borrado que sustituye
  (recrear función, renombrar columna): pre-aprobado. Borrado que **pierde una
  capacidad sin reemplazo**: requiere mostrar el SQL exacto y confirmación explícita.
- **Excepción estrecha (2026-09-11):** editar una migración ya aplicada está
  permitido solo para sincronizar el archivo con algo que ya corrió
  equivalentemente en producción (nunca para cambiar comportamiento), y solo si
  el statement agregado es idempotente/seguro desde un Postgres vacío y no
  afecta otro feature. Precedente: commit `9389e0f`, que agregó
  `ENABLE ROW LEVEL SECURITY` a una migración vieja para que el archivo
  reflejara lo que la tabla ya tenía en producción. Detalle completo de la regla
  en `.claude/rules/migraciones.md`.
- **Riesgo real encontrado al promover migraciones "atrasadas" (Fase 8.7.2,
  2026-09-11):** dos migraciones (`20260911_approve_cotizacion_estado_guard.sql`,
  `20260911_item_cotizacion_estado_guard.sql`) se habían probado en
  `serenata-erp-test` semanas antes de promoverse a producción. Al promoverlas
  se descubrió que ambas hacían `CREATE OR REPLACE FUNCTION` sobre una copia de
  `approve_cotizacion`/`patch_item_cotizacion` **anterior** a dos fixes ya
  aplicados por separado en producción sobre esas mismas funciones
  (`20260906_before_rename_fase53_cuentas_schema.sql`,
  `20260910_fix_null_vs_empty_conflict_false_positive.sql`) — promoverlas tal
  cual habría revertido ambos fixes en silencio (y ya los había revertido en
  `serenata-erp-test`, sin que nadie lo notara hasta ahora). Causa raíz: cuando
  dos migraciones distintas reemplazan la MISMA función completa en momentos
  distintos, la reproducibilidad de "aplicar en orden desde cero" no garantiza
  que una migración escrita hoy conozca los cambios que otra migración, escrita
  después de la que ella usó como base, ya aplicó sobre la misma función. Se
  corrigió con 2 migraciones aditivas nuevas que reincorporan ambos fixes sobre
  la base del guard de estado (ver commit `736b780`). **Mitigación para la
  próxima vez que una función se reemplace completa:** antes de promover una
  migración con `CREATE OR REPLACE FUNCTION` que lleva tiempo esperando, diffear
  su cuerpo contra `pg_get_functiondef` de la definición VIVA en producción, no
  solo confiar en el historial de archivos del repo.
- **Actualización (2026-09-18):** la regla "borrado sin reemplazo requiere
  confirmación explícita" de este documento aplica a pedidos sueltos de Supabase
  fuera de un plan aprobado. Dentro de la ejecución de un plan ya aprobado, esa
  confirmación deja de pedirse (incluido un borrado sin reemplazo) — ver
  `docs/decisions/012-autonomia-supabase-en-plan-aprobado.md`.
