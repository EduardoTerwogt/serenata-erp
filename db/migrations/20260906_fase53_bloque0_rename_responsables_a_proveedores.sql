-- Fase 5.3, Bloque 0, punto 1: renombrar responsables -> proveedores.
-- historial_responsable NO se toca (concepto distinto, snapshot histórico).
-- Los FKs existentes (responsable_id -> responsables(id) en items_cotizacion,
-- cuentas_pagar, historial_cambios_responsable_item, etc.) se preservan
-- automáticamente: Postgres los rastrea por OID, no por nombre de tabla.
ALTER TABLE responsables RENAME TO proveedores;
