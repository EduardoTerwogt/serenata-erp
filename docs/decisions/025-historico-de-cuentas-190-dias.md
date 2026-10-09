# 025 — Histórico de Cuentas a 190 días y lectura sin recalcular el historial (#110)

**Estado:** APROBADA (2026-10-09). Implementada en el PR #136 (migraciones `20261039` y `20261040`); producción al cerrar la iniciativa.
Sustituye a [`019`](019-cuentas-conceptos-materializada.md). Plan y mediciones: `docs/archive/frente2-historico-cuentas-110.md`.

## Contexto

Cada lectura global de Cuentas re-derivaba todo el historial con `cuentas_conceptos`. Con ~65k conceptos (1,000 proyectos/año × 10 años)
las lecturas globales extrapolaban a 2.7–6.6 s contra un `statement_timeout` de 8 s. Volumen y reglas decididos por el usuario el 2026-10-09.

## Decisión

1. **Lectura barata, sin estado nuevo (B1, `20261039`).** `cuentas_conceptos` deja de barrer tablas completas: sin objetivo y con ≥ 30% de los
   proyectos usa índices o `hash join` según convenga (`enable_nestloop = off` solo mientras dura la función). Sigue siendo plpgsql con
   `plan_cache_mode = force_custom_plan` (CI lo exige): como `LANGUAGE sql` se planea sin los valores y hace una sonda de índice por fila.
2. **Histórico (B2, `20261040`).** `proyectos.cuentas_historico_at`. Un proyecto pasa a histórico de **solo consulta** 190 días naturales (CDMX)
   después del último cambio registrado en el sistema (`cuentas_ultimo_cambio_lote`: máximo de las marcas de cuentas, grupos, pagos y líneas,
   documentos, reaperturas y correcciones), cuando tiene ≥ 1 concepto, todos resueltos y sin reapertura activa.
   - **Componentes:** proyectos unidos por factura de cobro o pago compartido se archivan **juntos y solo si todos cumplen**; un componente que cruza
     años o incluye un proyecto vivo no se archiva (se reporta en la simulación).
   - **Quién archiva:** `archivar_cuentas_historicas(p_year, p_hoy, p_dry_run)`, `service_role`, por año (cada llamada cabe en los 8 s de
     PostgREST; ~1.4 s por 950 proyectos). La invoca el cron diario `keep-alive`, una vez por año, cada una en su `try/catch`; si falla alguna, el cron
     responde 500 al final y lo dice. Bloquea los proyectos (`FOR UPDATE`) y **recomprueba** la marca antes de escribir.
   - **Escribir en un histórico falla** con `proyecto_historico` (SQLSTATE `P1420`; 409 en la API vía `DomainError`). Trigger
     `cuentas_bloquear_historico()` (`trigger_00_cuentas_historico`, corre antes de los de folio) sobre `cuentas_cobrar`, `cuentas_pagar`,
     `cuentas_pagar_grupos`, `documentos_cuentas_*`, `cuentas_reaperturas`, `cotizaciones` y `pagos` (UPDATE). `FOR KEY SHARE` en la guarda
     (no frena ediciones normales). Un test de comportamiento ejecuta cada RPC de escritura de Cuentas contra un histórico y exige el rechazo.
   - **Lecturas:** `cuentas_conceptos(…, p_objetivo)` acepta `'vivos'` y `'historicos'`. `cuentas_resumen` y `cuentas_avisos_items` usan `'vivos'`
     (todas sus categorías exigen un concepto sin resolver; un histórico está resuelto). **Todo lo demás sigue viendo los históricos:**
     `cuentas_periodo` (con la bandera `historico` y su insignia), totales de ingresos, egresos, utilidad e impuestos, `estado_cuenta`, detalle,
     búsqueda, y el dashboard (lee las tablas base).
   - **Régimen fiscal congelado (`20261041`, decisión del usuario 2026-10-09):** un proyecto cerrado no se mueve si el proveedor cambia de
     régimen; solo se mueve lo abierto. Al archivar, `archivar_cuentas_historicas` guarda el régimen de cada proveedor del proyecto en
     `proyectos.cuentas_regimenes` y `cuentas_conceptos` lo usa mientras `cuentas_historico_at` no sea NULL (retenciones de IVA/ISR y total
     estimado). Un histórico sin congelado (archivado antes de la migración) cae al régimen actual. **Límite conocido:** el congelado ocurre al
     archivar (190 días tras el último cambio); un proyecto ya resuelto pero aún no histórico sigue el régimen actual.
   - **Auditoría:** `auditar_consistencia()` pasa de 24 a 27 guardas (`historico_modificado`, `historico_reabierto`, `componente_mixto`).
3. **Puerta de rendimiento redefinida por el usuario (B3).** 5 usuarios simultáneos con el comportamiento real de la pantalla, p95 < 800 ms por
   endpoint; 10 usuarios es un **dato** (≈ 1–1.5 s en Micro), señal para subir el plan de Supabase. Escenario: `scripts/loadtest/k6/cuentas.js`.

## Emergencia y reversa

- Reabrir uno: SQL de admin que limpie `cuentas_historico_at` y `cuentas_regimenes` del proyecto e inserte en `cuentas_reaperturas` con motivo y usuario (rastro de auditoría existente).
- Reversa total: `UPDATE proyectos SET cuentas_historico_at = NULL, cuentas_regimenes = NULL`, retirar los triggers `trigger_00_cuentas_historico` y volver a las funciones
  de `20261039` (`cuentas_conceptos`; `archivar_cuentas_historicas` de `20261040`), `20261031` (`cuentas_periodo`, `cuentas_resumen`, `cuentas_avisos_items`) y `20261034` (`auditar_consistencia`).

## Alternativas descartadas

- **Tablas espejo con triggers** (PR #100, ADR 019): estado derivado que hay que mantener consistente con cada escritura; nunca llegó a `main`.
- **RPC única `cuentas_carga`, vista materializada, caché externa**: añaden estado o datos viejos en dinero.
- **`cuentas_opciones` desde tablas base**: segundo motor que repite las reglas de contraparte y año de `cuentas_conceptos`; ahorra poco (~140 ms).
- **Unir `resumen` y `avisos`**: el panel de avisos es perezoso; solo ahorra cuando se piden juntos (~25% de CPU).
- **Reducir el CPU por concepto**: el perfil en caliente (≈ 390–470 ms para 8.8k conceptos) no tiene un punto caliente —es una consulta de ~10 uniones y
  ordenamientos repartidos—; reescribirla arriesga mucho por ~15–20%. **Revisar solo si `Server-Timing` en producción muestra `periodo` > 1 s sostenido.**
- **Debounce del contador y aviso previo de archivado**: YAGNI hasta que haga falta.

## Pendientes anotados

- La fecha de entrega de un histórico sigue editable desde Proyectos hasta que se defina ese módulo.
- Los proyectos resueltos pero aún no archivados (los primeros 190 días) siguen el régimen actual del proveedor; si el usuario quiere congelarlos
  desde que se resuelven, hay que guardar el régimen en cada RPC de pago/cierre (cambio mayor, hoy no pedido).
- Producción trae 24 guardas de auditoría; tras aplicar `20261040` serán 27.
