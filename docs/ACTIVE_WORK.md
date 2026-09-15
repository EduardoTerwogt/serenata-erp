# Trabajo activo

**Última actualización:** 2026-09-15

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
3B-9, 3B-11, 3B-12, 3C-1, 3C-2, 3C-3, **3D-0, 3D-0b, 3D-1, 3D-2, 3D-3, 3D-4,
3D-6, 3D-7, 3D-8, 3D-9, 3D-10, 3D-11, 3D-12** (mergeados vía PR
[#49](https://github.com/EduardoTerwogt/serenata-erp/pull/49), commit de
merge `2d7bd47`).

**Ningún bloque en curso.** El único bloque de EF-3D que sigue abierto es
**3D-5** (`useQuotationItemCellsAutosave`), pausado por decisión explícita
del usuario — ver "Problemas encontrados que siguen abiertos". El resto del
grafo de EF-3D (3D-0..3D-4, 3D-6..3D-12) ya está cerrado.

**3C-4 y 3D-5 pausados** por decisión del usuario (ambos requieren el setup
manual de Vercel de 3A-1 pendiente, o en el caso de 3D-5 una prueba manual
serverless) — ver "Problemas encontrados que siguen abiertos".

## Completado en esta sesión

Sesión que implementó y cerró **11 de los 13 bloques de EF-3D** (refactor de
`app/cotizaciones/[id]/page.tsx` + `DomainError`/`buildErrorResponse` +
Document Ingestion Core), a pedido explícito del usuario
("implementa toda la fase completa de 3D desde ID 3D-0b hasta 3D-12").

- **Excepción de proceso, aprobada por el usuario:** este entorno de
  ejecución está limitado a una única rama designada
  (`claude/nifty-hypatia-n1tptj`), sin permiso para crear ramas nuevas —
  incompatible con la convención normal de "1 rama + 1 PR por bloque". Los
  13 bloques de EF-3D compartieron esa rama y un solo PR (#49) contra
  `main`, en commits separados por bloque. Documentado en el tracker antes
  de empezar.
- **3D-0b** (`8e2d1a2`): fix de la carrera real que T12 de 3D-0 había
  confirmado (F26) entre el flush de un campo de General/Totales y una
  reconciliación en vuelo — portado el patrón `localWriteAtRef` que
  partidas ya tenía.
- **3D-1..3D-4** (`b2e8255`, `1684d74`, `52a9600`): extracción de
  `useQuotationMutationTracker`, `useQuotationGeneralAutosave`,
  `useQuotationTotalesAutosave`, `useQuotationNotasAutosave` — mismo
  comportamiento exacto, verificado por los 13 casos de la suite de
  caracterización de 3D-0/3D-0b en verde tras cada extracción. Se creó
  `lib/quotations/collaboration.ts` (no listado en la especificación) para
  evitar un ciclo de imports `page.tsx` ↔ `hooks/*`.
- **3D-5 pausado por decisión explícita del usuario** tras preguntarle
  cómo proceder: es el bloque de mayor riesgo (P0, "ya causó bugs reales
  dos veces") y su propio criterio de aceptación exige una prueba manual
  contra el entorno serverless real de 3A-1, bloqueada por el mismo setup
  de Vercel pendiente que bloquea 3A-1/3B-7/3C-4.
- **3D-6/3D-7** (`1315a37`, `911cc6e`): extracción de
  `useQuotationReconciliation` y `useQuotationBusinessActions`, adaptados
  para recibir los refs del clúster de partidas (`itemDirtyCellsRef` y
  demás) directo de `page.tsx` en vez de desde el hook de 3D-5 — misma
  firma interna, distinto origen. Cuando 3D-5 se retome, ambas firmas se
  actualizan.
- **3D-8** (`453694e`+`0b7c1d2`, doc-only, 2 commits directo a `main` tras
  el merge de #49): `page.tsx` bajó de 2,388 a **1,484 líneas (-38%)**.
  `ARCHITECTURE.md` documenta los 6 hooks reales y deja explícito que
  `useQuotationItemCellsAutosave` (3D-5) no se extrajo. `live` completo
  verde contra `main` (workflow run `34917496098`).
- **3D-9** (`6f282d0`): `DomainError`/`buildErrorResponse` en cancelación de
  cotización + registrar-pago (CxP/CxC) + generar-orden-pago. 2 hits
  residuales de `rpcError.message` documentados (asignación a variable
  local para logging server-side, nunca llega al cliente).
- **3D-10** (`f5787be`): `buildErrorResponse` en las 8 rutas de Portal
  (login, signup, signup/confirmar, documentos, cuentas, factura, me,
  perfil). `toErrorMessage`/`error-message.ts` intactos.
- **3D-11** (`60b9aee`): `DomainError` en `proyectos/[id]` PUT y
  `proyectos/[id]/tipo` PUT, preservando intacto el mapeo
  `TipoYaAsignadoError`→409.
- **3D-12** (`31e0948`): nuevo `lib/server/uploads/factura-validation.ts`
  consolida required/tipo/tamaño de subida de factura para CxP/CxC/Portal
  — cada ruta conserva su propia tabla de mensajes exacta.
- **CI incidencia mid-sesión ("FALLO UN TEST"):** `tracker-lint` falló
  porque 3D-2 estaba `En curso` dependiendo de 3D-1 también `En curso` (el
  validador exige que toda dependencia de una fila `En curso` esté
  `Cerrado`). Fix: los bloques bundleados se quedaron en `Pendiente`
  (progreso real en "Nota") hasta el merge real — commit `e6635e0`.
- **Merge de PR #49 a `main`, autorizado explícitamente por el usuario**
  tras confirmar CI verde (`test`/`fresh-db`/`smoke-and-critical`/
  `tracker-lint`/`live`) y `mergeable_state: clean`. Commit de merge
  `2d7bd47`. Post-merge, `E2E`/`Test Suite`/`Migrations` en `main`
  confirmados verdes antes de cerrar 3D-8.
- **Tracker sincronizado:** 11 filas bundleadas (3D-0b, 3D-1..3D-4,
  3D-6, 3D-7, 3D-9..3D-12) pasaron a `Cerrado` de una vez con PR+SHA+commit
  de merge; 3D-8 cerrado aparte como doc-only con su propio Commit SHA;
  3D-5 se quedó `Pendiente`.

## Completado en sesiones anteriores

- Ver `docs/archive/` para EF-1/EF-2 completos. EF-3 bloques 3A-0, 3A-0b,
  3B-1 a 3B-12 (salvo 3B-7, bloqueado), 3C-1 a 3C-3, 3D-0: cerrados en
  sesiones previas de esta misma iniciativa — historia en el tracker
  (`docs/EF-3_ENGINEERING_HARDENING.md` §11) con PR y SHA de cada uno.

## Tests ejecutados

En cada bloque de esta sesión, antes de cada commit: `npx tsc --noEmit`
(limpio), `npm run lint` (0 errores, 7 warnings preexistentes), `npm test`
(creció de 728 a **792/792** verde), `npm run build` (compilación +
TypeScript limpios; falla después al recolectar datos de página por falta
de credenciales Supabase en este sandbox — esperado, `docs/ENV.md`, no
relacionado al diff), `node scripts/validate-ef3-tracker.mjs` (OK). CI del
PR #49: 6/6 checks verdes en el commit final (`31e0948`) antes de mergear.
Post-merge en `main`: `test`/`Migrations`/`live`/`smoke-and-critical` verdes
tanto en el commit de merge (`2d7bd47`) como en el push doc-only de 3D-8
(`0b7c1d2`).

## Problemas encontrados que siguen abiertos

- **3D-5 (`useQuotationItemCellsAutosave`) pausado** — máximo riesgo de
  implementación de todo EF-3D, requiere prueba manual contra el entorno
  serverless real de 3A-1. Todo el autoguardado de celdas de partidas sigue
  inline en `page.tsx`. Retomar cuando 3A-1 esté disponible, o si el
  usuario decide aceptar el riesgo sin la prueba manual.
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
- **`GET /api/productos` con `.limit(2000)` explícito** (no paginación
  real): sigue siendo deuda de Frente A del roadmap — un catálogo real que
  superara 2000 productos activos volvería a perder items del autofill sin
  error visible. Producción hoy: 40 productos (margen amplio). (Arrastrado.)

## Siguiente paso

1. **3D-5** sigue pausado — no hay siguiente acción salvo que el usuario
   decida retomarlo o que 3A-1 se resuelva.
2. **EF-3E** (3E-1 baseline final, 3E-2 reconciliación documental, 3E-3
   cierre formal) depende de EF-3B+3C+3D completos — todavía no aplica
   mientras 3D-5 siga abierto.
3. Sin dueño ni urgencia: borrar la rama remota huérfana
   `fix/totales-general-conflict-drain`, decidir el modo de uso de
   `check-schema-parity.mjs`.

**Sigue bloqueado, sin cambios:** 3A-1 a 3A-6, 3B-7, 3C-4 y 3D-5 — todos
esperando el paso manual del usuario (crear proyecto Vercel aislado +
secretos, spec 3A-1 punto 2).
