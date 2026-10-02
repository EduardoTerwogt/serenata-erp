# Plan de la iniciativa activa

**Estado:** En refinamiento (2026-10-02) — "Frente 2 v2: Cuentas sin recálculo, sobre el
modelo simplificado y dentro del plan Free". Pendiente de aprobación del usuario.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Simplificación del modelo de datos" (2026-10-02)
— historia en `docs/archive/simplificacion-modelo-datos.md`, resultado en
`docs/decisions/020-simplificacion-modelo-datos.md`.

Antecedente: el frente 2 original (epic #110, PR #100, rama
`claude/wonderful-hamilton-260e2w`), pausado en
`docs/archive/frente2-cuentas-conceptos-pausado.md`, y su diseño en
`docs/decisions/019`. Este plan lo re-ajusta sobre `main` (`c92b860`).

---

# Frente 2 v2 — Cuentas sin recálculo, dentro del plan Free

## Objetivo

Que leer Cuentas cueste en proporción a **lo que se muestra** (el mes, el
proyecto, lo pendiente) y no al historial completo, con el cómputo del plan Free
de Supabase. Meta: ~2,500 proyectos por año y ~10 años de historial, con las
lecturas y las escrituras dentro de presupuesto y sin que la tabla precalculada
pueda mostrar dinero distinto al de la derivación.

## Dependencias y orden (auditoría, 2026-10-02)

1. **#124 — Paridad de entornos** (test a `us-west-2`, misma versión de Postgres
   que producción). Chico, independiente; va primero para sembrar y medir una sola
   vez en el entorno final.
2. **#123 — Nueva lógica de cuentas** (una factura para varias cotizaciones, un
   comprobante para varias facturas). **Cambia el modelo que el frente 2 precalcula**:
   un documento deja de pertenecer a un solo cobro y puede cruzar proyectos. Si el
   frente 2 se construye antes, se rehace (es lo que pasó con el PR #100 frente a
   la simplificación). Se decide y construye antes de V1; la reescritura de la
   derivación que pide #123 se hace una sola vez, ya con el diseño de V1.
3. **Frente 2 v2** (este plan), sobre el modelo final.

Mientras tanto no hay urgencia: producción tiene datos mínimos y la curva de
escala no cruza el presupuesto con el volumen actual.

## Diagnóstico (código de `main` `c92b860` y BD de test)

Test: 2,203 proyectos (todos en 2026), 2,206 cobros, 10,992 cuentas por pagar,
10,985 grupos, 13,193 conceptos; 12 documentos y 6 pagos en total.

1. **Una carga de `/cuentas` deriva todo 4 veces.** `cuentas_periodo` y
   `cuentas_opciones` derivan el año; `cuentas_resumen` y `cuentas_avisos_items`
   llaman `cuentas_conceptos(NULL, hoy)`: todo el historial. Con 10 años de 500
   proyectos, `periodo` cuesta 105 ms pero `resumen`/`avisos` ~460–530 ms (curva
   de B7). Esas dos crecen con el tiempo aunque el negocio no crezca.
2. **Derivar un concepto cuesta casi lo mismo que derivar miles.** El detalle
   (`cuentas_conceptos(NULL, hoy, 'cobro', id)`): 37 ms y 3,701 buffers para una
   fila; el año completo, 548 ms y 161,979 buffers. La función es `LANGUAGE sql`
   con filtros `p_objetivo IS NULL OR …` y `CASE` en el `WHERE` que impiden usar
   índices, y los CTE de documentos y pagos (`cc_factura`, `cc_comp`, `p_factura`,
   `p_comp`, `p_fechas`) agregan **toda** la tabla sin filtrar por proyecto. Explica
   los 141 ms de media del refresco que midió el PR #100.
3. **El dataset de test no mide lo que crecerá:** casi sin documentos ni pagos,
   todo pendiente, un grupo por cuenta.
4. **Lo que depende de "hoy":** `venc_dias`, `vencido`, `paso_urgente` y el
   **estado** del cobro (`vencido`) salen de `fecha_vencimiento − hoy`. `paso` y
   `resuelto` **no** dependen de hoy (verificado en el código): `resuelto` sirve
   como llave de un índice parcial. Todo aviso y todo "pendiente" del resumen es
   un concepto no resuelto (verificado categoría por categoría).
