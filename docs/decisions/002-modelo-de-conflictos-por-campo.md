# 002 — Conflictos se detectan y resuelven por campo

## Contexto

Dos personas pueden tener abierta la misma cotización y editarla a la vez. Hacía
falta decidir qué pasa cuando ambas tocan el mismo registro.

## Decisión

Granularidad **por campo**, no por documento (el modelo de Figma/Linear). Las
escrituras van por sección — `PATCH /api/cotizaciones/[id]/{general,totales,notas}` y
`PATCH .../items/[itemId]` — y cada RPC bloquea la fila (`SELECT ... FOR UPDATE`) y
aplica **solo las claves que llegaron**.

**No es last-write-wins ciego.** Cada mutación manda la base del campo que el usuario
tenía a la vista; si en la base cambió mientras tanto, el servidor responde `409` y la
UI muestra un banner de conflicto en esa celda. Los campos que nadie más tocó se
aplican con normalidad: el conflicto es por campo, no por registro.

## Razón

No se edita texto compartido, se editan campos de un registro estructurado. OT y
CRDT resuelven un problema que esta app no tiene, a un costo alto de complejidad.
Aplicar solo las claves recibidas evita revivir valores viejos por read-modify-write.

## Alternativas descartadas

- **OT / CRDT** — complejidad injustificada para campos discretos.
- **Guardado total del documento** — era el comportamiento anterior y fue la causa
  raíz de que se perdieran ediciones ajenas.
- **Bloqueo pesimista del registro completo** — mataría la colaboración simultánea.
- **Last-write-wins sin detección** — pisa el trabajo ajeno en silencio, que es
  exactamente el problema original.

## Consecuencias

- No sustituir los PATCH por sección por un save completo.
- Un feature nuevo con edición concurrente debe seguir este patrón, no inventar otro.
- Los banners de conflicto son **por celda** y pueden coexistir varios a la vez.
- Un `409` de una mutación debe **abortar** cualquier transición de estado que
  dependiera de ella (Generar, Aprobar), no continuar.
