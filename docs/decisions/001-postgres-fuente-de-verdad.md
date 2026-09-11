# 001 — PostgreSQL es la única fuente de verdad persistente

## Contexto

La app tiene edición colaborativa en cotizaciones y varias integraciones externas
(Google Drive, Sheets, Calendar). Sin una autoridad única, cada canal —navegador,
Sheets, Realtime— puede creerse dueño del dato y producir divergencias silenciosas.

## Decisión

Supabase/PostgreSQL es la única autoridad sobre datos persistentes. Google Sheets
es **espejo de consulta**, nunca origen. Ningún mensaje navegador-a-navegador
transporta datos que deban persistir.

## Razón

Un solo lugar donde el dato es verdad hace que cualquier divergencia se resuelva
releyendo la base, sin protocolos de reconciliación entre pares.

## Alternativas descartadas

- **Sheets como origen editable** — era el flujo previo a la app; se descartó al
  construir el ERP, por falta de integridad transaccional.
- **Estado autoritativo en el navegador** (CRDT/OT) — se descartó: no se edita un
  stream de texto compartido sino campos de un registro estructurado.

## Consecuencias

- Toda escritura pasa por la API del servidor. `service_role` nunca llega al navegador.
- Escribir en cotizaciones / proyectos / cuentas dispara sync a Sheets como efecto,
  no al revés.
- Cualquier feature nueva con colaboración hereda esta regla sin discutirla de nuevo.
