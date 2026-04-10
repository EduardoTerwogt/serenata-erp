# FASE 5 — Endurecer y modularizar la capa PDF

## Objetivo
Reducir el riesgo de regresión visual en el PDF de cotización separando tipos, datos derivados y helpers de layout sin cambiar el resultado funcional.

## Qué cambió
- Se creó `lib/server/pdf/cotizacion-pdf-types.ts` para aislar contratos de datos del PDF.
- Se creó `lib/server/pdf/cotizacion-pdf-helpers.ts` para concentrar:
  - carga de logos
  - armado del header
  - agrupación de partidas
  - cálculo de descuento
  - construcción de filas de totales
  - textos legales del documento
- `lib/server/pdf/cotizacion-pdf.ts` quedó reducido a orquestación del render PDF usando esos helpers.
- La fecha ahora usa la utilidad compartida `formatDatePdf` desde `pdf-base-config`.

## Por qué fue seguro
- No se cambiaron rutas ni endpoints.
- No se cambió la API pública de `generateCotizacionPdf`.
- No se cambió el contenido funcional del PDF; solo se extrajo la lógica auxiliar.
- Se mantuvo compatibilidad con el import existente del tipo `CotizacionPDFData` reexportándolo desde el archivo principal.

## Resultado
- Menor complejidad en el generador principal.
- Mejor trazabilidad de layout y datos derivados.
- Base más limpia para continuar con PDFs y pruebas posteriores.

## Compatibilidad esperada con checks remotos
- Vercel - Deployment has completed: OK
- E2E / smoke-and-critical (push): OK
- Test Suite / test (push): OK
