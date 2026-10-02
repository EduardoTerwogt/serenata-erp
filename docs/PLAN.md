# Plan de la iniciativa activa

**Estado:** Borrador (2026-10-02) — "Frente 2 v2: Cuentas sin recálculo, sobre el
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
proyecto, lo pendiente) y no al historial completo, con el cómputo actual del
plan Free de Supabase (sin subir cómputo). Meta: aguantar ~2,500 proyectos por
año y ~10 años de historial con `live` en verde de forma estable.

## Diagnóstico (2026-10-02, código de `main` y BD de test)

Test: 2,203 proyectos (todos en 2026), 2,206 cobros, 10,992 cuentas por pagar,
10,985 grupos, 13,193 conceptos; **8 documentos de cobro, 4 de pago, 4 + 2
pagos**. `shared_buffers` 224 MB, `max_connections` 60.

1. **Una carga de `/cuentas` deriva todo 4 veces.** `cuentas_periodo` y
   `cuentas_opciones` derivan el año; `cuentas_resumen` y `cuentas_avisos_items`
   llaman `cuentas_conceptos(NULL, hoy)`: **todo el historial**. La curva de
   escala (archivo de la simplificación, B7) ya lo muestra: con 10 años de
   500 proyectos, `periodo` cuesta 105 ms pero `resumen`/`avisos` ~460–530 ms.
   Esas dos crecen sin límite con el tiempo aunque el negocio no crezca.
2. **Derivar un solo concepto cuesta casi lo mismo que derivar miles.**
   `cuentas_conceptos(NULL, hoy, 'cobro', id)` (el detalle, `detalle.ts`):
   37 ms y 3,701 buffers para **1 fila**, contra 548 ms y 161,979 buffers el
   año completo. Causa: función `LANGUAGE sql` con filtros
   `p_objetivo IS NULL OR …` y `CASE` en el `WHERE`, que impiden usar índices,
   y CTEs de documentos (`cc_factura`, `cc_comp`, `p_factura`, `p_comp`,
   `p_fechas`) con `DISTINCT ON`/`GROUP BY` sobre **toda** la tabla, sin filtrar
   por proyecto. Esto explica el refresco de 141 ms de media (máx. 2.9 s) que
   midió el PR #100: cada refresco de un proyecto escaneaba todo.
3. **El dataset de test no mide lo que crecerá.** Casi no tiene documentos ni
   pagos (12 y 6), todo está pendiente y hay 1 grupo por cuenta. En uso real
   cada concepto acumula 2–5 documentos y pagos, la mayoría queda resuelta y un
   grupo junta varias cuentas. Los puntos 1 y 2 empeoran con eso y hoy no se ven.
4. **Lo que depende de "hoy" es poco y se puede guardar como fecha.**
   `venc_dias`, `vencido`, `paso_urgente`, `hay_vencidos` y los avisos por
   vencer salen de `fecha_vencimiento` y `hoy`: se guardan las fechas y se
   compara al leer.
5. **Paridad de entornos:** test está en `us-east-2`, producción en
   `us-west-2` y Vercel en `sfo1`. Parte del p95 de `live` es red, no SQL.
6. `cuentas_orden_candidatos` no usa la derivación (filtra por estado
   directo); queda fuera.

## Opciones

| | Qué | A favor | En contra |
|---|---|---|---|
| **A** | Retomar el PR #100 tal cual (tabla por concepto + 11 triggers + cola). | Ya diseñado y medido. | Escrito sobre el esquema anterior a la simplificación (B5 cambió pagos, grupos y estado del cobro); el refresco hereda el punto 2 (141 ms por escritura); `resumen`/`avisos` siguen recorriendo todo el historial de la tabla. |
| **B** | Solo la "palanca barata": derivación barata por proyecto, sin estado nuevo. | Sin triggers ni tabla; arregla el detalle y baja todo. | `resumen`/`avisos` siguen sin saber qué está pendiente sin derivar todo; ayuda, no resuelve el crecimiento con el historial. |
| **C** | **A v2:** primero B (derivación por proyecto con índices), y encima la tabla por concepto mantenida en la misma transacción, con índice parcial de pendientes y lecturas acotadas a mes/proyecto/pendiente. | Cada lectura cuesta lo que muestra; el refresco por escritura pasa de ~141 ms a pocos ms; `resumen`/`avisos` dejan de crecer con el historial; reusa el mecanismo probado del PR #100 (cola + constraint trigger diferido + reconciliación). | Es la opción con más piezas; requiere dataset realista para demostrarlo. |
| D | Tabla refrescada por `pg_cron` cada minuto (consistencia eventual). | Las escrituras no pagan nada. | Tras subir una factura la UI mostraría el estado viejo hasta un minuto; rompe "leer lo que acabas de escribir". Descartada. |
| E | Subir cómputo de Supabase. | Cero código. | Fuera del plan Free (requisito del usuario). Descartada. |

## Recomendación: C

Es mejor que el plan original en tres puntos: (1) el refresco por escritura se
abarata 1–2 órdenes de magnitud porque la derivación por proyecto deja de
escanear tablas completas; (2) `resumen` y `avisos` leen solo lo pendiente
(índice parcial), así que su costo depende del trabajo abierto y no de los años
acumulados; (3) `periodo` lee el mes pedido por índice `(anio, mes)` y solo
calcula el año completo para los contadores por mes. B va primero porque vale
solo (detalle y refresco) y es requisito de C.

