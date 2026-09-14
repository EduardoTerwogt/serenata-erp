# Trabajo activo

**Última actualización:** 2026-09-14 (post-merge PR #48)

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
3B-9, 3B-11, 3B-12, 3C-1, 3C-2, 3C-3, 3D-0.

**3D-0 cerrado y mergeado** (characterization tests de `page.tsx`) — PR
[#48](https://github.com/EduardoTerwogt/serenata-erp/pull/48), squash
`30486a8`. Ver detalle abajo. Siguiente bloque libre: 3D-1 (o 3D-0b si se
prioriza el fix de F26).

**3C-4 pausado** por decisión del usuario (setup manual de Vercel
pendiente) — ver "Problemas encontrados que siguen abiertos".

## Completado en esta sesión

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
  (ni siquiera la parte de retención de `rate_limits`, independiente) y
  seguir con el resto del grafo que no depende de 3A-1/3A-3. Documentado en
  el tracker (nota de la fila 3C-4).
- **3D-0 (characterization tests de `page.tsx`):** archivo nuevo
  `app/cotizaciones/[id]/__tests__/page-autosave-characterization.test.tsx`,
  12 casos (T1-T12), **no toca `page.tsx` ni componentes hijos**. Primer
  `render()` de React Testing Library del repo (antes solo había
  `renderHook`) — infraestructura de mocking nueva: `useQuotationPresence`
  mockeado completo (el real revienta al importar `lib/supabase-browser.ts`
  sin env vars de Supabase en jsdom), `fetch` global enrutado por
  `MÉTODO url` con promesas controlables (`deferred()`).
  - **Dos correcciones a la descripción de 3D-0 en el plan:** T7 (Notas no
    tiene banner de conflicto — verificado que la ruta PATCH no tiene base
    ni detección de conflicto en absoluto) y T8 (Totales no tiene un PATCH
    "grupo multi-campo" atómico — cada campo manda su propio PATCH
    individual, igual que General).
  - **Hallazgo real (F26 activado):** T12 confirmó empíricamente una carrera
    real entre el flush de un campo de General/Totales y una reconciliación
    ya en vuelo — si el PATCH resuelve antes que la reconciliación, ésta
    pisa el valor recién confirmado con una lectura vieja. T11 (orden
    inverso) sí está protegido por el guard existente. Se activó F26 en la
    matriz de hallazgos y se abrió el bloque correctivo **3D-0b** con su
    especificación completa de 15 puntos ya escrita en el plan (fix: portar
    el patrón `localWriteAtRef`/`escrituraLocalPosterior` que partidas ya
    tiene, a General/Totales por campo — 2 refs nuevas +
    1 parámetro `pedidoEn` en `applyGeneralOnly`/`applyTotalsOnly`).
  - Validación local completa en verde: `tsc`, `lint`, `npm test` (97
    archivos, 727 tests), `npm run build` (falla esperada de
    `/api/admin/usuarios/[id]` por env vars ausentes en local, no
    relacionada, ya documentada en PRs previos).
  - **CI del PR #48:** `test`, `fresh-db`, `smoke-and-critical`,
    `tracker-lint` en verde desde el inicio. `live` falló 4 veces seguidas en
    el mismo spec (`cotizaciones-colaboracion.spec.ts:479`, "seleccionar
    producto (autofill) mientras otro edita precio a mano") — **causa raíz
    confirmada y arreglada** (ver bullet siguiente); tras el fix, 6/6 checks
    verdes y merge (squash `30486a8`).
- **Cierre de PR #48: causa raíz real de `live`, no timing/flake.**
  `app/api/productos/route.ts` no tenía `.limit()` cuando `q` viene vacío —
  dependía en silencio del tope por defecto de PostgREST. Confirmado por SQL
  directo: `serenata-erp-test.productos` tenía **1205 filas activas, 100%
  basura de fixtures de tests** (`Escala n=...` de
  `cotizaciones-colaboracion-escala.spec.ts`, `Partida creada y editada de
  inmediato...`, ninguna catálogo real — producción tiene solo 40). El
  producto recién creado por el test de autofill caía fuera de las primeras
  1000 filas alfabéticas. `cleanupOrphanedTestProductos()`
  (`tests/e2e/utils/live-cleanup.ts`) ya se invocaba en el `beforeAll` de
  las 5 specs live relevantes pero solo borraba filas >24h — con varios
  reruns el mismo día (como este PR) la basura fresca sobrevivía y se
  acumulaba (mismo síntoma de Fase 8.7.2, repetido). Fix (commit `62aac60`,
  mismo PR): `.limit(2000)` explícito en la ruta +
  `cleanupOrphanedTestProductos()` sin ventana de 24h (borra todo — seguro
  porque `workers:1`/`fullyParallel:false` garantiza que ningún spec corre
  en paralelo) + limpieza manual de las 1205 filas para desbloquear ya.
  Frente A del roadmap (paginación real del catálogo) queda pendiente, sin
  tocar — este fix es puntual.
- **Documentación EF-3:** tracker sincronizado en cada paso (3C-3 Cerrado,
  3C-4 pausado con nota, 3D-0 En curso→PR linkeado, F26/3D-0b), todo vía
  commits doc-only directos a `main` (excepción de `CLAUDE.md`).
  `ARCHITECTURE.md` actualizado: gotcha de sync a Sheets corregida (ya no es
  automático desde 3C-1), módulo nuevo del lock de Sheets agregado a
  "Módulos y cobertura", `sheets_sync_status` agregada a "Tablas".

## Completado en sesiones anteriores

Ver `docs/archive/` para EF-1/EF-2 completos. EF-3 bloques 3A-0, 3A-0b,
3B-1 a 3B-12 (salvo 3B-7, bloqueado), 3C-1, 3C-2: cerrados en sesiones
previas de esta misma iniciativa — historia en el tracker
(`docs/EF-3_ENGINEERING_HARDENING.md` §11) con PR y SHA de cada uno.

## Tests ejecutados

`npx tsc --noEmit`, `npm run lint`, `npm test` (727/727) y `npm run build`
en verde antes del push de 3D-0 (build con la falla esperada de env vars ya
documentada). CI del PR #47 (3C-3) confirmado verde en los 4 checks reales
antes de mergear. CI del PR #48 (3D-0): 6/6 checks verdes (incluido `live`)
tras el fix de `GET /api/productos`, confirmado antes de mergear.

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
  del roadmap — un catálogo real que superara 2000 productos activos volvería
  a perder items del autofill sin error visible. Producción hoy: 40
  productos (margen amplio). Paginación real, fuera de alcance de este fix
  puntual — evaluar si entra a un bloque EF-3 nuevo o queda para "Después".

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

**Sigue bloqueado, sin cambios:** 3A-1 a 3A-6, 3B-7, y ahora también 3C-4 —
todos esperando el paso manual del usuario (crear proyecto Vercel aislado +
secretos, spec 3A-1 punto 2).
