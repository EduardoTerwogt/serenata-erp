# PAUSADO (2026-10-01) — Frente 2: `cuentas_conceptos` sin recálculo por RPC

> **Estado: en pausa, no cerrado.** El usuario abrió la iniciativa
> "Simplificación del modelo de datos" (`docs/PLAN.md`) y se decidió no
> terminar el frente 2 hasta saber si esa simplificación cambia la forma de
> `cuentas_conceptos_base`. Este archivo es el tracker tal como quedó; para
> retomarlo, moverlo de vuelta a `docs/PLAN.md` cuando la iniciativa activa lo
> permita (una sola iniciativa a la vez).

## Dónde quedó (2026-10-01)

- **Código:** PR #100 en borrador, rama `claude/wonderful-hamilton-260e2w`
  (HEAD `0c0f5c3`): #99 (desglose IVA, utilidad con descuento), invariante de
  grupos (`20261008`), frente 2 (`20261009`) y la corrección `20261010`
  (recálculo de grupo con bloqueo + `reconciliar` que deriva una vez).
  `20261010` está aplicada en **test**, no en producción.
- **CI en `0c0f5c3`:** `test`, `fresh-db`, `smoke-and-critical` en verde.
  `live`: 81 de 82; falló `cuentas-b7-correcciones` "anular con un pago
  simultáneo" por timeout de 30 s (4 corridas anteriores en verde o con
  fallos de otra causa ya corregidos).
- **Causa del último fallo (investigada, no es de la lógica):** en esa ventana
  (00:31–00:34 UTC) la BD de test se degradó entera —latencia del lado BD de
  42 ms a 1,140 ms, también en lecturas sin refresh— sin deadlocks ni
  timeouts en Postgres. El patrón (corrida rápida al inicio, lenta a mitad)
  aparece desde las 16:30 del 2026-09-30, **antes** de los triggers del
  frente 2. Test y producción son cómputo **Micro** (2 núcleos ARM
  compartidos), que según la documentación de Supabase solo rinde sobre su
  base en ráfagas cortas. No se pudo confirmar qué recurso se agota (CPU o
  IO): falta mirar Dashboard → Reports → Database (2026-10-01 00:30–00:35 UTC).
- **Decisión pendiente del usuario:** subir el cómputo de test (y luego el de
  producción) vs. subir timeouts de las pruebas largas vs. solo reintentar.
  Recomendación: confirmar en el Dashboard y subir el cómputo.

## Cómo retomar

1. Confirmar la causa en el Dashboard y resolver el cómputo (H5).
2. H4: `live` 3 corridas seguidas en verde en el commit final; escenario k6
   `cuentas-escrituras.js`; corrida de `load-test.yml`.
3. A4: aplicar `20261007`, `20261008`, `20261009` y `20261010` en producción
   (antes, mostrar las 3 filas de SH072 que repara `20261008`), verificar
   `cuentas_conceptos_diferencias = 0`, y mergear el PR #100.
4. Si la iniciativa de simplificación cambia las tablas fuente, revisar
   primero qué triggers y qué derivación sobreviven (ADR 019, §Triggers).

---

# Plan de la iniciativa activa

**Estado:** Aprobado, listo para ejecutar — "Frente 2: derivar `cuentas_conceptos` sin recalcularlo en cada RPC", **opción A** (2026-09-30).

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** (este estado) — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Rediseño de la sección Cuentas" (2026-09-26)
— historia en `docs/archive/rediseno-cuentas.md`.

---

# Frente 2 — `cuentas_conceptos` sin recálculo por RPC

## Contexto

- Cada carga de `/cuentas` dispara `cuentas_periodo`, `cuentas_resumen`,
  `cuentas_opciones` y `cuentas_avisos_items` en paralelo, y **cada una
  recalcula `cuentas_conceptos` desde cero** (~200–400 ms en caliente sobre
  el dataset de carga de test: ~2,200 proyectos, ~13,000 conceptos/año).
