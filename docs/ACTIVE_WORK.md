# Trabajo activo

**Última actualización:** 2026-09-14

## Estado

**Engineering Hardening EF-1 y EF-2: cerrados y mergeados a `main`.**
EF-1: PR [#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29),
commit `cc60f6d`. EF-2: PR [#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31),
commit `980464c`. Historia completa de cada uno:
[`docs/archive/ef-1-engineering-hardening.md`](archive/ef-1-engineering-hardening.md),
[`docs/archive/ef-2-engineering-hardening.md`](archive/ef-2-engineering-hardening.md).

**EF-3 en ejecución.** Plan v12, 40 bloques + hasta 3 condicionales.
Documento canónico + matriz de hallazgos + tracker en vivo:
[`docs/EF-3_ENGINEERING_HARDENING.md`](EF-3_ENGINEERING_HARDENING.md) (§11).
Cerrados hasta hoy: 3A-0, 3A-0b, 3B-1, 3B-2, 3B-3, 3B-4, 3B-5, 3B-6, 3B-8,
3B-9, 3B-11, 3B-12, 3C-1, 3C-2, 3C-3, **3D-0**.

**Ningún bloque en curso.** Libres para arrancar: 3D-0b (fix de la carrera
F26) o 3D-1 (`useQuotationMutationTracker`) — no dependen entre sí.

**3C-4 pausado** por decisión del usuario (setup manual de Vercel
pendiente) — ver "Problemas encontrados que siguen abiertos".

## Completado en esta sesión

Sesión enfocada en cerrar el PR [#48](https://github.com/EduardoTerwogt/serenata-erp/pull/48)
(3D-0, characterization tests de `page.tsx`), que venía de una sesión
anterior con `live` en rojo repetido y sin mergear.

- **Causa raíz real de `live` diagnosticada con datos, no supuesta.**
  El diagnóstico embebido del test (`cotizaciones-colaboracion.spec.ts:479`)
  apuntaba a que `GET /api/productos?q=` no devolvía el producto recién
  creado. Confirmado por SQL directo contra `serenata-erp-test`:
  `app/api/productos/route.ts` no tenía `.limit()` cuando `q` viene vacío —
  dependía en silencio del tope por defecto de PostgREST — y la tabla
  `productos` tenía **1205 filas activas, 100% basura de fixtures de tests**
  (`Escala n=...` de `cotizaciones-colaboracion-escala.spec.ts`, `Partida
  creada y editada de inmediato...`; producción real tiene solo 40). El
  producto del test caía fuera de las primeras 1000 filas alfabéticas.
  `cleanupOrphanedTestProductos()` ya se invocaba en el `beforeAll` de las 5
  specs live relevantes, pero solo borraba filas >24h — con varios reruns
  de `live` el mismo día (como pasó en este PR) la basura fresca
  sobrevivía y se acumulaba. Mismo síntoma que ya había pasado una vez
  (Fase 8.7.2), repetido por la misma causa de fondo sin cerrar del todo.
- **Fix aplicado y mergeado (commit `62aac60`, mismo PR):**
  - `app/api/productos/route.ts`: `.limit(2000)` explícito en la carga sin
    `q` — dependía de un default implícito de PostgREST no documentado en
    el código, violaba "fallar explícito, nunca en silencio".
  - `tests/e2e/utils/live-cleanup.ts`: `cleanupOrphanedTestProductos()`
    borra todo en vez de filtrar por `created_at` >24h — seguro porque
    `workers:1`/`fullyParallel:false` (`playwright.config.ts`) garantiza
    que ningún spec live corre en paralelo con otro.
  - `serenata-erp-test.productos` limpiada manualmente (1205→0 filas) para
    desbloquear el PR de inmediato.
  - Decisión explícita: no tocar la paginación real del catálogo completo
    (eso es el Frente A del roadmap, alcance de iniciativa propia) — el fix
    es puntual, deja registrado el patrón como deuda técnica nueva.
- **CI y merge:** local en verde (`tsc`, `lint`, 727/727 tests) antes de
  pushear. CI del PR #48 pasó de 4/5 (con `live` rojo 4 veces seguidas) a
  **6/6 verde** tras el fix, sin conflicto de merge, sin review threads
  pendientes. Mergeado (squash `30486a8`).
- **Tracker EF-3 sincronizado** (commit doc-only `b37be1d`, directo a
  `main`): fila `3D-0` → `Cerrado` con PR+Commit SHA+Commit de merge, nota
  con la causa raíz y el fix aplicado.

## Completado en sesiones anteriores

- **3C-3 (EF-3):** lock de Sheets con lease/renovación/recuperación de
  huérfanos (`sheets_sync_status` + 3 RPC `SECURITY DEFINER`), heartbeat por
  página en `sync-down.ts`, `POST /sync-down` y `GET /status` nuevos,
  `AdminSheets.tsx` con estado "parcial, revisar". PR
  [#47](https://github.com/EduardoTerwogt/serenata-erp/pull/47) mergeado
  (squash `71881de`). 18 tests nuevos, todo verde en CI.
- **3C-4 evaluado y pausado:** requiere medición empírica de duración de
  `syncAllDown()` contra volumen objetivo (`items_cotizacion`≥5500) en el
  entorno serverless real de 3A-1 — hoy `serenata-erp-test` tiene 11 filas
  (500x por debajo). Decisión explícita del usuario: pausar esa fase entera
  y seguir con el resto del grafo que no depende de 3A-1/3A-3. Documentado
  en el tracker (nota de la fila 3C-4).
- **3D-0 (characterization tests de `page.tsx`):** archivo nuevo
  `app/cotizaciones/[id]/__tests__/page-autosave-characterization.test.tsx`,
  12 casos (T1-T12) del punto 10 de la especificación — debounce de
  General/Totales/Notas/celda de item, drenado real, retry acotado,
  conflicto por 409, unmount sin timer colgado, flush-before-transition e
  interleaving flush↔reconciliación en ambos órdenes. **No toca `page.tsx`
  ni componentes hijos.** Primer `render()` de React Testing Library del
  repo. **Hallazgo real (F26 activado):** T12 confirmó una carrera real
  entre el flush de un campo de General/Totales y una reconciliación en
  vuelo — si el PATCH resuelve antes que la reconciliación, ésta pisa el
  valor recién confirmado con una lectura vieja (T11, orden inverso, sí
  está protegido). Se abrió el bloque correctivo **3D-0b** con su
  especificación completa de 15 puntos ya escrita en el plan (fix: portar
  el patrón `localWriteAtRef`/`escrituraLocalPosterior` que partidas ya
  tiene, a General/Totales por campo).
- Ver `docs/archive/` para EF-1/EF-2 completos. EF-3 bloques 3A-0, 3A-0b,
  3B-1 a 3B-12 (salvo 3B-7, bloqueado), 3C-1, 3C-2: cerrados en sesiones
  previas de esta misma iniciativa — historia en el tracker
  (`docs/EF-3_ENGINEERING_HARDENING.md` §11) con PR y SHA de cada uno.

## Tests ejecutados

`npx tsc --noEmit`, `npm run lint` (0 errores, solo warnings preexistentes)
y `npm test` (727/727) en verde localmente antes de pushear el fix de
`GET /api/productos`. CI del PR #48: 6/6 checks verdes (`test`, `fresh-db`,
`smoke-and-critical`, `tracker-lint`, `live`, Vercel Preview) confirmado
antes de mergear.

## Problemas encontrados que siguen abiertos

- **Rama remota `fix/totales-general-conflict-drain` (ex-PR #30) no se pudo
  borrar** — `403` del token de esa sesión. Su código ya está en `main` vía
  PR #29; sin trabajo sin mergear. (Arrastrado, sin cambios esta sesión.)

## Deuda técnica

- **Frentes A (escalabilidad de datos) y E (pruebas de carga) de la
  auditoría de ingeniería: cubiertos por el plan EF-3** — en ejecución, no
  deuda sin plan.
- **Modo de uso de `scripts/check-schema-parity.mjs`:** ¿paso manual
  obligatorio antes de mergear a `main`, o workflow de GitHub Actions
  separado? Decisión del usuario, sin urgencia. (Arrastrado.)
- **`previewNextQuotationFolio()` sin `complementaria_de`:** F14, se cierra
  en 3B-7 — bloqueado por el mismo setup manual de Vercel que 3A-1.
- **`GET /api/productos` (hallazgo nuevo, sin F-code en la matriz EF-3):**
  el `.limit(2000)` agregado al cerrar PR #48 evita el truncado silencioso
  de hoy, pero sigue siendo el patrón "traer todo el catálogo" de Frente A
  del roadmap — un catálogo real que superara 2000 productos activos
  volvería a perder items del autofill sin error visible. Producción hoy:
  40 productos (margen amplio). Paginación real, fuera de alcance de este
  fix puntual — evaluar si entra a un bloque EF-3 nuevo o queda para
  "Después".

## Siguiente paso

1. **3D-0b** (fix de la carrera F26, especificación completa ya escrita en
   el plan, sección 6) — bloque chico, 6-8h estimadas. No bloquea 3D-1.
2. **3D-1** (`useQuotationMutationTracker`, extracción del primer hook) es
   el siguiente bloque independiente del grafo de EF-3D — no depende de
   3D-0b.
3. Sin dueño ni urgencia: borrar la rama remota huérfana
   `fix/totales-general-conflict-drain`, decidir el modo de uso de
   `check-schema-parity.mjs`, y decidir si el hallazgo nuevo de
   `GET /api/productos` (paginación real, ver Deuda técnica) entra a EF-3 o
   queda para "Después".

**Sigue bloqueado, sin cambios:** 3A-1 a 3A-6, 3B-7, y 3C-4 — todos
esperando el paso manual del usuario (crear proyecto Vercel aislado +
secretos, spec 3A-1 punto 2).
