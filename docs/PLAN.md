# Plan de la iniciativa activa

**Estado:** En refinamiento — "Simplificación del modelo de datos" (fases 2 y 3 hechas 2026-10-01; espera decisiones del usuario).

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** (este estado) — una idea se confirma con alcance de iniciativa.
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

**Iniciativa en pausa:** "Frente 2 — `cuentas_conceptos` sin recálculo por
RPC" (epic #110, PR #100, rama `claude/wonderful-hamilton-260e2w`) — estado exacto y
cómo retomarla en `docs/archive/frente2-cuentas-conceptos-pausado.md`.

---

# Simplificación del modelo de datos

**Epic en GitHub:** #109. Fase 2: #105 · Fase 3: #106 · deuda relacionada: #108.

## Origen

El 2026-10-01 el usuario revisó el Schema Visualizer de Supabase y percibió
**demasiadas tablas**, datos repetidos e información dispersa que podría vivir
junta. Pidió analizarlo como iniciativa (análisis y plan en una sesión,
implementación en otra) con una condición dura: **hoy muchos puntos de la app
están conectados a la BD, nada debe romperse ni quedar suelto.**

## Qué se sabe hoy

- Inventario (fase 1) y matriz con evidencia (fase 2):
  `docs/inventario-tablas.md`.
- Alternativas y recomendación (fase 3): `docs/decisions/020-simplificacion-modelo-datos.md`
  (Propuesta). Recomendada: **B** — un dueño por dato + el grupo como única
  obligación de pago.
- Conclusión central: **el problema es estado duplicado, no número de
  tablas.** 40 → 36 tablas (32 si se retiran tareas/documentos de proyecto),
  ~20 columnas copiadas o derivadas menos, y desaparece la rama "suelta" de
  `cuentas_pagar` en ~10 RPCs.
- Evidencia de que el diseño actual ya deja divergir datos: contacto de
  proveedor distinto en 10 de 82 cuentas por pagar; 13 renglones con margen de
  la fórmula vieja (incluidos 3 aprobados que alimentan Cuentas); 2 proyectos
  con datos distintos a su cotización; `cuentas_pagar.item_id` sin FK.
- **Hallazgo bloqueante (H11):** Sheets → Supabase (`sync-up`, botón en Admin)
  escribe directo sobre cotizaciones, proyectos y cuentas sin RPC. Rompe con
  cualquier cambio de columnas y hoy ya puede saltarse invariantes.

## Objetivo

Que cada dato tenga **un solo dueño** (los demás lo leen por llave o lo
congelan a propósito como snapshot documentado), sin perder invariantes de
dinero e impuestos y sin romper ninguna pantalla, RPC, test, espejo de Sheets
ni el portal de proveedores.

## Fuera de alcance

- Cambiar reglas de negocio (`docs/decisions/006`).
- Unificar cobrar y pagar en tablas únicas (ADR 020, alternativa C).
- Rediseñar pantallas. Solo cambia lo que la UI lee por debajo.

## Fases

| Fase | Qué | Salida | Estado |
|---|---|---|---|
| 1. Inventario | Tablas, columnas, quién las toca | `docs/inventario-tablas.md` | Hecha (2026-10-01) |
| 2. Uso real y riesgo | Evidencia en datos, lectores, matriz por tabla | `docs/inventario-tablas.md` → "Fase 2" | **Hecha (2026-10-01)** |
| 3. Propuestas | 3 alternativas con costo y riesgo | ADR 020 (Propuesta) | **Hecha (2026-10-01)** |
| 4. Decisión y plan | El usuario responde las preguntas de abajo | Este archivo → "Aprobado" | **Pendiente del usuario** |
| 5. Ejecución | Bloques B0–B7, rama + PR por bloque | PRs | Pendiente |

## Decisiones pendientes del usuario

1. **Alternativa:** ¿B (recomendada), A (solo limpieza, sin tocar flujos de
   pago) o C?
2. **Sheets → Supabase (H11):** recomendación: Sheets queda **solo de lectura**
   (se quita `sync-up` o se limita a catálogos: `clientes`, `proveedores`,
   `productos`). ¿Alguien usa hoy el botón "Sheets → Supabase"?
3. **Datos de producción:** son de prueba. ¿Se migran tal cual (más seguro y
   más caro) o se permite borrar los registros de prueba legados (sueltas,
   `TEST EF1 - BORRAR`, márgenes viejos) antes de migrar?
4. **Tareas y documentos de proyecto** (`proyecto_tareas`,
   `proyecto_tarea_checklist`, `proyecto_documentos`,
   `tipo_proyecto_tarea_default`, 0 filas): ¿se usan o se van a usar? Si no,
   se retiran completas (tabla + rutas + UI) en un bloque propio.
5. **Proyecto vs cotización (H1):** propuesta: después de aprobar, el dueño de
   cliente/nombre/fecha/locación es `proyectos`; la cotización conserva lo que
   se emitió en el PDF. ¿Correcto, o un cambio en el proyecto debe reflejarse
   en la cotización?