5. **Paridad de entornos:** test `us-east-2` / 17.6.1.166, producción
   `us-west-2` / 17.6.1.084, Vercel `sfo1` → #124. Además `live` y `escala.yml`
   corren en runners de GitHub de región no fija: el p95 de extremo a extremo
   mezcla red.
6. `cuentas_orden_candidatos` no usa la derivación; fuera de alcance.

## Auditoría del borrador (Dev Sr, Data Engineer Sr, Data Analyst Sr)

Cada hallazgo cambia el diseño; ninguno queda como "mitigación".

| # | Rol | Hallazgo | Resolución en el diseño |
|---|---|---|---|
| H1 | DE | #123 cambia el grano (documento ↔ varios cobros, pago ↔ varias facturas). Precalcular antes es retrabajo seguro. | Orden de arriba: #123 antes de V1. El refresco se marca por **conjunto de proyectos afectados** resuelto por las tablas de vínculo, no por "el proyecto de la fila". |
| H2 | DE | El diseño del PR #100 no tenía trigger en `clientes` (el nombre es la contraparte del cobro) ni en `items_cotizacion` (la descripción es el concepto). Renombrar un cliente dejaba la tabla vieja hasta la reconciliación. | **Cobertura mecánica:** la derivación pasa a plpgsql y un chequeo de CI compara `plpgsql_show_dependency_tb` (plpgsql_check 2.8, ya instalado) con las tablas que tienen el trigger. Si la derivación lee una tabla sin trigger, CI falla. Desaparece la clase de error "se olvidó un trigger". |
| H3 | Dev | El `WHEN` por columnas de los triggers de `UPDATE` es una trampa de mantenimiento (columna nueva sin agregar = dato viejo). Su motivo, el cron que reescribía `estado` en 500 cobros, ya no existe: `estado` es columna generada y `sync_estados_cuentas_cobrar_vencidas` quedó inerte (`20261022`). | Sin listas de columnas: `WHEN (OLD IS DISTINCT FROM NEW)`. Tras V1 el refresco cuesta milisegundos. |
| H4 | Dev/DE | Separar "lo guardado" de "lo de hoy" crea dos lugares con reglas del estado: un segundo motor (principio 7). | **Derivación en dos etapas por construcción:** etapa 1 `cuentas_conceptos_base(p_proyectos)` (sin hoy) y etapa 2 `cuentas_concepto_al_dia(fila, hoy)` (pura, `IMMUTABLE`). La derivación en vivo es etapa2(etapa1); la tabla guarda etapa1; las lecturas aplican la misma etapa2. Una sola regla, dos usos. La paridad se reduce a "tabla = etapa1". |
| H5 | DE | Proyecto repetido en cada concepto (nombre, cliente, fecha, margen, fee, IVA, utilidad, reapertura): copia de datos y escrituras de más. | **Dos granos:** `cuentas_proyecto_base` (una fila por proyecto, con sus agregados: totales, pendientes, vencimiento más próximo pendiente, última fecha resuelta) y `cuentas_concepto_base` (una fila por concepto, sin columnas del proyecto). Tarjetas, contadores por mes y resumen leen el grano proyecto (~180 filas por mes). El orden de proyectos (`row_number`) se calcula al leer: depende del conjunto consultado. |
| H6 | DE | Refresco con `DELETE` + `INSERT` por proyecto: escribe todas las filas aunque cambie una (WAL, bloat y autovacuum en un cómputo chico). | `MERGE … WHEN MATCHED AND fila IS DISTINCT FROM … THEN UPDATE … WHEN NOT MATCHED BY SOURCE THEN DELETE` (Postgres 17): solo se escribe lo que cambió. |
| H7 | Dev | Concurrencia: dos escrituras del mismo proyecto podían refrescar con una foto vieja si el lock y la lectura comparten snapshot o si la transacción no es `READ COMMITTED`. | El constraint trigger diferido toma el advisory lock por proyecto (orden fijo) en una sentencia y deriva en otra: snapshot nuevo, ve lo ya confirmado. La función **falla si `transaction_isolation` ≠ `read committed`** (explícito, principio 4). Sin ciclo de deadlock: al llegar al commit la transacción ya no espera locks de fila. Test `live` nuevo: N escritores concurrentes sobre el mismo proyecto, al final tabla = derivación. |
| H8 | Dev | "Si la derivación falla, la escritura de negocio falla": riesgo P0 del borrador. | Se elimina como clase de fallo **por datos**: sin casts sobre datos (`item_id` ya es `uuid`; año y mes con `extract`, no `substr::int`), divisiones protegidas, `plpgsql_check` y paridad en CI. Las fallas por tiempo: refresco de milisegundos por llave e índice, `lock_timeout` explícito menor que el de PostgREST y k6 de escrituras como puerta. Un bug de lógica queda al nivel de cualquier RPC de hoy (`approve_cotizacion`) y lo detienen las mismas puertas antes del merge. Se descarta "atrapar el error y marcar sucio": crearía un segundo camino de lectura. |
| H9 | DE | Reconciliación en el cron que "corrige": puede ocultar un bug. | La reconciliación **solo reporta**: guarda nueva en `auditar_consistencia()` (tabla = etapa1, ambos granos), visible en Admin y en el cron diario. Corregir es una acción manual (`cuentas_conceptos_reconstruir()`) después de encontrar la causa (principio 6). Además, en CI cada spec `live` que escribe Cuentas termina comparando tabla y derivación. |
| H10 | DA | Medir en milisegundos sobre cómputo compartido da ruido (la misma consulta de 37 a 445 ms en esta sesión). | **Métrica primaria determinista: buffers por llamada** (`EXPLAIN (ANALYZE, BUFFERS)`), estable entre corridas. Puerta de CI por buffers; el tiempo de servidor (p50/p95 de 30 corridas calientes) es secundario y va en `escala.yml`. |
| H11 | DA | El dataset de test no es representativo y el generador inventaría distribuciones. | V0 calibra el generador con parámetros que da el negocio: proyectos por año y su estacionalidad, cotizaciones complementarias, renglones y proveedores por proyecto (tamaño de grupo), % PPD/PUE, documentos y pagos por concepto, % resuelto por antigüedad, sin fecha y reaperturas, más los vínculos N:M de #123. Se documentan en el generador. |
| H12 | DA | Un pendiente que nunca se resuelve (p. ej. "subir comprobante") hace crecer el índice parcial. | Métrica visible: tamaño y antigüedad del backlog de pendientes en Admin. Es higiene operativa, no rendimiento: con ~13k pendientes el índice parcial sigue siendo el peor caso actual. |
| H13 | Dev | Salida a producción "big bang" (V5 aplicaba todo junto y mergeaba). | **Lanzamiento en sombra:** V2 sale a producción manteniendo las tablas sin lectores; la guarda diaria tiene que dar 0 durante una ventana acordada antes de V3. V3 cambia lectores con una migración de reversa ya escrita y probada en test (`CREATE OR REPLACE` de las versiones actuales). |
| H14 | Dev | El PR #100 sigue abierto con migraciones (`20261009`/`20261010`) escritas sobre el esquema viejo; `20261007`/`20261008` ya están en `main`. | Cerrar el PR #100 como reemplazado **al aprobar este plan**, no al final; se porta el mecanismo (cola + constraint trigger diferido + advisory lock), no los archivos. |
| H15 | Dev | Cargas masivas (generador, reinicios) disparan miles de refrescos. | Se conserva `SET LOCAL serenata.sin_refresco = 'on'` + `cuentas_conceptos_reconstruir()`, y la guarda diaria detecta si alguien lo olvidó. |
| H16 | DE | Plan Free. | Cabe: ~10 MB por año en ambos granos (límite 500 MB); sin extensiones nuevas; el cron sigue en `/api/keep-alive` (no hace falta `pg_cron`). Fuera de alcance y ya registrado: sin respaldos en Free (P0 previo a uso real). |

