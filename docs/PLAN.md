# Plan de la iniciativa activa

**Estado:** **Borrador** (2026-10-09) — Frente 2 v2 de Cuentas (#110): leer Cuentas sin recalcular el historial. Dirección
aprobada por el usuario; el texto pasa a **Aprobado** cuando lo revise. Sustituye al plan del issue #110 (2026-10-02) y cierra el PR #100.

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

Última iniciativa cerrada: "Facturas y pagos ligados" (#123, con #130 y #131; lanzada a
producción el 2026-10-08, merge `35709b6`) — historia en
`docs/archive/facturas-pagos-ligados-123-130-131.md`, decisiones en
`docs/decisions/022`, `023` y `024`.

---

# Frente 2 v2 de Cuentas — leer sin recalcular el historial (#110)

## Objetivo y meta (sin cambio)

Que leer Cuentas cueste en proporción a **lo que se muestra** (el año, el proyecto, lo pendiente) y no al historial completo, con el
cómputo del plan Free de Supabase. Meta: ~2,500 proyectos por año y ~10 años de historial, con las lecturas dentro de presupuesto.

**Restricciones del usuario (2026-10-09):** ningún feature cambia; la única consecuencia visible es una mejora; la iniciativa
salda deuda técnica y no la crea. Por eso el criterio de aceptación de todo bloque es **salida idéntica** (paridad = 0), y el plan
no agrega estado derivado mientras no haga falta demostrado con mediciones.

## Auditoría (2026-10-09, `main` `b974c43`, BD de test y producción)

- **Premisas del issue ya cumplidas:** #124 (test y producción en `us-east-2`, Postgres 17.11.0.002, Vercel `cle1`) y #123/#130/#131
  (modelo final de facturas y pagos, migraciones `20261030`–`20261038`). El PR #100 y sus `20261009`/`20261010` están obsoletos (rama sobre
  `55930c5`); `main` salta de `20261008` a `20261011` y el siguiente número libre es `20261039`.
- **Los objetos del frente 2 no existen** en test ni en producción (tabla nula, 0 funciones).
- **Producción:** 1 proyecto, 4 cuentas por pagar; `auditar_consistencia()` = 0 en test y producción.
- **Test:** 2,703 proyectos (500 son residuo `ESC` del generador), 16,195 conceptos, 1,010 documentos de cobro, 5,005 de pago, 6,007 pagos;
  todo en 2026 (un solo año).
- **La derivación creció:** gasto extra (`item_id` nulo + `concepto`) que resta de la utilidad real, cliente por llave, modos
  `cobro|grupo|cuenta|cliente|proveedor`, y lectores nuevos (`estado_cuenta`, `cuentas_proyectos_selector`, `facturas_candidatos`). Sigue siendo una función plpgsql
  de ~400 líneas con `force_custom_plan` (`20261034`).
- **Quién la llama (verificado en `pg_proc`):** `cuentas_periodo` (año), `cuentas_resumen` y `cuentas_avisos_items` (`NULL` = todo el historial),
  `cuentas_opciones` (año) y `estado_cuenta`. Cada carga de `/cuentas` deriva 3 veces (periodo, resumen, opciones) y el panel de avisos una cuarta.

| Medición en test (`EXPLAIN BUFFERS`, todo en caché) | Buffers | Tiempo (ruidoso) |
|---|---|---|
| `cuentas_conceptos(NULL, hoy)` | 15,845 | 1,197 ms |
| `cuentas_resumen` | 16,808 | 705 ms |
| `cuentas_periodo` (mes) | 16,505 | 862 ms |
| `cuentas_opciones(2026)` | 15,970 | 1,627 ms |
| detalle de un concepto | ≈3,060 | 82 ms |
| `estado_cuenta` de un cliente | ≈3,700 | — |

- **Hallazgos del perfil por nodos** (consulta con los CTE de documentos podados por el planner; cubre ~60% del costo): no hay un punto caliente
  único, así que un arreglo local rinde del orden de 2×, no de 10×. Desperdicio verificable: `proyecto_id IN (SELECT id FROM py)` en `cc` y `cp`
  no filtra nada en lecturas globales pero obliga a construir `py` y evaluar un subplan hasheado por fila; el bloque más grande es `cp` → `g`
  (escaneos completos de `cuentas_pagar` y `cuentas_pagar_grupos`). El tiempo de reloj varía hasta 5× (cómputo Micro): **la puerta usa
  buffers + filas + mediana, no un solo p95**.
