-- Migration: cotizaciones_add_notas_pdf
-- Purpose: Bloque 2 (docs/PLAN.md) sub-tarea 6 -- notas visibles en el PDF
-- de cotización, campo nuevo y distinto de notas_internas.
--
-- notas_pdf: TEXT nullable, aditivo. NULL en todas las filas existentes (sin
-- backfill). notas_internas ("Nota de evento", uso interno) NO se toca --
-- sigue sin salir en el PDF. Este campo nuevo es lo único que
-- generateCotizacionPdf imprime.

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS notas_pdf TEXT NULL;

COMMENT ON COLUMN cotizaciones.notas_pdf IS 'Notas visibles en el PDF de la cotización. Distinto de notas_internas (uso interno, nunca sale en el PDF) -- ver docs/PLAN.md Bloque 2.';
