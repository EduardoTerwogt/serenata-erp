# 002 — Conflictos se resuelven por campo, último en escribir gana

## Contexto

Dos personas pueden tener abierta la misma cotización y editarla a la vez. Hacía
falta decidir qué pasa cuando ambas tocan el mismo registro.

## Decisión

Modelo **último en escribir gana, por campo** (el de Figma/Linear), no por
documento. Las escrituras van por sección — `PATCH /api/cotizaciones/[id]/{general,
totales,notas}` y `PATCH .../items/[itemId]` — y cada RPC bloquea la fila
(`SELECT ... FOR UPDATE`) y aplica **solo las claves que llegaron**.

## Razón

No se edita texto compartido, se editan campos de un registro estructurado. OT y
CRDT resuelven un problema que esta app no tiene, a un costo alto de complejidad.
Aplicar solo las claves recibidas evita revivir valores viejos por read-modify-write.

## Alternativas descartadas

- **OT / CRDT** — complejidad injustificada para campos discretos.
- **Guardado total del documento** — era el comportamiento anterior y fue la causa
  raíz de que se perdieran ediciones ajenas.
- **Bloqueo pesimista del registro completo** — mataría la colaboración simultánea.

## Consecuencias

- No sustituir los PATCH por sección por un save completo.
- Un feature nuevo con edición concurrente debe seguir este patrón, no inventar otro.
- Los banners de conflicto son **por celda** y pueden coexistir varios a la vez.
