# 025 — Histórico de Cuentas a 190 días y lectura sin recalcular el historial (#110)

**Estado:** BORRADOR (2026-10-09) — se completa y se marca "Aprobada" al cerrar B4 de `docs/PLAN.md`. Sustituye a
[`019`](019-cuentas-conceptos-materializada.md).

## Contexto

Cada lectura global de Cuentas re-deriva todo el historial con `cuentas_conceptos`. Con ~65k conceptos (1,000 proyectos/año × 10 años)
las lecturas globales extrapolan a 2.7–6.6 s contra un `statement_timeout` de 8 s. Volumen y reglas de negocio decididos por el usuario
el 2026-10-09 (ver `docs/PLAN.md`, «Decisiones del usuario»).

## Decisión (resumen; el detalle se completa en B4)

- Primero abaratar la lectura sin estado nuevo (B1).
- Un proyecto pasa a **histórico** de solo consulta 190 días después del último cambio registrado en el sistema, cuando todo está resuelto
  (B2). Proyectos unidos por factura o pago compartido se archivan juntos y solo si todos cumplen.
- Escribir en un histórico falla con error explícito (`proyecto_historico`).
- `resumen` y `avisos` ignoran los históricos (todas sus categorías exigen un concepto sin resolver).

## Alternativas descartadas

Tablas espejo con triggers (PR #100, ADR 019), RPC única `cuentas_carga`, vista materializada, caché externa, `cuentas_opciones` desde
tablas base, debounce del contador y aviso previo de archivado. Motivos en `docs/PLAN.md` → «Enfoque».

## Pendientes anotados

- La fecha de entrega de un histórico sigue editable desde Proyectos hasta que se defina ese módulo.
- Los totales fiscales de un histórico dependen del régimen fiscal actual del proveedor.
