-- Migration: proveedores_add_alias
-- Purpose: Bloque 4a (docs/PLAN.md) -- separar nombre/alias en el Portal.
--
-- alias: TEXT nullable, aditivo. `proveedores.nombre` NO se toca -- sigue
-- siendo la columna contra la que corre match_proveedor_por_nombre() y
-- findOrCreateProveedorByNombre/bulk_replace_items_cotizacion (texto libre).
-- `alias` nace vacío para todos los proveedores existentes (sin backfill),
-- se administra solo explícitamente desde Portal (TabDatos) o el admin
-- interno (ProveedorModal.tsx) -- nunca se infiere ni se propaga a
-- items_cotizacion.responsable_nombre.

ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS alias TEXT NULL;

COMMENT ON COLUMN proveedores.alias IS 'Nombre corto/operativo, opcional -- distinto de nombre (identidad de matching) y de document-parser.ts nombre_completo (dato extraído de un documento). Nunca participa en matching por texto libre ni se propaga a items_cotizacion.responsable_nombre -- ver docs/PLAN.md Bloque 4a.';