- **Caducado en el issue:** 162k buffers por año contra 3.7k por concepto (44×). Hoy es 16k contra 3k (5×).
- **Crece con los años (lo que la meta exige):** `resumen` y `avisos` (leen todo el historial). La lectura de un año no crece con los años.
- **Cosmético, no es drift:** el `md5` de `cuentas_periodo` y `cuentas_resumen` en test difiere del de producción solo por comentarios.

## Enfoque: primero sin estado nuevo

Se descartan, con motivo, las alternativas de mantener una copia derivada desde el arranque:

| Alternativa | Por qué no ahora |
|---|---|
| Tablas `cuentas_proyecto_base` + `cuentas_concepto_base` con triggers en ~14 tablas, cola, constraint trigger, advisory locks y `MERGE` (diseño del issue, ADR 019) | Mete una clase de falla en cada escritura financiera (aprobar, pagar, subir documento) y una copia que puede diferir de la derivación. Contradice «no crear deuda»; se reserva para el bloque condicional V2. |
| RPC única `cuentas_carga` | Cambia el contrato API↔UI y no baja el costo de cada endpoint medido por separado. |
| Vista materializada / refresco al leer | Refresco completo por escritura; refresco al leer ya se probó y se descartó en CI (ADR 019). |
| Caché fuera de la BD | Datos viejos en pantalla de dinero: viola «fallar explícito». |

Principios de ejecución: SQL sigue siendo la única fuente de las reglas de dinero; `cuentas_conceptos(p_year, p_hoy[, p_objetivo, p_id])`
conserva su firma (los llamadores no cambian); cada migración trae su reversa (`CREATE OR REPLACE` de la versión anterior) probada en test.

## Bloques

| Bloque | Qué | Producción |
|---|---|---|
| **V0 Medición fiel** | Generador calibrado con parámetros del negocio y **10 años** (hoy 1 año); retirar el residuo `ESC` de test. Perfil completo por nodos (con todos los CTE referenciados) y línea base de buffers, filas y mediana/p95 de servidor para: periodo (mes, año, lista), resumen, avisos, opciones, detalle (cobro, grupo, cuenta), `estado_cuenta` (cliente, proveedor) y selector. Agregar esos casos a `scripts/db/escala-medir.sql`. Presupuestos finales se fijan aquí. | — |
| **V1a Opciones sin derivación** | `cuentas_opciones` lee de `cuentas_cobrar`/`cuentas_pagar`/grupos/clientes/proveedores (solo usa `tipo`, `contraparte`, `contraparte_id`); quita 1 de las 3 derivaciones por carga. Mismo `jsonb` que la actual. | Sí |
| **V1b Derivación por conjunto de proyectos** | Una sola consulta parametrizada por conjunto de proyectos (la resolución `py` sale del llamador: año, un concepto, una contraparte); los CTE de documentos y pagos (`p_factura`, `p_comp`, `cc_comp`, …) se filtran por ese conjunto; `proyecto_id IN (SELECT id FROM py)` deja de ejecutarse en lecturas globales; 1–2 índices parciales por llave (p. ej. documentos de pago por grupo y fecha). `cuentas_conceptos` queda como envoltura con la firma actual. | Sí |
| **V1c Equivalencia** | `scripts/db/` compara la función anterior (copiada en test con otro nombre, no migrada) contra la nueva: 0 diferencias de `jsonb` en todos los modos y varias fechas sobre el dataset de V0; `cuentas-paridad-sql` y la suite actual en verde; `plpgsql_check` y la guarda `force_custom_plan` de `migrations.yml`. | — |
| **Puerta tras V1** | Medir con el dataset de V0 a 10 años. Todo dentro de presupuesto → saltar a V3. `resumen`/`avisos` fuera de presupuesto o creciendo con los años → V2, con el usuario. | — |
| **V2 (condicional) Marca por proyecto para lecturas globales** | Solo si la puerta lo exige. En vez del espejo de 45 columnas: una sola marca por proyecto («tiene conceptos sin resolver») para que `resumen`/`avisos` deriven solo esos proyectos. Se diseña entonces con los datos de V0; no se escribe SQL antes. **Heredado del plan anterior y obligatorio:** cobertura mecánica de triggers con `plpgsql_show_dependency_tb` (confirmar que existe en `plpgsql_check` 2.8), `WHEN (OLD IS DISTINCT FROM NEW)` sin listas de columnas, advisory lock por proyecto con `read committed` explícito, guarda en `auditar_consistencia()` que solo reporta (corregir es manual), lanzamiento en sombra con ventana en 0, reversa probada y `SET LOCAL serenata.sin_refresco` para cargas masivas. Dependencias que hoy ensanchan el conjunto afectado: `pagos` (anulado, fecha, comprobante), `clientes`, `items_cotizacion`, `proveedores`, `cotizaciones`, y los documentos ligados por `factura_documento_id` (una factura puede cruzar proyectos). | Sí, en sombra |
| **V3 Cierre** | ADR 019 reescrito (se descartó materializar primero; medidas antes/después) y `ARCHITECTURE.md` («última versión `20261029`» caduca); actualizar la regla de `.claude/rules/migraciones.md` sobre `cuentas_conceptos_derivar` (la función no existe); quitar `p_proyecto` muerto de `cuentas_por_proyecto` si una migración de V1 la toca; `live` 3 corridas seguidas; `escala.yml` con los casos nuevos; cerrar #110 y mover este archivo a `docs/archive/`. | — |

