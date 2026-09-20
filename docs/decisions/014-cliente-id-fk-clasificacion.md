# 014 — `cliente_id` como FK real: clasificación en 3 cubetas

## Contexto

Bloque 3 de `docs/PLAN.md`: `clientes` ya existe con `id uuid`, pero `cliente`
sigue siendo `text not null` sin FK en `cotizaciones`, `proyectos`,
`cuentas_cobrar` y `historial_responsable` (este último no estaba en la lista
original del plan; se encontró en la exploración de código — también
alimenta la tabla "Historial Responsables" de Sheets). Un backfill por
"mejor coincidencia" sin distinguir certeza puede relacionar una fila
histórica con el cliente equivocado — peor que dejarla sin `cliente_id`
(riesgo P0 explícito del plan).

## Hallazgo del Paso 0 (verificado contra Supabase real antes de escribir migraciones)

`app/api/clientes/route.ts` hace
`.upsert({...}, { onConflict: 'nombre' })` al crear un cliente. Se verificó
contra `supabase-test` (`ozrtsludmcguvgqdjicn`) y producción
(`fwmyoqokcjtldiofuxdg`):

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.clientes'::regclass;
-- => solo clientes_pkey (PRIMARY KEY (id)) en ambos ambientes
```

**No existe ningún `UNIQUE` sobre `clientes.nombre`, en ningún ambiente.**
`ON CONFLICT (nombre)` en Postgres requiere una constraint única real sobre
esa columna para ser una sentencia válida — no solo "cuando hay conflicto":
sin ella, la sentencia falla con `42P10` en **cada** ejecución, no solo
cuando el nombre ya existe. Es decir, `POST /api/clientes` está
probablemente roto hoy en producción (nunca crea un cliente exitosamente).
No se encontraron duplicados de `lower(trim(nombre))` en ninguno de los dos
ambientes (`select ... group by 1 having count(*) > 1` → `[]`).

**Esto queda fuera de alcance de este bloque**, por decisión explícita del
plan aprobado: arreglarlo (agregar la constraint y decidir qué hacer con
`onConflict`) es un cambio de comportamiento de una ruta que Bloque 3 no
toca, y merece su propia validación (¿debería el catálogo administrativo de
Clientes permitir nombres duplicados o no? — decisión de producto, no
solo técnica). Se documenta aquí para que no se pierda: **candidato a fix
inmediato en una sesión futura**, con severidad P1 real (ruta de creación de
clientes rota), no solo una limpieza cosmética.

## Decisión: clasificación en 3 cubetas

Con `nombre` como único campo de matching disponible (sin RFC ni otro
identificador fiscal en `clientes`), la clasificación usa:

- **`safe_match`** — exactamente un cliente con `lower(trim(nombre)) =
  lower(trim(texto))`. Es la única cubeta que asigna `cliente_id`
  automáticamente.
- **`ambiguous`** — más de un cliente con el mismo nombre normalizado
  exacto (no se encontraron casos reales, pero el código lo contempla), **o**
  ningún exacto pero ≥1 candidato con `similarity(nombre, texto) > 0.35`
  (mismo umbral que `match_proveedor_por_nombre`,
  `db/migrations/20260907_fase55_portal_proveedores_schema.sql`). A
  diferencia de Proveedores, aquí **nunca se autoasigna por similarity** —
  solo se registra el candidato para reconciliación manual futura en
  `/clientes` (fuera de alcance de este bloque).
- **`no_match`** — sin exacto y sin candidato fuzzy.

La clasificación completa (las 3 cubetas, con sus candidatos) se guarda en
`cliente_id_backfill_clasificacion` (append-only) — insumo directo de la
pantalla de reconciliación manual futura. Solo `safe_match` escribe
`cliente_id` en la migración de backfill.

## Razón

- Sin RFC en `clientes`, la igualdad exacta de nombre normalizado es la
  única señal sin ambigüedad real disponible.
- Reusar `pg_trgm`/`similarity()` (ya extensión activa en el proyecto, ya
  usada por Proveedores) evita introducir una segunda librería de matching
  fuzzy para el mismo problema.
- Nunca autoasignar por similarity honra el riesgo P0 del plan: un
  candidato razonable no es lo mismo que una certeza.

## Alternativas descartadas

- **Backfill directo sin clasificación** (asignar el mejor candidato
  siempre) — descartado explícitamente por el plan (riesgo P0).
- **Bloquear el bloque hasta agregar RFC a `clientes`** — alcance mayor no
  pedido; la clasificación por nombre ya cubre el caso `safe_match` real
  (sin duplicados en ningún ambiente).
- **Arreglar `POST /api/clientes` dentro de este bloque** — descartado por
  ser una ruta y un comportamiento que Bloque 3 no toca; requiere su propia
  decisión de producto sobre duplicados de nombre.

## Consecuencias

- `ambiguous`/`no_match` quedan con `cliente_id NULL` explícito y visibles
  en `cliente_id_backfill_clasificacion` — la reconciliación manual en
  `/clientes` es trabajo futuro, no de este bloque.
- `historial_responsable` se agrega al alcance de la migración de columnas
  (no estaba en la lista original de `docs/PLAN.md`).
- El bug real de `POST /api/clientes` (`onConflict: 'nombre'` sin
  constraint) queda pendiente, documentado aquí para no perderlo.