- El job `live` mide p95 < 800 ms por endpoint (O1b) y falla de forma
  intermitente desde #92. En el PR #100 (issue #99) falló **3 veces seguidas**,
  cada vez en un endpoint distinto (mes, resumen, lista) y una vez con
  `statement_timeout` en la paridad. Medido: el cambio de #99 cuesta ~2 ms en
  caliente; la varianza viene de la BD de test (misma consulta de 400 ms a
  1.2–4.7 s bajo contención; lecturas frías de 98 ms donde en caliente son 2 ms).
- Decisión del usuario (2026-09-30): **atacar este frente antes de mergear
  el PR #100**. El PR queda en borrador; sus migraciones 20261007/20261008 no
  se aplican en producción hasta entonces.
- Deuda de referencia: `docs/ROADMAP.md` → "Latencia en paralelo de las RPCs
  de Cuentas"; decisión 017 §O1/O1b (paridad SQL↔TS obligatoria).

## Opciones (a decidir)

| | Qué | A favor | En contra |
|---|---|---|---|
| **A** | Tabla `cuentas_conceptos_mat` mantenida por triggers en las tablas fuente (cotizaciones, cuentas_cobrar/pagar, grupos, documentos, pagos, reaperturas). Las RPCs leen de ahí. | Lecturas O(filtro); consistencia inmediata; escala a producción futura. | Muchos triggers; lo que depende de "hoy" (vencido, `venc_dias`) no se materializa y se calcula al leer; riesgo de desincronía si falta un trigger (mitigado con test de paridad contra la función actual). |
| **B** | `MATERIALIZED VIEW` de la parte que no depende de "hoy", con `REFRESH ... CONCURRENTLY` al final de cada RPC de escritura (o por cron). | Poco código; la función actual casi se reutiliza. | Refresh completo en cada escritura (costoso con volumen); ventana de datos viejos si es por cron. |
| **C** | Una sola RPC `cuentas_carga(p)` que deriva `cuentas_conceptos` **una vez** y devuelve periodo + resumen + opciones (+ avisos) en una respuesta. | Cambio acotado, sin estado nuevo en BD; quita 3 de 4 recálculos por carga; la paridad TS se conserva. | No acelera un endpoint aislado (cambiar de página del periodo sigue recalculando); cambia el contrato de la ruta/UI. |

**Decisión (2026-09-30): opción A.** Se había recomendado C, pero la
medición F2-0 la descartó: `cuentas-periodo-rendimiento.spec.ts` mide **cada
endpoint por separado y en serie** (40 llamadas seguidas), así que juntar las
RPCs no baja el tiempo que falla. De los ~400–450 ms por llamada, ~330 ms son
`cuentas_conceptos` recalculando ~13,000 conceptos; con esa base, cualquier
contención de la BD de test rebasa 800 ms. A deja cada lectura en filas ya
calculadas.

### Diseño de A

- **Tabla `cuentas_conceptos_base`**: una fila por concepto con todo lo que
  **no** depende de "hoy" (lo mismo que devuelve `cuentas_conceptos` salvo
  `venc_dias`, el estado `vencido` y `paso_urgente`, que se derivan al leer
  desde `fecha_vencimiento`). Llave: `key` ('c:…', 'g:…', 's:…'); índices por
  `proyecto_key` y por `anio, mes`.
- **Refresco por proyecto**: `cuentas_conceptos_refrescar(p_proyectos text[])`
  borra y recalcula los conceptos de esos proyectos **reutilizando la
  derivación actual** (misma consulta, filtrada por proyecto; principio 7,
  sin segundo motor).
- **Triggers** (el plan decía `AFTER … FOR EACH STATEMENT` con tablas de transición; se implementó por fila con cola, ver decisión 019) (sin
  duplicar proyectos) en las tablas fuente: `cotizaciones`, `proyectos`,
  `cuentas_cobrar`, `cuentas_pagar`, `cuentas_pagar_grupos`,
  `documentos_cuentas_cobrar`, `documentos_cuentas_pagar`,
  `pagos_comprobantes`, `pagos_cuentas_pagar`, `cuentas_reaperturas` y
  `proveedores` (nombre/régimen → todos sus proyectos). Refresco síncrono en
  la misma transacción: nunca hay datos viejos.