Todo cabe en el plan Free: la tabla pesa ~10 MB por año de 2,500 proyectos
(límite 500 MB), `pg_cron` está disponible y no se agrega cómputo.

## Bloques propuestos

| Bloque | Qué | Sale a producción solo |
|---|---|---|
| **V0 Medición fiel** | Extender `scripts/db/escala-generador.sql` con documentos, pagos, grupos de varias cuentas y ~80 % de conceptos resueltos en meses pasados; línea base de la curva (500 / 2,200 / 5,000 y 10 años) incluyendo detalle y derivación de un proyecto. | No aplica (scripts). |
| **V1 Derivación por proyecto** | `cuentas_conceptos` a plpgsql con ramas por modo (todos / año / proyectos / un concepto), documentos y pagos buscados por llave (`LATERAL … ORDER BY fecha_carga DESC LIMIT 1`) e índices parciales nuevos (p. ej. `documentos_cuentas_cobrar (cuentas_cobrar_id, fecha_carga DESC) WHERE tipo = 'FACTURA_XML' AND eliminado_at IS NULL`). Sin cambio de resultado: paridad = 0. | Sí. Mejora el detalle y todas las lecturas actuales. |
| **V2 Tabla y refresco** | `cuentas_conceptos_base` + cola + constraint trigger diferido + advisory lock por proyecto, portado del PR #100 **sobre el esquema vigente** (re-auditar las tablas fuente tras B5). Guarda fechas en vez de lo que depende de "hoy". Backfill y `cuentas_conceptos_reconstruir()`. | Sí, sin lectores todavía (solo se mantiene). |
| **V3 Lecturas** | `cuentas_periodo` (mes por índice; contadores del año), `cuentas_opciones` (distinct sobre la tabla), `cuentas_resumen` y `cuentas_avisos_items` (índice parcial `WHERE NOT resuelto`), detalle (una fila por llave). | Sí. |
| **V4 Red de seguridad** | Reconciliación diaria en el cron existente y guarda nueva en `auditar_consistencia()` (tabla = derivación); ADR 019 reescrito; regla de migraciones actualizada. | Sí. |
| **V5 Cierre** | k6 de escrituras concurrentes (aprobar, pagar, subir documento) con presupuesto de latencia; `live` 3 corridas seguidas; aplicar en producción; cerrar el PR #100 como reemplazado. | — |

Puerta tras V1: medir otra vez. Si V1 solo ya deja todo bajo meta con el
dataset realista, decidir con el usuario si V2–V3 se hacen ya o quedan con
disparador.

## Riesgos

- **P0 — Dinero mal mostrado por desfase tabla↔derivación.** Mitigación:
  refresco en la misma transacción, paridad en CI y `live`, reconciliación
  diaria y guarda en `auditar_consistencia()`.
- **P0 — Una falla de la derivación bloquea escrituras de negocio** (aprobar,
  pagar). Mitigación: V1 abarata y simplifica el refresco; probar bajo
  restricciones de PostgREST (`pg_safeupdate`, `statement_timeout`/
  `lock_timeout` de 8 s), no solo con `postgres`.
- **P1 — Contención entre escrituras concurrentes del mismo proyecto.**
  Advisory lock en orden fijo; k6 de escrituras en V5.
- **P1 — Medir con un dataset que no se parece al real.** V0 antes de todo.
- **P1 — Paridad de regiones** (test `us-east-2` vs producción `us-west-2`):
  el p95 de `live` mezcla red y SQL. Medir server-side (`EXPLAIN ANALYZE`) como
  métrica primaria; mover test de región es decisión del usuario (implica
  recrear el proyecto Free).
- **P2 — Mantenimiento:** columna o tabla nueva leída por la derivación sin
  trigger. Regla vigente en `.claude/rules/migraciones.md` y la guarda diaria.
- **P2 — Cargas masivas** (generador, reinicios): `serenata.sin_refresco` +
  `cuentas_conceptos_reconstruir()`.

## Validación

- Paridad derivación↔tabla = 0 y paridad SQL↔TS (`cuentas-paridad-sql`) en verde.
- Curva `escala.yml` con el dataset de V0 (server-side, p50/p95): metas
  provisionales — `periodo` (mes) < 100 ms, `periodo` (año) < 250 ms,
  `resumen`/`avisos` < 60 ms **sin crecer con los años**, detalle < 10 ms,
  refresco de un proyecto p95 < 30 ms.
- k6 de escrituras: p95 de aprobar/pagar sube menos de 50 ms contra la base.
- `live` 3 corridas seguidas en verde; `auditar_consistencia()` = 0 en test y
  producción.

## Tracker

| Bloque | Estado |
|---|---|
| V0 Medición fiel | Pendiente |
| V1 Derivación por proyecto | Pendiente |
| V2 Tabla y refresco | Pendiente |
| V3 Lecturas | Pendiente |
| V4 Red de seguridad | Pendiente |
| V5 Cierre | Pendiente |