### Riesgos que quedan

Ninguno abierto por diseño. Los que el borrador listaba se resolvieron así:
desfase de dinero → H2, H3, H4, H9; escritura bloqueada → H8; concurrencia → H7;
medición engañosa → H10, H11; regiones → #124; mantenimiento → H2, H3; cargas
masivas → H15. Lo único que no depende de este plan es #123, que lo antecede.

## Diseño

- **Etapa 1** `cuentas_conceptos_base(p_proyectos text[])`, plpgsql, una sola
  consulta parametrizada por conjunto de proyectos (no ramas por modo).
  Documentos y pagos por llave con `LATERAL … ORDER BY fecha_carga DESC LIMIT 1`
  e índices parciales nuevos por llave (p. ej.
  `documentos_cuentas_cobrar (cuentas_cobrar_id, fecha_carga DESC) WHERE tipo = 'FACTURA_XML' AND eliminado_at IS NULL`).
  "Año" y "un concepto" son conjuntos de proyectos que resuelve el que llama.
- **Etapa 2** `cuentas_concepto_al_dia(cuentas_concepto_base, date)`, `IMMUTABLE`:
  `venc_dias`, `vencido`, estado del cobro y `paso_urgente`.
- **Tablas** `cuentas_proyecto_base` y `cuentas_concepto_base`, mantenidas por
  `cuentas_refrescar(p_proyectos)` (un `MERGE` por grano).