## Validación (presupuestos provisionales; se fijan con la línea base de V0)

- **Salida idéntica:** 0 diferencias entre la función anterior y la nueva, y `cuentas-paridad-sql` en verde (también en `live`).
- Detalle de un concepto y `estado_cuenta`: buffers casi constantes (no dependen del tamaño del historial).
- Lecturas con dataset de 10 años: `periodo` (mes) < 100 ms de servidor, `periodo` (año) < 250 ms, `resumen`/`avisos` < 60 ms y **sin crecer con los
  años**, detalle < 10 ms; en el cliente, p95 < 800 ms (el gate de `escala.yml`).
- `auditar_consistencia()` = 0 en test y producción antes y después de cada lanzamiento.

## Riesgos

- **P1** — Reescribir una función de ~400 líneas con 5 modos: lo cubre V1c (comparación completa contra la anterior) y la reversa por migración.
- **P1** — Mejora insuficiente de las lecturas globales: la puerta lo decide con datos de 10 años, no con estimaciones; V2 queda definido pero apagado.
- **P1** — Medir con tiempo de reloj en cómputo Micro: buffers + filas + mediana, `escala.yml` solo como tendencia.
- **P2** — El dataset de V0 depende de los parámetros del negocio (ver abajo); mientras falten, se usa la forma actual de test y se anota como supuesto.
- **P2** — Documentos desactualizados (ADR 019, `ARCHITECTURE.md`, cuerpo del issue #110): se corrigen en V3 y en este mismo cambio el issue queda apuntando a este plan.

## Pendiente del usuario

Parámetros del negocio para V0: proyectos por año y su estacionalidad, renglones y proveedores por proyecto, % PPD/PUE, documentos y pagos
por concepto, % resuelto por antigüedad y reaperturas. Sin ellos V0 usa la forma de test y lo declara como supuesto.

## Tracker

| Bloque | Estado |
|---|---|
| Prerrequisito #124 (región) | Hecho (2026-10-06) |
| Prerrequisito #123 (modelo de facturas y pagos) | Hecho (2026-10-08, `35709b6`) |
| PR #100 | Cerrado como reemplazado (2026-10-09) |
| V0 Medición fiel | Pendiente |
| V1a Opciones sin derivación | Pendiente |
| V1b Derivación por conjunto de proyectos | Pendiente |
| V1c Equivalencia | Pendiente |
| Puerta tras V1 | Pendiente |
| V2 Marca por proyecto (condicional) | No iniciado — depende de la puerta |
| V3 Cierre | Pendiente |