- **Lecturas**: `cuentas_periodo`, `cuentas_resumen`, `cuentas_avisos_items`
  y `cuentas_opciones` leen de la tabla y calculan lo de "hoy" al vuelo.
- **Red de seguridad**: test live de paridad tabla ↔ función de derivación
  (la función se conserva como referencia) y reconciliación completa en el
  cron diario (`/api/keep-alive`) que reporta y corrige diferencias.

### Bloques

1. **A1 — Tabla y refresco**: migración con la tabla,
   `cuentas_conceptos_refrescar` y el backfill completo; test de paridad
   tabla ↔ `cuentas_conceptos`.
2. **A2 — Triggers**: triggers en todas las tablas fuente; tests live de que
   cada RPC de escritura (aprobar, cancelar, pagos, documentos, reasignar,
   reabrir) deja la tabla igual a la derivación.
3. **A3 — Lecturas**: las 4 RPCs leen de la tabla; paridad SQL↔TS y
   rendimiento (`cuentas-periodo-rendimiento`) en verde.
4. **A4 — Cierre**: 3 corridas de `live` seguidas en verde; aplicar en
   producción junto con 20261007/20261008 y mergear el PR #100.

## Tracker

| Bloque | Estado |
|---|---|
| F2-0 Medición | Hecho (2026-09-30) |
| A1 Tabla y refresco | Hecho (2026-09-30): `20261009` en test y en el PR #100. Paridad leer↔derivar = 0 (2026, todos, 2025, fecha futura); leer 51–69 ms vs derivar 224–283 ms; refrescar 2 proyectos 35 ms. La derivación pasó a plpgsql + `force_custom_plan` (el plan genérico tardaba ~7.5 s). El test live de paridad pasa a A2: sin triggers la tabla se desactualiza con los specs que escriben. |
| A2 Triggers | Hecho (2026-09-30). Triggers en las 11 tablas fuente, cola `cuentas_conceptos_pendientes` y constraint trigger diferido (un refresco por transacción, advisory lock por proyecto). Se probó también un refresco al leer (`0572ff3`) y se descartó en CI por razones de diseño; ver `docs/decisions/019-cuentas-conceptos-materializada.md`. |
| A3 Lecturas | Hecho (2026-09-30): las 4 RPCs leen de la tabla; `cuentas_periodo` (mes) 311 → 140 ms, `cuentas_resumen` 261 → 84 ms; los 5 tests de rendimiento pasaron con p95 < 800 ms. |
| H1 Consolidar migraciones | Hecho: `20261009` única (antes `20261009`–`20261015`); 21 de 21 funciones idénticas a la base de test. |
| H1b/H1c Endurecer | Hecho: tipo `cuentas_concepto_t`; los `UPDATE` de solo `estado` ya no refrescan (500 cobros: 498 proyectos y 882 ms → 0). |
| H2 Red de seguridad | Hecho: `cuentas_conceptos_reconciliar()` + `/api/keep-alive`. |
| H3 Documentación | ADR 019, ARCHITECTURE, ROADMAP, regla de migraciones. |
| H4 Validación bajo demanda | Pendiente: `live` 3 corridas seguidas, escenario k6 de escrituras (aprobar) y corrida de `load-test.yml`. |
| H5 Paridad de entornos | Pendiente (checklist: regiones, versiones, cómputo). |
| A4 Cierre | Pendiente: aplicar `20261007`, `20261008` y `20261009` en producción y mergear el PR #100. |

**Corrección de diagnóstico (2026-09-30):** el timeout de los B7 en `c7b2fad`
no se demostró causado por el refresco; el entorno completo estuvo +20 % más
lento entre dos corridas con el mismo código. Y la escala de referencia es la
de test, no la de producción de hoy (28 proyectos): ver la decisión 019.
