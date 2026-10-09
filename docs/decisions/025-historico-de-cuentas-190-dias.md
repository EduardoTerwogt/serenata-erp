# 025 — Histórico de Cuentas: solo consulta a los 190 días del último cambio (#110)

**Estado:** aprobada el 2026-10-09; en ejecución (plan en `docs/PLAN.md`, bloque B2). Sustituye a la decisión
[019](019-cuentas-conceptos-materializada.md). Esta decisión se completa al cerrar B2 con lo realmente medido y construido.

## Contexto

Cada lectura global de Cuentas re-deriva todo el historial con `cuentas_conceptos` (plpgsql, `force_custom_plan`). Medido el 2026-10-09:
≈16.8k buffers (0.7–1.8 s) para `cuentas_resumen` sobre 16,195 conceptos, de los cuales ≈3.4k son un piso constante (producción, con 5 conceptos, ya
cuesta 3,360). Con 1,000 proyectos al año durante 10 años (≈65k conceptos) las lecturas globales extrapolan a 2.7–6.6 s contra el
`statement_timeout` de 8 s de PostgREST. La alternativa de guardar una copia derivada (019) mete una clase de falla en cada escritura financiera.

## Decisión

Un proyecto pasa a **histórico de solo consulta** cuando se cumplen a la vez:

- todos sus conceptos están **resueltos**,
- no tiene una reapertura activa, y
- lleva **190 días naturales (hora CDMX) sin ningún cambio registrado en el sistema** (`cuentas_ultimo_cambio`: la fecha en que se registró algo, no la fecha
  de negocio del documento; así un pago con fecha vieja capturado hoy no archiva el proyecto esa misma noche).

Reglas:

1. **Automático y diario**, por la RPC `archivar_cuentas_historicas(p_year, p_hoy, p_dry_run)` que llama el `keep-alive`. Por año, para no pasar los 8 s.
2. **Componentes:** los proyectos unidos por una factura o un pago compartido se archivan **juntos y solo si todos cumplen**. Un componente que cruza años
   no se archiva y se reporta.
3. **Inmutable:** un histórico no se reabre ni se corrige desde la aplicación. Escribir en él (cuentas, grupos, documentos, reaperturas, una cotización
   complementaria) falla con un error explícito `proyecto_historico` (409), por una guarda en la base, no en las rutas.
4. **Sigue sumando** en totales, año/mes y búsqueda; solo `resumen` y `avisos` lo ignoran, porque un histórico está resuelto y no puede aportar avisos.
5. **Alcance: solo Cuentas.** No se toca el módulo Proyectos ni la tabla `proyectos` más que la columna `cuentas_historico_at`.
6. **Emergencia (solo SQL de admin):** limpiar `cuentas_historico_at` e insertar una fila en `cuentas_reaperturas` con motivo y usuario.
   **Reversa:** `cuentas_historico_at = NULL` en todos y retirar los triggers.

## Razón

El histórico es una decisión de negocio persistida (como aprobar o cancelar una cotización), no una caché que pueda desfasarse: nada puede escribir en un
histórico, así que su marca no puede quedar vieja. Reemplaza a la copia derivada de 019 con una columna, una función y una guarda en pocas tablas.

## Invariante y su vigilancia

**Histórico ⇒ resuelto e inmutable.** `auditar_consistencia()` suma tres guardas: histórico con concepto no resuelto, histórico con reapertura activa y
componente mixto (un histórico conectado con un proyecto vivo). Si una regla futura cambia qué significa «resuelto» (ajuste de monto de factura, notas de crédito,
traspaso, saldo a favor, gastos sin factura, «dar por perdido»; ver `docs/ROADMAP.md` → «Después»), hay que revisar `archivar_cuentas_historicas`.

## Pendientes y riesgos aceptados

- **Archivar es irreversible por decisión de negocio.** Mitigación: `p_dry_run` con lista previa, respaldo manual antes del primer archivado real en
  producción (plan Free sin respaldos, decisión 020) y el procedimiento de emergencia de arriba.
- **Módulo Proyectos:** sin guarda sobre `proyectos`, la fecha de entrega de un histórico sigue editable y movería sus totales. Qué se congela de Proyectos
  (etapa, notas, fecha de entrega, Reporte de Cierre) se define cuando se trabaje ese módulo.
- **Régimen fiscal del proveedor:** los totales fiscales de un histórico (IVA y ISR retenidos) leen el régimen **actual** de `proveedores`; editarlo cambiaría
  un histórico. Fuera de alcance de #110.

## Alternativas descartadas

- Tablas espejo con triggers en ~14 tablas, cola y locks (019 / PR #100): una clase de falla en cada escritura financiera.
- Marca derivada «proyecto resuelto» mantenida por triggers: mismo costo, y se desfasa.
- RPC única `cuentas_carga`, vista materializada, caché externa: no bajan el costo por endpoint o dejan datos viejos en una pantalla de dinero.
- Ventana fija de N años sin importar el estado: esconde pendientes reales.