6. **Frente 2:** recomendación: sigue en pausa hasta terminar B4 (su diseño
   depende de cuántas tablas alimenten Cuentas).

## Plan de ejecución (borrador, alternativa B)

Cada bloque sigue las reglas de ADR 020: **expandir → migrar lectores →
verificar → contraer**, mapa de dependencias en cero antes de borrar, guardas
de consistencia en 0 antes y después, test con el dataset de carga → PR con
las 4 suites verdes → prod. Funciones SQL se reescriben desde
`pg_get_functiondef` de producción.

| Bloque | Qué | Hallazgos | Riesgo | Depende de |
|---|---|---|---|---|
| **B0 — Red de seguridad** | Script versionado de guardas de consistencia (consultas de la fase 2) + script de mapa de dependencias por columna (código, Sheets, `pg_proc`, triggers, vistas, políticas). Respaldo de prod antes de B4. Resolver H14 y el cobro sin `proyecto_id`. | H14 | P2 | — |
| **B1 — Sheets solo lectura** | Quitar o limitar `sync-up` según decisión 2; ajustar `schema.ts` y Admin. | H11 | P1 | Decisión 2 |
| **B2 — Residuos, FKs y tipos** | Borrar `cliente_id_backfill_clasificacion` (CSV archivado). `cuentas_pagar.item_id` → uuid + FK. FKs faltantes. `timestamp` → `timestamptz`. `planeacion_pendientes.fecha`/`fecha_iso` en una. | H12, H13 | P2 | B0 |
| **B3 — Derivados generados** | `items_cotizacion.importe` y `.margen` como columnas generadas; recalcular `margen_total` de cotizaciones; quitar escrituras de esos campos en RPCs y TS. | H6 | P1 | B0 |
| **B4 — Grupo como única obligación** | Expandir: sueltas con proveedor → grupos de un renglón; pagos/documentos apuntan al grupo. Migrar RPCs y derivación TS sin rama suelta. Contraer: quitar `estado`, `monto_pagado`, `orden_pago_id`, `total_a_transferir`, `monto_transferido` de `cuentas_pagar` y `cuenta_pagar_id` de pagos/documentos. Renombrar `x_pagar` → `costo_total`. | H5, H9 | **P0** | B0–B2, decisión 3 |
| **B5 — Copias de terceros** | `cuentas_pagar` sin contacto ni copias del renglón (join a `proveedores` e `items_cotizacion`); `cuentas_cobrar` sin `cliente`/`proyecto` texto; `clientes.proyectos` → consulta; `historial_responsable` → vista o RPC sobre proyectos finalizados (mismo resultado que hoy). | H2, H3, H4, H7, H8 | P1 | B1, B2, B4 |
| **B6 — Idempotencia única** | `pago_operations` y `bulk_import_operations` → `idempotency_keys` (scope por RPC), conservando la atomicidad dentro de la transacción. | H10 | P1 | B4 |
| **B7 — Cierre** | Tareas/documentos de proyecto según decisión 4. Re-evaluar frente 2 con el modelo nuevo. Actualizar `ARCHITECTURE.md`, decisiones 011/017, ADR 020 → Aceptada. | — | P1 | B1–B6 |

Si se elige **A**: se ejecutan B0, B1, B2, B3, B5 (sin la parte de B4) y B7.

## Riesgos

- **P0:** B4 cambia cómo se registra y se lee el dinero a proveedores. Mitigación:
  paridad SQL/TS, guardas de consistencia (`Σ pagos = monto_pagado`,
  `grupo.monto_total = Σ costo_total`, órdenes = Σ desglose) en 0, `live` con el
  dataset de carga, respaldo antes de prod.
- **P1:** borrar una columna que algo todavía lee (Sheets, portal, un test, una
  función). Mitigación: mapa de dependencias automatizado en cero antes de cada
  contracción, y la contracción siempre en un deploy posterior a la migración
  de lectores.
- **P1:** re-escribir una función sobre una versión vieja (pasó en la decisión
  011). Mitigación: partir siempre de `pg_get_functiondef` de producción.
- **P2:** el conteo de funciones por coincidencia de texto sobrecuenta;
  el mapa de B0 lo reemplaza por dependencias verificadas.

## Tracker

| Bloque | Estado |
|---|---|
| Entrada de iniciativa y pausa del frente 2 | Hecho (2026-10-01) |
| Fase 1 — Inventario | Hecho (2026-10-01) |
| Fase 2 — Uso real y riesgo (#105) | Hecho (2026-10-01) |
| Fase 3 — Propuestas, ADR 020 (#106) | Hecho (2026-10-01), estado Propuesta |
| Fase 4 — Decisiones del usuario | **Pendiente** (6 preguntas arriba) |
| B0–B7 | Pendiente |
| Tickets en GitHub | Hecho (2026-10-01): epic #109, #105, #106, #108 |
