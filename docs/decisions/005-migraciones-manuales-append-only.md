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
- **Editar la migración existente** — rompe el gate de reproducibilidad.

## Consecuencias

- `npm run check-migrations` solo lista y valida nombres; no aplica nada.
- Cambio aditivo o de mejora en producción: pre-aprobado. Borrado que sustituye
  (recrear función, renombrar columna): pre-aprobado. Borrado que **pierde una
  capacidad sin reemplazo**: requiere mostrar el SQL exacto y confirmación explícita.
