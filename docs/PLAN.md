# Plan de la iniciativa activa

**Estado:** **Borrador** (2026-10-09) — iniciativa [#140](https://github.com/EduardoTerwogt/serenata-erp/issues/140) «Cuenta de proyecto clara para no contadores». Pendiente de tu aprobación; preguntas abiertas al final.

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

Última iniciativa cerrada: "Frente 2 de Cuentas: leer lo que se muestra" (#110; lanzada a
producción el 2026-10-09, PR #136) — historia y mediciones en
`docs/archive/frente2-historico-cuentas-110.md`, decisión en `docs/decisions/025`.
Anterior: "Facturas y pagos ligados" (#123, con #130 y #131) —
`docs/archive/facturas-pagos-ligados-123-130-131.md`.

---

# #140 — Cuenta de proyecto clara para no contadores

**Issue:** [#140](https://github.com/EduardoTerwogt/serenata-erp/issues/140) · **Maqueta:** https://claude.ai/artifact/VStbYWKYVQX9Nez4EGFUXj (privada; tokens del repo, los 3 casos de SH001 calculados en vivo)
**Relacionado:** #99 (desglose antes/después de IVA), ADR 017 (rediseño de Cuentas), 022, 025.

## Contexto

La cuenta de un proyecto (`app/cuentas/components/ProyectoPanel.tsx`) muestra la utilidad 3 veces, el IVA neto 3 veces, dos renglones «IVA a enterar» de signo
opuesto (el segundo es IVA acreditable), el ISR como pago con fecha y como «utilidad neta», y no distingue lo aproximado de lo real. Reglas de negocio e
invariante en el issue. Es 100 % lectura/presentación de dinero que ya existe: **no cambia cotizar, aprobar, pagar ni facturar**.

**Estado actual (verificado en el código, 2026-10-09).**
- Todo el cálculo vive en SQL: `cuentas_conceptos` (`20261041`) por concepto; `cuentas_periodo` (`20261040`, ~l.990–1011) arma `cierre`; `cuentas_cierre_mensual` (`20261028`) las filas con fecha SAT.
- **Dos fuentes mezcladas:** el flujo usa el `total_a_transferir` real del CFDI; IVA acreditable, retenciones y utilidad usan siempre la estimación (neto de la cotización × régimen vigente del proveedor). `utilidad_proyecto` sale de `cotizaciones.utilidad_total − gastos extra`, no de cobros − pagos.
- **El componente recalcula:** `conciliacionUtilidad()` en `ProyectoPanel.tsx` (flujo, «ajuste»). Es el origen del renglón «Ajuste» y contradice «fuente única».
- **Lo real no se guarda:** `documentos_cuentas_pagar` solo tiene `total_cfdi`, `uuid_cfdi`, `metodo_pago_cfdi`. El parser lee subtotal, IVA y retenciones, y se descartan (`subir-factura-proveedor.ts`, y las otras rutas que insertan `FACTURA_PROVEEDOR_XML`: portal `grupos/[id]/factura`, reemplazo, `lib/db`).
- **Aproximado vs. real ya es derivable:** `total_estimado = total_a_transferir IS NULL` y `tiene_factura` por concepto; «facturas que faltan» = conceptos con `paso = subir_factura`.
- Con CFDI validado, subtotal = neto cotizado (±0.01) e IVA = 16 %; solo la retención de IVA tiene tolerancia (0.03 %). Ver `validarFacturaFiscalProveedor`.

**Diagnóstico del −$9.09 (causa raíz, reproducida con la captura de SH001).** No es un descuadre de datos: es un bug de `round2` en `lib/shared/decimal.ts`.
`round2` redondea partiendo la representación en texto (`toString().split('.')`); un residuo de punto flotante tan chico que JS escribe en notación científica lo rompe.
En SH001, `8476.7 − 1169.2 − 0 − 7307.5` da `9.094947017729282e-13`; `round2` lo parte en `"9"` + `"094947017729282e-13"`, toma `"09"` y devuelve **9.09** (con `1e-7` devuelve `NaN`).
`conciliacionUtilidad()` lo pinta como «Ajuste −$9.09», aunque los datos cuadran exacto (flujo 8,476.70 − IVA 1,169.20 − retenciones 0 = utilidad 7,307.50; verificado en SQL de producción, solo lectura).
**Alcance:** todo llamador que reste/sume floats y deje un residuo |x| < 1e-6 (u ≥ 1e21): `ProyectoPanel`, `Totales`, `orden-cruce`, `status` (saldos), `detalle-armar`, `portal/cuentas`, `preview-cuentas` y el dashboard (`lib/server/shared/decimal.ts` re-exporta la misma). Un saldo «fantasma» de $0.0x–$9.99 es posible.
Aparte, y aplicable a otros casos reales: con facturas reales cuyo total difiera de la estimación, el «ajuste» sí sería un descuadre genuino (Σ estimado − real); eso lo elimina la Fase 1.

**Infraestructura reutilizable.** `obtenerRetencionesPorRegimen` / `calcularEjemploFactura` (`lib/shared/factura-fiscal.ts`) = configuración por régimen; `auditar_consistencia()` (27 guardas) para
la guarda permanente del invariante; `ConceptoVista.paso`/`estado` y `useAcciones` para las acciones; `StatusBadge`, `sn-caption`, `fmtMoney`, `TablaConceptos`.
No se construye un segundo motor.

## Opciones para «lo real»

| | Qué | Trade-off |
|---|---|---|
| **A. Sin migración** | Retenciones reales = neto + IVA − `total_cfdi`, repartidas por régimen | Cero DDL, pero inexacto por centavos en el reparto IVA/ISR, sin régimen real y no admite un subtotal distinto. |
| **B. 4 columnas nullable (recomendada)** | `subtotal_cfdi`, `iva_trasladado_cfdi`, `iva_retenido_cfdi`, `isr_retenido_cfdi` en `documentos_cuentas_pagar`, escritas junto a `total_cfdi` | Aditiva, sin backfill necesario (producción sin facturas reales); legado = estimación + total real. |
| **C. Re-parsear el XML al leer** | Leer el archivo en cada consulta | Descartada: Drive en el camino de lectura, contra «leer barato». |

**Recomendación: B** (más `regimen_cfdi` si la pregunta 2 es sí). **¿Migración?** Sí, una sola, aditiva (`20261042`); el conteo «aprox./facturas que faltan» no la necesita.

## Fase 1 — Lógica y pruebas (sin tocar la interfaz)

**B0 (independiente, un PR chico, puede salir antes).** Arreglar `round2` en `lib/shared/decimal.ts`: si el valor se escribe en notación científica, redondear con `toFixed(2)` (y normalizar `-0`). Una prueba unitaria con `8476.7 − 1169.2 − 7307.5` (→ 0), `±1e-7`, `1e-13` y los casos 100.005 que motivaron la función. Es la causa del −$9.09; los demás bloques no dependen de él.

| Bloque | Qué | Archivos |
|---|---|---|
| **B1** | Migración aditiva: 4 columnas + CHECK `total_cfdi = subtotal + iva − ret_iva − ret_isr` (±0.01) cuando están completas. Escribirlas junto a `total_cfdi` en todos los puntos de alta del XML de proveedor. | `db/migrations/20261042_*.sql`, `lib/db` (`createDocumentoCuentaPagar`), `lib/server/cuentas/subir-factura-proveedor.ts`, `app/api/portal/cuentas/grupos/[id]/factura/route.ts`, `reemplazo-factura.ts`, `lib/types.ts`, `lib/validation/schemas.ts` |
| **B2** | `cuentas_conceptos`: pago con factura validada y datos → subtotal/IVA/retenciones reales; si no → estimación actual. `cuentas_periodo.cierre`: `utilidad = cobros_sin_iva − pagos_neto` (reales), bloque `sat {iva_neto, ret_iva, ret_isr, total, vence}`, `aprox {pagos, facturas_faltan, sin_proveedor}`, `isr_referencia`, `iva_mes_incompleto`, `cuadre {cobrado, proveedores, sat, utilidad, diferencia}`. Se quitan `utilidad_neta`/`utilidad_libre_estimada`. `cuentas_cierre_mensual`: sin filas de ISR, IVA trasladado y acreditable con su nombre. Cuerpos exactos de las funciones vigentes + `md5(prosrc)` (reglas de migraciones). | `db/migrations/20261043_*.sql`, `lib/shared/cierre-proyecto.ts`, `lib/shared/cuentas/periodo-tipos.ts` |
| **B3** | Guarda permanente: `auditar_consistencia()` 27 → 28 guardas (`cuadre.diferencia = 0` en todo proyecto no histórico). | `db/migrations/20261044_*.sql` |
| **B4** | Pruebas: `scripts/db/cuenta-proyecto-prueba.sql` con los 3 casos de SH001 (11,600.00 / 1,169.20; 9,533.33 / 3,235.87; mixto 11,187.00 / 1,582.20, utilidad 7,307.50) + propiedad con valores aleatorios; golden de las lecturas de Cuentas (diferencias esperadas solo en `cierre`); unitarias de los tipos y de la escritura de las 4 columnas; plpgsql_check en CI. | `scripts/db/`, `lib/server/cuentas/__tests__/`, `tests/support/cuentas-motor/*` (ver riesgo 3) |

**Puerta de la Fase 1:** `tsc`, lint, unitarias, `cuenta-proyecto-prueba.sql` verde, golden sin diferencias fuera de `cierre`, BD limpia reconstruida desde todas las migraciones, `auditar_consistencia()` = 0, CI verde (incluido `live`).

## Fase 2 — Interfaz (mobile-first, solo lee `cierre`)

| Bloque | Qué | Archivos |
|---|---|---|
| **B5** | `ProyectoPanel.tsx` se parte en `components/proyecto/`: `Veredicto`, `Sobres` (Proveedores / SAT / Serenata), `Pendientes` (acciones primero con `paso` + `useAcciones`, luego movimientos), `DetalleContable` (colapsado: trasladado/acreditable/retenido, tabla por proveedor, fuente Aprox./Factura). Se borran `conciliacionUtilidad`, `LineasConciliacion`, `Metricas`, `Cierre` y el modo `compacto` (un solo layout responsivo). Cada número una vez; alerta solo en acciones. | `app/cuentas/components/ProyectoPanel.tsx` → `proyecto/*`, `CuentasApp.tsx`, `ui.ts` |
| **B6** | Tests de componente y E2E (`smoke`/`critical`) que citan «Utilidad neta», «Cierre del proyecto (estimado)», «Ajuste»; casos nuevos para los 3 estados del veredicto. | `app/cuentas/components/__tests__/`, `tests/e2e/critical/cuentas-principal.spec.ts` |
| **B7** | Docs: ADR 026 (ISR solo referencia; lo real reemplaza a lo aproximado; invariante; qué reemplaza de 017), `ARCHITECTURE.md`, `TESTING.md` (conteos, 28 guardas), `ROADMAP.md`. | `docs/` |

**Puerta de la Fase 2:** build, lint, suites verdes, Preview de Vercel, PR a **Ready for review** (job `live`), revisión visual móvil y escritorio contra la maqueta.

## Riesgos

- **P0** — Ninguno de seguridad/datos: la migración es aditiva y de solo lectura sobre dinero. Si la utilidad cambiara de fuente (cotización → cobros − pagos) y diera centavos distintos al histórico, el golden lo detecta antes de merge.
- **P1** — Cambiar `utilidad` de `cotizaciones.utilidad_total` a `cobros_sin_iva − pagos_neto` puede mover centavos por el prorrateo de `v_neto` (cobro) y por gastos extra. Mitigación: golden + propiedad; si hay deriva, redondear en un solo punto.
- **P1** — `cuentas_periodo` es la función más cara (plpgsql, `force_custom_plan`, 57014 en CI): no agregar lecturas por concepto; todo sale de columnas ya leídas. Medir con `Server-Timing`.
- **P1** — Motor TS de pruebas (`tests/support/cuentas-motor`, 2,147 líneas) alimenta `critical` y la paridad `live`: o se amplía al nuevo contrato o se recorta la paridad al bloque que no cambia (pregunta 5).
- **P2** — Facturas ya validadas sin las 4 columnas: se quedan con estimación + total real (retenciones = residual). En producción no hay ninguna real; en la base de test sí (fixtures).
- **P2** — Régimen congelado solo al archivar (025): una factura con el régimen de ese día convive con el régimen vigente del proveedor para las aproximadas. Aceptable y visible en el detalle.
- **Lo que no sé:** si otros llamadores de `round2` ya mostraron un valor fantasma en producción (se revisa al hacer B0); si la sección `Totales.tsx`/Dashboard (ISR estimado, «IVA a enterar» del periodo) debe seguir el mismo vocabulario; el nombre real de los conceptos/proveedores de SH001 (la maqueta usa Proveedor A–D).

## Preguntas para ti

1. ~~Captura del −$9.09~~ (recibida; causa raíz arriba). ¿Apruebas el **B0** como PR aparte, ya, sin esperar el resto del plan?
2. ¿Guardamos también el **régimen real** de cada factura (derivado de las retenciones del XML, columna `regimen_cfdi`) o basta el vigente del proveedor?
3. ¿Si una factura se acepta desde «En revisión» con subtotal distinto al cotizado, la **utilidad se mueve** (lo real manda)? Propuesta: sí.
4. ¿Alineamos ahora el vocabulario de **totales del periodo** (`Totales.tsx`, Dashboard: «ISR estimado», «Utilidad neta») o queda para otra iniciativa? Propuesta: solo la etiqueta «Utilidad neta», el resto aparte.
5. **Paridad `live` y motor TS:** ¿ampliar el motor al contrato nuevo o recortar la paridad al resto (propuesta, ver deuda técnica «Doble TS»)?
6. Textos del veredicto: ¿te sirven estas tres variantes? (a) «Ya cobraste todo; falta pagar y facturar.» (b) «Falta cobrar $X.» (c) «Todo cobrado y pagado; falta {documento}.» / «Cuentas cerradas.»

## Tracker

| Bloque | Estado |
|---|---|
| B0–B7 | Pendiente (borrador sin aprobar) |
