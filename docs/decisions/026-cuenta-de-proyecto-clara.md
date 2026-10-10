# 026 — Cuenta de proyecto clara para no contadores (#140)

**Estado:** APROBADA (2026-10-09). Implementada en el PR #142 (migración `20261042`). Plan: `docs/PLAN.md` (v4).

## Contexto

La cuenta de proyecto (`ProyectoPanel`) repetía utilidad e IVA, presentaba el ISR como un pago con fecha y «utilidad neta», no distinguía lo aproximado de
lo real y no contestaba «¿cuánto me deja y qué falta?». El «Ajuste −$9.09» de SH001 era un bug de `round2` (notación científica), no de datos.

## Decisión

1. **Una sola cifra y tres sobres.** El panel dice «este proyecto te deja $X antes de ISR», qué falta (`resumen-proyecto.ts`, puro) y cómo se reparte
   lo que pagó el cliente: **Proveedores** (a transferir), **SAT** (IVA neto + retenciones) y **Serenata** (utilidad; «libre para usar» = utilidad − 30 % de
   ISR de referencia). El ISR es **solo referencia** (el real depende de toda la empresa): ya no es un pago con fecha, ni sale en el cierre mensual.
2. **El dinero sigue saliendo de SQL.** Sin tablas ni columnas nuevas. `cuentas_periodo` agrega a `cierre` `sat_total` y `cuadre_diferencia`
   (`cobros − pagos − SAT − utilidad bruta`; 0 = cuadra, la UI alerta si |valor| > 0.01 y nunca en «Sin proyecto»). `cuentas_cierre_mensual` deja de
   producir filas `isr` y `proveedores`; el pendiente de IVA negativo se rotula «IVA acreditable por aplicar» y la retención pendiente dice «17 del mes
   siguiente al pago». Migración `20261042`: solo `CREATE OR REPLACE`, reversible re-aplicando `20261028`/`20261040`.
3. **Aproximado vs. real.** «~» delante de todo monto que depende de un total de proveedor sin factura (`total_estimado`); sin chip ni tooltip.
   Con factura real, la retención de IVA de un grupo es el **residuo del Total del CFDI** (`neto + IVA − Total − ISR retenido`) si cae dentro de la
   tolerancia del validador (`max(0.01, 0.03 % del neto) + 0.03`); fuera de ella se conserva la estimada por régimen y la diferencia queda visible en
   `cuadre_diferencia` (no se reparte como retención).
4. **«Siguiente paso» es un botón** (solo en el panel del proyecto; la Lista no cambia): subir factura/complemento → ventana «Subir factura»; cobrar/pagar →
   «Registrar pago»; revisar o indicar PUE/PPD → detalle, pestaña Documentos; subir comprobante → pestaña Pago; **asignar proveedor → pop up nuevo**
   (`POST /api/cuentas/proveedores/asignar` sobre `preparar_grupo_factura_proveedor`, sin exigir factura). Sin botones en proyectos históricos (409) ni en
   conceptos sin proyecto. `emitir_factura` se rotula «Subir factura».
5. **`round2` devuelve 0 para |x| < 0.005** (PR #142, B0): cierra el ajuste fantasma y posibles saldos fantasma.

## Decisiones de producto confirmadas

- **No se avisa de renglones sin costo:** Serenata tiene equipo propio que no se paga (ingreso íntegro y legítimo). Se resuelve en [#143](https://github.com/EduardoTerwogt/serenata-erp/issues/143),
  que debe distinguir «equipo propio» de «pendiente de proveedor/costo».
- «Libre para usar» se conserva. El monto vigente vive en `cuentas_pagar.costo_total` / `cuentas_pagar_grupos.monto_total` (un solo dueño del dato).

## Consecuencias

- Se borran `Metricas`, `Cierre`, `conciliacionUtilidad` y el modo `compacto` de `ProyectoPanel`; el motor de pruebas (`tests/support/cuentas-motor`) refleja el mismo cierre.
- Pruebas: `scripts/db/cuenta-proyecto-prueba.sql` (invariante, tolerancia, tres regímenes), golden de lecturas sin diferencias salvo `cierre` y `cierre_mensual`.