- **Triggers** en cada tabla que lee la etapa 1 (lista verificada por CI), por fila
  con `WHEN (OLD IS DISTINCT FROM NEW)`; marcan proyectos afectados (OLD y NEW, vía
  vínculos) en una cola; un constraint trigger diferido refresca una vez por
  transacción.
- **Lecturas:** `cuentas_periodo` (mes por índice `(anio, mes)`; contadores del año
  desde el grano proyecto), `cuentas_opciones` (distinct sobre el grano concepto
  del año), `cuentas_resumen` y `cuentas_avisos_items` (índice parcial
  `WHERE NOT resuelto`), detalle (una fila por llave). Todas aplican la etapa 2.
- **Guardas:** `auditar_consistencia()` + chequeo de dependencias en CI + paridad
  SQL↔TS vigente + comparación al final de cada spec `live` de Cuentas.

## Bloques

| Bloque | Qué | Producción |
|---|---|---|
| **V0 Medición fiel** | Generador calibrado (H11) con el modelo de #123; línea base por buffers y tiempo (500 / 2,200 / 5,000 y 10 años), incluidos detalle y derivación de un proyecto. | — |
| **V1 Derivación en dos etapas** | Etapa 1 y etapa 2; `cuentas_conceptos` queda como envoltura de las dos; índices por llave; chequeo de dependencias en CI. Resultado idéntico: paridad = 0. | Sí; acelera lo actual sin estado nuevo. |
| **V2 Tablas en sombra** | Dos granos, `MERGE`, triggers, cola, constraint trigger, guardas H7/H9, test de concurrencia. Sin lectores. | Sí; ventana de guarda en 0. |
| **V3 Lecturas** | Las 4 RPCs y el detalle leen las tablas; migración de reversa probada. | Sí, tras la ventana. |
| **V4 Cierre** | k6 de escrituras (aprobar, pagar, subir documento, cancelar, reabrir); `live` 3 corridas seguidas; ADR 019 reescrito; reglas de migraciones actualizadas. | — |

Puerta tras V1: medir con el dataset de V0. Si V1 deja todo dentro de las metas
con 10 años de historial, decidir con el usuario si V2–V3 van ya o con disparador.

## Validación (metas provisionales, se fijan con la línea base de V0)

- Tabla = etapa 1 (ambos granos): 0 diferencias en CI, en `live` y en la guarda diaria.
- Lecturas, servidor, dataset de V0 con 10 años: `periodo` (mes) < 100 ms,
  `periodo` (año) < 250 ms, `resumen`/`avisos` < 60 ms **y sin crecer con los años**
  (buffers constantes al agregar años resueltos), detalle < 10 ms.
- Refresco de un proyecto: p95 < 30 ms; aprobar/pagar suben < 50 ms en k6.
- Concurrencia: N escritores sobre un proyecto → tabla = derivación, sin deadlocks.
- `auditar_consistencia()` = 0 en test y producción.

## Tracker

| Bloque | Estado |
|---|---|
| Prerrequisito #124 (región) | Pendiente |
| Prerrequisito #123 (modelo de facturas y pagos N:M) | Pendiente — decisión de producto |
| V0 Medición fiel | Pendiente |
| V1 Derivación en dos etapas | Pendiente |
| V2 Tablas en sombra | Pendiente |
| V3 Lecturas | Pendiente |
| V4 Cierre | Pendiente |
