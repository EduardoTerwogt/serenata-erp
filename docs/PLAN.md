# Plan de la iniciativa activa

**Estado:** Borrador — "Frente 2: derivar `cuentas_conceptos` sin recalcularlo en cada RPC" (2026-09-30). Pendiente de aprobación del usuario.

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

**Recomendación inicial:** C primero (rápido, sin estado derivado nuevo,
ataca la causa de la contención) y medir; A solo si C no deja margen estable
bajo el presupuesto de 800 ms.

## Bloques propuestos (para C)

1. **F2-0 Medición base:** p95 por endpoint y por carga completa en test,
   aislado y en paralelo, con `EXPLAIN (ANALYZE, BUFFERS)` de `cuentas_conceptos`.
2. **F2-1 RPC combinada** `cuentas_carga(p jsonb)` + migración; la ruta y la UI
   piden una vez por carga; `periodo` sigue existiendo para cambios de
   página/filtro.
3. **F2-2 Paridad y rendimiento:** extender `cuentas-paridad-sql.spec.ts` y
   `cuentas-periodo-rendimiento.spec.ts` al contrato nuevo.
4. **F2-3 Verificación:** 3 corridas de `live` en verde seguidas; luego
   desbloquear el PR #100.

## Tracker

| Bloque | Estado |
|---|---|
| F2-0 | Pendiente |
| F2-1 | Pendiente |
| F2-2 | Pendiente |
| F2-3 | Pendiente |
