# 008 — Idempotencia de cliente: orden fingerprint → normalize → persist → fetch

## Contexto

`runIdempotentPagoSubmit` (`lib/client/pagoIdempotency.ts`, compartido por
`useCuentasPagar`/`useCuentasCobrar`) y `runIdempotentBulkImportSubmit`
(`lib/client/bulkImportIdempotency.ts`) orquestan reintentos seguros de
mutaciones financieras/de partidas contra doble ejecución (doble clic, retry
de red, pestaña que se cae a medio submit). El diseño original (v13.1 §9)
persistía la identidad (`createPendingOperation`) inmediatamente después de
generarla y antes de cualquier trabajo async adicional.

Una auditoría del PR #29 encontró que, en pagos, `normalizeComprobante()`
(compresión de imagen: carga, canvas, encode JPEG) es async y puede tardar
varios segundos, y corría **después** de persistir la identidad. Un cierre
de pestaña o caída del navegador durante esa ventana dejaba una identidad
persistida sin que ningún request hubiera salido nunca del navegador. Como
`not_found` nunca es un estado terminal para la reconciliación (una
identidad pendiente solo se libera con `completed`), esa identidad fantasma
bloqueaba indefinidamente un intento posterior con un payload distinto —
no era un riesgo de doble cobro (nunca hubo request), sino un problema de
liveness.

## Decisión

Orden fijo, para cualquier dominio que use este patrón:

```
fingerprint (sobre el archivo/payload ORIGINAL, antes de normalizar)
  → readPendingOperation
  → reconciliar si aplica (fingerprint distinto, o TTL stale con mismo fingerprint)
  → normalize() / construir el payload final
  → createPendingOperation()  (solo si origin === 'createdNow')
  → fetch (submit)
  → clear (solo en éxito)
```

Reglas derivadas, explícitas en el código:

- El **fingerprint nunca se calcula sobre datos ya normalizados/comprimidos**
  — sobre el archivo original, para que dos submits del mismo archivo con
  distinta compresión produzcan la misma identidad.
- La orquestación distingue `origin: 'createdNow' | 'reusedExisting'`:
  - `createdNow` (identidad generada en este mismo submit, `readPendingOperation`
    devolvió `none`): un fallo en `normalize()` **no limpia nada**, porque
    todavía no se persistió ninguna identidad — no hay rastro que dejar.
    `createPendingOperation()` corre justo antes del `fetch`, nunca antes.
  - `reusedExisting` (identidad de un intento anterior, mismo fingerprint):
    un fallo local en este retry **nunca limpia** la identidad previa —
    ese registro no lo creó este intento, y otro request (este mismo
    reintentado antes, o uno en vuelo) pudo haber hecho commit en el
    servidor.
- Una vez que el `fetch` fue intentado, cualquier resultado ambiguo
  posterior nunca limpia — permanece pendiente hasta éxito confirmado o
  reconciliación `completed` (regla fuerte de v13.1, sin cambios).
- El TTL de `pendingOperation` (`stale`) es un **gatillo real de
  reconciliación**, no una marca ignorada: incluso con el mismo fingerprint,
  un registro vencido se reconcilia contra `/estado` antes de reenviar.
  `completed` usa el resultado ya confirmado sin reenviar (reenviar
  generaría un `operationId` nuevo y, con él, una mutación duplicada real);
  `not_found`/`ambiguous` conservan la identidad y solo permiten un retry
  EXACTO (mismo `operationId`, mismo payload).

`bulkImportIdempotency` sigue el mismo orden por consistencia, aunque su
`buildCandidatePayload()` es síncrono y no tiene el gap de liveness que sí
existía en pagos (no hay ningún punto async entre `readPendingOperation` y
`createPendingOperation` en ese caso).

## Alternativas descartadas

- **Persistir antes de normalizar** (diseño original de v13.1 §9): más
  simple, pero deja la ventana de liveness descrita arriba. Descartado tras
  la auditoría del PR #29.
- **Limpiar siempre ante cualquier fallo pre-fetch**, sin distinguir
  `origin`: más simple, pero para `reusedExisting` puede borrar una
  identidad cuyo intento anterior sí llegó al servidor, permitiendo que un
  submit posterior genere una identidad nueva y duplique la mutación.
  Descartado — la distinción por procedencia es la que sostiene la garantía
  de no-duplicación de v13.1.

## Consecuencias

- Cualquier nuevo dominio que adopte este patrón (futuras mutaciones
  financieras con archivo adjunto o paso de normalización propio) debe
  replicar el orden `fingerprint → normalize → persist → fetch` y el
  tracking de `origin`, no solo copiar la forma de `createPendingOperation`/
  `submit`.
- Si se agrega un paso async nuevo entre `readPendingOperation` y el
  `fetch` (p. ej. otra transformación del payload), debe evaluarse si abre
  el mismo tipo de ventana de liveness y, si aplica, correr antes de
  `createPendingOperation()`, no después.
