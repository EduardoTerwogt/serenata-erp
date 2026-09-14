# EF-3 — Engineering Hardening (versión final v12 — cada bloque autosuficiente)

**Nada de esto se ha ejecutado.** No hay rama, no hay commits, no se tocó
`ROADMAP.md`/`ACTIVE_WORK.md`. Décimo segunda ronda de auditoría (ronda 12,
externa e independiente: verificación cruzada de ~60 afirmaciones factuales
del documento contra el código real del repositorio, usando exploración de
solo lectura en los 4 frentes A/B/C/D, más revisión manual de consistencia
interna del documento). Regla vigente desde la ronda 4, pedida
explícitamente: **ningún bloque dice "igual que antes" ni depende de leer
una ronda anterior — cada bloque trae su especificación completa**, aunque
el patrón se repita entre varios.

## 1. Contexto

EF-1 y EF-2 cerraron 17 bloques del plan canónico v13.1 (PR #29, #31). Esta
es la **décima segunda versión** del plan de EF-3 (cada ronda desde la v5
"final" se revisó y corrigió contra hallazgos reales, de ahí el encabezado
del documento). Alcance: cerrar toda la deuda técnica
confirmada de correctness, seguridad, escalabilidad, mantenibilidad y
observabilidad de los frentes A-E de la auditoría original, más lo que las
rondas de reauditoría de este plan encontraron. Cada corrección de una ronda
se incorporó a la siguiente, nunca se acumuló como nota aparte. **Esta
ronda 12 es la primera auditoría externa e independiente del documento**
(las rondas 1-11 fueron autorrevisión del propio plan contra el código;
la ronda 12 verificó ~60 afirmaciones puntuales del documento contra el
repositorio real vía exploración de solo lectura, y encontró 6
inconsistencias — todas textuales/descriptivas, ninguna invalida una
decisión de diseño, SQL o migración — documentadas arriba y aplicadas en
sus bloques correspondientes).

## 2. Conteo final de bloques (verificado, no estimado)

**EF-3A:** 3A-0, 3A-0b, 3A-1, 3A-2, 3A-3, 3A-4, 3A-5, 3A-6 = **8 bloques**.
**EF-3B:** 3B-1, 3B-2, 3B-3, 3B-4, 3B-5, 3B-6, 3B-7, 3B-8, 3B-9, 3B-10,
3B-11, 3B-12 = **12 bloques**.
**EF-3C:** 3C-1, 3C-2, 3C-3, 3C-4 = **4 bloques**.
**EF-3D:** 3D-0, 3D-1, 3D-2, 3D-3, 3D-4, 3D-5, 3D-6, 3D-7, 3D-8, 3D-9,
3D-10, 3D-11, 3D-12 = **13 bloques**.
**EF-3E:** 3E-1, 3E-2, 3E-3 = **3 bloques**.

**Total: 8 + 12 + 4 + 13 + 3 = 40 bloques.**

---

## 3. Inventario completo de lecturas de colecciones (con las 3 que faltaban)

Conteos reales de producción (`fwmyoqokcjtldiofuxdg`, MCP Supabase,
2026-09-13): `cotizaciones`=76, `proyectos`=18, `proveedores`=10,
`cuentas_pagar`=55, `cuentas_cobrar`=23, `rate_limits`=2,
`idempotency_keys`=58, `items_cotizacion`=211. `db.max_rows` local
(`supabase/config.toml:18`) = **1000** — se verifica empíricamente contra
`serenata-erp-test` en 3B-5 (no se asume que el proyecto hosted tenga el
mismo valor solo porque el archivo local lo diga).

| Repositorio.función | Límite hoy | Consumidores reales | Clasificación | Bloque |
|---|---|---|---|---|
| `cuentas-pagar.ts::getCuentasPagar()` | `.limit(500)` | Lista de CxP | Paginación real | 3B-3 |
| `cuentas-cobrar.ts::getCuentasCobrar()` | ninguno | Lista de CxC + 2 side-effects de escritura | Paginación + unificar side-effect | 3B-2, 3B-1 |
| `quotations.ts::getCotizaciones()` | ninguno | 2 consumidores: `app/cotizaciones/page.tsx` (fetch directo a `GET /api/cotizaciones`, lista filtrada simple) y `QuotationCopyItemsModal.tsx` (único caller real de `fetchQuotationsList()`, lista+detalle bajo demanda tras el rediseño — ver corrección de ronda 12 en 3B-4) | Paginación real | 3B-4 |
| `proyectos.ts::getProyectos()` | ninguno | `useProyectosListado.ts` (tablero Kanban por etapa/tipo — necesita membresía completa) + `app/proyectos/tipos/page.tsx` | Lectura interna completa vía keyset, contrato sin cambio (sigue devolviendo array completo) | 3B-5 |
| `proyecto-tareas.ts::getTareasAgregadas()` | ninguno | `useProyectosListado.ts` (tabs Tareas/Estatus del mismo tablero) | Lectura interna completa vía keyset (cursor nullable en `fecha_limite`) — mismo tablero, misma necesidad de membresía completa que Proyectos | 3B-5 |
| `proveedores.ts::getProveedores()` | ninguno | 3 consumidores server-side reales (`app/api/proveedores/documentos-resumen/route.ts`, `app/api/proveedores/route.ts`, `app/api/proyectos/[id]/generar-hoja-llamado/route.ts`) — los componentes cliente (`app/proveedores/page.tsx`, `TareaFormModal.tsx`, `plantillas-servicios/nueva`, `plantillas-servicios/[id]/editar`) la alcanzan de forma transitiva vía `app/api/proveedores/route.ts`, nunca la llaman directo (corren en el browser, no pueden importar un módulo de servidor) — ver corrección de ronda 12 en 3B-6 | Lectura interna completa vía keyset por RPC parametrizada (`(nombre,id) > cursor`, orden decidido por Postgres — nunca reordenado en Node), contrato sin cambio | 3B-6 |
| `cuentas-pagar.ts::getCuentasPagarPendientesEventosRealizados()` | ninguno, filtra fecha en JS | Único: `generar-orden-pago/route.ts` | RPC con filtro SQL | 3B-8 |
| `cuentas-pagar.ts::getOrdenesPago()` | ninguno | Único: `useCuentasPagar.ts` vía `/api/cuentas-pagar/ordenes-historial` (tab historial, lista simple) | Paginación real | 3B-11 |
| `proveedores.ts::getAllProveedorDocumentos()` | ninguno | Único: `app/proveedores/page.tsx` (resumen de validación por proveedor) | Agregado SQL (es literalmente un resumen — no hace falta traer cada fila) | 3B-12 |
| `dashboard.ts::getResumenDashboard()` | hereda de los de arriba | `app/dashboard/` | Agregados SQL, resiliencia `Promise.allSettled` preservada | 3B-10 |
| por-proyecto (route, no repo) | trae 3 tablas completas | vista "Por proyecto" de Cuentas | RPC de agregación | 3B-9 |
| `sync-down.ts::syncTableDown()` | `.limit(5000)` | Espejo de Sheets, 9 tablas | Paginación completa vía keyset | 3C-2 |
| resto de `lib/server/repositories/*.ts` (historial-cambios-responsable, portal, proyecto-documentos, service-templates, tipos-proyecto, usuarios) | ya acotadas por FK real (`.eq('cotizacion_id',...)`, etc.) o catálogos de tamaño fijo por diseño | — | No aplica | — |

Las 13 filas de este inventario (12 con acción propia + 1 fila agrupada de
"no aplica", que reúne el resto de `lib/server/repositories/*.ts` ya
acotado por FK real o catálogos de tamaño fijo) cierran el pedido de
clasificar **todas** las lecturas de colecciones — ninguna quedó sin
destino.

---

## 4. Matriz de hallazgos (25 base, 25-28 según condicionales)

| # | Hallazgo | Bloque(s) |
|---|---|---|
| F1 | `getCuentasPagar()` `.limit(500)` | 3B-3 |
| F2 | `getCuentasCobrar()` sin límite | 3B-2 |
| F3 | `GET /api/cuentas-cobrar` recalcula+escribe en cada GET | 3B-1 |
| F4 | `GET /api/cuentas-cobrar/alertas` duplica esa lógica | 3B-1 |
| F5 | `getCotizaciones()` sin límite | 3B-4 |
| F6 | `getProyectos()`/`getTareasAgregadas()` sin límite, tablero necesita membresía completa | 3B-5 |
| F7 | `getProveedores()` sin límite, objetivo de capacidad = cap real | 3B-6 |
| F8 | `getCuentasPagarPendientesEventosRealizados()` filtra en JS | 3B-8 |
| F9 | `sync-down.ts` `.limit(5000)` | 3C-2 |
| F10 | `triggerSheetsSync()` no coalesce entre instancias | 3C-1 |
| F11 | Lock de sync manual sin lease/huérfanos/auth | 3C-3 |
| F12 | `/api/cuentas/por-proyecto` agrega en Node | 3B-9 |
| F13 | `dashboard.ts` agrega en Node | 3B-10 |
| F14 | Folio principal sin filtro/límite | 3B-7 |
| F14b | *(condicional)* RPC de folio no pasa el gate de latencia serverless sin caché | 3B-7 (si aplica) |
| F15 | `rate_limits` sin retención | 3C-4 |
| F15b | *(condicional)* `syncAllDown()` no cabe en `maxDuration` del cron de keep-alive al volumen objetivo | 3C-4 (si aplica) |
| F16 | `page.tsx` 2,388 líneas, ~80 refs inline | 3D-0..3D-8 |
| F26 | **Activado** — T12 de 3D-0 confirmó una carrera real: si el PATCH de un campo de General/Totales resuelve antes que una reconciliación ya en vuelo, ésta pisa el valor recién confirmado con una lectura vieja (T11, orden inverso, sí está protegido por el guard existente) | 3D-0b |
| F17 | Reconciliación/collaboration-adapter sin extraer | 3D-6 |
| F18 | `DomainError`/`buildErrorResponse` en 3/93 rutas | 3D-9, 3D-10, 3D-11 |
| F19 | Validación de upload duplicada | 3D-12 |
| F20 | Sin suite de carga | 3A-5 |
| F21 | `preview-latency.yml` apunta a producción — no aplica a la suite de carga | No aplica |
| F22 | Sin función de borrado de Drive | 3A-4 |
| F23 | Rate limit de Portal incompatible con 100-200 VUs | 3A-2 |
| F24 | Deriva documental de `ROADMAP.md` | 3A-0 |
| F25 | `getOrdenesPago()`/`getAllProveedorDocumentos()` sin acotar (encontrados en ronda 4) | 3B-11, 3B-12 |

**F1 a F25 = 25 hallazgos base** (24 con bloque asignado + F21 "no
aplica"). **F14b, F15b y F26 son condicionales** — cada una solo existe
como fila real si su gate/medición/test respectivo falla (3B-7 para F14b,
3C-4 para F15b, 3D-0 para F26); si pasan/no revelan el problema, esa fila
condicional no se crea. **F26 ya se activó** (T12 de 3D-0, ver arriba) —
26 hallazgos reales hoy, 26-28 según si F14b/F15b también se activan.

---

## 5. Grafo de dependencias

```
3A-0 (doc-only: canónico + ROADMAP + ACTIVE_WORK + 2 skills) → commit a main
  │
  └─▶ requisito de TODO lo demás (ninguna rama de EF-3 abre antes)
  ▼
3A-0b (validador de tracker + workflow de CI, rama+PR) ──▶ requisito de que
  el tracker se pueda verificar automáticamente desde 3A-1 en adelante
  ▼
3A-1 (entornos local+serverless aislado, concurrency compartida con e2e.yml)
  ├─▶ 3A-2 (fixtures identidad)
  ├─▶ 3A-3 (fixtures volumen)
  └─▶ 3A-4 (cleanup: carpeta Drive por runId + Postgres por runId)
         ▼
     3A-5 (k6 + telemetría SQL/Vercel best-effort)
         ▼
     3A-6 (baseline inicial, ambos entornos, SHA fijado)

3B-1 ──▶ 3B-2
3B-3, 3B-4, 3B-5, 3B-6, 3B-7 (gate serverless de 3A-1), 3B-8, 3B-9, 3B-11,
  3B-12 — independientes entre sí y de 3B-1/3B-2
3B-10 — depende de 3B-1 (usa `lib/server/shared/decimal.ts` consolidado
  ahí); en paralelo con el resto de EF-3B

3C-1 ──▶ 3C-2 ──▶ 3C-3 ──▶ 3C-4 (paralelo con EF-3B)

3D-0 ──▶ 3D-1 ──▶ 3D-2 ──▶ 3D-3 ──▶ 3D-4 ──▶ 3D-5 ──▶ 3D-6 ──▶ 3D-7 ──▶ 3D-8
  (secuencial estricto)
3D-0 ──▶ 3D-0b ──▶ 3D-6
  (activado -- T12 de 3D-0 confirmó la carrera real (F26); 3D-0b bloquea
  3D-6 hasta cerrar, sin afectar a 3D-1..3D-5)
3D-9, 3D-10, 3D-11, 3D-12 — independientes entre sí y de 3D-0..3D-8

EF-3A completo ──▶ EF-3B/3C/3D (necesitan sus entornos)
EF-3B+3C+3D completos ──▶ 3E-1 ──▶ 3E-2 ──▶ 3E-3
```

---

## 6. Subfases y bloques (los 40, cada uno autosuficiente)

### EF-3A — Tooling y baseline diagnóstico

#### 3A-0 — Persistencia documental del plan (doc-only, 5 archivos exactos)

1. **Problema:** un plan que solo vive fuera del repo se desincroniza del
   código real durante la ejecución — ya pasó 3 veces con `ROADMAP.md` en
   este mismo plan.
2. **Decisión — dos commits, no uno, para poder registrar el SHA del
   propio 3A-0:**
   - **Commit #1** (doc-only, excepción `CLAUDE.md`, diff 100% `.md`) toca
     exactamente 5 archivos: (a) crea
     `docs/EF-3_ENGINEERING_HARDENING.md` con este plan completo, la matriz
     de 25 hallazgos base (F1-F25) más hasta 3 condicionales (F14b, F15b,
     F26), el inventario de 13 filas, el grafo, la suite de carga, la
     estimación y el criterio de cierre, más el
     tracker de 40 bloques con el campo "Estado" de cada uno en `Pendiente`
     **excepto la fila de `3A-0` misma, que se escribe directo en `En
     curso`** (todavía no puede decir `Cerrado`: este commit aún no tiene
     SHA propio), y **un historial de cambios con una línea por cada ronda
     de auditoría real que este plan realmente tuvo (hoy 12: rondas 1 a
     12), sin fijar de antemano un número de líneas que vuelva a quedar
     obsoleto en una ronda futura** (corrección de ronda 12: el número de
     rondas ya se quedó corto dos veces — "8 líneas" fijado en la ronda 9
     omitía las rondas 9, 10, 11 y 12, cada una con hallazgos reales;
     omitir cualquiera de ellas dejaría el historial incompleto justo en
     las correcciones más recientes — RLS, distinción
     lease-perdido-vs-fallo-de-RPC, fix de `Date.now()`, `SMOKE`
     fixtureCount, F26/3D-0b, y las 6 correcciones textuales de esta
     ronda), una
     frase cada una; (b) corrige `ROADMAP.md` (F24); (c) actualiza
     `docs/ACTIVE_WORK.md`; (d)/(e) modifican las 2 skills (ver abajo).
   - **Commit #2** (doc-only, mismo push o el inmediato siguiente): edita
     **solo** la fila `3A-0` del tracker recién creado, cambiando
     `Estado: En curso` → `Estado: Cerrado`, `Commit SHA:` al hash real del
     commit #1 (ya conocido en este punto porque el commit #1 ya existe en
     el historial local), y `Próxima acción` a "arrancar 3A-0b".
   - **Regla uniforme para los 6 bloques doc-only del plan (3A-0, 3A-6,
     3D-8, 3E-1, 3E-2, 3E-3), sin excepción ni caso especial:** un commit no
     puede registrar su propio SHA — el hash de un commit no existe todavía
     mientras ese mismo commit se está escribiendo. Por eso **todo cierre
     de un bloque doc-only son exactamente 2 commits, siempre, nunca 1**:
     **Commit de contenido** (crea/edita el archivo `.md` real del bloque —
     el canónico en 3A-0, el baseline en 3A-6/3E-1, la actualización de
     `ARCHITECTURE.md` en 3D-8, la reconciliación final en 3E-2, la sección
     de cierre en 3E-3 — y dentro del mismo commit marca la fila de ese
     bloque en el tracker como `Estado: Cerrado` con `Commit SHA:`
     temporalmente vacío o con la nota `"pendiente de commit de
     sincronización"`); **Commit de sincronización** (inmediato siguiente,
     edita **solo** esa fila del
     tracker, llenando `Commit SHA:` con el hash real del commit de
     contenido, ya conocido porque ese commit ya existe en el historial
     local). Este es el único mecanismo — 3A-0 no es un caso especial
     dentro de él, es el primer bloque que lo ejecuta porque además es
     quien crea el archivo del tracker por primera vez.
     **Corrección de ronda 11 — empuje de los 2 commits, distinta antes y
     después de que 3A-0b exista:** en 3A-0 mismo, `tracker-lint` (3A-0b)
     todavía no existe — no hay CI que pueda ver un estado intermedio
     inválido, así que los 2 commits pueden viajar en el mismo push o en
     dos pushes consecutivos, indistintamente. **En los otros 5 bloques
     doc-only (3A-6, 3D-8, 3E-1, 3E-2, 3E-3), `tracker-lint` ya corre en
     cada push** (3A-0b es requisito de todos ellos) y su regla (c) rechaza
     cualquier fila `Cerrado` con `Commit SHA` vacío — si el commit de
     contenido se empujara solo, ese push haría fallar `tracker-lint` en su
     propio estado intermedio. Por eso, para esos 5 bloques, **los 2
     commits van siempre en un solo push, nunca en dos pushes separados**
     — se preparan ambos localmente (el segundo ya puede calcular el SHA
     real del primero antes de empujar ninguno) y se empujan juntos.
   - (d) modifica `.claude/skills/serenata-iniciar-fase/SKILL.md`,
     agregando al final del paso 1 un ítem 1b: *"Si `docs/ACTIVE_WORK.md`
     indica una iniciativa EF-3 activa, leer también el tracker de
     `docs/EF-3_ENGINEERING_HARDENING.md`, localizar el bloque `En curso` o
     el siguiente `Pendiente` según el grafo, y partir de ahí en vez de
     re-proponer desde cero."*
   - (e) modifica `.claude/skills/serenata-cerrar-sesion/SKILL.md`,
     agregando un paso 6bis: *"Si esta sesión mergeó un bloque de EF-3 a
     `main`: sincronización documental inmediata (commit doc-only) que lo
     marca `Cerrado` con PR+SHA y marca `En curso` el siguiente bloque del
     grafo — esto sí es parte de cerrar sesión, a diferencia del merge de
     código (que sigue rama+PR normal). Si el bloque quedó a medias, el
     checkpoint va también en el tracker, no solo en `ACTIVE_WORK.md`."*
   - **Campos del tracker ajustados para distinguir bloques con PR de
     bloques doc-only** (detalle completo de las 2 formas del tracker, más
     abajo en esta misma spec): un bloque doc-only nunca tiene "PR" (queda
     `N/A`) — tiene "Commit SHA" en su lugar; un bloque con rama nunca tiene
     "Commit SHA" propio como campo primario — tiene "PR" y, tras el merge,
     "Commit de merge".
   - **Orden exacto para sincronizar `En curso` a `main` y rebasar la rama
     de un bloque** (aplica a todo bloque 3A-1 en adelante que use rama,
     detalle completo más abajo en esta spec, sección "Publicación de En
     curso").
3. **Comportamiento a preservar:** ninguno de producto.
4. **Archivos exactos:** `docs/EF-3_ENGINEERING_HARDENING.md`,
   `docs/ROADMAP.md`, `docs/ACTIVE_WORK.md`,
   `.claude/skills/serenata-iniciar-fase/SKILL.md`,
   `.claude/skills/serenata-cerrar-sesion/SKILL.md` — exactamente 5, ninguno
   más (el validador y el workflow de CI van en 3A-0b, con rama y PR).
5. **Nuevos:** el canónico. **Modificados:** los otros 4.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** 3A-0b y, a través de
   ella, todo lo demás.
8. **Orden:** primero de todo EF-3.
9. **Riesgo:** P0 de proceso.
10. **Pruebas:** ninguna (doc-only); revisión manual de fidelidad.
11. **Criterio de aceptación:** los 5 archivos en `main` antes de que exista
    la rama de 3A-0b.
12. **Rollback:** revertir el commit.
13. **Horas:** 5-6h.
14. **Tamaño:** chico, 2 commits doc-only (ver el mecanismo de los 2
    commits en el punto 2).
15. **Evidencia:** los 2 commits, el segundo mostrando el SHA del primero
    ya registrado en la fila `3A-0` del tracker.

**Campos del tracker — 2 formas según el tipo de bloque** (tabla en
`docs/EF-3_ENGINEERING_HARDENING.md`, 40 filas, una por bloque):

| Campo | Bloque con rama (la mayoría) | Bloque doc-only (3A-0, 3A-6, 3D-8, 3E-1, 3E-2, 3E-3 — 6 en total, corrección de esta ronda: 3D-8 y 3E-3 son doc-only también) |
|---|---|---|
| ID y nombre | igual en ambos | igual en ambos |
| Estado | `Pendiente`/`En curso`/`Bloqueado`/`Cerrado`/`Diferido con aprobación`/`No aplica` | igual (nunca `Bloqueado` — un commit doc-only no queda a medias) |
| Dependencias | IDs que deben estar `Cerrado` antes | igual |
| Rama | nombre real cuando exista | **siempre `N/A`** — un doc-only no abre rama |
| PR | link cuando exista | **siempre `N/A`** |
| Commit SHA | vacío mientras no mergea (el PR todavía no tiene un commit final en `main`) | **el campo que sí se llena, siempre en 2 commits** (regla uniforme del punto 2 de 3A-0, aplica a los 6 bloques doc-only sin excepción): el commit de contenido cierra la fila con este campo vacío/pendiente, el commit de sincronización (mismo push, ver la regla uniforme) lo llena con el SHA real ya existente |
| Commit de merge | SHA del merge commit del PR a `main`, una vez mergeado | **`N/A`** — no hay PR que mergear, el "commit de merge" y el "commit SHA" son el mismo valor, solo se llena "Commit SHA" |
| Criterio de aceptación | copiado del punto 11 de la spec del bloque | igual |
| Evidencia de pruebas y CI | link al run de CI + evidencia del punto 15 | link al commit + evidencia del punto 15 (no hay CI de PR que correr sobre un push directo a `main`, salvo el propio `tracker-lint` de 3A-0b si el push toca el tracker) |
| Decisión o bloqueo pendiente | vacío si no hay ninguno | igual |
| Próxima acción | frase concreta | igual |

El validador de 3A-0b exige, para cada fila `Cerrado`: **o bien** "PR" y
"Commit de merge" llenos (bloque con rama), **o bien** "Commit SHA" lleno y
"Rama"/"PR"/"Commit de merge" en `N/A` (bloque doc-only) — nunca ambos
vacíos, nunca una mezcla inconsistente de los dos patrones.

**Publicación de "En curso" y orden exacto de sincronización + rebase**
(aplica a todo bloque con rama, 3A-1 en adelante):

1. Antes de crear la rama: `git fetch origin main && git log -1
   origin/main` para confirmar el estado real de `main`.
2. **Commit de sincronización a `main` PRIMERO, directo (doc-only, sin
   rama):** editar solo la fila del bloque en el tracker,
   `Estado: Pendiente` → `Estado: En curso`, `Rama:` con el nombre que la
   rama va a tener (aunque todavía no exista localmente). Push directo a
   `main`.
3. **Crear la rama desde ese `main` ya actualizado:** `git fetch origin
   main && git switch -c <rama-del-bloque> origin/main` — la rama nace
   YA con el tracker mostrando su propio nombre en `En curso`, no hace
   falta un rebase todavía porque se creó después del commit del paso 2.
4. Trabajo normal en la rama, commits, PR en borrador desde el primer
   commit útil.
5. **Si `main` avanza mientras la rama sigue abierta** (otro bloque
   paralelo se sincronizó/cerró): `git fetch origin main && git rebase
   origin/main` en la rama del bloque antes de cada push subsecuente —
   mantiene la copia del tracker que viaja en la rama al día con lo que
   `main` ya sabe, para que el merge final no tenga que resolver un
   conflicto de tracker.
6. **Al mergear el PR:** el merge commit **nunca** puede llevar su propio
   SHA escrito adentro (mismo motivo que ya vale para los bloques doc-only,
   punto 2 de 3A-0: un commit no conoce su propio hash mientras se está
   escribiendo) — así que el PR mergea con el tracker mostrando la fila
   todavía `En curso` (o, si el PR sí incluyó el cambio de estado como
   parte de su propio diff, con `Commit de merge:` pendiente/vacío).
   **Inmediatamente después del merge, un commit de sincronización doc-only
   separado, directo a `main` (nunca pospuesto):** edita **solo** esa fila
   del tracker, `Estado: Cerrado`, `PR:` con el link, `Commit de merge:`
   con el SHA real del merge commit ya existente en `origin/main` —
   mismo mecanismo de "commit de contenido + commit de sincronización" que
   los bloques doc-only, aplicado aquí al merge en vez de a un commit de
   contenido propio.
7. **Selección del siguiente bloque:** en el mismo commit del paso 6, el
   siguiente bloque según el grafo de dependencias (sección 5) pasa de
   `Pendiente` a `En curso` con su `Rama:` ya anunciada — repite el ciclo
   desde el paso 3 para ese bloque.

#### 3A-0b — Validador de tracker en CI (rama + PR, no doc-only)

1. **Problema:** un script `.mjs` y un workflow de GitHub Actions no son
   `.md` — no aplica la excepción de `CLAUDE.md`, van por rama+PR aunque
   sirvan para vigilar documentación.
2. **Decisión:** nuevo script `scripts/validate-ef3-tracker.mjs` que
   localiza el tracker probando 2 rutas en orden — **corrección de esta
   ronda: el validador debe seguir funcionando después de que 3E-2 mueva
   el canónico a `docs/archive/`, o dejaría de poder verificar el estado
   final del propio EF-3** — `docs/EF-3_ENGINEERING_HARDENING.md` (ruta
   activa, durante la ejecución) y, si no existe, `docs/archive/ef-3-engineering-hardening.md`
   (ruta archivada, después de 3E-2); falla explícito si NINGUNA de las 2
   existe (nunca asume "no hay tracker, entonces paso"). Sobre el archivo
   que encuentre, extrae la tabla del tracker
   (parseo de markdown por regex de fila, no un parser genérico) y valida:
   (a) las 40 filas base de la sección 2 de este plan existen todas, cada
   una con su ID exacto; el tracker puede tener además **hasta 3 filas
   condicionales** con ID exactamente `3B-7b`, `3C-4b` o `3D-0b` (los
   únicos 3 IDs condicionales que este plan puede generar — remediación de
   F14b en 3B-7, remediación de F15b en 3C-4, remediación de F26 en 3D-0,
   ver sección 4) — **cualquier otro ID que no esté en las 40 filas base ni
   en esta lista de 3 condicionales hace fallar la validación** (protege
   contra un ID inventado o mal escrito, no solo contra filas faltantes) —
   **regla de proceso explícita: ningún hallazgo
   nuevo real de la ejecución puede agregar una fila espontánea con un ID
   que no esté ya en esta lista blanca — un PR que agrega un hallazgo
   nuevo primero actualiza la matriz (sección 4), el grafo (sección 5) y
   `CONDITIONAL_BLOCK_IDS`/este mismo validador para incluir el ID nuevo, y
   SOLO DESPUÉS de que ese PR esté mergeado se agrega la fila del tracker
   con ese ID — nunca al revés**;
   (b) todo ID listado en "Dependencias" de una fila existe como fila
   propia (base o condicional ya presente); (c) ninguna fila `Cerrado`
   tiene, según su tipo, "PR"+"Commit de merge" vacíos (bloque con rama) o
   "Commit SHA" vacío (bloque doc-only) — nunca acepta ambos patrones
   vacíos a la vez, ni una mezcla inconsistente; (d) ningún bloque
   `En curso` tiene una dependencia que no esté `Cerrado`. Las 4
   validaciones (a)-(d) son **estructurales** — corren siempre, en todo
   push/PR, sin importar el estado real de avance de EF-3, y son las
   únicas que `tracker-lint` (el job de CI de más abajo) ejecuta.
   El script exporta una constante `BASE_BLOCK_IDS` (los 40 exactos de la
   sección 2) y `CONDITIONAL_BLOCK_IDS` (los 3 de arriba) — el criterio de
   "todas las filas están cerradas" que usan 3E-2/3E-3 se calcula como
   `BASE_BLOCK_IDS` completo + solo los `CONDITIONAL_BLOCK_IDS` que
   efectivamente aparecen como fila en el tracker (una condicional ausente
   nunca cuenta como pendiente, porque significa que su gate pasó y nunca
   se activó). Sale con código de error (no solo advierte) si cualquiera
   falla.

   **Modo adicional `--require-final` (sin él,
   3E-3 no tiene con qué verificar "todas las filas terminaron", solo con
   qué verificar la estructura del tracker):** flag opcional, **nunca**
   usado por `tracker-lint` en CI (que corre siempre en modo estructural,
   sin este flag) — solo lo invoca manualmente el propio 3E-3 al cerrarse.
   Con `--require-final [--except <ID>...]`, además de (a)-(d) valida (e):
   toda fila listada en `BASE_BLOCK_IDS`/`CONDITIONAL_BLOCK_IDS` presente
   en el tracker tiene `Estado` en `Cerrado`, `No aplica`, o `Diferido con
   aprobación` **con una nota de aprobación explícita no vacía en
   "Decisión o bloqueo pendiente"** (un `Diferido con aprobación` sin esa
   nota falla igual que un `Bloqueado`/`En curso`/`Pendiente`) — cualquier
   ID pasado en `--except` se excluye de esta validación (e), sin afectar
   (a)-(d). 3E-3 lo invoca como
   `node scripts/validate-ef3-tracker.mjs --require-final --except 3E-3`
   (su propia fila todavía no puede estar `Cerrado` en el momento en que
   corre la verificación — se está cerrando en ese mismo instante).
   Nuevo job `tracker-lint` en `.github/workflows/test.yml`
   (agregado al workflow existente, no uno nuevo — reduce workflows a
   mantener). **Corre en TODO push/PR, sin
   condicionarlo a que el diff toque el tracker** — GitHub Actions no
   ofrece un filtro de `paths` confiable a nivel de job (los filtros de
   `paths` son del disparador del workflow completo, no de un job
   individual dentro de él); intentar condicionar solo este job por path
   arriesgaría, si se implementara mal, que se saltee sin querer en un push
   que sí toca el tracker. El job es barato (lee 1 archivo, valida
   estructura) — correrlo siempre en cada push es más simple y más seguro
   que una lógica de detección de cambios propensa a fallar.
3. **Comportamiento a preservar:** el resto de jobs de `test.yml` no cambia.
4. **Archivos exactos:** `scripts/validate-ef3-tracker.mjs` (nuevo),
   `.github/workflows/test.yml` (agregar el job).
5. **Nuevos:** el script. **Modificados:** el workflow.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3A-0. **Salientes:** ninguna (los demás
   bloques no dependen técnicamente de este validador para existir, pero sí
   para que sus violaciones del tracker se detecten automáticamente).
8. **Orden:** segundo de EF-3A, antes de 3A-1.
9. **Riesgo:** P1.
10. **Pruebas:** el propio script, corrido contra una copia del tracker con
    cada tipo de violación forzada: fila faltante; dependencia inexistente;
    bloque con rama marcado `Cerrado` sin "PR"/"Commit de merge"; bloque
    doc-only marcado `Cerrado` sin "Commit SHA"; bloque doc-only marcado
    `Cerrado` con "PR" lleno (mezcla inconsistente de los 2 patrones,
    también debe fallar); `En curso` con dependencia abierta; **3 casos
    sobre los IDs condicionales:** (a) tracker con
    las 40 filas base MÁS una fila `3B-7b` válida (con sus propios
    campos según su tipo, `Cerrado` con PR+merge) → **pasa limpio**,
    confirma que una condicional de la lista blanca no rompe el conteo de
    "exactamente 40 base"; (b) tracker con una fila de ID `3B-99` (no está
    ni en las 40 base ni en la lista blanca de 3 condicionales) →
    **falla**, confirma que un ID inventado nunca pasa aunque tenga todos
    los campos bien formados; (c) tracker con `3D-0b` presente y
    `Cerrado`, pero con una dependencia declarada hacia otra condicional
    que NO aparece en el tracker (ej. `3D-0b` dice depender de `3B-7b` y
    esa fila no existe) → **falla** por la misma regla del punto (b) de la
    validación ("todo ID en Dependencias existe como fila propia"),
    aplicada también a IDs condicionales, no solo a los 40 base — 9 casos
    en total, 8 fallos esperados + 1 caso que debe pasar limpio; **3 casos
    sobre `--require-final`:** (d) tracker con las 40
    filas base en `Cerrado`/`No aplica` salvo una en `Bloqueado` →
    `--require-final` **falla** (el modo estructural por sí solo, sin el
    flag, pasaría limpio — confirma que ambos modos son independientes);
    (e) la misma fila puesta en `Diferido con aprobación` con una nota no
    vacía en "Decisión o bloqueo pendiente" → `--require-final` **pasa**;
    (f) esa misma fila `Diferido con aprobación` pero con la nota vacía →
    `--require-final` **falla** — confirma que el estado por sí solo no
    basta, hace falta la nota de aprobación — 12 casos en total, 9 fallos
    esperados + 3 casos que deben pasar limpio ((a) y (e), más el modo
    estructural del caso (d) sin `--require-final`).
11. **Criterio de aceptación:** los 9 casos de violación del punto 10
    fallan como se espera, y los 3 casos que deben pasar limpio ((a), (e),
    y el modo estructural del caso (d)) pasan; el tracker real (recién
    creado en 3A-0, `3A-0` en `Cerrado` con "Commit SHA" y el resto
    `Pendiente`) también pasa limpio en modo estructural; una copia idéntica del tracker guardada en
    `docs/archive/ef-3-engineering-hardening.md` (simulando el estado
    post-3E-2) en vez de la ruta activa pasa exactamente igual — confirma
    el fallback de ruta.
12. **Rollback:** quitar el job del workflow; el script queda sin invocar.
13. **Horas:** 10-12h (por el modo `--require-final` con sus 3 casos
    nuevos, los 3 casos de IDs condicionales + el fallback de ruta
    activa/archivada + la regla de proceso de "hallazgo nuevo modifica el
    validador antes de tener fila").
14. **Tamaño:** chico, 1 PR.
15. **Evidencia:** los 10 casos del punto 10 en el log del PR.

#### 3A-1 — Entornos de carga (local + serverless aislado) + preflight + aislamiento de `serenata-erp-test`

1. **Problema:** los Preview de Vercel comparten env vars de producción.
   `next start` corre con `NODE_ENV=production`, así que un guard basado en
   `NODE_ENV` se bloquea a sí mismo. Carga puramente local no reproduce cold
   starts ni múltiples instancias Lambda. Sembrar miles de filas de volumen
   (3A-3) en `serenata-erp-test` puede interferir con corridas normales de
   `live` (mismo proyecto compartido, ya documentado como fuente real de
   contaminación cruzada en EF-2).
2. **Decisión:**
   - **Local:** build+`next start` en el runner. **Tabla exacta de
     variables → origen, verificada contra el job `live` real de
     `e2e.yml` (líneas 87-114), no un "remapeo" genérico. La tabla omitía
     variables que la app sí lee en
     runtime (`AUTH_TRUST_HOST`/`NEXTAUTH_URL`, confirmados en
     `docs/ENV.md`; `CRON_SECRET`, confirmado usado por
     `app/api/keep-alive/route.ts`) y variables que usan los scripts/el
     propio workflow, no la app (`PLAYWRIGHT_TEST_EMAIL`/`PASSWORD`,
     usadas por 3A-2 para el login REST de staff) — separadas en 2 tablas
     para no confundir ambos universos:**

     **Variables de runtime de la app (Next.js las lee en el proceso
     `next start`):**

     | Variable que la app lee | Origen en `load-test.yml` |
     |---|---|
     | `AUTH_SECRET` | literal fijo `loadtest-e2e-secret` (mismo patrón que `live` usa `live-e2e-secret`: no necesita coincidir con ningún secreto externo, solo ser consistente dentro del propio proceso que firma y verifica) |
     | `AUTH_TRUST_HOST` | literal `'true'` (mismo valor que `docs/ENV.md` documenta para cualquier entorno que no sea `localhost:3000` sin proxy) |
     | `NEXTAUTH_URL` | `http://127.0.0.1:3000` para el job local; la URL real del proyecto Vercel aislado para el job serverless (conocida solo después del primer deploy manual, se fija como secreto `LOADTEST_SERVERLESS_URL` — ver más abajo) |
     | `CRON_SECRET` | literal fijo `loadtest-cron-secret` (solo lo usa `keep-alive`, que 3A-5/3A-6 no invocan como parte de los 8 escenarios — se fija de todas formas para que un `env-check` futuro que sí lo verifique no falle por ausencia) |
     | `NEXT_PUBLIC_SUPABASE_URL` | `${{ secrets.TEST_SUPABASE_URL }}` |
     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `${{ secrets.TEST_SUPABASE_ANON_KEY }}` |
     | `SUPABASE_SERVICE_ROLE_KEY` | `${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}` |
     | `SUPABASE_JWT_SECRET` | `${{ secrets.TEST_SUPABASE_JWT_SECRET }}` |
     | `GOOGLE_CLIENT_ID` | `${{ secrets.GOOGLE_CLIENT_ID }}` (mismo en todos los entornos, no es secreto de test) |
     | `GOOGLE_CLIENT_SECRET` | `${{ secrets.GOOGLE_CLIENT_SECRET }}` (ídem) |
     | `GOOGLE_DRIVE_REFRESH_TOKEN` | `${{ secrets.GOOGLE_DRIVE_REFRESH_TOKEN_TEST }}` |
     | `GOOGLE_DRIVE_FOLDER_ID` | `${{ secrets.DRIVE_TEST_FOLDER_ID }}` |
     | `GOOGLE_DRIVE_FOLDER_ID_CUENTAS` | `${{ secrets.DRIVE_TEST_FOLDER_ID }}` (mismo valor que `live`, confirmado en `e2e.yml:111`) |
     | `GOOGLE_SHEETS_SPREADSHEET_ID` | `${{ secrets.TEST_SHEETS_SPREADSHEET_ID }}` (nuevo secreto — `live` no lo usa hoy porque no ejercita Sheets; se crea aquí) |
     | `LOADTEST_MODE` | literal `'true'` (nunca presente fuera de este workflow) |
     | `LOADTEST_ENV_SECRET` | `${{ secrets.LOADTEST_ENV_SECRET }}` (nuevo secreto) |

     **Variables que solo usan los scripts/el workflow (nunca las lee
     `next start`, no viajan como env var de la app):**

     | Variable | Quién la usa | Origen |
     |---|---|---|
     | `PLAYWRIGHT_TEST_EMAIL` | `prepare-staff-fixtures.mjs` (3A-2), login REST de la cuenta staff sin identidad distinta | `${{ secrets.PLAYWRIGHT_TEST_EMAIL }}` (mismo secreto que ya usa `live`, confirmado en `e2e.yml:113`) |
     | `PLAYWRIGHT_TEST_PASSWORD` | ídem | `${{ secrets.PLAYWRIGHT_TEST_PASSWORD }}` (ídem, `e2e.yml:114`) |
     | `VERCEL_TOKEN` | `wait-for-deployment.mjs` (este bloque) y `vercel logs` (3A-5) | `${{ secrets.VERCEL_TOKEN }}` (nuevo secreto) |
     | `LOADTEST_VERCEL_PROJECT_ID` | `wait-for-deployment.mjs` (este bloque, es el `--project-id` que el script exige) — la ronda anterior invocaba el script con `--project-id <id>` sin declarar de dónde sale ese `<id>`, un secreto que nunca se hubiera creado | `${{ secrets.LOADTEST_VERCEL_PROJECT_ID }}` (nuevo secreto — el ID real del proyecto Vercel aislado, visible en Vercel → Project Settings → General → "Project ID" en cuanto el paso manual (2) de más abajo crea el proyecto; **si el proyecto vive bajo un team de Vercel (no la cuenta personal), agregar también `LOADTEST_VERCEL_TEAM_ID` con el mismo origen manual — la API de deployments de Vercel exige `teamId` en la query cuando el proyecto no es personal, o la consulta de `wait-for-deployment.mjs` no encuentra el deployment** |
     | `LOADTEST_SERVERLESS_URL` | `env-check.mjs`, los 8 scripts de k6 al apuntar al target serverless | `${{ secrets.LOADTEST_SERVERLESS_URL }}` (nuevo secreto, se guarda manualmente tras crear el proyecto Vercel — ver más abajo) |

     Guard de arranque (antes de VU 1): `LOADTEST_MODE=true` Y (no "o")
     `LOADTEST_ENV_SECRET` correcto + verificación real vía
     `GET /api/internal/env-check` (ver más abajo) — nunca `NODE_ENV`.
   - **Serverless real:** proyecto de Vercel nuevo y separado del de
     producción, rama de despliegue fija `loadtest-target` (nunca `main`).
     Pasos manuales (el usuario los ejecuta, sin API de Vercel disponible en
     esta sesión): (1) Vercel Dashboard → New Project → importar
     `EduardoTerwogt/serenata-erp`, Production Branch = `loadtest-target`;
     (2) configurar en Vercel, **como variables de entorno persistentes del
     proyecto (no secretos de GitHub — Vercel no los lee), con los mismos
     valores reales que la tabla de runtime de arriba** (excepto
     `AUTH_SECRET`, que aquí es un literal propio y distinto, ej.
     `loadtest-serverless-secret` — un proyecto Vercel separado, deploy
     persistente, no necesita coincidir con el literal del job local ni con
     producción, solo ser estable entre corridas de este mismo proyecto; y
     excepto `NEXTAUTH_URL`, que aquí es la URL real que Vercel asigna al
     proyecto): las 16 variables de runtime; (3) Settings → Git →
     deshabilitar cualquier auto-deploy desde `main`; (4) guardar la URL
     resultante como secreto `LOADTEST_SERVERLESS_URL`.
   - **Aislamiento de `serenata-erp-test` frente a CI normal:**
     `.github/workflows/load-test.yml` declara
     `concurrency: { group: 'serenata-erp-test-shared', cancel-in-progress: false }`,
     y se agrega la MISMA `concurrency.group` a `.github/workflows/e2e.yml`
     (una línea agregada a un workflow existente) — GitHub Actions encola
     automáticamente cualquier corrida de `live`/`load-test` que se solape
     con otra, nunca corren dos a la vez contra el mismo proyecto
     compartido.
   - **Actualización de `loadtest-target` — permisos, checkout y guard de
     rama explícitos:** el job que
     fija el proyecto Vercel aislado al SHA exacto de cada baseline declara
     `permissions` **dentro del job** (`pin-loadtest-target`), no a nivel
     de workflow — el permiso `contents: write` queda acotado a ese job
     únicamente, el resto de `load-test.yml` no lo hereda:
     ```yaml
     jobs:
       pin-loadtest-target:
         runs-on: ubuntu-latest
         permissions:
           contents: write   # acotado a ESTE job -- el resto de load-test.yml no lo hereda
         steps:
           - uses: actions/checkout@v4
             with:
               fetch-depth: 0   # historial completo -- el push siguiente referencia un SHA arbitrario de main, no solo el HEAD superficial que un checkout shallow trae por defecto
           - name: Guard -- solo se permite fijar loadtest-target desde un SHA que sea ancestro real de origin/main
             run: |
               git fetch origin main
               if ! git merge-base --is-ancestor "${{ inputs.sha }}" origin/main; then
                 echo "::error::${{ inputs.sha }} no es un ancestro de origin/main -- abortando, nunca se fuerza un push a loadtest-target con un SHA arbitrario o de una rama distinta." >&2
                 exit 1
               fi
           - name: Fijar loadtest-target al SHA exacto
             run: git push --force-with-lease origin "${{ inputs.sha }}:refs/heads/loadtest-target"
     ```
     (`inputs.sha` viene del propio `workflow_dispatch` que dispara 3A-6/3E-1
     — nunca se infiere de un evento de push automático, evitando que un
     push cualquiera a `main` dispare sin querer un deploy al entorno de
     carga).

     **Espera del deployment — mecanismo único decidido, con estados,
     timeout y error explícitos:** este repo no tiene hoy ningún
     precedente de polling contra la API de Vercel (`e2e.yml` solo hace
     `wait-on` contra un servidor local, `127.0.0.1:3000` — no aplica
     aquí), así que se define desde cero, sin ambigüedad. Nuevo script
     `scripts/loadtest/wait-for-deployment.mjs`, llamado con
     `--project-id "${{ secrets.LOADTEST_VERCEL_PROJECT_ID }}" --sha <sha>
     --timeout-seconds 300` (y `--team-id "${{ secrets.LOADTEST_VERCEL_TEAM_ID }}"`
     si ese secreto está presente, omitido si no) vía secreto `VERCEL_TOKEN`
     ya usado por 3A-5 para `vercel logs`, reutilizado aquí:
     ```js
     const POLL_INTERVAL_MS = 5000
     const TERMINAL_STATES = new Set(['READY', 'ERROR', 'CANCELED'])

     async function waitForDeployment(projectId, sha, timeoutSeconds, vercelToken, teamId) {
       const deadline = Date.now() + timeoutSeconds * 1000
       while (Date.now() < deadline) {
         const teamParam = teamId ? `&teamId=${teamId}` : ''
         const res = await fetch(
           `https://api.vercel.com/v6/deployments?projectId=${projectId}&meta-githubCommitSha=${sha}&limit=1${teamParam}`,
           { headers: { Authorization: `Bearer ${vercelToken}` } }
         )
         if (!res.ok) throw new Error(`Vercel API respondió ${res.status} consultando deployments`)
         const { deployments } = await res.json()
         const deployment = deployments[0]
         if (!deployment) {
           await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
           continue // el deploy puede tardar unos segundos en aparecer tras el push
         }
         if (deployment.readyState === 'READY') return deployment
         if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
           throw new Error(`Deployment de Vercel terminó en estado ${deployment.readyState} (sha ${sha}) -- no se lanza k6 contra un deploy fallido`)
         }
         // BUILDING / QUEUED / INITIALIZING: sigue esperando
         await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
       }
       throw new Error(`Timeout de ${timeoutSeconds}s esperando el deployment del sha ${sha} -- ver el dashboard de Vercel manualmente antes de reintentar`)
     }
     ```
     Estados no terminales (`QUEUED`/`BUILDING`/`INITIALIZING`) siguen el
     polling; `READY` continúa el workflow; `ERROR`/`CANCELED` y el
     timeout de 300s **ambos abortan el job con código de error** (nunca
     lanzan k6 contra un deploy que no se confirmó `READY`) — la
     diferencia entre ambos casos queda en el mensaje de error
     (`ERROR`/`CANCELED` reales vs timeout), ambos con la misma severidad
     operativa: el job de carga no continúa. `pin-loadtest-target` llama
     este script inmediatamente después del `push --force-with-lease`,
     antes de que cualquier job de k6 arranque.
   - `GET /api/internal/env-check` (nuevo). **La ruta exige LOADTEST_MODE='true' Y secreto correcto simultáneamente
     (nunca uno solo)** — `if (process.env.LOADTEST_MODE !== 'true' ||
     request.headers.get('x-loadtest-secret') !== process.env.LOADTEST_ENV_SECRET)
     return new Response(null, { status: 404 })` (404, no 403 — no delata
     ni siquiera que la ruta existe a quien no tenga ambas condiciones,
     mismo criterio de "inerte por construcción" que `resolveUploadFolderId`
     de 3A-4). Responde sin exponer ninguna llave/token/secreto real:
     `{ supabaseProjectRef, supabaseAnonKeyFingerprint,
     supabaseServiceRoleKeyFingerprint, driveFolderId, driveFolderIdCuentas,
     sheetsSpreadsheetId, authSecretConfigured: boolean, isProductionProject:
     boolean }` — `supabaseProjectRef` se deriva de
     `NEXT_PUBLIC_SUPABASE_URL` (el subdominio `https://<ref>.supabase.co`);
     `*KeyFingerprint` es un hash corto (`sha256(key).slice(0,8)`, nunca la
     key completa) para poder comparar "misma key que la de test" sin
     exponerla; `isProductionProject` compara `supabaseProjectRef` contra el
     ref real de producción (hardcoded en la ruta,
     `fwmyoqokcjtldiofuxdg` — confirmado en la sección 3 de este plan) y
     responde `true` si coinciden, señal de aborto inmediato.
     `env-check.mjs` llama esta ruta contra ambos entornos antes de que
     reciban tráfico y verifica: `supabaseProjectRef` es el de
     `serenata-erp-test` (nunca el de producción — `isProductionProject`
     debe ser `false`), `driveFolderId`/`driveFolderIdCuentas` coinciden con
     `DRIVE_TEST_FOLDER_ID`, `sheetsSpreadsheetId` coincide con
     `TEST_SHEETS_SPREADSHEET_ID`, `authSecretConfigured` es `true`, y
     `supabaseServiceRoleKeyFingerprint`/`supabaseAnonKeyFingerprint`
     coinciden con el fingerprint calculado localmente en el script a partir
     de los mismos secretos de test — si cualquiera falla, el script aborta
     con código de error antes de que k6 lance su primera VU. **Verificación
     adicional — permiso real de administrador para crear los
     10 usuarios efímeros de 3A-2:** `env-check.mjs`, tras el login REST de
     `PLAYWRIGHT_TEST_EMAIL` (staff sin identidad distinta), hace un
     `GET /api/admin/usuarios` con esa sesión — esa ruta exige
     `requireSection('admin')` (confirmado en
     `app/api/admin/usuarios/route.ts:6`); un 200 confirma que la cuenta
     tiene la sección `admin` y puede ejecutar el `POST` que 3A-2 necesita
     para crear los 10 usuarios de staff con identidad distinta; un 403
     aborta el `env-check` completo con un mensaje explícito ("la cuenta de
     staff de `serenata-erp-test` no tiene la sección `admin` — 3A-2 no
     podrá crear las fixtures de identidad") en vez de descubrir la falla
     recién dentro de 3A-2.
3. **Comportamiento a preservar:** ninguno de producto; `e2e.yml` sigue
   corriendo igual salvo la línea nueva de `concurrency`; el resto de
   workflows del repo no ganan `contents: write` — ese permiso queda
   acotado al job `pin-loadtest-target` de `load-test.yml` únicamente
   (`permissions` a nivel de job, no a nivel de workflow, para no ampliar el
   alcance del token en los demás jobs del mismo archivo).
4. **Archivos exactos:** `.github/workflows/load-test.yml` (nuevo, jobs
   `pin-loadtest-target`/`local`/`serverless`; **secuenciado explícito entre
   `local` y `serverless`:** ambos mutan la
   MISMA base `serenata-erp-test` y la misma carpeta de Drive de test (3A-4),
   así que dejarlos correr en paralelo dentro de la misma corrida de
   `workflow_dispatch` corrompería el ciclo de 8 pasos de 3A-6/3E-1 (seed
   idéntico, conteos verificados, snapshot, k6, snapshot, cleanup, nunca
   solapado). `concurrency` a nivel de workflow (punto 2 de más abajo) solo
   serializa corridas *distintas* del workflow entre sí, nunca jobs
   *dentro* de la misma corrida — eso requiere una dependencia explícita:
   `serverless: needs: [pin-loadtest-target, local]` (el job `serverless`
   no arranca hasta que `local` completó su propio ciclo de 8 pasos
   completo, incluido su cleanup; `pin-loadtest-target` sigue corriendo en
   paralelo con `local` porque solo prepara el deploy remoto, no toca datos
   compartidos) — nunca dos jobs de este workflow sin relación `needs:`
   entre sí cuando ambos escriben en `serenata-erp-test`/Drive de test),
   `scripts/loadtest/wait-for-deployment.mjs` (nuevo),
   `.github/workflows/e2e.yml` (+1 línea de `concurrency`),
   `scripts/loadtest/env-check.mjs` (nuevo),
   `app/api/internal/env-check/route.ts` (nuevo); **`docs/ENV.md`
   (modificado — registra los secretos nuevos de
   este bloque —`TEST_SHEETS_SPREADSHEET_ID`, `LOADTEST_MODE`,
   `LOADTEST_ENV_SECRET`, `VERCEL_TOKEN`, `LOADTEST_VERCEL_PROJECT_ID`
   (y `LOADTEST_VERCEL_TEAM_ID` si aplica), `LOADTEST_SERVERLESS_URL`— sin
   los cuales `docs/ENV.md` dejaría de ser la lista completa y comentada
   que `CLAUDE.md` promete)**.
5. **Nuevos:** los 4 scripts/rutas. **Modificados:** `e2e.yml`,
   `docs/ENV.md`. **Acción manual:** creación del proyecto Vercel aislado.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3A-0b. **Salientes:** 3A-2, 3A-3, 3A-4.
8. **Orden:** primero de EF-3A en código.
9. **Riesgo:** P0.
10. **Pruebas:** forzar `LOADTEST_ENV_SECRET` incorrecto → `env-check.mjs`
    aborta antes de VU 1 (ambos entornos) **(1)**; forzar `LOADTEST_MODE` ausente
    con secreto correcto → `env-check` responde 404 (confirma el AND, no
    basta el secreto solo) **(2)**; forzar que
    `NEXT_PUBLIC_SUPABASE_URL` apunte al ref de producción (simulado) →
    `isProductionProject: true` → abort **(3)**; forzar un `driveFolderId`/
    `sheetsSpreadsheetId` que no coincida con los secretos de test → abort **(4)**;
    forzar que la cuenta de `PLAYWRIGHT_TEST_EMAIL` no tenga la sección
    `admin` (fixture sin esa sección) → `env-check.mjs` aborta con el
    mensaje explícito antes de llegar a 3A-2 **(5)**; lanzar `load-test.yml` y
    `e2e.yml` a la vez → confirmar que GitHub
    Actions encola uno detrás del otro (log de "waiting for concurrency
    group") **(6)**; confirmar que `loadtest-target` apunta al SHA exacto pedido
    tras el push forzado **(7)**; **forzar un SHA que no sea ancestro de
    `origin/main`** (ej. un commit de una rama de feature cualquiera) y
    confirmar que el guard aborta antes del `push --force-with-lease` **(8)**;
    **`wait-for-deployment.mjs`, unitaria con mock de la API de Vercel:**
    secuencia `QUEUED`→`BUILDING`→`READY` resuelve **(9)**; `ERROR` lanza de
    inmediato sin seguir el polling **(10)**; `CANCELED` ídem **(11)**; ninguna respuesta
    `READY` antes del `timeoutSeconds` lanza el error de timeout **(12)**; llamada
    sin `--team-id` NO agrega `&teamId=` a la URL (confirma que el
    parámetro es opcional, no un string `"undefined"` literal) **(13)**;
    disparar `load-test.yml` manualmente y confirmar
    en el log de Actions que el job `serverless` queda en estado `Waiting`
    hasta que `local` reporta éxito — nunca arrancan ambos a la vez **(14)**.
11. **Criterio de aceptación:** los 14 casos del punto 10 se comportan como
    se espera.
12. **Rollback:** eliminar workflows/rutas nuevas; quitar la línea de
    `concurrency` de `e2e.yml`; borrar el proyecto Vercel aislado desde el
    dashboard; revertir `docs/ENV.md`.
13. **Horas:** 18-20h (sube por la tabla de 16 variables de runtime + 4 de
    script separadas + el secreto `LOADTEST_VERCEL_PROJECT_ID`/`_TEAM_ID`,
    `wait-for-deployment.mjs` con estados/timeout propios, la verificación
    de permiso admin, el `needs:` entre `local`/`serverless`, y
    `docs/ENV.md`).
14. **Tamaño:** mediano, 1 PR (+ pasos manuales fuera del PR).
15. **Evidencia:** los 14 casos del punto 10 documentados con logs,
    incluido el guard de rama rechazando un SHA ajeno.

#### 3A-2 — Fixtures de identidad (staff, Portal)

1. **Problema:** el Portal tiene rate limit real (`checkRateLimit('portal-login:ip',
   20, 900)`, `checkRateLimit('portal-login:email', 5, 900)`,
   `db/migrations/20260909_rate_limits.sql`) que 100-200 VUs de login real
   agotarían de inmediato. NextAuth de staff es JWT/cookie; identidades
   duplicadas del mismo usuario comparten `userId` en Presence
   (`identity.userId = currentUser?.id || currentUser?.email`,
   `useQuotationPresence.ts`), inservibles para simular usuarios *distintos*
   editando la misma cotización.
2. **Decisión:**
   - **Staff sin identidad distinta** (crear cotizaciones, navegar
     proyectos, CxC/CxP, Dashboard): 1-2 cuentas existentes de
     `serenata-erp-test` (`PLAYWRIGHT_TEST_EMAIL/PASSWORD`), login REST
     (GET `/api/auth/csrf` + POST `/api/auth/callback/credentials`) contra
     el entorno objetivo (local o `LOADTEST_SERVERLESS_URL`), una vez al
     inicio.
   - **Staff con 10 identidades distintas** (editar-concurrente): crear 10
     usuarios efímeros vía `POST /api/admin/usuarios` con `runId` en el
     correo (`loadtest-${runId}-N@serenata.test`), login REST secuencial de
     cada uno (sin rate limit documentado en login de staff).
   - **Portal (100-200 VUs):** bypass total de `/api/portal/login`.
     Un script `.mjs` corrido con `node`
     plano no puede `import` un archivo `.ts` ni resolver el alias `@/`
     directamente (no hay `tsx`/`ts-node` en `package.json` — confirmado,
     `scripts` solo tiene `next`/`eslint`/`vitest`/`playwright` — y el
     resolutor de módulos de Node no entiende `tsconfig.json`/`paths`), así
     que `prepare-portal-fixtures.mjs` **no puede** llamar
     `signPortalSession()` de `lib/portal-auth.ts` por import directo. En
     vez de duplicar la lógica de firma HMAC en JS plano (duplicarla
     arriesgaría que diverja de la real con el tiempo — justo lo que
     "buscar antes de crear" prohíbe), se agrega un endpoint interno nuevo
     que SÍ corre dentro de Next.js y por lo tanto SÍ puede importar el
     código real sin trucos: `POST /api/internal/loadtest-portal-session`
     (nuevo), protegido por el mismo guard fail-closed de `LOADTEST_MODE`+
     `LOADTEST_ENV_SECRET` que 3A-4 (header `x-loadtest-secret`, 404 si no
     coincide o si `LOADTEST_MODE !== 'true'` — mismo criterio de "no
     delatar ni que la ruta existe" que el `env-check` de 3A-1). **Payload
     validado con Zod antes de usarlo:**
     ```ts
     // lib/validation/schemas.ts (agregar)
     export const LoadtestPortalSessionSchema = z.object({
       proveedorId: z.string().uuid(),
       sessionVersion: z.number().int().positive(),
     })
     ```
     La ruta: `let body: unknown; try { body = await request.json() } catch
     { return Response.json({ error: 'JSON inválido' }, { status: 400 }) }`
     (content-type/body no-JSON nunca llega a `request.json()` sin catch —
     mismo patrón que `admin/usuarios` POST); luego
     `const validation = validate(LoadtestPortalSessionSchema, body); if
     (!validation.ok) return Response.json({ error: validation.error },
     { status: 400 })` — un `proveedorId` que no sea UUID real o un
     `sessionVersion` no entero/no positivo nunca llega a
     `signPortalSession`. Recibe
     `{ proveedorId: string, sessionVersion: number }` y devuelve
     `{ cookieValue: string }` llamando **directamente**
     `signPortalSession(proveedorId, sessionVersion)`
     (`lib/portal-auth.ts:46`, sin modificarla) — la firma real de
     producción, nunca una reimplementación. `prepare-portal-fixtures.mjs`
     (script Node plano) crea los N proveedores efímeros directo en
     Postgres (`runId` en el correo, vía `@supabase/supabase-js` que sí es
     un paquete Node normal, sin alias ni TS) y para cada uno hace
     `fetch('<target-url>/api/internal/loadtest-portal-session', {method:
     'POST', headers: {'x-loadtest-secret': ...}, body: JSON.stringify({
     proveedorId, sessionVersion: 1 })})`, guarda el `cookieValue`
     devuelto, y lo usa como header `Cookie: portal_session=<cookieValue>`
     en cada request de k6 — nunca pasa por `/api/portal/login`.
     **Prueba de paridad explícita:** test unitario
     (`vitest`) que llama `signPortalSession(proveedorId, sessionVersion)`
     directo (no vía HTTP) y luego `verifyPortalSession(token)` sobre el
     resultado, confirmando que decodifica exactamente el mismo
     `proveedorId`/`sessionVersion` — no ejercita el endpoint nuevo (ese es
     el request manual del punto 10), sino que fija que la propia función
     de producción es su propio inverso, como base de confianza antes de
     confiar en el endpoint que la envuelve.
3. **Comportamiento a preservar:** ninguno de producto — el endpoint nuevo
   está muerto (404 inmediato) fuera de `LOADTEST_MODE=true`, igual patrón
   que `resolveUploadFolderId` de 3A-4.
4. **Archivos exactos:** `scripts/loadtest/prepare-staff-fixtures.mjs`
   (nuevo), `scripts/loadtest/prepare-portal-fixtures.mjs` (nuevo), ambos
   parametrizados por `--target-url`;
   `app/api/internal/loadtest-portal-session/route.ts` (nuevo);
   `lib/validation/schemas.ts` (agrega `LoadtestPortalSessionSchema`);
   `lib/portal-auth.test.ts` (o el archivo de test existente de
   `portal-auth`, agregar el caso de paridad — no crear un archivo nuevo si
   ya existe uno, confirmado que existe `lib/__tests__/portal-auth.test.ts`).
5. **Nuevos:** los 2 scripts + la ruta. **Modificados:**
   `lib/__tests__/portal-auth.test.ts` (agrega 1 caso, no toca los
   existentes); `lib/validation/schemas.ts`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3A-1. **Salientes:** 3A-5.
8. **Orden:** en paralelo con 3A-3/3A-4.
9. **Riesgo:** P0.
10. **Pruebas:** el caso de paridad unitario descrito arriba (nuevo); 1
    request manual end-to-end contra el endpoint nuevo (con
    `LOADTEST_MODE`/secreto correctos) seguido de `GET /api/portal/me` con
    la cookie devuelta, confirma 200; 1 request al mismo endpoint con
    secreto incorrecto o sin `LOADTEST_MODE`, confirma 404; **3 casos
    nuevos de validación Zod:** `proveedorId` que no es un UUID válido →
    400 con `validation.error`, nunca llega a `signPortalSession`;
    `sessionVersion` no entero o ≤0 (ej. `0`, `-1`, `1.5`) → 400; body no
    JSON (string plano) → 400 `'JSON inválido'`, nunca una excepción sin
    capturar; 1 login REST de staff confirma cookie de sesión válida.
11. **Criterio de aceptación:** los 7 casos del punto 10 pasan; 0
    respuestas 429 de rate limit propio en la corrida completa de Portal
    (verificado en 3A-6).
12. **Rollback:** eliminar los scripts y la ruta nueva; revertir el caso
    agregado a `portal-auth.test.ts` y el schema agregado a `schemas.ts`.
13. **Horas:** 11-13h (sube por la validación Zod explícita + sus 3 casos
    de test).
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** los 7 casos del punto 10.

#### 3A-3 — Fixtures de volumen (>500 / >1,000 / >5,000 según hallazgo)

1. **Problema:** volumen real de `serenata-erp-test` (decenas de filas) es
   insuficiente para ejercer F1 (CxP>500), F2/F5/F7 (CxC/Cotizaciones/
   Proveedores>1,000), F9 (tablas de Sheets>5,000).
2. **Decisión:** script `scripts/loadtest/seed-volume-fixtures.mjs`, corrido
   dentro de la misma ventana de `concurrency` de 3A-1 (así nunca se solapa
   con `live`), que inserta vía las RPCs reales (`save_cotizacion_rpc`,
   `approve_cotizacion`, inserts directos para proveedores) con `runId` en
   cada fila, hasta: `cuentas_pagar`≥600, `cuentas_cobrar`/`cotizaciones`/
   `proveedores`≥1,200, `items_cotizacion`≥5,500. Corre una vez por baseline
   (3A-6/3E-1), nunca en cada push.
3. **Comportamiento a preservar:** N/A, es seeding.
4. **Archivos exactos:** `scripts/loadtest/seed-volume-fixtures.mjs` (nuevo).
5. **Nuevos:** ese script.
6. **Migraciones/RPC:** ninguna nueva — reutiliza RPCs existentes.
7. **Dependencias entrantes:** 3A-1. **Salientes:** 3A-5, 3A-6.
8. **Orden:** en paralelo con 3A-2/3A-4.
9. **Riesgo:** P0 para la validez del baseline.
10. **Pruebas:** el script verifica al final que cada tabla alcanzó su
    objetivo, falla si no.
11. **Criterio de aceptación:** conteos reales post-seed ≥ los objetivos.
12. **Rollback:** 3A-4 borra todo por `runId`.
13. **Horas:** 9-10h.
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** conteos antes/después en el log.

#### 3A-4 — Cleanup de Postgres y Drive (carpeta dedicada por `runId`, sin depender de columnas inexistentes)

1. **Problema:** `documentos_cuentas_cobrar`/`documentos_cuentas_pagar`
   tienen `archivo_url` (ruta/URL de Drive), **no** `drive_file_id`
   (confirmado en `db/migrations/20260410_cuentas_cobrar_completa.sql:71` y
   `20260410_cuentas_pagar_estados.sql:67`) — solo `cotizaciones` tiene
   `drive_file_id` directo. Un diseño de cleanup basado en leer esa columna
   de las 3 tablas fallaría en 2 de ellas. Además, si Drive acepta un
   archivo pero el `INSERT` en Postgres falla, ese archivo queda huérfano
   sin ninguna fila que lo referencie. Un script `.mjs` real no puede
   contener sintaxis de tipos de TypeScript (`table: string`,
   `Promise<string[]>`) — es JavaScript puro, Node lo rechaza al parsear.
   Un registro de corridas en un archivo local del runner
   (`.last-runs.json`) no sirve para recuperar una corrida fallida: cada
   ejecución de GitHub Actions es un runner nuevo, sin disco persistente
   entre corridas.
2. **Decisión — corregido contra el código real de
   `lib/integrations/google/drive.ts`:** las 3 rutas de subida
   (`app/api/cuentas-pagar/[id]/subir-factura/route.ts:74-75`,
   `app/api/cuentas-cobrar/[id]/subir-factura/route.ts:119,128`,
   `app/api/portal/cuentas/[id]/factura/route.ts:87-88`) **no usan
   `uploadPdf`** (esa función, usada solo por
   `app/api/integrations/drive/upload/route.ts` para el PDF de
   cotizaciones, en efecto no acepta `folderId` en `DriveUploadParams` y
   usa `env.driveFolderId` fijo internamente — no se toca, no lo necesita
   este bloque). Las 3 rutas de factura usan **`uploadFileToDrive(file,
   folderPath, fileName, rootFolderId)`**, que **ya acepta `rootFolderId`
   como su 4to parámetro posicional** (`drive.ts:299-312`,
   `finalRootFolderId = rootFolderId || env.driveFolderId`) — hoy le pasan
   `googleEnv.driveFolderIdCuentas`/`cuentasFolderId` directo. **No hace
   falta modificar la interfaz ni la implementación de Drive** — el único
   cambio es qué valor calculan las 3 rutas para ese 4to argumento.

   **Override — falla cerrado si se intenta y es inválido, nunca cae en
   silencio al folder normal. Extiende `DomainError` (no un `Error` plano)
   para que las 3 rutas, que ya cierran su catch con
   `buildErrorResponse(error, ROUTE)` (confirmado — las 3 usan ese patrón,
   no un catch ad-hoc), devuelvan 400 automáticamente sin necesitar un
   `instanceof` especial en cada una — `buildErrorResponse` solo respeta el
   `status`/`safeMessage` de un `DomainError`; cualquier otro tipo de error
   cae siempre en un 500 genérico (confirmado leyendo
   `lib/server/errors/domain-error.ts`), así que un `Error` plano aquí
   habría producido 500, no el 400 prometido:**
   ```ts
   // lib/server/loadtest/drive-folder-override.ts (nuevo)
   import { DomainError } from '@/lib/server/errors/domain-error'

   export class LoadtestOverrideRejectedError extends DomainError {
     constructor(safeMessage: string) {
       super({ code: 'LOADTEST_OVERRIDE_REJECTED', status: 400, safeMessage })
     }
   }

   export function resolveUploadFolderId(request: Request, defaultFolderId: string): string {
     const overrideFolderId = request.headers.get('x-loadtest-drive-folder-id')
     const secret = request.headers.get('x-loadtest-secret')
     const attemptedOverride = Boolean(overrideFolderId) || Boolean(secret)
     if (!attemptedOverride) return defaultFolderId // ningún header presente -- comportamiento normal, en cualquier entorno
     // Antes, con LOADTEST_MODE apagado, esta
     // función devolvía defaultFolderId aunque llegaran headers de
     // override -- una corrida de carga mal dirigida (LOADTEST_SERVERLESS_URL
     // apuntando por error a un despliegue sin LOADTEST_MODE, ej. producción)
     // habría subido archivos al folder normal en silencio, sin ninguna señal
     // de que algo estaba mal. Ahora CUALQUIER header de override presente,
     // con o sin LOADTEST_MODE activo, exige que LOADTEST_MODE sea 'true' Y
     // el secreto coincida -- si no, falla cerrado siempre.
     if (process.env.LOADTEST_MODE !== 'true') {
       throw new LoadtestOverrideRejectedError('Headers de override de carga presentes pero LOADTEST_MODE no está activo en este entorno -- posible corrida de carga mal dirigida')
     }
     if (secret !== process.env.LOADTEST_ENV_SECRET || !overrideFolderId) {
       // Se intentó un override y algo no cuadra: fallar cerrado. Caer en
       // silencio al folder normal aquí escondería un bug del propio script
       // de carga (secreto mal armado, header faltante) detrás de un upload
       // que "funcionó" pero fuera de la carpeta esperada -- justo el tipo
       // de contaminación de Drive que este candado existe para evitar.
       throw new LoadtestOverrideRejectedError('Override de carpeta de carga rechazado -- secreto ausente/incorrecto o folder no especificado')
     }
     return overrideFolderId
   }
   ```
   Cada una de las 3 rutas llama `resolveUploadFolderId(request,
   googleEnv.driveFolderIdCuentas)` (o `cuentasFolderId`, el nombre local
   que ya usa cada ruta) y pasa el resultado como el 4to argumento de
   `uploadFileToDrive` en vez del valor fijo de hoy. **No las 3 rutas cierran igual su catch:**
   `app/api/cuentas-pagar/[id]/subir-factura/route.ts` y
   `app/api/cuentas-cobrar/[id]/subir-factura/route.ts` sí usan
   `catch (error) { return buildErrorResponse(error, ROUTE) }` (confirmado
   en ambas), así que para esas 2 no hace falta agregar nada — el 400 sale
   solo porque `LoadtestOverrideRejectedError` ahora es un `DomainError`
   con `status: 400`. **`app/api/portal/cuentas/[id]/factura/route.ts` NO
   usa `buildErrorResponse`** (confirmado leyendo el archivo real: su catch
   es `catch (error) { console.error(...); return Response.json({ error:
   toErrorMessage(error) }, { status: 500 }) }`, el mismo patrón crudo que
   3D-10 migrará más adelante para las 8 rutas de Portal, pero 3A-4 no
   puede esperar a EF-3D para tener su 400 real). Esta ronda agrega, **solo
   en esa ruta**, un `instanceof` explícito antes del catch genérico, sin
   adelantar la migración completa a `buildErrorResponse` que le
   corresponde a 3D-10:
   ```ts
   } catch (error) {
     if (error instanceof LoadtestOverrideRejectedError) {
       return Response.json({ error: error.safeMessage }, { status: error.status })
     }
     console.error('[portal/cuentas/factura]', error)
     return Response.json({ error: toErrorMessage(error) }, { status: 500 })
   }
   ```
   (cuando 3D-10 migre esta ruta a `buildErrorResponse`, ese `instanceof`
   explícito queda redundante y se elimina como parte de esa migración —
   `buildErrorResponse` ya lo cubre automáticamente; anotado aquí para que
   3D-10 no lo pase por alto como código muerto). Sin ningún header de
   override presente, la función siempre devuelve `defaultFolderId` en
   cualquier entorno (incluida producción) — inerte por construcción para
   el tráfico real, que nunca manda esos 2 headers.
   `uploads.js` (3A-5) manda los 2 headers en cada request de subida, con
   el ID de la carpeta `loadtest-${runId}` creada al inicio de la corrida.

   **Registro persistente de corridas (nueva migración, no un archivo del
   runner) — con RLS habilitado, mismo patrón que
   `20260422_enable_rls_all_tables.sql` aplica a las demás tablas de datos
   (confirmado: esa migración deja explícito que `service_role` bypasea RLS
   y que habilitarlo sin políticas bloquea todo acceso `anon`/`authenticated`
   — `loadtest_runs` no es la excepción, nunca debe quedar leíble/editable
   por el cliente):**
   ```sql
   CREATE TABLE IF NOT EXISTS loadtest_runs (
     run_id uuid PRIMARY KEY,
     started_at timestamptz NOT NULL DEFAULT now(),
     drive_folder_id text,
     cleaned_at timestamptz
   );
   ALTER TABLE public.loadtest_runs ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON public.loadtest_runs FROM PUBLIC, anon, authenticated;
   GRANT ALL ON public.loadtest_runs TO service_role;
   ```
   **`drive_folder_id` guarda el ID real de Drive, nunca el nombre
   `loadtest-${runId}`:** **`create-drive-run-folder.mjs` no puede
   llamar `createDriveFolder` directo:** ese script es Node plano corrido
   con `node`, y `createDriveFolder` vive en
   `lib/integrations/google/drive.ts`, un `.ts` dentro de la app de
   Next.js — mismo problema ya resuelto en 3A-2 para `signPortalSession`
   (no hay `tsx`/`ts-node` en `package.json`, ni el alias `@/` es
   resoluble fuera de Next.js). Mismo patrón de solución:
   nuevo endpoint interno `POST /api/internal/loadtest-drive-folder`
   (nuevo), protegido por el mismo guard fail-closed de
   `LOADTEST_MODE`+`LOADTEST_ENV_SECRET` (header `x-loadtest-secret`, 404
   si no coincide, mismo criterio "inerte por construcción" que
   `env-check`/`loadtest-portal-session`), con el mismo patrón de
   validación Zod que 3A-2 (`LoadtestDriveFolderSchema = z.object({
   runId: z.string().uuid() })`, agregado a `lib/validation/schemas.ts`).
   La ruta llama **directamente** `createDriveFolder(`loadtest-${runId}`,
   DRIVE_TEST_FOLDER_ID)` (sin modificarla) y responde `{ folderId }`
   (el ID real de Drive). `scripts/loadtest/create-drive-run-folder.mjs`
   (Node plano, corrido una sola vez al inicio de cada corrida, antes de
   que cualquier VU de k6 arranque) hace
   `fetch('<target-url>/api/internal/loadtest-drive-folder', {method:
   'POST', headers: {'x-loadtest-secret': ...}, body: JSON.stringify({
   runId })})`, obtiene el **ID real** de la carpeta creada, hace
   `INSERT INTO loadtest_runs (run_id, drive_folder_id) VALUES ($1, $2)`
   con ese ID real (nunca el nombre) **vía `@supabase/supabase-js`
   directo** (paquete Node normal, sin alias ni TS — mismo patrón que
   `bulk-cleanup.mjs`/`prepare-portal-fixtures.mjs` ya usan para hablar
   con Postgres desde un script plano), y lo imprime a stdout en un
   formato que el orquestador del workflow captura y reenvía a k6 como
   variable de entorno (`k6 run --env LOADTEST_DRIVE_FOLDER_ID=<id-real>
   uploads.js`) — `uploads.js` lee `__ENV.LOADTEST_DRIVE_FOLDER_ID` y
   manda **ese** valor en `x-loadtest-drive-folder-id`, nunca
   `loadtest-${runId}` armado dentro del propio script de k6.
   `UPDATE loadtest_runs SET cleaned_at = now()
   WHERE run_id = $1` al terminar su propio cleanup exitoso. El barrido
   huérfano al inicio de cada corrida consulta `SELECT run_id,
   drive_folder_id FROM loadtest_runs WHERE cleaned_at IS NULL AND
   started_at < now() - interval '2 hours'` — filas sin `cleaned_at` y
   viejas son corridas que murieron a medio camino en un runner que ya no
   existe; se limpian igual (Postgres + la carpeta de Drive por el ID real
   en `drive_folder_id`), sin depender de ningún estado local.

   **Cleanup masivo propio — JavaScript puro, sin tipos, no reutiliza
   `live-cleanup.ts`** (esas funciones no paginan; sirven para los
   volúmenes chicos de `live`, no para los miles de filas que deja
   3A-3/un escenario de carga completo). Nuevo módulo
   `scripts/loadtest/bulk-cleanup.mjs`:
   ```js
   const PAGE_SIZE = 500
   // CHUNK_SIZE acota cuántos valores van en un filtro .in()/.delete() de
   // PostgREST -- ese filtro siempre viaja en la query string de la URL
   // (incluso para DELETE), y 500 UUIDs (~37 chars c/u con la coma) rondan
   // los 18-20 KB codificados, cerca de límites prácticos de proxies/
   // gateways. 150 deja margen real (~5.5 KB sin codificar) y se valida
   // empíricamente contra `serenata-erp-test` antes de aceptar el bloque
   // (punto 10) en vez de asumir que 500 funciona.
   const CHUNK_SIZE = 150

   async function discoverIdsByPrefix(supabaseAdmin, table, column, runId) {
     // `.range()` sin `.order()` no
     // garantiza un orden estable entre páginas en Postgres -- una fila
     // puede duplicarse u omitirse igual que el bug de offset ya
     // corregido en 3B-5/3B-6/3C-2. Keyset por `id` (uuid, cursor seguro),
     // mismo patrón que el resto del plan.
     const pattern = `LOADTEST-${runId}-%`
     let all = []
     let cursorId = null
     while (true) {
       let query = supabaseAdmin
         .from(table).select('id')
         .ilike(column, pattern)
         .order('id', { ascending: true })
         .limit(PAGE_SIZE)
       if (cursorId !== null) query = query.gt('id', cursorId)
       const { data, error } = await query
       if (error) throw error
       if (!data || data.length === 0) break
       all.push(...data.map((r) => r.id))
       cursorId = data[data.length - 1].id
       if (data.length < PAGE_SIZE) break
     }
     return all
   }

   async function discoverIdsWhereIn(supabaseAdmin, table, column, values) {
     let all = []
     for (let i = 0; i < values.length; i += CHUNK_SIZE) {
       const chunk = values.slice(i, i + CHUNK_SIZE)
       let cursorId = null
       while (true) {
         let query = supabaseAdmin
           .from(table).select('id')
           .in(column, chunk)
           .order('id', { ascending: true })
           .limit(PAGE_SIZE)
         if (cursorId !== null) query = query.gt('id', cursorId)
         const { data, error } = await query
         if (error) throw error
         if (!data || data.length === 0) break
         all.push(...data.map((r) => r.id))
         cursorId = data[data.length - 1].id
         if (data.length < PAGE_SIZE) break
       }
     }
     return all
   }

   async function deleteWhereInChunks(supabaseAdmin, table, column, values) {
     for (let i = 0; i < values.length; i += CHUNK_SIZE) {
       const chunk = values.slice(i, i + CHUNK_SIZE)
       const { error } = await supabaseAdmin.from(table).delete().in(column, chunk)
       if (error) throw error
     }
   }

   // Envoltorio para el caso más común (borrar por PK 'id') -- las 7
   // llamadas de bulkCleanupLoadTestRun contra tablas cuya PK es 'id'
   // usan esta forma; solo la limpieza de cotizacion_folio_reservations
   // (PK real 'token', se borra por 'folio') llama deleteWhereInChunks
   // directo con la columna explícita.
   async function deleteByIdsInChunks(supabaseAdmin, table, ids) {
     return deleteWhereInChunks(supabaseAdmin, table, 'id', ids)
   }

   export async function bulkCleanupLoadTestRun(supabaseAdmin, runId) {
     // Orden que respeta FKs: hojas primero, raíz al final.
     const cotizacionIds = await discoverIdsByPrefix(supabaseAdmin, 'cotizaciones', 'cliente', runId)
     if (cotizacionIds.length > 0) {
       const itemIds = await discoverIdsWhereIn(supabaseAdmin, 'items_cotizacion', 'cotizacion_id', cotizacionIds)
       await deleteByIdsInChunks(supabaseAdmin, 'items_cotizacion', itemIds)
       const historialIds = await discoverIdsWhereIn(supabaseAdmin, 'historial_responsable', 'cotizacion_id', cotizacionIds)
       await deleteByIdsInChunks(supabaseAdmin, 'historial_responsable', historialIds)
       const cpIds = await discoverIdsWhereIn(supabaseAdmin, 'cuentas_pagar', 'cotizacion_id', cotizacionIds)
       await deleteByIdsInChunks(supabaseAdmin, 'cuentas_pagar', cpIds)
       const ccIds = await discoverIdsWhereIn(supabaseAdmin, 'cuentas_cobrar', 'cotizacion_id', cotizacionIds)
       await deleteByIdsInChunks(supabaseAdmin, 'cuentas_cobrar', ccIds)
       await deleteByIdsInChunks(supabaseAdmin, 'proyectos', cotizacionIds) // proyecto_id = cotizacion_id principal
       // cotizacion_folio_reservations: PK real es `token` (uuid), no `id`
       // -- confirmado en db/migrations/20260408_atomic_cotizacion_folio_reservations.sql.
       // Su columna `folio` guarda exactamente el mismo string que
       // cotizaciones.id (SH### o SH###-A) para la reserva que originó esa
       // cotización -- el mismo patrón que ya usa live-cleanup.ts
       // (.eq('folio', cotizacionId)) generalizado a .in(). No hace falta
       // descubrir nada por prefijo: cotizacionIds ya trae los folios
       // exactos a borrar. Las reservas huérfanas nunca consumidas (INSERT
       // de la cotización falló después de reservar) no necesitan limpieza
       // aparte: reserve_next_cotizacion_folio() ya borra en cada llamada
       // las que tienen expires_at < now() (30 min de default) -- se
       // autolimpian con el siguiente folio reservado, en producción o en
       // la siguiente corrida de carga.
       await deleteWhereInChunks(supabaseAdmin, 'cotizacion_folio_reservations', 'folio', cotizacionIds)
       await deleteByIdsInChunks(supabaseAdmin, 'cotizaciones', cotizacionIds)
     }
     const usuarioIds = await discoverIdsByPrefix(supabaseAdmin, 'usuarios', 'email', runId)
     await deleteByIdsInChunks(supabaseAdmin, 'usuarios', usuarioIds)
     const proveedorIds = await discoverIdsByPrefix(supabaseAdmin, 'proveedores', 'correo', runId)
     await deleteByIdsInChunks(supabaseAdmin, 'proveedores', proveedorIds)
     // clientes/productos: autosaveClienteYProyecto()/autosaveProductos()
     // (lib/server/quotations/persistence.ts) crean/actualizan estas filas
     // al guardar una cotizacion con un cliente/descripcion de item que no
     // exista todavia en el catalogo -- confirmado que SI escriben aqui.
     // Los fixtures de 3A-3/k6 embeben runId en `cliente` (ya usado arriba
     // para descubrir cotizacionIds) y en la `descripcion` de cada item
     // nuevo, precisamente para que sean descubribles aqui.
     const clienteIds = await discoverIdsByPrefix(supabaseAdmin, 'clientes', 'nombre', runId)
     await deleteByIdsInChunks(supabaseAdmin, 'clientes', clienteIds)
     const productoIds = await discoverIdsByPrefix(supabaseAdmin, 'productos', 'descripcion', runId)
     await deleteByIdsInChunks(supabaseAdmin, 'productos', productoIds)
   }
   ```
   **Inventario cerrado de mutaciones de los 8 escenarios y su cobertura de
   cleanup** (la tabla exhaustiva por
   escenario del punto 2 de 3A-5 es la fuente de
   verdad de qué tablas mutan; contra esa tabla, 3 tablas reales quedan
   **deliberadamente fuera** del cleanup por runId, con su razón
   verificada contra el código real, no por omisión:
   - **`pago_operations`**: confirmado leyendo
     `app/api/cuentas-pagar/[id]/registrar-pago/route.ts` y
     `app/api/cuentas-cobrar/[id]/registrar-pago/route.ts`: ambas rutas SÍ
     pasan `p_operation_id` a `registrar_pago_cuenta_pagar`/
     `registrar_pago_cuenta_cobrar`, vía `withIdempotency` — la tabla no
     está inerte. La razón real de excluirla del cleanup por `runId` es
     otra: **decisión explícita, la suite de carga no registra pagos** —
     ninguno de los 8 escenarios de 3A-5 llama `POST
     .../registrar-pago` (confirmado contra la especificación exhaustiva
     de cada escenario: `crear-cotizaciones.js` solo crea+emite,
     `editar-concurrente.js` solo edita partidas, `cuentas.js` es de
     solo lectura y excluye explícitamente `generar-orden-pago`, y ningún
     otro escenario toca cuentas por pagar/cobrar en absoluto) — así que
     ningún escenario de carga puede escribir en `pago_operations` aunque
     la tabla y sus callers reales sí la usen fuera de esta suite.
   - **`idempotency_keys`/`bulk_import_operations`**: son bookkeeping
     efímero de requests, nunca datos visibles en una pantalla de negocio
     (a diferencia de cotizaciones/cuentas/proveedores) — `idempotency_keys`
     ya tiene retención propia por TTL, corre en cada
     `keep-alive` sin importar si hubo o no una corrida de carga (query
     real: `DELETE FROM idempotency_keys WHERE created_at < now() -
     interval '7 days' AND status_code IS NOT NULL` — ver la descripción
     corregida del precedente en 3C-4).
     `bulk_import_operations` (usado por `bulk_replace_items_cotizacion`,
     ejercitado por `editar-concurrente.js`) queda fuera del alcance de
     runId-cleanup por la misma razón — es estado de progreso de una
     operación, no un registro de negocio — y su volumen (una fila por
     operación bulk, nunca por fila de partida) no compite en escala con
     las tablas de negocio que sí acumulan miles de filas por corrida.
   - **`ordenes_pago`**: **decisión explícita, no omisión** —
     `POST /api/cuentas-pagar/generar-orden-pago` genera el PDF de la
     orden a partir de **todas** las `cuentas_pagar` pendientes con
     eventos ya realizados en ese momento (`getCuentasPagarPendientesEventosRealizados()`),
     sin acotar por `runId` — si `serenata-erp-test` tuviera cuentas
     pendientes reales (de un seed normal o de otra corrida) al momento de
     generar la orden, esa misma orden mezclaría fixtures de carga con
     datos ajenos, y borrar esa fila de `ordenes_pago` después borraría
     historial que no es solo del load test. Por eso **`cuentas.js` (3A-5)
     no ejercita `POST /generar-orden-pago`** — se excluye del set de
     acciones de ese escenario precisamente para no tocar un flujo que
     agrupa estado no aislado por diseño; `ordenes_pago` no necesita
     cleanup porque el load test nunca escribe ahí.
   (JavaScript puro, ejecutable directo por Node sin transpilar — ninguna
   anotación de tipo). **Toda mutación financiera de este módulo (`DELETE`
   en `cuentas_pagar`/`cuentas_cobrar`) opera exclusivamente sobre IDs
   descubiertos por el prefijo `LOADTEST-${runId}-`** — nunca un `DELETE`
   sin `WHERE id IN (...)` acotado a esos IDs exactos.
3. **Comportamiento a preservar:** `live-cleanup.ts` no se modifica ni se
   reutiliza; las rutas de upload fuera de `LOADTEST_MODE` siguen subiendo
   al folder fijo de siempre (`googleEnv.driveFolderIdCuentas`), sin ningún
   cambio de comportamiento observable; `uploadPdf`/`DriveUploadParams` no
   se tocan (no los usa ninguna de las 3 rutas).
4. **Archivos exactos:** nueva migración (tabla `loadtest_runs`);
   `lib/server/loadtest/drive-folder-override.ts` (nuevo);
   `app/api/cuentas-pagar/[id]/subir-factura/route.ts`,
   `app/api/cuentas-cobrar/[id]/subir-factura/route.ts`,
   `app/api/portal/cuentas/[id]/factura/route.ts` (las 3 calculan el 4to
   argumento de `uploadFileToDrive` vía `resolveUploadFolderId`);
   `scripts/loadtest/bulk-cleanup.mjs` (nuevo);
   `scripts/loadtest/create-drive-run-folder.mjs` (nuevo);
   `app/api/internal/loadtest-drive-folder/route.ts` (nuevo);
   `lib/validation/schemas.ts` (agrega `LoadtestDriveFolderSchema`);
   `lib/integrations/google/drive.ts` (+2 funciones nuevas, sin tocar las
   existentes: `createDriveFolder(name, parentId)`, `deleteDriveFile(fileId)`).
5. **Nuevos:** 1 migración, `drive-folder-override.ts`, `bulk-cleanup.mjs`,
   `create-drive-run-folder.mjs`, `app/api/internal/loadtest-drive-folder/route.ts`.
   **Modificados:** `drive.ts` (solo agrega, no cambia firmas existentes) +
   las 3 rutas de upload + `schemas.ts`.
6. **Migración/RPC:** la tabla `loadtest_runs` de arriba (sin RPC, acceso
   directo vía `supabaseAdmin` como el resto de los scripts de carga).
7. **Dependencias entrantes:** 3A-1. **Salientes:** 3A-5.
8. **Orden:** en paralelo con 3A-2/3A-3.
9. **Riesgo:** P1 (higiene de entorno); el override de folder es P0 de
   seguridad si fallara abierto — de ahí que un diseño con fallback
   silencioso se corrigiera a fallar cerrado.
10. **Pruebas:** unitaria de `createDriveFolder`/`deleteDriveFile` (mock);
    unitaria de `resolveUploadFolderId`: **sin ningún header, en cualquier
    entorno (con o sin `LOADTEST_MODE`), devuelve siempre el default** (uso
    normal, nunca un intento de override); **con headers de override
    presentes pero `LOADTEST_MODE` apagado (o ausente) — el diseño
    anterior devolvía el default en este caso —
    lanza** `LoadtestOverrideRejectedError` con el mensaje de "posible
    corrida mal dirigida", nunca cae en silencio al default; con
    `LOADTEST_MODE=true` y sin ningún header devuelve el default (uso
    normal, no es un intento de override); con `LOADTEST_MODE=true` y
    secreto incorrecto/folder ausente **lanza** `LoadtestOverrideRejectedError`
    (nunca devuelve el default en ese caso), y las 2 rutas de
    `cuentas-pagar`/`cuentas-cobrar` responden 400 (no 500) vía su catch
    genérico existente sin `instanceof` especial (confirma que extender
    `DomainError` funciona), mientras que la ruta de Portal responde 400
    vía su `instanceof` explícito nuevo (confirma que el catch crudo de
    Portal, sin `buildErrorResponse`, también queda cubierto);
    con `LOADTEST_MODE=true` y secreto correcto devuelve el override;
    unitaria de `discoverIdsByPrefix`/`discoverIdsWhereIn` con mock de >500
    filas en 2 páginas ordenadas por `id`, confirma que las junta todas sin
    duplicar (antes usaban `.range()` sin
    `.order()`, sin garantía de orden estable entre páginas); **prueba
    empírica de
    `CHUNK_SIZE=150` contra `serenata-erp-test` real** (no solo mock):
    sembrar ≥300 filas reales con IDs UUID, confirmar que
    `deleteWhereInChunks`/`deleteByIdsInChunks` completan sin error de URL
    demasiado larga — si falla, `CHUNK_SIZE` baja hasta que la prueba
    empírica pase, antes de aceptar el bloque; **prueba de reservas de
    folio:** reservar un folio real (`reserve_next_cotizacion_folio`), crear la cotización con
    ese folio y `runId` en `cliente`, correr `bulkCleanupLoadTestRun`,
    confirmar que la fila de `cotizacion_folio_reservations` con ese
    `folio` ya no existe, y que **reservar de nuevo el mismo folio
    exacto** (con la tabla de cotizaciones ya vacía) funciona sin colisión
    de `UNIQUE(folio)` — confirma que el cleanup no deja una reserva
    fantasma bloqueando el folio; **prueba de
    cobertura completa del inventario de mutaciones:** crear una cotización de
    fixture con un `cliente` y una `descripcion` de item nuevos (no
    existentes en el catálogo, ambos con `runId`), confirmar que
    `autosaveClienteYProyecto`/`autosaveProductos` crean filas reales en
    `clientes`/`productos`, correr `bulkCleanupLoadTestRun`, confirmar que
    ambas quedan en 0; ídem para `historial_responsable` tras aprobar una
    cotización de fixture con responsables asignados; manual: crear carpeta real, subir 1
    archivo adentro vía el override real contra `serenata-erp-test`,
    borrar la carpeta, confirmar 404 en ambos; manual: matar un proceso de
    carga a medio camino (sin cleanup), confirmar que el barrido huérfano
    de la siguiente corrida lo encuentra vía `loadtest_runs` y lo limpia;
    confirmar que `anon`/`authenticated` no pueden leer ni escribir
    `loadtest_runs` (RLS habilitado, sin políticas) mientras `service_role`
    sí puede; 1 request real a
    `POST /api/internal/loadtest-drive-folder` con `LOADTEST_MODE`/secreto
    correctos y un `runId` UUID válido, confirmar que devuelve `{folderId}`
    con un ID real de Drive (no el string `loadtest-${runId}`), que la
    carpeta existe de verdad en `serenata-erp-test`, y que un `runId` no
    UUID responde 400 vía la validación Zod; 1 request sin
    `LOADTEST_MODE`/secreto correctos confirma 404.
11. **Criterio de aceptación:** los 13 casos del punto 10 pasan; tras una
    corrida+cleanup real (usando `bulk-cleanup.mjs`, no `live-cleanup.ts`),
    **0 filas de fixtures con ese `runId` en las 11 tablas de negocio
    cubiertas (`cotizaciones`, `items_cotizacion`, `historial_responsable`,
    `cuentas_pagar`, `cuentas_cobrar`, `proyectos`,
    `cotizacion_folio_reservations`, `usuarios`, `proveedores`,
    `clientes`, `productos` — 11 tablas en total), EXCEPTO la propia fila
    de auditoría en `loadtest_runs`, que se conserva deliberadamente con
    `cleaned_at` no nulo para esa corrida** (el criterio anterior decía "0 filas con runId" sin esta excepción, lo cual
    contradice directamente que `loadtest_runs` conserva su fila como
    registro de que la corrida sí se limpió — la ausencia total de esa
    fila sería indistinguible de una corrida que nunca se registró); 0
    carpetas `loadtest-*` en Drive de test.
12. **Rollback:** revertir el PR completo (migración incluida, es
    append-only así que la tabla puede quedar sin uso si se revierte el
    código).
13. **Horas:** 23-26h (por el keyset en `discoverIds*`, la cobertura
    completa de `clientes`/`productos`/`historial_responsable` con su
    prueba dedicada, el inventario cerrado documentando por qué
    `pago_operations`/`idempotency_keys`/`bulk_import_operations`/
    `ordenes_pago` quedan fuera, y el endpoint interno
    `loadtest-drive-folder` con su validación Zod).
14. **Tamaño:** mediano-grande, 1 PR.
15. **Evidencia:** los 13 tests del punto 10 + el log del barrido
    post-corrida con conteos antes/después + el caso de recuperación de
    corrida muerta documentado.

#### 3A-5 — Scripts de carga (k6): arrival model, think time, telemetría real (no MCP)

1. **Problema:** F20; además, un workflow de GitHub Actions no puede llamar
   herramientas MCP (son de la sesión de Claude, no de CI) — la telemetría
   propuesta en rondas previas no era ejecutable así. `ramping-arrival-rate` mide **iteraciones por segundo**, no
   usuarios concurrentes — un diseño anterior de este bloque confundía
   ambos: `target: 150` en `ramping-arrival-rate` dispara 150
   iteraciones/segundo (con think-time de 3-8s, eso exige que k6 mantenga
   cientos de VUs simultáneas solo para sostener esa tasa), no "150 usuarios
   navegando el Portal" — una carga muchísimo más agresiva y distinta de lo
   que el escenario dice simular. El objetivo real del audit original es
   **concurrencia** ("~20 creando cotizaciones", "100-200 en el portal"),
   no throughput en RPS — el executor correcto es `ramping-vus`, donde cada
   VU es un usuario simulado que hace `acción → sleep(think_time) → repite`
   durante la duración del stage, así que `target: N` sí significa "N
   usuarios concurrentes" literalmente.
2. **Decisión — herramienta: k6** (binario standalone, `thresholds`
   nativos, WebSockets, multipart — sin dependencias de Node adicionales al
   propio proyecto, instalado como binario en el runner, no en
   `package.json`). **Duración única: 30s de ramp-up al 10% + 11m30s de
   meseta al 100% = 12 minutos exactos por escenario** (`session-version-cost`
   tiene su propia duración fija, ver tabla).

   **Parámetros exactos por escenario — todos `ramping-vus` (concurrencia
   real, no `ramping-arrival-rate`), sin valores por definir:**

   | Escenario | Executor | Stages (VUs objetivo) | think time | Duración |
   |---|---|---|---|---|
   | `crear-cotizaciones.js` | `ramping-vus` | `[{target:2,duration:'30s'},{target:20,duration:'11m30s'}]` | `2 + Math.random()*4` s (2-6s) | 12m |
   | `editar-concurrente.js` | `ramping-vus` | `[{target:10,duration:'30s'},{target:10,duration:'11m30s'}]` | `1 + Math.random()*2` s (1-3s) | 12m |
   | `navegacion-proyectos.js` | `ramping-vus` | `[{target:3,duration:'30s'},{target:30,duration:'11m30s'}]` | `2 + Math.random()*3` s (2-5s) | 12m |
   | `cuentas.js` | `ramping-vus` | `[{target:2,duration:'30s'},{target:15,duration:'11m30s'}]` | `2 + Math.random()*2` s (2-4s) | 12m |
   | `portal.js` | `ramping-vus` | `[{target:15,duration:'30s'},{target:150,duration:'11m30s'}]` | `3 + Math.random()*5` s (3-8s) | 12m |
   | `uploads.js` | `ramping-vus` | `[{target:4,duration:'30s'},{target:38,duration:'11m30s'}]` | `5 + Math.random()*5` s (5-10s) | 12m |
   | `dashboard.js` | `ramping-vus` | `[{target:2,duration:'30s'},{target:20,duration:'11m30s'}]` | `5 + Math.random()*10` s (5-15s, simula lectura del panel) | 12m |
   | `session-version-cost.js` | `constant-vus` | `vus: 5, duration: '5m'` (sin ramp — medición aislada, no representa tráfico mixto) | `1s` fijo (throughput consistente para aislar el costo por request) | 5m |

   `target` es ahora literalmente el número de VUs concurrentes sostenidas
   en la meseta — `150` en `portal.js` son 150 usuarios simultáneos
   ejecutando su propio loop de think-time, exactamente lo que el audit
   original pedía. `15` en `cuentas.js` (medio de 10-20), `38` en
   `uploads.js` (medio de 25-50) — mismo criterio de punto medio que la
   ronda anterior para los rangos, ahora aplicado a VUs reales.

   **Especificación exhaustiva por escenario (antes
   solo había nombres de archivo y parámetros de carga, sin decir qué hace
   cada iteración; sin esto, 2 implementadores construirían pruebas
   distintas). Cada escenario es un loop `acción(es) → sleep(think_time) →
   repetir` durante su duración; `runId` es el mismo UUID de la corrida
   completa (3A-4), usado para taggear cada fila creada y para que
   `bulk-cleanup.mjs` la encuentre después:**

   - **`crear-cotizaciones.js`**
     1. `POST /api/cotizaciones` — cookie de sesión de staff sin identidad
        distinta (3A-2, `PLAYWRIGHT_TEST_EMAIL`). Payload (**agregado `x_pagar` real y positivo, y un
        `responsable_id` de un proveedor real de fixture** — sin
        `x_pagar > 0`, `approve_cotizacion` no genera ninguna fila en
        `cuentas_pagar` para ese ítem, confirmado en
        `db/migrations/20260408_approve_cotizacion_rpc.sql:112`
        (`AND i.x_pagar > 0`), y tanto `cuentas.js` como `uploads.js`
        dependen de que existan cuentas por pagar reales generadas por
        este mismo escenario):
        `{ cliente: "LOADTEST-${runId}-Cliente-${vuId}-${iter}", proyecto: "Proyecto carga ${iter}", fecha_entrega: "<+15 días>", items: [{ descripcion: "LOADTEST-${runId}-Item-${iter}-1", categoria: "Producción", cantidad: 1, precio_unitario: 1000, x_pagar: 700, responsable_id: <de fixture de proveedores, creado en 3A-2/3A-3> }] }`
        (`cliente`/`descripcion` llevan el prefijo `LOADTEST-${runId}-`
        precisamente para que `discoverIdsByPrefix` de 3A-4 los encuentre
        vía `cotizaciones.cliente`/`clientes.nombre`/`productos.descripcion`).
        Status esperado `201`. Crea 1 fila en `cotizaciones`, 1 en
        `items_cotizacion`, y (primera vez que ese `cliente`/`descripcion`
        aparece) 1 en `clientes` y 1 en `productos` vía
        `autosaveClienteYProyecto`/`autosaveProductos`
        (`lib/server/quotations/persistence.ts`).
     2. `POST /api/cotizaciones/[id]/emitir` (mismo `id` del paso 1) —
        status esperado `200`. Cambia `estado` a `EMITIDA`, sin fila nueva.
     3. Métrica custom: `k6.Trend('crear_cotizacion_ms')` alrededor del
        paso 1 (duración de guardado, el más costoso del flujo).
     Cleanup: cubierto por `bulkCleanupLoadTestRun` vía `cotizacionIds`
     (descubre por `cliente`) → `items_cotizacion`/`clientes`/`productos`
     en cascada (3A-4).
   - **`editar-concurrente.js`** (10 VUs fijos, simula colaboración en
     tiempo real sobre la MISMA cotización — rediseño
     completo del setup y de la conexión Realtime, ambos
     técnicamente imposibles en un diseño anterior)
     1. **`export function setup()`** (fase real de setup de k6, corre una
        sola vez en el proceso principal, antes de cualquier VU — nunca
        `SharedArray`/`open()`: esas 2 APIs solo leen archivos de disco
        preparados de antemano en la fase de inicialización del script, no
        pueden contener un `id` generado en runtime por un `POST` HTTP; y
        una "VU semilla" no puede "publicar" nada a las demás VUs — cada
        VU de k6 es su propio runtime aislado (goja), sin memoria
        compartida entre ellas). `setup()` hace `POST /api/cotizaciones`
        (mismo shape que `crear-cotizaciones.js`, incluido `x_pagar > 0`,
        `cliente: "LOADTEST-${runId}-Concurrente"`), captura `id`/`itemId`
        de la partida creada, y hace `return { id, itemId }` — ese objeto
        es lo único que k6 garantiza pasar de `setup()` a cada VU (llega
        como argumento de la función `default` de cada una). **Ya es
        SMOKE-seguro por construcción** (mismo cuidado que `uploads.js`): crea exactamente 1 cotización sin
        importar `SMOKE`/VUs — nunca escala con el número de VUs, así que
        no necesita un guard `__ENV.SMOKE` adicional.
     2. Cada iteración de cada VU: `PATCH /api/cotizaciones/[id]/items/[itemId]`
        sobre la MISMA celda (`descripcion` de la partida creada en el
        setup) con un valor distinto por VU/iteración y un `mutation_id`
        que **codifica el timestamp de envío** (`mutation_id:
        `edit-${__VU}-${iter}-${Date.now()}`` — necesario para correlacionar
        con el broadcast sin memoria compartida entre VUs, ver punto 4)
        — status esperado `200` la mayoría, `409` aceptable (conflicto real
        de edición concurrente, es lo que este escenario existe para
        ejercer) nunca `500`.
     3. **Conexión Realtime — un escenario observador dedicado de 1 VU**
        (declarado aparte en `options.scenarios`, mismo archivo, corriendo
        en paralelo durante toda la duración de los otros 10 VUs de
        edición — k6 permite varios `scenarios` nombrados en un mismo
        script): abre 1 sola conexión WebSocket (protocolo real, ver punto
        de Realtime más abajo) al canal `cotizacion:${id}` y la mantiene
        viva toda la corrida — **nunca "una conexión compartida entre las
        10 VUs de edición"** (imposible: cada VU de k6 es un runtime
        aislado, un objeto WebSocket abierto en una VU no es visible desde
        otra). Por cada evento `item_confirmed` recibido, extrae el
        timestamp de envío del propio `mutation_id` del payload (parseando
        el sufijo `Date.now()` codificado en el punto 2) y calcula
        `realtime_propagation_ms = Date.now() - timestamp_envio` —
        **ambos lados de la resta deben ser
        `Date.now()` (tiempo de reloj/época), nunca `performance.now()`**
        (que mide tiempo monotónico relativo al origen del proceso, no
        comparable con un timestamp de época — mezclar los dos produciría
        un delta sin sentido o negativo) — sin necesitar ningún estado
        compartido entre VUs, la correlación viaja dentro del propio
        payload del evento.
     4. Métricas custom: `k6.Rate('conflict_409_rate')` (proporción de
        409 sobre el total — un valor de referencia, no un umbral de
        fallo); `k6.Trend('realtime_propagation_ms')`, calculada por la VU
        observadora del punto 3 (ver protocolo de Realtime más abajo).
     Cleanup: 1 sola cotización de fixture, cubierta igual que
     `crear-cotizaciones.js`.
   - **`navegacion-proyectos.js`** (solo lectura, tablero Kanban)
     1. `GET /api/proyectos` — cookie de staff sin identidad distinta.
        Status esperado `200`.
     2. `GET /api/proyectos/tareas` (confirmado — el archivo real es
        `app/api/proyectos/tareas/route.ts`, expone `getTareasAgregadas()`)
        — status esperado `200`.
     3. Sin payload (GET puro), sin fila nueva, sin cleanup necesario —
        este escenario nunca escribe.
     4. Métrica custom: `k6.Trend('proyectos_listado_ms')`.
   - **`cuentas.js`**
     1. `GET /api/cuentas-cobrar?search=&page=1&pageSize=50` — status
        `200`.
     2. `GET /api/cuentas-pagar?search=&page=1&pageSize=50` — status `200`.
     3. `GET /api/cuentas/por-proyecto` — status `200`.
     4. **Explícitamente NO incluye `POST /generar-orden-pago`** — decisión
        documentada en 3A-4: esa ruta agrupa TODAS las cuentas pendientes
        reales del entorno, no solo las del fixture, y borrar la orden
        resultante en el cleanup arriesgaría destruir historial ajeno.
     5. Sin fila nueva (solo lecturas), sin cleanup propio — usa los datos
        ya sembrados por 3A-3.
   - **`portal.js`** (100→150 VUs, proveedores con sesión bypaseada, 3A-2)
     1. `GET /api/portal/cuentas` — cookie `portal_session` pre-firmada
        (3A-2). Status `200`.
     2. `GET /api/portal/documentos` — status `200`.
     3. `GET /api/portal/perfil` — status `200`.
     4. Sin escritura en este escenario (el flujo de subir factura del
        Portal vive en `uploads.js`, no aquí, para no mezclar 150 VUs de
        solo-lectura con el volumen de archivos reales de uploads).
     5. Métrica custom: `k6.Rate('portal_429_rate')` — debe ser `0` (3A-2
        existe para garantizar esto).
   - **`uploads.js`** (25→50 VUs, sube archivos reales)
     1. **`export function setup()`** (función de ciclo de vida real de k6,
        corre una sola vez en el proceso principal antes de que arranque
        ninguna VU — un diseño anterior no
        distinguía `setup()` de la fase de inicialización y proponía
        crear estas cuentas "por VU" sin un mecanismo real para
        publicarlas): hace, secuencialmente vía `http.post` (cliente HTTP
        normal de k6, disponible en `setup()`), tantas cotizaciones+ítems
        como el máximo de VUs del escenario (50) — **`setup()` corre siempre completo, sin importar
        `options.scenarios`/`vus`/`iterations` — el modo `SMOKE` de
        `buildOptions` (más abajo en este bloque) solo cambia esas
        opciones, nunca el cuerpo de `setup()`, así que sin un guard
        explícito una corrida de humo (`SMOKE=1`, pensada para 1 sola
        iteración rápida) igual crearía+emitiría+aprobaría 50 cotizaciones
        antes de esa única iteración — lento y contrario al propósito de
        un smoke test.** `setup()` empieza con
        `const fixtureCount = __ENV.SMOKE === '1' ? 1 : 50` y crea
        exactamente `fixtureCount` cotizaciones — cada ítem con
        `descripcion`/`categoria`/`precio_unitario` **y `x_pagar > 0`**
        (mismo payload base que `crear-cotizaciones.js`, ver ese escenario
        — sin `x_pagar > 0` `approve_cotizacion` no genera ninguna fila en
        `cuentas_pagar`, confirmado en `db/migrations/20260408_approve_cotizacion_rpc.sql:112`,
        y este escenario se quedaría sin ningún objetivo de subida), emite
        y aprueba cada una (`POST .../emitir` + `POST .../aprobar`), y
        arma el array de `cuenta_pagar_id` resultantes. **`setup()` hace
        `return { cuentaPagarIds }`** — ese valor de retorno es lo único
        que k6 garantiza compartir entre el proceso de setup y cada VU
        (pasado como argumento a la función `default` de cada una); nunca
        se intenta compartir estado vía `SharedArray`/`open()` (esas 2
        APIs solo leen archivos de disco preparados de antemano en fase de
        inicialización — no pueden contener datos creados en runtime por
        una llamada HTTP).
     2. Cada VU toma `cuentaPagarIds[__VU % cuentaPagarIds.length]` (rotación
        determinística, sin colisión entre VUs porque cada `cuenta_pagar`
        soporta múltiples documentos) y hace
        `POST /api/cuentas-pagar/[id]/subir-factura` — multipart con 2
        archivos reales fijos del repo de fixtures de carga (un XML y un
        PDF pequeños, `scripts/loadtest/fixtures/factura-ejemplo.xml`/`.pdf`,
        nuevos, committeados al repo — nunca generados on-the-fly, para
        que el tamaño/contenido sea determinístico entre corridas), **más
        los 2 headers de override de Drive de 3A-4** (`x-loadtest-secret`,
        `x-loadtest-drive-folder-id: __ENV.LOADTEST_DRIVE_FOLDER_ID`) —
        **el header manda el ID REAL de la
        carpeta de Drive de esta corrida** (creado por
        `scripts/loadtest/create-drive-run-folder.mjs`, 3A-4, y pasado a k6
        vía `--env LOADTEST_DRIVE_FOLDER_ID=<id-real>`), **nunca el nombre
        `loadtest-${runId}`** — `resolveUploadFolderId`/`uploadFileToDrive`
        usan ese header directo como ID de carpeta padre de la API de
        Drive, que no resuelve nombres, solo IDs; mandar el nombre
        produciría un 404 real de Drive en cada subida. Status esperado
        `200`.
     3. Crea 2 filas en `documentos_cuentas_pagar` (XML+PDF) y 2 archivos
        reales en la carpeta real de Drive de esta corrida
        (`LOADTEST_DRIVE_FOLDER_ID`).
     4. Cleanup: la carpeta de Drive completa se borra por `runId`
        (`deleteDriveFile`/borrado de carpeta, 3A-4); las filas de
        `documentos_cuentas_pagar` se borran en cascada al borrar la
        `cuenta_pagar` padre (ya cubierto, son hijas de `cuentas_pagar`
        que a su vez se descubre por `cotizacion_id`).
     5. Métricas custom: `k6.Trend('upload_ms')`;
        `k6.Rate('upload_error_rate')` (umbral `rate<0.02`, ya declarado
        en el punto 11 de este bloque).
   - **`dashboard.js`** (solo lectura)
     1. `GET /api/dashboard/resumen` (confirmado —
        `app/api/dashboard/resumen/route.ts`, expone
        `getResumenDashboard()`) — status `200`.
     2. Sin payload, sin fila nueva, sin cleanup.
     3. Métrica custom: `k6.Trend('dashboard_ms')`.
   - **`session-version-cost.js`** (aislado, `constant-vus: 5`, 5 min, sin
     mezclar con los otros 7)
     1. `GET /api/cotizaciones/[id]` sobre 1 cotización de fixture fija
        (creada una vez en el setup del escenario, reutilizada por las 5
        VUs durante todo el escenario — el objetivo es medir el costo por
        request de `session_version`, no ejercer concurrencia). Status
        `200`.
     2. Comparación que se pretende producir: el snapshot de
        `pg_stat_statements` antes/después de este escenario aislado
        (5 min, carga constante y conocida — 5 VUs × 1 req/s = 300
        req/min) contra el mismo query aislado en el baseline anterior
        (3A-6 vs 3E-1) — el `queryid` de la consulta que resuelve
        `session_version` en `GET /api/cotizaciones/[id]` debe mostrar
        `window_mean_ms` estable entre ambos baselines; una regresión aquí
        aísla el costo específico de esa columna, sin ruido de los otros 7
        escenarios corriendo a la vez.
     3. Cleanup: 1 sola cotización de fixture, igual patrón que los demás.

   **Protocolo de Realtime (para `editar-concurrente.js`, único escenario
   que lo ejercita) — verificado contra el código real de
   autorización, no asumido:** el canal `cotizacion:${id}` es **privado**
   (`private: true`, confirmado en
   `tests/e2e/live/realtime-channel-authorization.spec.ts:134` y en
   `lib/realtime/authorize.ts:27-32`) — un `join` sin autorización previa
   lo rechaza la política RLS de `realtime.messages`
   (`db/migrations/20260909_realtime_broadcast_authorization.sql`). El
   script k6 (cliente WebSocket nativo de k6, no el SDK de Supabase — k6
   no corre un runtime Node completo) replica el handshake real en 2
   pasos, confirmado leyendo `lib/realtime/authorize.ts`:
   1. `GET /api/realtime/token` (con la cookie de sesión de staff) →
      `{ token, expires_in }` — el mismo JWT de Realtime que
      `authorizeRealtime()` obtiene en el browser.
   2. Conectar al WebSocket de Realtime de Supabase (protocolo Phoenix
      Channels) y enviar `phx_join` sobre el tópico `realtime:cotizacion:${id}`
      con `payload: { config: { private: true }, access_token: token }` —
      el mismo formato que `supabaseBrowser.channel(topic, { config: {
      private: true } })` arma internamente.
   Con el canal unido, el script escucha el evento
   **`item_confirmed`** — el nombre y el
   payload quedan cerrados contra el código real, no abiertos "a
   confirmar al implementar", confirmado leyendo
   `app/api/cotizaciones/[id]/items/[itemId]/route.ts:114-127` (el PATCH
   de partida) y `lib/server/realtime/__tests__/broadcast.test.ts:25`: el
   evento viaja con
   `payload: { cotizacion_id, item_id, revision, mutation_id, at }` (y
   `operation: 'delete'` cuando la partida se borra en vez de patchearse,
   caso que este escenario no ejercita). La correlación no usa
   `rememberOwnItemMutationId` (eso es un mecanismo interno del cliente
   React, no algo que un script de k6 replique) — usa el propio
   `mutation_id` que cada VU manda en su `PATCH` (punto 2 del escenario,
   arriba: `edit-${__VU}-${iter}-${Date.now()}`, con el timestamp de envío
   codificado en el propio string). **Medir desde antes de mandar el
   `PATCH`, no desde la respuesta HTTP:** el
   broadcast se emite dentro de un `after()` de Next.js que corre tras el
   commit en Postgres pero **puede completarse y llegar por WebSocket
   antes de que la respuesta HTTP del `fetch` del `PATCH` termine de
   resolverse** en el cliente (dos ramas asíncronas independientes desde
   el punto de vista del servidor) — medir contra el timestamp de
   respuesta HTTP arriesgaría un delta negativo o artificialmente bajo si
   el WebSocket gana la carrera. Por eso el timestamp de referencia es el
   que la VU de edición ya codificó en `mutation_id` **antes de enviar el
   `PATCH`** (`Date.now()` capturado inmediatamente antes del `fetch`), y
   `realtime_propagation_ms = Date.now() (al recibir el mensaje WebSocket) -
   timestamp_codificado_en_mutation_id` — **ambos lados en `Date.now()`,
   nunca `performance.now()`** (relojes distintos, no comparables entre
   sí) — nunca contra el timestamp de la
   respuesta HTTP. **Liveness de la conexión:** la VU observadora responde
   `phx_reply` a cada `heartbeat` que el servidor de Realtime de Supabase
   manda por el protocolo Phoenix Channels (cada ~30s) — si dos heartbeats
   consecutivos no obtienen respuesta, el servidor cierra la conexión, así
   que el script debe enviar el `heartbeat` de vuelta o el canal se cae a
   mitad de los 12 minutos de la meseta, invalidando la métrica desde ese
   punto en adelante sin ningún error visible en las 10 VUs de edición
   (que no dependen de esa conexión para sus propios `PATCH`). El token se
   refresca a mitad de su TTL igual que `scheduleTokenRefresh` en el
   browser, para que la conexión no se caiga por expiración del JWT a
   mitad de la meseta.

   **Uploads — cuenta y archivos exactos (resumen, detalle arriba):**
   cuenta de staff sin identidad distinta (3A-2); 1 XML + 1 PDF fijos del
   repo (`scripts/loadtest/fixtures/`); headers de override de Drive de
   3A-4 en cada request.

   **Modo `SMOKE` explícito — `--vus 1 --iterations 1` no sustituye de
   forma fiable un script que ya define `options.scenarios`** (los flags de
   CLI de k6 no pisan un `scenarios` declarado en el propio script). Cada
   script exporta sus opciones condicionalmente:
   ```js
   // scripts/loadtest/k6/_shared.js
   export function buildOptions(scenarioStages, thresholds) {
     if (__ENV.SMOKE === '1') {
       return { vus: 1, iterations: 1, thresholds: {} } // sin scenarios: 1 sola iteración real, sin ramp
     }
     return {
       scenarios: { main: { executor: 'ramping-vus', stages: scenarioStages, gracefulRampDown: '30s' } },
       thresholds,
     }
   }
   ```
   y cada script llama `export const options = buildOptions(STAGES,
   THRESHOLDS)` con sus propios `STAGES`/`THRESHOLDS`. La corrida de humo se
   dispara con `SMOKE=1 k6 run crear-cotizaciones.js`, nunca con flags de
   CLI que compitan con `options.scenarios`.

   **Telemetría real vía RPC segura, universo completo (no un top-N que
   puede sesgar los deltas):**
   - Antes de escribir la RPC, **verificar contra `serenata-erp-test` real,
     esquema Y columnas, no solo columnas** — Supabase instala
     `pg_stat_statements` por convención en el esquema `extensions`, no en
     `public` (a diferencia de `pgcrypto`/`pg_trgm`, que este repo sí
     instala manualmente en `public` — confirmado que ninguna migración de
     este repo crea `pg_stat_statements`, señal de que ya viene
     pre-instalada por la plataforma en su esquema propio); un `SET
     search_path = public, pg_catalog` (como escribía una ronda anterior)
     **no incluye `extensions`**, así que `FROM pg_stat_statements` sin
     calificar fallaría con "relation does not exist" dentro de la función.
     La verificación real es:
     `SELECT table_schema, column_name FROM information_schema.columns
     WHERE table_name = 'pg_stat_statements'` — confirma en una sola
     consulta tanto el esquema real (`extensions` u otro, nunca asumido)
     como los nombres de columna (`total_exec_time`/`mean_exec_time` en
     Postgres 13+ vs `total_time`/`mean_time` en versiones viejas).
   - Nueva migración: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements
     SCHEMA extensions;` (`IF NOT EXISTS` la deja intacta si ya existe en
     otro esquema — el `CREATE EXTENSION` con `SCHEMA` solo aplica en la
     instalación inicial) + RPC que trae **todas** las filas relevantes,
     no un top-N — `pg_stat_statements.max` (parámetro de configuración de
     la extensión, típicamente 5000) acota el tamaño real de la vista, así
     que traer el universo completo es factible y es lo único que da
     deltas correctos: una query que ya acumulaba estadísticas por debajo
     de un corte top-200 en el snapshot "antes" pero cruza el corte en
     "después" haría que un diseño top-N le atribuyera TODO su tiempo
     acumulado histórico a la ventana de la corrida, no solo el delta real.
     **La función referencia la vista calificada por el esquema real
     confirmado en el punto anterior (`extensions.pg_stat_statements` aquí,
     ajustado si la verificación real diera otro esquema) — nunca depende
     de que ese esquema esté en `search_path`:**
     ```sql
     CREATE OR REPLACE FUNCTION public.pg_stat_statements_snapshot()
     RETURNS jsonb
     LANGUAGE sql
     STABLE
     SECURITY DEFINER
     SET search_path = public, pg_catalog
     AS $$
       SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
       FROM (
         SELECT queryid::text AS queryid, query, calls, total_exec_time, mean_exec_time, rows
         FROM extensions.pg_stat_statements
         WHERE query NOT ILIKE '%pg_stat_statements%'
       ) t;
     $$;
     REVOKE EXECUTE ON FUNCTION public.pg_stat_statements_snapshot() FROM PUBLIC, anon, authenticated;
     GRANT EXECUTE ON FUNCTION public.pg_stat_statements_snapshot() TO service_role;
     ```
     (esquema `extensions` y nombres de columna
     `total_exec_time`/`mean_exec_time` a confirmar contra el resultado
     real de `information_schema.columns` del punto anterior antes de
     aplicar esta migración — si la verificación real diera un esquema u
     nombres distintos, la RPC se escribe con esos valores reales en su
     lugar, mismo contrato de salida hacia Node). `queryid::text` porque
     `bigint` pierde precisión al pasar por JSON en algunos clientes.
   - `scripts/loadtest/telemetry-snapshot.mjs`: llama la RPC (sin
     parámetros, universo completo) una vez **antes** de arrancar k6
     (`before.json`) y una vez **después** (`after.json`), ambos con
     timestamp ISO.
   - `scripts/loadtest/telemetry-deltas.mjs`: lee ambos snapshots
     completos, empareja por `queryid`, calcula `calls_delta = after.calls
     - before.calls` y `total_exec_time_delta_ms = after.total_exec_time -
     before.total_exec_time`. **La media debe
     ser de la ventana, no la histórica:** `mean_exec_time` de un snapshot
     es el promedio acumulado desde el último reset del contador, no el
     promedio de lo que pasó durante la ventana de carga — usar
     `after.mean_exec_time` directo mezcla
     todo el historial previo con la ventana. La métrica correcta es
     `window_mean_ms = calls_delta > 0 ? total_exec_time_delta_ms /
     calls_delta : null` (guardado explícitamente contra división por
     cero cuando `calls_delta` es 0 — puede pasar si una query no se
     ejecutó durante la ventana pero sigue en ambos snapshots). **Un
     `queryid` presente en `after` y ausente en `before` no se etiqueta
     como "genuinamente nuevo" con certeza** — puede serlo, o puede ser una
     entrada vieja que `pg_stat_statements.max` desalojó (evicción LRU)
     entre el snapshot "antes" y una ejecución durante la ventana,
     reapareciendo con contadores reiniciados desde cero: ambos casos son
     indistinguibles solo con los 2 snapshots. Esa fila se marca `flag:
     'new_or_reset'` en la salida (en vez de afirmar "nueva") y su delta se
     calcula igual como el valor completo de `after` (es la única cifra
     disponible en cualquiera de los 2 casos, correcta para "nueva" y una
     sobre-estimación acotada y explícita para "reseteada" — nunca se
     inventa un delta más preciso que no existe). Un `queryid` en `before`
     ausente en `after` se omite (reciclado por `pg_stat_statements.max`,
     no es un error, y no hay filas "después" que pudieran indicar lo
     contrario). Salida: `docs/archive/telemetry/<runId>-pg-stat-deltas.json`,
     cada fila con `{queryid, calls_delta, total_exec_time_delta_ms,
     window_mean_ms, flag}` (`flag` es `'matched'` o `'new_or_reset'`),
     ordenado por `total_exec_time_delta_ms` descendente.
   - **Vercel:** captura best-effort vía CLI (`vercel logs
     <deployment-url> --json`, `VERCEL_TOKEN` como secreto) — declarado
     explícitamente best-effort, con "captura manual pendiente" documentada
     si el plan de Vercel no expone suficiente detalle.
3. **Comportamiento a preservar:** ninguno de producto — la extensión
   `pg_stat_statements` es de solo lectura de estadísticas.
4. **Archivos exactos:** `scripts/loadtest/k6/{_shared.js,
   crear-cotizaciones.js, editar-concurrente.js, navegacion-proyectos.js,
   cuentas.js, portal.js, uploads.js, dashboard.js,
   session-version-cost.js}` (nuevos); `scripts/loadtest/fixtures/{factura-ejemplo.xml,factura-ejemplo.pdf}`
   (nuevos — archivos reales fijos para `uploads.js`); nueva migración (extensión + RPC);
   `scripts/loadtest/telemetry-snapshot.mjs`,
   `scripts/loadtest/telemetry-deltas.mjs` (nuevos).
5. **Nuevos:** los 8 scripts de k6 + `_shared.js` + los 2 archivos de
   fixture de uploads + los 2 scripts de
   telemetría + 1 migración.
6. **Migración/RPC:** la de arriba (`pg_stat_statements_snapshot`, sin
   parámetros, universo completo).
7. **Dependencias entrantes:** 3A-1, 3A-2, 3A-3, 3A-4. **Salientes:** 3A-6.
8. **Orden:** después de 3A-1/3A-2/3A-3/3A-4.
9. **Riesgo:** P1 — tooling, no toca producción.
10. **Pruebas:** cada script corre con `SMOKE=1` contra el entorno local, 1
    sola iteración real, 0 errores HTTP inesperados; `SMOKE=1 k6 run uploads.js` confirma que `setup()` crea
    exactamente 1 cotización (no 50) — verificado contando las filas
    `LOADTEST-${runId}-*` en `cotizaciones` inmediatamente después de que
    `setup()` termina, antes de que corra la única iteración; unitaria de
    `telemetry-deltas.mjs` con 2 snapshots mock completos (`queryid`s
    solapados con `calls_delta>0` → `window_mean_ms` calculado correcto vs
    `total_exec_time_delta_ms/calls_delta`; uno con `calls_delta===0` →
    `window_mean_ms: null`, nunca división por cero; uno nuevo en `after`
    → `flag: 'new_or_reset'`, nunca `'nuevo'` sin calificar; uno que
    desaparece de `before` a `after` → omitido de la salida) — confirma los
    4 casos de emparejamiento; verificación de **esquema y columnas**
    reales de `pg_stat_statements` contra `serenata-erp-test` (punto 2,
    `information_schema.columns` con `table_schema` incluido) documentada
    antes de escribir la migración; unitaria de la RPC corrida real
    confirmando `queryid` como string sin pérdida de precisión, que la RPC
    NO falla por "relation does not exist" (confirma que el esquema
    calificado en el `FROM` es el correcto), y que el conteo de filas
    devueltas coincide con `SELECT count(*) FROM extensions.pg_stat_statements`
    (o el esquema real confirmado) en el mismo momento (universo completo,
    no un top-N).
11. **Umbrales (evaluados como gate real recién en 3E-1, 3A-6 es
    diagnóstico):** HTTP `p(95)<800`, `p(99)<1500` (ms); Realtime
    `p(95)<2000`, `p(99)<8000` (ms); uploads `p(95)<5000`, `p(99)<8000`
    (ms); error rate general `rate<0.01`; error rate de uploads
    `rate<0.02`.
12. **Rollback:** eliminar `scripts/loadtest/k6/` y los scripts de
    telemetría; la RPC/extensión quedan sin invocar si se revierte el
    código que las usa.
13. **Horas:** 40-46h (por corregir el modelo de carga de
    `ramping-arrival-rate` a `ramping-vus`, el modo `SMOKE` explícito, la
    calificación de esquema de `pg_stat_statements`, el cálculo correcto
    de `window_mean_ms` con el flag `new_or_reset`, y la especificación
    exhaustiva por escenario — endpoints/payloads/fixtures/
    métricas/cleanup de los 8 escenarios y el handshake real de
    autorización de Realtime en 2 pasos).
14. **Tamaño:** grande, 3 PRs: (a) `_shared.js` + 3 escenarios simples
    (navegación, dashboard, cuentas); (b) el resto de escenarios
    (crear/editar cotizaciones, portal, uploads, session-version-cost); (c)
    telemetría (migración + los 2 scripts de snapshot/deltas).
15. **Evidencia:** output de `SMOKE=1` de cada script; los 4 casos de
    emparejamiento de `telemetry-deltas.mjs` en verde; la verificación de
    esquema+columnas reales de `pg_stat_statements`; 1 corrida real de la
    RPC confirmando universo completo (conteo igual al de la vista) y
    `queryid` sin pérdida de precisión.

#### 3A-6 — Baseline diagnóstico inicial (local y serverless real, SHA fijado)

1. **Decisión:** correr los 8 escenarios de 3A-5 contra ambos entornos de
   3A-1 sobre el commit exacto de `main` que se fija a `loadtest-target`
   (push forzado + espera de deploy `READY`), con los datos de volumen de
   3A-3 ya sembrados, dentro de la ventana de `concurrency` compartida con
   `e2e.yml` (nunca se solapa con una corrida `live`). **Los escenarios
   mutan datos (crean cotizaciones, editan partidas, suben facturas —
   **ninguno registra pagos**, mismo inventario
   cerrado de 3A-4 que excluye `pago_operations` del cleanup precisamente
   porque ningún escenario llama una ruta `.../registrar-pago`) —
   ambos entornos comparten la misma base de `serenata-erp-test` y la
   misma carpeta de Drive de test, así que correr local y luego serverless
   sin resetear entre uno y otro dejaría al segundo entorno midiendo sobre
   un estado ya mutado por el primero, invalidando la comparación "ambos
   entornos lado a lado" del punto 2.** Por eso el ciclo por entorno
   (`target ∈ {local, serverless}`) es obligatorio y siempre en este
   orden exacto, nunca solapado entre targets:
   1. `runId = crypto.randomUUID()` distinto para cada target (nunca se
      reutiliza el mismo `runId` entre local y serverless).
   2. Barrido de huérfanos de corridas previas (`bulk-cleanup.mjs` de
      3A-4, consultando `loadtest_runs` con `cleaned_at IS NULL`).
   3. Seed idéntico (`seed-volume-fixtures.mjs` de 3A-3, mismos objetivos
      de conteo para ambos targets) + fixtures de identidad (3A-2).
   4. **Verificación de conteos iniciales:** `SELECT count(*)` de las 5
      tablas de volumen (`cuentas_pagar`, `cuentas_cobrar`, `cotizaciones`,
      `proveedores`, `items_cotizacion`) debe coincidir exactamente entre
      el conteo post-seed de este target y el del target anterior (para el
      primer target de los 2, se documenta el conteo como línea base) —
      si no coinciden, el ciclo aborta antes de correr k6 (un conteo
      distinto significa que el cleanup del paso 2 no dejó la base en el
      mismo estado, y comparar throughput/latencia entre 2 volúmenes
      distintos sería una medición inválida).
   5. Snapshot de `pg_stat_statements` "antes" (3A-5).
   6. Los 8 escenarios de k6 contra este target.
   7. Snapshot de `pg_stat_statements` "después" (3A-5).
   8. Cleanup completo de este `runId` (`bulk-cleanup.mjs`, incluida la
      carpeta de Drive) — **antes de empezar el ciclo del siguiente
      target**, nunca en paralelo con él.
2. **Criterio de aceptación:** reporte completo (ambos entornos lado a
   lado) con throughput/error rate/p50/p95/p99/iteraciones descartadas,
   latencia de Realtime, latencia/error de uploads, costo de
   `session_version`, snapshot de `pg_stat_statements`, y telemetría de
   Vercel (real o "captura manual pendiente" documentada); **más los
   conteos iniciales verificados idénticos entre ambos targets (paso 4 del
   ciclo)**. **No exige pasar umbral** — diagnóstico.
3. **Archivos:** `docs/archive/ef-3-baseline-previo.md` (100% `.md`).
   **2 commits, regla uniforme de 3A-0 (nunca 1):** commit de contenido
   (crea el archivo, marca la fila `3A-6` `Cerrado` con "Commit SHA"
   pendiente) + commit de sincronización inmediato siguiente (llena el SHA
   real ya existente) — ambos directo a `main`.
4. **Dependencias entrantes:** 3A-1..3A-5 completos.
5. **Horas:** 7-8h.
6. **Tamaño:** chico, 2 commits doc-only (ver punto 3).

---

### EF-3B — Escalabilidad y acceso a datos

#### 3B-1 — RPC única de recálculo de estados vencidos de CxC (con redondeo real)

1. **Problema:** F3+F4 — dos implementaciones del mismo recálculo+escritura
   como side-effect de un GET; el redondeo real
   de saldo debe ser decimal-seguro, como `calcularSaldoPendiente`
   (`lib/server/cuentas/status.ts:11-14`: `saldo > 0 ? Number(saldo.toFixed(2)) : 0`)
   pretende hacer pero no logra del todo (ver política canónica de
   redondeo, punto 9).
2. **Decisión — SQL corregido con `ROUND`:**
   ```sql
   CREATE OR REPLACE FUNCTION public.sync_estados_cuentas_cobrar_vencidas()
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     v_hoy date := (now() AT TIME ZONE 'UTC')::date;
   BEGIN
     WITH calculado AS (
       SELECT
         id,
         ROUND(monto_total - COALESCE(monto_pagado, 0), 2) AS saldo,
         CASE
           WHEN ROUND(monto_total - COALESCE(monto_pagado, 0), 2) <= 0 AND monto_total > 0
             THEN 'PAGADO'
           WHEN fecha_vencimiento IS NOT NULL
             AND fecha_vencimiento < v_hoy
             AND ROUND(monto_total - COALESCE(monto_pagado, 0), 2) > 0
             THEN 'VENCIDO'
           WHEN NOT (estado <> 'FACTURA_PENDIENTE' AND fecha_factura IS NOT NULL)
             THEN 'FACTURA_PENDIENTE'
           WHEN COALESCE(monto_pagado, 0) > 0
             THEN 'PARCIALMENTE_PAGADO'
           ELSE 'FACTURADO'
         END AS estado_nuevo
       FROM cuentas_cobrar
     )
     UPDATE cuentas_cobrar c
     SET estado = calculado.estado_nuevo
     FROM calculado
     WHERE c.id = calculado.id AND c.estado IS DISTINCT FROM calculado.estado_nuevo;
   END;
   $$;
   REVOKE EXECUTE ON FUNCTION public.sync_estados_cuentas_cobrar_vencidas() FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.sync_estados_cuentas_cobrar_vencidas() TO service_role;
   ```
   `app/api/cuentas-cobrar/route.ts` y `app/api/cuentas-cobrar/alertas/route.ts`
   llaman esta RPC antes de leer; se eliminan `syncEstadosVencidos`/
   `updateCuentasCobrarEstadoBatch` (`route.ts:8-45`) y el bloque inline de
   `alertas/route.ts:14-30`.
3. **Comportamiento a preservar:** recalcula en cada GET, nunca se mueve a
   un cron.
4. **Archivos exactos:** nueva migración; `app/api/cuentas-cobrar/route.ts`;
   `app/api/cuentas-cobrar/alertas/route.ts`; `lib/server/shared/decimal.ts`
   (nuevo, la función `round2` de arriba); `lib/server/cuentas/status.ts`
   (modificado, `calcularSaldoPendiente` importa `round2` de
   `shared/decimal.ts` en vez de `Number(saldo.toFixed(2))`);
   `lib/server/repositories/dashboard.ts` (modificado, su `round2` local
   de la línea 100 se elimina, importa el compartido — 3B-10 depende de
   este mismo cambio, ver ese bloque).
5. **Nuevos:** 1 migración, `shared/decimal.ts`. **Modificados:** 2 rutas +
   `status.ts` + `dashboard.ts` (solo el import, sin tocar su lógica de
   negocio). **Eliminados:** las 2 funciones duplicadas de CxC + el
   `round2` local de `dashboard.ts`.
6. **Migración/RPC:** la de arriba.
7. **Dependencias entrantes:** ninguna. **Salientes:** 3B-2.
8. **Orden:** primero de EF-3B.
9. **Riesgo:** P0 en el hallazgo; P1 en implementación (redondeo financiero,
   exige paridad exacta).

   **Política canónica de redondeo financiero:
   la promesa de "paridad exacta con `toFixed()`" es falsa.** `numeric` de
   Postgres guarda el decimal exacto y `ROUND(numeric, 2)` redondea sobre
   ese valor exacto (mitad hacia arriba); `Number.prototype.toFixed(2)` de
   JS redondea sobre la representación en punto flotante de doble
   precisión del valor, que para un decimal como `100.005` **no** es
   exacta (el double más cercano es `100.00499999999999...`) —
   `(100.005).toFixed(2)` da `"100.00"` en JS, mientras
   `ROUND(100.005, 2)` da `100.01` en Postgres: son dos resultados
   distintos para el "mismo" valor. **Se fija Postgres/`numeric`/`ROUND` como la
   política canónica única** (ya es la fuente de verdad persistente per
   `CLAUDE.md`), y se corrige deliberadamente el lado JS para que deje de
   depender de `toFixed()` en el camino que compara contra la RPC:
   `lib/server/cuentas/status.ts::calcularSaldoPendiente` (y cualquier
   otro punto que la ronda de pruebas de 3B-1/3B-10 use como referencia
   JS) cambia su redondeo de `Number(saldo.toFixed(2))` a una función
   `round2` que opera sobre la representación en **string** del valor
   (no sobre el float multiplicado), evitando el bug de `toFixed`:
   **"buscar antes de crear": `dashboard.ts`
   (línea 100, confirmado leyendo el archivo real) ya define su propio
   `round2` local, no exportado, con la MISMA implementación ingenua
   (`Math.round(n * 100) / 100`) — que tiene el mismo problema de fondo
   (`Math.round(100.005 * 100)` también puede caer del lado equivocado por
   el mismo error de representación de punto flotante en la
   multiplicación). En vez de crear una segunda utilidad de redondeo en
   paralelo, se consolida en una sola, compartida:**
   ```ts
   // lib/server/shared/decimal.ts (nuevo, reemplaza el `round2` local de
   // status.ts y el de dashboard.ts -- una sola función, dos lugares que
   // dejan de duplicarla)
   export function round2(value: number): number {
     const sign = value < 0 ? -1 : 1
     const [intPart, fracPart = ''] = Math.abs(value).toString().split('.')
     if (fracPart.length <= 2) return sign * Number(`${intPart}.${fracPart.padEnd(2, '0')}`)
     const roundUp = fracPart.charCodeAt(2) - 48 >= 5 // dígito en la 3ra posición decimal
     const base = Number(`${intPart}${fracPart.slice(0, 2)}`) + (roundUp ? 1 : 0)
     return sign * (base / 100)
   }
   ```
   (`value.toString()` en JS usa el algoritmo de string más corto que
   redondea de vuelta al mismo double — para `100.005` eso es literalmente
   `"100.005"`, el decimal que el usuario/la base realmente quiso decir,
   no la representación interna con error de flotante; por eso parsear el
   string, no el float, recupera el dígito de redondeo correcto). Esto es
   una corrección real de un bug latente pre-existente en
   `calcularSaldoPendiente` (fuera del hallazgo original F3/F4, pero
   necesaria para que la promesa de "paridad 100%" del punto 11 sea
   siquiera posible) — se declara explícitamente aquí en vez de evadirla
   eligiendo fixtures de prueba que nunca toquen un límite `.xx5`.
10. **Pruebas:** fixture con montos que producen diferencia de redondeo
    real (`monto_total=100.005`, `monto_pagado=0`) insertado en
    `serenata-erp-test`, comparando primero que **antes** del fix de
    `round2`, `Number((100.005).toFixed(2))` (`100`) y
    `ROUND(100.005, 2)` (`100.01`) efectivamente divergen (documenta el
    bug real que motiva el punto 9); **después** del fix, `round2(100.005)`
    (`100.01`) coincide con `ROUND(100.005, 2)` de Postgres — comparar
    `calcularEstadoCuentaCobrarDetallado` (JS, ya usando `round2`) vs 1
    corrida de la RPC sobre el mismo fixture — 100% de coincidencia
    exigida, incluido este caso límite y al menos 2 más (`.xx5` exacto con
    signo negativo tras un pago mayor al total; un valor con más de 3
    decimales de arrastre, ej. `.0051`, para confirmar que `round2` solo
    mira el 3er decimal y no acumula error de los siguientes).
11. **Criterio de aceptación:** paridad 100% en el punto 10, incluidos los
    casos de redondeo.
12. **Rollback:** revertir las 2 rutas, `status.ts` y `dashboard.ts`; RPC y
    `shared/decimal.ts` quedan sin invocar (`dashboard.ts` recupera su
    `round2` local desde el historial de git si hace falta).
13. **Horas:** 10-12h (sube por la política canónica de redondeo, la
    función `round2` compartida nueva que consolida la de `status.ts` y la
    de `dashboard.ts`, y el fix del bug latente en
    `calcularSaldoPendiente`).
14. **Tamaño:** chico-mediano, 1 PR.
15. **Evidencia:** tabla de paridad con los casos de redondeo explícitos,
    incluida la demostración del divergir/converger antes/después de
    `round2`.

#### 3B-2 — Paginación/búsqueda/totales server-side — CxC (con escape de `%`/`_`, debounce y cancelación)

1. **Problema:** F2 — `getCuentasCobrar()` sin límite; búsqueda/totales/
   conteos calculados en JS del cliente sobre el array completo
   (`app/components/cuentas/useCuentasPage.ts`, `selectors.ts`).
2. **Decisión — RPC completa, sin fragmentos:**
   ```sql
   CREATE OR REPLACE FUNCTION public.buscar_cuentas_cobrar(p_search text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 50)
   RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
     v_page int := GREATEST(p_page, 1);
     v_term text := CASE WHEN p_search IS NULL OR p_search = '' THEN NULL
       ELSE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
     v_rows jsonb;
     v_total_rows bigint;
     v_total_pendiente numeric;
     v_total_pagado numeric;
     v_pendientes_count bigint;
   BEGIN
     -- (a) recalcula estados vencidos antes de leer -- mismo efecto que la
     -- llamada explícita que 3B-1 dejó en la ruta, ahora dentro de la RPC
     -- para que la ruta deje de invocarla por su cuenta (ver más abajo).
     PERFORM sync_estados_cuentas_cobrar_vencidas();

     -- (b)+(c): búsqueda escapada sobre los 4 campos exactos que hoy
     -- filtra filterCobrarRows (selectors.ts:23-35), paginada con
     -- desempate estable.
     SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
     INTO v_rows
     FROM (
       SELECT *
       FROM cuentas_cobrar cc
       WHERE v_term IS NULL
          OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
          OR cc.folio ILIKE v_term ESCAPE '\'
          OR cc.cliente ILIKE v_term ESCAPE '\'
          OR cc.proyecto ILIKE v_term ESCAPE '\'
       ORDER BY cc.created_at DESC, cc.id DESC
       LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
     ) t;

     -- total_rows real del filtro (no el de la página).
     SELECT COUNT(*) INTO v_total_rows
     FROM cuentas_cobrar cc
     WHERE v_term IS NULL
        OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
        OR cc.folio ILIKE v_term ESCAPE '\'
        OR cc.cliente ILIKE v_term ESCAPE '\'
        OR cc.proyecto ILIKE v_term ESCAPE '\';

     -- (d) totales sobre el filtro aplicado -- mismo redondeo por fila
     -- que sumMontoPendiente/sumMontoPagado sobre pagarFiltradas hoy.
     SELECT
       ROUND(COALESCE(SUM(GREATEST(cc.monto_total - COALESCE(cc.monto_pagado, 0), 0)), 0), 2),
       ROUND(COALESCE(SUM(cc.monto_pagado), 0), 2)
     INTO v_total_pendiente, v_total_pagado
     FROM cuentas_cobrar cc
     WHERE v_term IS NULL
        OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
        OR cc.folio ILIKE v_term ESCAPE '\'
        OR cc.cliente ILIKE v_term ESCAPE '\'
        OR cc.proyecto ILIKE v_term ESCAPE '\';

     -- pendientes_count sobre la tabla COMPLETA sin filtro -- misma
     -- semántica que countPendingCuentas(cuentasCobrar) hoy, que cuenta
     -- sobre el arreglo sin filtrar, nunca sobre el resultado de búsqueda.
     SELECT COUNT(*) INTO v_pendientes_count FROM cuentas_cobrar WHERE estado <> 'PAGADO';

     RETURN jsonb_build_object(
       'rows', v_rows, 'total_rows', v_total_rows,
       'total_monto_pendiente', v_total_pendiente, 'total_monto_pagado', v_total_pagado,
       'pendientes_count', v_pendientes_count
     );
   END;
   $$;
   REVOKE EXECUTE ON FUNCTION public.buscar_cuentas_cobrar(text, int, int) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.buscar_cuentas_cobrar(text, int, int) TO service_role;
   ```
   Campos de búsqueda exactos: `cotizacion_id`, `folio`, `cliente`,
   `proyecto` — los mismos 4 que hoy filtra `filterCobrarRows`
   (`selectors.ts:23-35`). Devuelve `{rows, total_rows,
   total_monto_pendiente, total_monto_pagado, pendientes_count}` — los 3
   totales sobre el filtro aplicado excepto `pendientes_count` (sobre la
   tabla completa sin filtro).
   **Evitar el doble recálculo:** 3B-1 dejó
   `app/api/cuentas-cobrar/route.ts` llamando explícitamente
   `sync_estados_cuentas_cobrar_vencidas()` antes de leer; como
   `buscar_cuentas_cobrar` ya la llama internamente en el paso (a), **esta
   ronda quita esa llamada explícita del `GET` de la ruta al reemplazar su
   cuerpo por la llamada a `buscarCuentasCobrar`** — la ruta no vuelve a
   invocar el sync por su cuenta, evitando ejecutarlo 2 veces por request
   (el segundo `UPDATE` sería un no-op dado el `IS DISTINCT FROM` de 3B-1,
   pero sigue siendo un `UPDATE` completo de la tabla ejecutado de más).
   **Cliente:** `app/components/cuentas/hooks/useCuentasCobrar.ts` agrega
   debounce de 300ms al input de búsqueda (`setTimeout` cancelado en cada
   tecla), `AbortController` para cortar el `fetch` anterior al disparar uno
   nuevo, y un `requestSeqRef` (número incremental) — la respuesta solo se
   aplica al estado si su secuencia coincide con la última emitida (ignora
   respuestas atrasadas que llegaron después de una más nueva pese al
   abort).
3. **Comportamiento a preservar:** los 4 campos de búsqueda, semántica de
   `pendientes_count` global vs totales filtrados, orden `created_at desc`.
4. **Archivos exactos:** nueva migración;
   `lib/server/repositories/cuentas-cobrar.ts` (nueva `buscarCuentasCobrar`);
   `app/api/cuentas-cobrar/route.ts` (`GET` con querystring
   `?search=&page=&pageSize=`); `app/components/cuentas/useCuentasPage.ts`/`selectors.ts` (quitar
   `filterCobrarRows`/totales de CxC); nuevo `components/ui/Pager.tsx` (no
   existe un paginador reutilizable hoy, verificado por ausencia en el
   inventario de `components/ui/*`).
5. **Nuevos:** 1 migración, `Pager.tsx`. **Modificados:** los 4 archivos.
6. **Migración/RPC:** la de arriba, `SECURITY DEFINER`/`search_path`/`GRANT`
   mismo patrón que todo el plan.
7. **Dependencias entrantes:** 3B-1. **Salientes:** ninguna.
8. **Orden:** después de 3B-1.
9. **Riesgo:** P0 en el hallazgo; P1 en implementación (volumen real hoy 23
   filas, sin urgencia de bug activo).
10. **Pruebas:** equivalencia JS-vs-RPC sobre fixture con términos que
    contienen `%`/`_` literales (ej. buscar "SH_001" debe encontrar
    exactamente ese folio, no cualquier folio de 6 caracteres); test de
    debounce/cancelación (2 búsquedas rápidas, solo la última pinta el
    estado).
11. **Criterio de aceptación:** paridad 100%, incluidos los casos de
    `%`/`_`; `tests/e2e/critical/` de cuentas en verde adaptando selectores
    del paginador.
12. **Rollback:** revertir el PR completo.
13. **Horas:** 16-18h.
14. **Tamaño:** grande, 1 PR.
15. **Evidencia:** tabla de equivalencia + los casos de `%`/`_` + el test de
    cancelación.

#### 3B-3 — Paginación/búsqueda/totales server-side — CxP (con escape de `%`/`_`, debounce y cancelación)

1. **Problema:** F1 — `.limit(500)`.
2. **Decisión:** RPC `buscar_cuentas_pagar(p_search text, p_page int,
   p_page_size int) RETURNS jsonb`, mismo escape `ESCAPE '\'`, búsqueda
   sobre los 5 campos exactos de `filterPagarRows`
   (`selectors.ts:37-50`): `cotizacion_id`, `folio`, `responsable_nombre`,
   `proyecto_nombre`, `item_descripcion`. CxP no tiene side-effect de
   escritura en su GET — RPC puramente de lectura.
   ```sql
   CREATE OR REPLACE FUNCTION public.buscar_cuentas_pagar(p_search text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 50)
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
     v_page int := GREATEST(p_page, 1);
     v_term text := CASE WHEN p_search IS NULL OR p_search = '' THEN NULL
       ELSE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
     v_rows jsonb;
     v_total_rows bigint;
     v_total_pendiente numeric;
     v_total_pagado numeric;
     v_pendientes_count bigint;
   BEGIN
     -- `cp.*` bastaba para buscar/paginar, pero
     -- el repositorio JS actual (`getCuentasPagar()`/`getCuentaPagarById()`,
     -- confirmado leyendo `cuentas-pagar.ts:23-32`) rellena
     -- `proyecto_nombre` con `row.proyecto_nombre || row.cotizaciones?.proyecto
     -- || row.proyectos?.proyecto` -- si la columna propia de `cuentas_pagar`
     -- viene vacía, el JOIN a `cotizaciones`/`proyectos` la completa. Una
     -- fila con `cp.proyecto_nombre` NULL habría perdido ese fallback aquí.
     -- Se replica el mismo COALESCE vía LEFT JOIN, sobreescribiendo solo ese
     -- campo sobre el resto de columnas de `cp` intactas. jsonb_agg agrega
     -- explícitamente t.row_json (nunca t completo) y repite el ORDER BY
     -- en el nivel externo: un agregado no hereda el orden de su
     -- subconsulta sin su propio ORDER BY.
     SELECT COALESCE(jsonb_agg(t.row_json ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb), COUNT(*) OVER ()
     INTO v_rows, v_total_rows
     FROM (
       SELECT to_jsonb(cp) || jsonb_build_object(
         'proyecto_nombre', COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto)
       ) AS row_json, cp.created_at, cp.id
       FROM cuentas_pagar cp
       LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
       LEFT JOIN proyectos p ON p.id = cp.proyecto_id
       WHERE v_term IS NULL
          OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
          OR cp.folio ILIKE v_term ESCAPE '\'
          OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
          OR COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
          OR cp.item_descripcion ILIKE v_term ESCAPE '\'
       ORDER BY cp.created_at DESC, cp.id DESC
       LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
     ) t
     LIMIT 1;

     -- total_rows real (no el de la página): recalculado aparte porque
     -- `COUNT(*) OVER()` de arriba solo cuenta las filas de la página, no
     -- el total del filtro. Mismo JOIN+COALESCE que arriba para que el
     -- filtro de búsqueda por proyecto_nombre sea idéntico al de la página.
     SELECT COUNT(*) INTO v_total_rows
     FROM cuentas_pagar cp
     LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
     LEFT JOIN proyectos p ON p.id = cp.proyecto_id
     WHERE v_term IS NULL
        OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
        OR cp.folio ILIKE v_term ESCAPE '\'
        OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
        OR COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
        OR cp.item_descripcion ILIKE v_term ESCAPE '\';

     SELECT
       ROUND(COALESCE(SUM(GREATEST(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 0)), 0), 2),
       ROUND(COALESCE(SUM(cp.monto_pagado), 0), 2)
     INTO v_total_pendiente, v_total_pagado
     FROM cuentas_pagar cp
     LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
     LEFT JOIN proyectos p ON p.id = cp.proyecto_id
     WHERE v_term IS NULL
        OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
        OR cp.folio ILIKE v_term ESCAPE '\'
        OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
        OR COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
        OR cp.item_descripcion ILIKE v_term ESCAPE '\';

     SELECT COUNT(*) INTO v_pendientes_count FROM cuentas_pagar WHERE estado <> 'PAGADO';

     RETURN jsonb_build_object(
       'rows', v_rows, 'total_rows', v_total_rows,
       'total_monto_pendiente', v_total_pendiente, 'total_monto_pagado', v_total_pagado,
       'pendientes_count', v_pendientes_count
     );
   END;
   $$;
   REVOKE EXECUTE ON FUNCTION public.buscar_cuentas_pagar(text, int, int) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.buscar_cuentas_pagar(text, int, int) TO service_role;
   ```
   `pendientes_count` sobre la tabla completa sin filtro (misma semántica
   que `countPendingCuentas(cuentasPagar)` hoy); `total_monto_pendiente`/
   `total_monto_pagado` sobre el filtro de búsqueda aplicado (misma
   semántica que `sumMontoPendiente`/`sumMontoPagado` sobre
   `pagarFiltradas`). `app/api/cuentas-pagar/route.ts` acepta
   `?search=&page=&pageSize=` y llama esta RPC. **Cliente:**
   `app/components/cuentas/hooks/useCuentasPagar.ts` agrega debounce de
   300ms al input de búsqueda, `AbortController` para cortar el fetch
   anterior, y un `requestSeqRef` incremental — la respuesta solo se aplica
   si su secuencia coincide con la última emitida.
3. **Comportamiento a preservar:** los 5 campos exactos, semántica de
   `pendientes_count` global vs totales filtrados, orden `created_at desc,
   id desc`.
4. **Archivos exactos:** nueva migración;
   `lib/server/repositories/cuentas-pagar.ts` (nueva `buscarCuentasPagar`,
   reemplaza el uso de `getCuentasPagar()` con `.limit(500)` en la ruta de
   lista — `getCuentasPagar()` sin parámetros se conserva para los demás
   call sites que necesitan la tabla completa, ej. `dashboard.ts` antes de
   3B-10, `por-proyecto` antes de 3B-9); `app/api/cuentas-pagar/route.ts`
   (`GET` con querystring); `app/components/cuentas/hooks/useCuentasPagar.ts`;
   reutiliza `components/ui/Pager.tsx` de 3B-2 (lo crea este bloque si corre
   antes que 3B-2).
5. **Nuevos:** 1 migración. **Modificados:** 3 archivos.
6. **Migración/RPC:** la función `buscar_cuentas_pagar` de arriba,
   `SECURITY DEFINER`, `search_path` fijo, `REVOKE ... FROM PUBLIC, anon,
   authenticated; GRANT ... TO service_role`.
7. **Dependencias entrantes:** ninguna (independiente de 3B-1/3B-2).
   **Salientes:** ninguna.
8. **Orden:** en paralelo con 3B-2 (comparten `Pager.tsx`, cualquiera de
   los dos lo crea si corre primero — el otro lo reutiliza sin duplicar).
9. **Riesgo:** P0 en el hallazgo original (Frente A); P1 en la
   implementación real dado el volumen actual (55 filas, sin bug activo
   hoy).
10. **Pruebas:** test de integración que compara, sobre un fixture de N
    cuentas variadas, el resultado de `filterPagarRows` +
    `sumMontoPendiente` + `sumMontoPagado` + `countPendingCuentas` (JS,
    código actual) vs la respuesta de la RPC para los mismos términos de
    búsqueda — deben coincidir exactamente antes de eliminar el código JS,
    incluidos términos con `%`/`_` literales (ej. buscar "ITEM_01" debe
    encontrar exactamente ese `item_descripcion`, no cualquier cadena de 7
    caracteres); fixture con
    `cuentas_pagar.proyecto_nombre` NULL pero con `cotizaciones.proyecto`/
    `proyectos.proyecto` poblados — confirma que la RPC devuelve el mismo
    valor de fallback que `getCuentasPagar()` (JS) hoy, tanto en el shape
    de la fila devuelta como en que ese registro aparece al buscar por ese
    nombre de proyecto (ejercita el `COALESCE` dentro del propio filtro
    `ILIKE`, no solo en la columna de salida); test de debounce/cancelación (2 búsquedas rápidas
    consecutivas, solo la última pinta el estado final).
11. **Criterio de aceptación:** la prueba de equivalencia del punto 10 pasa
    exactamente, incluidos los casos `%`/`_` y el caso de `proyecto_nombre`
    NULL con fallback; `tests/e2e/critical/` de
    cuentas sigue en verde adaptando selectores si el DOM cambia por el
    paginador, sin cambiar el objetivo de la aserción.
12. **Rollback:** revertir el PR completo (repositorio+ruta+hook+UI juntos,
    es un solo contrato).
13. **Horas:** 13-15h (sube por el JOIN+COALESCE de `proyecto_nombre` y su
    caso de prueba dedicado).
14. **Tamaño:** mediano-grande, 1 PR.
15. **Evidencia en el PR:** tabla de equivalencia JS-vs-RPC del punto 10,
    incluidos los casos `%`/`_`; captura de la pantalla con paginador
    funcionando.

#### 3B-4 — Paginación/búsqueda server-side — Cotizaciones (campos y conteos cerrados)

1. **Problema:** F5 — `getCotizaciones()` sin límite. **`app/cotizaciones/page.tsx`** (lista
   filtrada simple) consume la lista completa hoy vía un
   `fetch('/api/cotizaciones')` **directo propio** (confirmado por grep —
   `page.tsx` NO llama `fetchQuotationsList()`, tiene su propio fetch
   inline). **`components/quotations/QuotationCopyItemsModal.tsx`**
   (confirmado leyendo el archivo completo) es el **único caller real** de
   `fetchQuotationsList()` (`lib/services/quotation-service.ts`) — carga
   TODAS las cotizaciones completas (incluidas sus `items`) de una sola
   vez, filtra por texto en el propio modal (`filteredCotizaciones`,
   client-side sobre el array completo) y, al elegir una, lee
   `selectedCotizacion.items` directo del array ya cargado en memoria
   (`sourceItems = selectedCotizacion?.items || []`) — nunca vuelve a
   pedir nada al servidor. Si `getCotizaciones()` pasa a paginar, tanto el
   fetch directo de `page.tsx` (que hoy trae la tabla completa sin límite)
   como el modal (que dejaría de ver cotizaciones fuera de la primera
   página y no podría copiar sus partidas) necesitan actualizarse — cada
   uno por su propio camino de datos, `page.tsx` vía la ruta paginada
   nueva y el modal vía el rediseño en 2 pasos del punto 2.
2. **Decisión — campos y conteos cerrados, leídos de
   `app/cotizaciones/page.tsx:62-79,95-99`, más el rediseño del modal —
   RPC completa, sin fragmentos:**
   ```sql
   CREATE OR REPLACE FUNCTION public.buscar_cotizaciones(p_search text DEFAULT NULL, p_estado text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 10)
   RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
     v_page int := GREATEST(p_page, 1);
     v_term text := CASE WHEN p_search IS NULL OR p_search = '' THEN NULL
       ELSE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
     v_rows jsonb;
     v_total_rows bigint;
     v_counts_by_estado jsonb;
   BEGIN
     -- rows + items_count por fila -- reemplaza (c.items || []).length que
     -- QuotationCopyItemsModal.tsx:118 calculaba sobre el array completo.
     SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
     INTO v_rows
     FROM (
       SELECT
         c.id, c.cliente, c.proyecto, c.total, c.estado, c.created_at,
         (SELECT COUNT(*) FROM items_cotizacion i WHERE i.cotizacion_id = c.id) AS items_count
       FROM cotizaciones c
       WHERE (p_estado IS NULL OR p_estado = 'TODAS' OR c.estado = p_estado)
         AND (
           v_term IS NULL OR
           c.id ILIKE v_term ESCAPE '\' OR
           c.cliente ILIKE v_term ESCAPE '\' OR
           c.proyecto ILIKE v_term ESCAPE '\' OR
           EXISTS (
             SELECT 1 FROM items_cotizacion i
             WHERE i.cotizacion_id = c.id
               AND (i.descripcion ILIKE v_term ESCAPE '\' OR i.responsable_nombre ILIKE v_term ESCAPE '\')
           )
         )
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
     ) t;

     -- total_rows real del filtro (búsqueda+estado), no el de la página.
     SELECT COUNT(*) INTO v_total_rows
     FROM cotizaciones c
     WHERE (p_estado IS NULL OR p_estado = 'TODAS' OR c.estado = p_estado)
       AND (
         v_term IS NULL OR
         c.id ILIKE v_term ESCAPE '\' OR
         c.cliente ILIKE v_term ESCAPE '\' OR
         c.proyecto ILIKE v_term ESCAPE '\' OR
         EXISTS (
           SELECT 1 FROM items_cotizacion i
           WHERE i.cotizacion_id = c.id
             AND (i.descripcion ILIKE v_term ESCAPE '\' OR i.responsable_nombre ILIKE v_term ESCAPE '\')
         )
       );

     -- counts_by_estado sobre la tabla COMPLETA sin filtro de búsqueda ni
     -- de estado -- misma semántica que `tabs` en page.tsx:95-99, que
     -- cuenta sobre `cotizaciones` completo, nunca sobre `filtradas`.
     SELECT jsonb_build_object(
       'TODAS', COUNT(*),
       'BORRADOR', COUNT(*) FILTER (WHERE estado = 'BORRADOR'),
       'EMITIDA', COUNT(*) FILTER (WHERE estado = 'EMITIDA'),
       'APROBADA', COUNT(*) FILTER (WHERE estado = 'APROBADA'),
       'CANCELADA', COUNT(*) FILTER (WHERE estado = 'CANCELADA')
     ) INTO v_counts_by_estado
     FROM cotizaciones;

     RETURN jsonb_build_object(
       'rows', v_rows, 'total_rows', v_total_rows, 'counts_by_estado', v_counts_by_estado
     );
   END;
   $$;
   REVOKE EXECUTE ON FUNCTION public.buscar_cotizaciones(text, text, int, int) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.buscar_cotizaciones(text, text, int, int) TO service_role;
   ```
   Campos de búsqueda: `id`, `cliente`, `proyecto` de la propia cotización
   + `descripcion`/`responsable_nombre` de sus `items_cotizacion` vía
   `EXISTS` — replica exacto `app/cotizaciones/page.tsx:70-76`.

   **Mapeo `items_count` → `itemsCount`:** la RPC devuelve `items_count` (snake_case, mismo
   convenio que el resto de las RPCs de este plan). La conversión a
   `itemsCount` (camelCase, convenio del lado cliente) ocurre en
   `lib/services/quotation-service.ts::fetchQuotationsPage` — esa función
   es la única que lee la respuesta cruda de `GET /api/cotizaciones` y
   mapea explícitamente `{ ...row, itemsCount: row.items_count }` antes de
   devolver el array al componente; `QuotationCopyItemsModal.tsx` nunca ve
   `items_count`, solo `itemsCount` ya mapeado — mismo patrón que
   cualquier otro campo que la API devuelve en snake_case y el cliente
   consume en camelCase en este repo. **`app/cotizaciones/page.tsx`
   actualiza su fetch directo propio** (no pasa por
   `fetchQuotationsPage`, pero sí por el mismo `GET /api/cotizaciones` ya
   paginado) para pasar `?search=&estado=&page=&pageSize=` y leer
   `{rows, total_rows, counts_by_estado}` en vez del array completo que
   trae hoy.

   **`QuotationCopyItemsModal.tsx` — rediseño explícito, no solo
   "adaptar":** deja de llamar `fetchQuotationsList()` (que después de
   este bloque ya no trae `items`, solo el resumen paginado). Pasa a 2
   pasos:
   1. **Lista ligera:** llama la misma RPC `buscar_cotizaciones` (vía un
      nuevo `fetchQuotationsPage(params)` en `quotation-service.ts`, que
      pega a `GET /api/cotizaciones?search=&page=&pageSize=20` — 20 como
      tamaño de página del modal, no 10, para mostrar más opciones en la
      lista compacta) con el texto de `search` ya tipeado por el usuario —
      el filtro pasa de client-side (`filteredCotizaciones`, sobre el
      array completo) a server-side (mismo debounce de 300ms +
      `AbortController` que 3B-2/3B-3, ya que el modal también dispara un
      fetch por tecla). El modal solo necesita
      `{id, cliente, proyecto, itemsCount}` por fila para pintar la lista
      — `buscar_cotizaciones` ya expone `id`/`cliente`/`proyecto`; se le
      agrega `(SELECT COUNT(*) FROM items_cotizacion i WHERE
      i.cotizacion_id = c.id) AS items_count` a la RPC como campo
      adicional (reemplaza `(c.items || []).length` que el modal muestra
      hoy, `QuotationCopyItemsModal.tsx:118`).
   2. **Detalle bajo demanda:** al hacer clic en una cotización de la
      lista (`setSelectedCotizacionId`), el modal llama
      `fetchQuotationDetail(id)` (`quotation-service.ts:19`, **función ya
      existente, reutilizada tal cual** — pega a `GET
      /api/cotizaciones/:id`, que ya devuelve el detalle completo con
      `items`, confirmado leyendo `app/api/cotizaciones/[id]/route.ts`) en
      vez de leer `selectedCotizacion.items` de un array ya cargado en
      memoria. `sourceItems` pasa a ser el estado de ese fetch (con su
      propio `loading`/`error` mientras carga el detalle), no una
      derivación de `cotizaciones`.
3. **Comportamiento a preservar:** los 5 campos de búsqueda exactos, los
   conteos de pestañas independientes del término de búsqueda, `PAGE_SIZE`
   configurable (hoy fijo en 10 client-side, se mantiene 10 como default del
   nuevo paginador); en el modal, la búsqueda por folio/cliente/proyecto y
   el flujo de selección → checkbox de partidas → importar quedan
   idénticos para el usuario, solo cambia de dónde vienen los datos.
4. **Archivos exactos:** nueva migración;
   `lib/server/repositories/quotations.ts` (nueva `buscarCotizaciones`,
   incluye `items_count` por fila);
   `app/api/cotizaciones/route.ts` (`GET` con querystring);
   `app/cotizaciones/page.tsx` (reemplazar el fetch directo propio por el
   nuevo contrato paginado, quitar
   `.filter()`/`.slice()` client-side, usar `counts_by_estado` para los
   tabs, reutilizar `Pager.tsx` de 3B-2);
   `lib/services/quotation-service.ts` (nueva `fetchQuotationsPage(params)`,
   `fetchQuotationsList()` se elimina — su único caller,
   `QuotationCopyItemsModal.tsx`, migra al rediseño de 2 pasos);
   `components/quotations/QuotationCopyItemsModal.tsx` (los 2 pasos de
   arriba: lista paginada con debounce + `fetchQuotationDetail` al
   seleccionar).
5. **Nuevos:** 1 migración. **Modificados:** 5 archivos.
6. **Migración/RPC:** la de arriba.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente, en paralelo con 3B-2/3B-3.
9. **Riesgo:** P0 en el hallazgo, P1 en implementación.
10. **Pruebas:** equivalencia JS-vs-RPC (incluye el caso de búsqueda que
    solo matchea por `items_cotizacion`, y los conteos por estado con y sin
    término de búsqueda activo); **caso que cierra la
    regresión que el rediseño previene:** sembrar >20 cotizaciones (más de
    1 página del modal), abrir `QuotationCopyItemsModal`, buscar por el
    `id`/`cliente` de una cotización que NO está en la primera página del
    modal, confirmar que aparece en los resultados de la búsqueda
    server-side, seleccionarla, confirmar que `fetchQuotationDetail` trae
    sus partidas reales y que "Traer a cotización actual" las importa
    correctamente — sin este caso, un fix de paginación que rompiera el
    modal para cotizaciones fuera de la primera página pasaría
    desapercibido.
11. **Criterio de aceptación:** paridad 100%; el caso del modal fuera de la
    primera página pasa;
    `tests/e2e/critical/cotizaciones-*.spec.ts` en verde adaptando
    selectores del paginador sin cambiar el objetivo de la aserción; ningún
    caller de `fetchQuotationsList()` sobrevive (grep en 0).
12. **Rollback:** revertir el PR (afecta 2 pantallas: la lista y el modal,
    ambas en el mismo PR — no tiene sentido paginar la lista dejando el
    modal roto a medio camino).
13. **Horas:** 20-23h (sube por el rediseño de `QuotationCopyItemsModal.tsx`
    en 2 pasos, `items_count` en la RPC, y el caso de prueba de la
    cotización fuera de la primera página).
14. **Tamaño:** grande, 1 PR.
15. **Evidencia:** tabla de paridad incluyendo el caso `items_cotizacion` y
    los conteos por estado; el caso del modal documentado con captura o
    grabación mostrando la búsqueda/selección/importación de una
    cotización fuera de la primera página.

#### 3B-5 — Lectura interna completa vía keyset — Proyectos y tareas agregadas (verificación empírica de `max_rows`)

1. **Problema:** F6/F25 — `getProyectos()` y `getTareasAgregadas()` sin
   límite. Un `.limit(5000)` del lado cliente NO vence `db.max_rows` de PostgREST (confirmado 1000 en
   `supabase/config.toml:18` — se verifica empíricamente contra
   `serenata-erp-test` en el punto 10, no se asume que el proyecto hosted
   tenga el mismo valor solo porque el archivo local lo diga).
   `useProyectosListado.ts` alimenta un **tablero Kanban** agrupando TODOS los proyectos
   por `etapa_id` (`groupProyectosByEtapa`, función real ubicada en
   `app/components/proyectos/kanban-helpers.ts`, no en
   `useProyectosListado.ts` — ese hook solo orquesta el fetch/estado de
   tabs); `getTareasAgregadas()` alimenta las tabs
   Tareas/Estatus del MISMO tablero (`proyecto-tareas.ts:174-193`, ya
   filtrada a tareas no completadas de proyectos no finalizados). Un
   tablero necesita la membresía completa — paginar el array de origen lo
   rompe. La solución no es paginar el endpoint: es asegurarse de que el
   repositorio **lea de verdad todas las filas**, sin quedarse corto por el
   cap de PostgREST.
2. **Decisión — paginación por keyset (no offset), lanza si se agota el
   circuit breaker (nunca devuelve un array parcial en silencio):**
   ```ts
   export async function getProyectos(): Promise<Proyecto[]> {
     const PAGE_SIZE = 500 // conservador, la mitad del max_rows verificado en el punto 10
     const HARD_CAP = 20000
     let all: Proyecto[] = []
     let cursorCreatedAt: string | null = null
     let cursorId: string | null = null
     while (true) {
       let query = supabaseAdmin
         .from('proyectos')
         .select('*')
         .order('created_at', { ascending: false })
         .order('id', { ascending: false })
         .limit(PAGE_SIZE)
       if (cursorCreatedAt && cursorId) {
         // keyset: fila estrictamente posterior al cursor en el mismo orden
         // (created_at, id) descendente -- evita el drift de `.range()`
         // offset si se insertan/borran filas entre páginas durante el loop.
         query = query.or(
           `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
         )
       }
       const { data, error } = await query
       if (error) throw error
       if (!data || data.length === 0) break
       all = all.concat(data as Proyecto[])
       if (all.length > HARD_CAP) {
         throw new Error(
           `getProyectos() superó el circuit breaker de ${HARD_CAP} filas sin agotar la tabla -- ` +
           `posible bug de paginación o crecimiento muy por encima de lo esperado. Fallando explícito ` +
           `en vez de devolver un array parcial al tablero de Proyectos.`
         )
       }
       const last = data[data.length - 1] as Proyecto
       cursorCreatedAt = last.created_at
       cursorId = last.id
       if (data.length < PAGE_SIZE) break
     }
     return all
   }
   ```
   Mismo mecanismo de keyset para `getTareasAgregadas()` (con su
   `.neq('estado', 'COMPLETADA')`/`.neq('proyectos.estado', 'FINALIZADO')`
   preservados en cada página del loop), cursor por `fecha_limite`+`id`,
   replicando su propio `ORDER BY fecha_limite ASC NULLS LAST, id ASC`
   (confirmado en `proyecto-tareas.ts`: `.order('fecha_limite', {
   ascending: true, nullsFirst: false })`). **Especificado completo, sin
   "mismo patrón" — 2 ramas explícitas, porque
   `NULLS LAST` pone todas las filas con `fecha_limite IS NULL` después de
   TODAS las no-nulas, sin importar su valor, así que la condición de
   "después del cursor" depende de si el cursor mismo es nulo o no:**
   ```ts
   let query = supabaseAdmin
     .from('proyecto_tareas')
     .select('*, proveedores(nombre), proyectos!inner(proyecto, cliente, estado)')
     .neq('estado', 'COMPLETADA')
     .neq('proyectos.estado', 'FINALIZADO')
     .order('fecha_limite', { ascending: true, nullsFirst: false })
     .order('id', { ascending: true })
     .limit(PAGE_SIZE)
   if (cursorFechaLimite !== null) {
     // Cursor con fecha_limite NO nula: la página siguiente incluye tanto
     // las filas con fecha_limite mayor (o igual + id mayor, desempate)
     // como TODAS las filas con fecha_limite NULL -- esas van después de
     // cualquier fecha_limite no nula bajo NULLS LAST, sin importar el
     // valor del cursor.
     query = query.or(
       `fecha_limite.gt.${cursorFechaLimite},and(fecha_limite.eq.${cursorFechaLimite},id.gt.${cursorId}),fecha_limite.is.null`
     )
   } else if (cursorId !== null) {
     // Cursor ya dentro del bloque de fecha_limite NULL (cursorFechaLimite
     // === null pero cursorId no): no hay nada "después" salvo más filas
     // NULL con id mayor -- ya estamos al final del orden.
     query = query.is('fecha_limite', null).gt('id', cursorId)
   }
   // cursorFechaLimite/cursorId ambos null: primera página, sin filtro de cursor.
   ```
   `fecha_limite` (timestamp) e `id` (uuid) son ambos seguros de
   interpolar sin escapar en `.or()` — ninguno puede contener `,`/`(`/`)`,
   los caracteres que ese filtro de PostgREST trata como reservados.
   **Al llegar al circuit breaker, la función lanza un `Error` explícito — nunca devuelve las
   filas leídas hasta ese punto como si fueran el total** (un array parcial
   silencioso rompería el tablero de forma indetectable: tarjetas
   "desaparecidas" sin ningún error visible).
3. **Comportamiento a preservar:** el shape de retorno (`Proyecto[]`/
   `TareaAgregada[]`) no cambia en el caso normal — los consumidores
   (`useProyectosListado.ts`, `app/proyectos/tipos/page.tsx`) siguen
   recibiendo el array completo, ahora garantizado completo de verdad más
   allá de 1000 filas, o una excepción explícita si el circuit breaker se
   agota (nunca datos incompletos sin avisar).
4. **Archivos exactos:** `lib/server/repositories/proyectos.ts`;
   `lib/server/repositories/proyecto-tareas.ts`.
5. **Modificados:** los 2 archivos.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente.
9. **Riesgo:** P1 (el bug real, "1000+ proyectos silenciosamente
   invisibles", pasa a ser imposible; el circuit breaker ahora falla
   explícito en vez de esconder el problema).
10. **Pruebas:** **primero, empírica contra `serenata-erp-test` real (no un
    mock):** insertar 1,200 filas sintéticas de `proyectos` (reutilizando el
    seed de 3A-3 si ya corrió, o un insert puntual de prueba con `runId`
    dedicado) y confirmar que `getProyectos()` **sin** el fix devuelve
    exactamente 1000 (confirma el `max_rows` real del proyecto, no
    supuesto) y **con** el fix devuelve las 1,200 completas. Unitaria: mock
    de 3 páginas keyset de 500/500/200 filas, confirma que se concatenan las
    1,200 en el orden correcto; mock de un dataset que nunca decrece bajo
    `PAGE_SIZE` (simulando el circuit breaker) confirma que la función lanza
    el `Error` explícito, nunca retorna un array parcial; **para
    `getTareasAgregadas()`, unitaria de las 2 ramas del cursor nullable:**
    fixture con tareas de `fecha_limite` mixta (algunas con fecha, algunas
    NULL) repartidas en más de `PAGE_SIZE` filas — confirma que la página
    que cruza de "última fecha no nula" a "primera NULL" no pierde ni
    duplica ninguna tarea, y que el avance dentro del bloque NULL (rama
    `else if`) tampoco lo hace.
11. **Criterio de aceptación:** el test empírico del punto 10 confirma el
    `max_rows` real y la corrección contra el proyecto de test de verdad;
    el test de circuit breaker confirma que se lanza excepción, no un
    array truncado; el test de las 2 ramas del cursor nullable de
    `getTareasAgregadas()` pasa sin perder ni duplicar filas.
12. **Rollback:** revertir a la implementación de una sola página.
13. **Horas:** 11-13h (sube por especificar completo el cursor nullable de
    `getTareasAgregadas()`, con sus 2 ramas y su propio test).
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** el test empírico contra `serenata-erp-test` (antes:
    1000, después: 1,200) + el test de circuit breaker lanzando error + el
    test de las 2 ramas del cursor nullable, todos documentados en el PR.

#### 3B-6 — Lectura interna completa vía keyset — Proveedores (verificación empírica de `max_rows`)

1. **Problema:** F7 — `getProveedores()` sin límite; volumen real 10,
   objetivo de capacidad 1,000 (`CLAUDE.md`), justo en el borde del cap real
   de PostgREST. **3 consumidores server-side reales confirmados** por
   grep exhaustivo de callers de la función de repositorio:
   `app/api/proveedores/documentos-resumen/route.ts`,
   `app/api/proveedores/route.ts`,
   `app/api/proyectos/[id]/generar-hoja-llamado/route.ts` — la ruta
   `app/api/proveedores/route.ts` es, a su vez, la que sirve
   `app/proveedores/page.tsx`, `TareaFormModal.tsx`,
   `lib/services/quotation-service.ts::fetchProveedores()`,
   `plantillas-servicios/nueva` y `plantillas-servicios/[id]/editar` (los
   5 son componentes cliente que consumen `/api/proveedores` por HTTP —
   corren en el browser, nunca pueden importar el módulo de servidor
   `lib/server/repositories/proveedores.ts` directo). El fix (paginar
   `getProveedores()` por keyset) beneficia a esos 5 consumidores
   cliente de forma transitiva a través de la ruta, sin que ellos mismos
   sean callers directos de la función.
2. **Decisión — RPC parametrizada con
   comparación por tupla, no cursor de texto en `.or()` ni orden en Node.**
   Un cursor por `id` con el orden final aplicado con `localeCompare('es')`
   en Node resolvería el riesgo de inyección de
   PostgREST pero dejaría abierta una pregunta real: si la collation de
   Node coincide o no con la de Postgres — "ajustar el comparador hasta
   que coincida" no es un comparador cerrado. La solución que sí cierra
   ambos problemas a la vez: una **RPC** con parámetros bindeados (nunca
   interpolación de texto en un filtro), que compara `(nombre, id) >
   (p_cursor_nombre, p_cursor_id)` **dentro de SQL**, dejando que el
   `ORDER BY nombre` real de Postgres decida el orden — exactamente
   "conservar el orden en PostgreSQL", sin el riesgo de escapado de un
   `.or()` armado a mano, porque un parámetro bindeado de una RPC nunca se
   interpreta como sintaxis de filtro:
   ```sql
   CREATE OR REPLACE FUNCTION public.proveedores_pagina_por_nombre(
     p_cursor_nombre text DEFAULT NULL,
     p_cursor_id uuid DEFAULT NULL,
     p_page_size int DEFAULT 500
   )
   RETURNS SETOF proveedores
   LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
     SELECT *
     FROM proveedores
     WHERE activo = true
       AND (
         p_cursor_nombre IS NULL
         OR (nombre, id) > (p_cursor_nombre, p_cursor_id)
       )
     ORDER BY nombre ASC, id ASC
     LIMIT p_page_size;
   $$;
   REVOKE EXECUTE ON FUNCTION public.proveedores_pagina_por_nombre(text, uuid, int) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.proveedores_pagina_por_nombre(text, uuid, int) TO service_role;
   ```
   (`(nombre, id) > (p_cursor_nombre, p_cursor_id)` es comparación de tupla
   nativa de Postgres — equivalente exacto a `nombre > cursor OR (nombre =
   cursor AND id > cursorId)`, evaluada con la collation real de la
   columna, nunca con una reimplementación en otro lenguaje). El
   repositorio:
   ```ts
   export async function getProveedores(): Promise<Proveedor[]> {
     const PAGE_SIZE = 500
     const HARD_CAP = 20000
     let all: Proveedor[] = []
     let cursorNombre: string | null = null
     let cursorId: string | null = null
     while (true) {
       const { data, error } = await supabaseAdmin.rpc('proveedores_pagina_por_nombre', {
         p_cursor_nombre: cursorNombre,
         p_cursor_id: cursorId,
         p_page_size: PAGE_SIZE,
       })
       if (error) throw error
       if (!data || data.length === 0) break
       all = all.concat(data as Proveedor[])
       if (all.length > HARD_CAP) {
         throw new Error(
           `getProveedores() superó el circuit breaker de ${HARD_CAP} filas sin agotar la tabla -- ` +
           `posible bug de paginación o crecimiento muy por encima del objetivo de capacidad (1,000). ` +
           `Fallando explícito en vez de devolver un array parcial a los consumidores (dropdowns/lista).`
         )
       }
       const last = data[data.length - 1] as Proveedor
       cursorNombre = last.nombre
       cursorId = last.id
       if (data.length < PAGE_SIZE) break
     }
     return all // ya viene ordenado por Postgres -- ORDER BY nombre ASC, id ASC de la RPC, sin reordenar en Node
   }
   ```
3. **Comportamiento a preservar:** array completo para los 3 callers
   server-side (y, transitivamente, los 5 consumidores cliente que
   dependen de `app/api/proveedores/route.ts`) en el caso normal, filtro
   `activo=true`, orden final por `nombre`
   ascendente **decidido por Postgres, idéntico al `ORDER BY` de siempre**
   (nunca recalculado en Node); excepción explícita (nunca array parcial)
   si el circuit breaker se agota.
4. **Archivos exactos:** nueva migración (la RPC de arriba);
   `lib/server/repositories/proveedores.ts`.
5. **Nuevos:** 1 migración. **Modificados:** `proveedores.ts`.
6. **Migraciones/RPC:** la función `proveedores_pagina_por_nombre` de
   arriba.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente.
9. **Riesgo:** P1 — el más cercano al límite real de capacidad objetivo (10
   → 1,000, exactamente el cap de PostgREST).
10. **Pruebas:** mismo test empírico que 3B-5 — sembrar 1,200 proveedores
    reales en `serenata-erp-test` (reutilizando 3A-3), confirmar 1000 sin el
    fix y 1,200 con el fix; **prueba de orden — ahora trivial de cerrar
    porque el orden lo decide Postgres, no un comparador de Node:**
    fixture con nombres que ejercen casos reales
    de collation (mayúsculas/minúsculas mezcladas, acentos, ñ) y con al
    menos uno que contenga `,`/`(`/`)` — confirmar que el array final
    coincide exactamente con `SELECT * FROM proveedores WHERE activo=true
    ORDER BY nombre ASC, id ASC` corrido directo (sin paginar, sobre el
    fixture chico) — la RPC pagina la MISMA query, así que deben coincidir
    por construcción, no por ajuste; unitaria de circuit breaker
    confirmando `throw`, no array parcial; **`app/api/proyectos/[id]/generar-hoja-llamado/route.ts`
    sigue recibiendo el array completo** — confirmado por `Glob` que no
    existe hoy ningún test para esa ruta (no hay archivo bajo
    `app/api/__tests__/` que la cubra), así que no hay ninguno que
    preservar: la verificación de este caso es manual (llamar la ruta real
    con el fixture de 1,200 proveedores y confirmar que la hoja de llamado
    generada lista a los 1,200, no solo a los primeros 1,000).
11. **Criterio de aceptación:** el test empírico del punto 10 pasa; el
    test de orden coincide exactamente contra la query directa de
    Postgres; el circuit breaker lanza excepción explícita en su test; el
    proveedor con caracteres reservados aparece completo y bien ordenado.
12. **Rollback:** revertir la migración y `proveedores.ts` a la
    implementación anterior.
13. **Horas:** 11-13h (sube por la RPC parametrizada — más simple de
    razonar que un comparador de Node, pero es una pieza nueva de SQL con
    su propia migración — y la verificación de los 3 callers reales).
14. **Tamaño:** chico-mediano, 1 PR.
15. **Evidencia:** test empírico documentado (antes 1000, después 1,200) +
    test de orden contra la query directa de Postgres + test de circuit
    breaker.

#### 3B-7 — Folio principal por RPC (algoritmo proporcional, `bigint`, gate serverless con remediación obligatoria si falla)

1. **Problema:** F14 — `SELECT id FROM cotizaciones` sin filtro para el
   folio principal, trae la tabla completa a Node.
2. **Decisión — algoritmo proporcional a ocupación (cota del principio del
   palomar: con k números ocupados, el primer hueco libre está a lo sumo en
   k+1), `bigint`:**
   ```sql
   CREATE OR REPLACE FUNCTION public.preview_next_cotizacion_folio_principal()
   RETURNS text
   LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
     WITH ocupados AS (
       SELECT substring(id from '^SH(\d+)$')::bigint AS n
       FROM cotizaciones WHERE id ~ '^SH\d+$'
       UNION ALL
       SELECT substring(folio from '^SH(\d+)$')::bigint
       FROM cotizacion_folio_reservations
       WHERE kind = 'PRINCIPAL' AND consumed_at IS NULL AND expires_at > now()
         AND folio ~ '^SH\d+$'
     ),
     candidatos AS (
       SELECT gs AS n FROM generate_series(1::bigint, (SELECT COUNT(*) FROM ocupados) + 1) AS gs
     )
     SELECT 'SH' || lpad(candidatos.n::text, 3, '0')
     FROM candidatos
     LEFT JOIN ocupados ON ocupados.n = candidatos.n
     WHERE ocupados.n IS NULL
     ORDER BY candidatos.n
     LIMIT 1;
   $$;
   REVOKE EXECUTE ON FUNCTION public.preview_next_cotizacion_folio_principal() FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.preview_next_cotizacion_folio_principal() TO service_role;
   ```
   `computeNextQuotationFolio()` (`lib/server/quotations/folio.ts`) reemplaza
   la rama `!trimmedBase` por esta RPC, mismo patrón `isMissingFunctionError`
   que ya usa el archivo, fallback a `getNextFolio()`.
   **Gate y remediación obligatoria (nunca deuda silenciosa):** una vez
   implementada, medir la RPC **sin caché** contra el **entorno serverless
   real de 3A-1**. Si el p95 < 1000ms (mismo umbral que motivó el caché en
   EF-2 1D-3): se elimina `CacheManager`/`invalidateFolioCache()` de
   `folio.ts` en este mismo bloque. **Modelo de estados simplificado, mismo criterio que 3D-0: si no pasa el gate, 3B-7 cierra igual (`Cerrado`) una vez que la RPC+paridad+medición están
   entregadas** — nada fuera de este bloque depende de que el caché se
   haya podido quitar (confirmado, `Salientes: ninguna` en el punto 7), así
   que no hay razón para bloquear el tracker por una optimización adicional
   pendiente. Se agrega el hallazgo
   `F14b` a la matriz (sección 4) con la medición real adjunta, y se abre
   una fila nueva `3B-7b` en el tracker — bloque correctivo con su propia
   especificación de 15 puntos (archivos, ej. índice funcional sobre el
   patrón `SH\d+`; pruebas, la misma medición repetida contra el fix;
   rollback propio) — que EF-3 no puede cerrarse (criterio de la sección 8)
   sin que `3B-7b` quede `Cerrado` o `Diferido con aprobación` explícita
   del usuario — nunca aceptado como "se documentó y se sigue".
3. **Comportamiento a preservar:** algoritmo de "primer hueco libre desde
   1", reservas activas cuentan como ocupadas. La rama de complementarias
   (`folio.ts:96-124`, ya acotada por `.eq('es_complementaria_de', ...)`) no
   se toca.
4. **Archivos exactos:** nueva migración; `lib/server/quotations/folio.ts`.
5. **Nuevos:** 1 migración. **Modificados:** `folio.ts`.
6. **Migración/RPC:** la de arriba.
7. **Dependencias entrantes:** 3A-1 (para el gate serverless real).
   **Salientes:** ninguna, salvo `3B-7b` condicional (que no bloquea nada
   fuera de sí misma tampoco).
8. **Orden:** después de que 3A-1 exista (para poder medir); independiente
   del resto de EF-3B.
9. **Riesgo:** P0 en el hallazgo (deuda documentada explícitamente en
   `ACTIVE_WORK.md`).
10. **Pruebas:** paridad JS-vs-RPC sobre estados sintéticos con huecos y
    reservas; medición de latencia sin caché en el entorno serverless real,
    documentada con el número exacto obtenido.
11. **Criterio de aceptación:** paridad 100%; medición documentada con
    resultado pasa/no-pasa explícito — 3B-7 cierra (`Cerrado`) en cualquiera
    de los 2 casos; si no pasa, `F14b`/`3B-7b` se crean como fila
    independiente del tracker, sin condicionar el cierre de 3B-7 mismo.
12. **Rollback:** revertir `folio.ts`; RPC queda sin invocar.
13. **Horas:** 9-11h.
14. **Tamaño:** mediano, 1 PR (más una posible remediación F14b si el gate
    falla, tratada como bloque nuevo si ocurre).
15. **Evidencia:** tabla de paridad + medición de latencia con resultado
    explícito.

#### 3B-8 — RPC de eventos realizados pendientes (columnas reales, sin placeholders)

1. **Problema:** F8 — `getCuentasPagarPendientesEventosRealizados()`
   (`lib/server/repositories/cuentas-pagar.ts:336-353`) filtra
   `fecha_entrega<=hoy` en JS después de traer todas las `PENDIENTE` con
   joins. Único caller confirmado por grep exhaustivo:
   `app/api/cuentas-pagar/generar-orden-pago/route.ts`.
2. **Decisión — `jsonb`, columnas reales (no provisionales):** el shape
   actual que el caller consume es `CuentaPagarConJoins` — todas las
   columnas de `cuentas_pagar` más `cotizaciones(fecha_entrega, proyecto)` y
   `proyectos(proyecto)` anidados (`cuentas-pagar.ts:11-14`). La RPC
   devuelve exactamente ese shape aplanado con los mismos nombres que el
   TS ya usa para desanidar (`row.cotizaciones?.fecha_entrega`,
   `row.proyectos?.proyecto`):
   ```sql
   CREATE OR REPLACE FUNCTION public.cuentas_pagar_pendientes_eventos_realizados()
   RETURNS jsonb
   LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
     SELECT COALESCE(jsonb_agg(t ORDER BY t.responsable_nombre, t.cotizacion_id), '[]'::jsonb)
     FROM (
       SELECT
         cp.*,
         jsonb_build_object('fecha_entrega', c.fecha_entrega, 'proyecto', c.proyecto) AS cotizaciones,
         CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('proyecto', p.proyecto) ELSE NULL END AS proyectos
       FROM cuentas_pagar cp
       JOIN cotizaciones c ON c.id = cp.cotizacion_id
       LEFT JOIN proyectos p ON p.id = cp.proyecto_id
       WHERE cp.estado = 'PENDIENTE'
         AND c.fecha_entrega IS NOT NULL
         AND c.fecha_entrega <= (now() AT TIME ZONE 'UTC')::date
     ) t;
   $$;
   REVOKE EXECUTE ON FUNCTION public.cuentas_pagar_pendientes_eventos_realizados() FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.cuentas_pagar_pendientes_eventos_realizados() TO service_role;
   ```
   `jsonb_build_object` para `cotizaciones`/`proyectos` replica exactamente
   la forma anidada que `CuentaPagarConJoins` espera (objeto, no columnas
   planas) — el TS wrapper en `cuentas-pagar.ts` cambia el cuerpo de la
   función para llamar esta RPC y castear el resultado a
   `CuentaPagarConJoins[]`, sin cambiar la firma exportada.
3. **Comportamiento a preservar:** shape de retorno idéntico al que
   `generar-orden-pago/route.ts` ya consume; orden
   `responsable_nombre, cotizacion_id`.
4. **Archivos exactos:** nueva migración;
   `lib/server/repositories/cuentas-pagar.ts` (reemplaza el cuerpo de
   `getCuentasPagarPendientesEventosRealizados`, mismo nombre exportado).
5. **Nuevos:** 1 migración. **Modificados:** `cuentas-pagar.ts`.
6. **Migración/RPC:** la de arriba.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente.
9. **Riesgo:** P1.
10. **Pruebas:** paridad JS-vs-RPC sobre fixture con fechas antes/después de
    hoy y `fecha_entrega` nula (excluida en ambos); test existente de
    `generar-orden-pago` sin modificar.
11. **Criterio de aceptación:** paridad 100%, incluida la forma anidada
    exacta del JSON.
12. **Rollback:** revertir `cuentas-pagar.ts`.
13. **Horas:** 6-7h.
14. **Tamaño:** chico, 1 PR.
15. **Evidencia:** tabla de paridad + comparación de shape JSON.

#### 3B-9 — Agregación SQL de `/api/cuentas/por-proyecto`

1. **Problema:** F12 — `por-proyecto/route.ts:29-72` trae `proyectos`+
   `cuentas_cobrar`+`cuentas_pagar` completos y agrupa/suma en Node.
2. **Decisión — RPC `cuentas_por_proyecto() RETURNS jsonb`, con el
   agregado externo reconstruyendo explícitamente solo los 5 campos
   públicos (`jsonb_agg(t)` sobre la fila
   completa arrastraría las columnas auxiliares de orden al JSON final —
   `t` es la fila entera del `FROM (...) t`, no solo lo que estaba dentro
   de `jsonb_build_object`; el fix reconstruye el objeto en el `jsonb_agg`
   externo, dejando las auxiliares solo en el `ORDER BY`):**
   ```sql
   CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto()
   RETURNS jsonb
   LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
     SELECT COALESCE(
       jsonb_agg(
         jsonb_build_object(
           'proyecto', t.proyecto,
           'cuentas_cobrar', t.cuentas_cobrar,
           'cuentas_pagar', t.cuentas_pagar,
           'total_cobrar', t.total_cobrar,
           'total_pagar', t.total_pagar
         )
         ORDER BY t.proyecto_created_at DESC, t.proyecto_id DESC
       ),
       '[]'::jsonb
     )
     FROM (
       SELECT
         p.id AS proyecto_id,
         p.created_at AS proyecto_created_at,
         jsonb_build_object('id', p.id, 'folio', p.id, 'nombre', p.proyecto, 'cliente', p.cliente, 'estado', p.estado) AS proyecto,
         COALESCE((SELECT jsonb_agg(cc ORDER BY cc.created_at DESC, cc.id DESC) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), '[]'::jsonb) AS cuentas_cobrar,
         COALESCE((SELECT jsonb_agg(cp ORDER BY cp.created_at DESC, cp.id DESC) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), '[]'::jsonb) AS cuentas_pagar,
         ROUND(COALESCE((SELECT SUM(cc.monto_total) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), 0), 2) AS total_cobrar,
         ROUND(COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), 0), 2) AS total_pagar
       FROM proyectos p
       WHERE EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id)
          OR EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id)
     ) t;
   $$;
   REVOKE EXECUTE ON FUNCTION public.cuentas_por_proyecto() FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.cuentas_por_proyecto() TO service_role;
   ```
   Orden explícito, replicando el orden implícito de hoy (`por-proyecto/route.ts`
   itera `getProyectos()`/`getCuentasCobrar()`/`getCuentasPagar()`, las 3 ya
   ordenadas `created_at DESC` — el orden de inserción en cada grupo hereda
   ese orden): proyectos por `created_at DESC, id DESC` (vía el `ORDER BY`
   del `jsonb_agg` externo, usando las columnas auxiliares); `cuentas_cobrar`/
   `cuentas_pagar` anidadas, cada una por su propio `created_at DESC, id DESC`.
   `proyecto_id`/`proyecto_created_at` **nunca viajan en el JSON final** —
   confirmado por construcción: el `jsonb_build_object` externo solo
   nombra los 5 campos públicos, las auxiliares existen únicamente dentro
   del `FROM (...) t` para ordenar, nunca dentro de ese `jsonb_build_object`.
3. **Comportamiento a preservar:** shape `{proyectos: [{proyecto, cuentas_cobrar,
   cuentas_pagar, total_cobrar, total_pagar}]}` idéntico; filtro "solo con
   al menos una cuenta" preservado como `WHERE EXISTS ... OR EXISTS`; orden
   de proyectos y de cada arreglo anidado idéntico al de hoy.
4. **Archivos exactos:** nueva migración; `app/api/cuentas/por-proyecto/route.ts`
   (reemplaza el cuerpo del `GET` por 1 llamada RPC).
5. **Nuevos:** 1 migración. **Modificados:** la ruta.
6. **Migración/RPC:** la de arriba.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente.
9. **Riesgo:** P1.
10. **Pruebas:** diff de JSON completo, **campo por campo y en el mismo
    orden de arreglo** (JS actual vs RPC), sobre fixture con proyectos
    con/sin cuentas y con más de una cuenta por proyecto (para ejercer el
    `ORDER BY` anidado).
11. **Criterio de aceptación:** diff vacío (idéntico, incluido el orden de
    `proyectos`, `cuentas_cobrar` y `cuentas_pagar`).
12. **Rollback:** revertir la ruta.
13. **Horas:** 9-10h.
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** diff de JSON del punto 10, incluido el orden.

#### 3B-10 — Agregados SQL de Dashboard (redondeo por fila, resiliencia preservada)

1. **Problema:** F13 — `dashboard.ts:192-277` trae 5 tablas completas y
   agrega en Node. El redondeo debe aplicarse **por fila antes de sumar**
   (`calcularSaldoPendiente` ya redondea cada término a 2 decimales,
   `dashboard.ts:238,243`), y otra vez sobre la suma final (`round2`,
   `dashboard.ts:235,240`) — doble redondeo real, no solo el de la suma.
   **La RPC no puede prometer "paridad exacta"
   contra el `round2` actual de `dashboard.ts:100`** —
   `Math.round(n * 100) / 100` tiene el mismo problema de fondo que
   `toFixed()` para valores como `100.005` (ver la política canónica de
   redondeo de 3B-1) — este bloque **depende de que 3B-1 ya haya
   consolidado `round2` en `lib/server/shared/decimal.ts`** y de que
   `dashboard.ts` ya lo importe de ahí en vez de su implementación local:
   la paridad de este bloque se mide contra ese `round2` compartido
   (decimal-safe), nunca contra el `Math.round(n*100)/100` original.
2. **Decisión — varias RPCs chicas, preservan `Promise.allSettled`:**
   ```sql
   CREATE OR REPLACE FUNCTION public.dashboard_kpis_cuentas()
   RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
     SELECT jsonb_build_object(
       'porCobrar', ROUND(COALESCE(SUM(ROUND(GREATEST(cc.monto_total - COALESCE(cc.monto_pagado,0), 0), 2)), 0), 2),
       'porPagar', (SELECT ROUND(COALESCE(SUM(ROUND(GREATEST(cp.x_pagar - COALESCE(cp.monto_pagado,0), 0), 2)), 0), 2) FROM cuentas_pagar cp WHERE cp.estado <> 'PAGADO')
     )
     FROM cuentas_cobrar cc WHERE cc.estado <> 'PAGADO';
   $$;

   CREATE OR REPLACE FUNCTION public.dashboard_balance_periodos(p_buckets jsonb)
   RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
     -- jsonb_array_elements() no garantiza que el orden de salida respete
     -- el orden del array de entrada -- el código JS actual interpreta el
     -- ÚLTIMO bucket del array como el periodo vigente (bucketsDePeriodo()
     -- en dashboard.ts arma p_buckets ya en orden cronológico), así que un
     -- reordenamiento aquí corromperia esa lectura sin ningún error
     -- visible. WITH ORDINALITY asigna la posición real de cada elemento
     -- en el array de entrada; ORDER BY esa posición en el jsonb_agg
     -- externo hace que el orden de salida sea el mismo que el de
     -- p_buckets, por construcción, no por casualidad del plan de
     -- ejecución.
     SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'label', t.b->>'label',
       'ingresos', ROUND(COALESCE((SELECT SUM(pc.monto) FROM pagos_comprobantes pc WHERE pc.fecha_pago >= (t.b->>'inicio')::date AND pc.fecha_pago < (t.b->>'fin')::date), 0), 2),
       'egresos', ROUND(COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.estado = 'PAGADO' AND cp.fecha_pago >= (t.b->>'inicio')::date AND cp.fecha_pago < (t.b->>'fin')::date), 0), 2)
     ) ORDER BY t.ord), '[]'::jsonb)
     FROM jsonb_array_elements(p_buckets) WITH ORDINALITY AS t(b, ord);
   $$;

   CREATE OR REPLACE FUNCTION public.dashboard_actividad_cotizaciones(p_inicio date, p_fin date)
   RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
     SELECT jsonb_build_object(
       'cotizacionesAprobadas', COUNT(*) FILTER (WHERE estado = 'APROBADA'),
       'cotizacionesBorrador', COUNT(*) FILTER (WHERE estado = 'BORRADOR')
     )
     FROM cotizaciones WHERE created_at >= p_inicio AND created_at < p_fin;
   $$;

   CREATE OR REPLACE FUNCTION public.dashboard_actividad_proyectos(p_inicio date, p_fin date)
   RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
     SELECT jsonb_build_object(
       'proyectosCreados', COUNT(*) FILTER (WHERE created_at >= p_inicio AND created_at < p_fin),
       'proyectosEnCurso', COUNT(*) FILTER (WHERE fecha_inicio_real IS NOT NULL AND fecha_inicio_real < p_inicio AND fecha_cierre_real IS NULL)
     )
     FROM proyectos;
   $$;

   CREATE OR REPLACE FUNCTION public.dashboard_cotizaciones_recientes()
   RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
     -- jsonb_agg(t) sin ORDER BY dentro del propio agregado no hereda el
     -- ORDER BY de la subconsulta -- Postgres no garantiza el orden de un
     -- agregado sin una cláusula ORDER BY explícita en la llamada al
     -- agregado mismo. El dashboard muestra estas 6 como "más recientes
     -- primero"; sin el ORDER BY aquí, el orden de salida queda
     -- indefinido.
     SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb) FROM (
       SELECT id, proyecto, cliente, total, estado, created_at
       FROM cotizaciones ORDER BY created_at DESC, id DESC LIMIT 6
     ) t;
   $$;
   ```
   (los `REVOKE`/`GRANT` de las 5, mismo patrón que todo el plan, se agregan
   igual en la migración). `getResumenDashboard()` sigue llamando estas 5
   RPCs + `getGastosFijos(true)` (sin cambio — ya filtrada y chica por
   catálogo, no crece con el volumen de negocio) con `Promise.allSettled`
   exactamente como hoy, mismo `fuentesConError`. `bucketsDePeriodo`/
   `rangoDePeriodo` (matemática pura de fechas, `dashboard.ts:36-94`) se
   quedan en TS — no tocan tablas, no son parte de F13.
3. **Comportamiento a preservar:** valores numéricos idénticos (redondeo
   por fila + redondeo final, verificado punto 10); resiliencia por fuente
   idéntica.
4. **Archivos exactos:** nueva migración (5 funciones);
   `lib/server/repositories/dashboard.ts`.
5. **Nuevos:** 1 migración. **Modificados:** `dashboard.ts`.
6. **Migración/RPC:** las 5 de arriba.
7. **Dependencias entrantes:** 3B-1 (necesita `lib/server/shared/decimal.ts`
   ya consolidado). **Salientes:** ninguna.
8. **Orden:** después de 3B-1; en paralelo con el resto de EF-3B.
9. **Riesgo:** P1 en el hallazgo; **P0 de implementación** por la cantidad
   de cálculo financiero replicado.
10. **Pruebas:** para las 5 RPCs, comparar JS actual vs RPC sobre fixture
    idéntico, para los 3 periodos y 2 anchors (incluido un cruce de año),
    **incluyendo casos con decimales que producen diferencia de redondeo
    real** (montos tipo `X.005`); test de resiliencia (una RPC falla, el
    resto del resumen sigue); **caso para
    `dashboard_balance_periodos`:** `p_buckets` con ≥4 elementos en orden
    cronológico, confirmar que el array `ingresos`/`egresos` devuelto
    conserva ese mismo orden (compara `label` posición por posición, no
    solo que el conjunto de valores coincida) — y que el código cliente
    que lee "el último bucket es el periodo vigente" sigue leyendo el
    bucket correcto tras el cambio a `WITH ORDINALITY`.
11. **Criterio de aceptación:** paridad 100% en todos los casos del punto
    10, incluidos los de redondeo y el de orden de `dashboard_balance_periodos`;
    test de resiliencia pasa.
12. **Rollback:** revertir `dashboard.ts`; RPCs quedan sin invocar.
13. **Horas:** 19-23h (sube por `WITH ORDINALITY` y su test de orden
    dedicado).
14. **Tamaño:** grande, 1 PR (las 5 RPCs se mergean juntas).
15. **Evidencia:** tabla de paridad 3 periodos × 2 anchors × 5 RPCs,
    incluidos los casos de redondeo y el de orden.

#### 3B-11 — Paginación/búsqueda server-side — Órdenes de pago (hallazgo nuevo encontrado durante la propia auditoría del plan)

1. **Problema:** F25 — `getOrdenesPago()` (`cuentas-pagar.ts:327-334`) sin
   límite explícito, `ORDER BY fecha_generacion DESC`. Único consumidor
   confirmado: `app/api/cuentas-pagar/ordenes-historial/route.ts` (leído
   completo — es un `GET` sin querystring, sin ningún parámetro de filtro
   ni búsqueda, devuelve `{total, ordenes: [...]}` mapeando 8 campos fijos),
   a su vez consumido por `useCuentasPagar.ts` para el tab "historial" de
   Cuentas > Pagar (lista simple, no tablero ni dropdown). **Cerrado: no
   existe ningún filtro de texto ni parámetro adicional que agregar** — el
   único cambio de contrato es paginación.
2. **Decisión:**
   ```sql
   CREATE OR REPLACE FUNCTION public.buscar_ordenes_pago(p_page int DEFAULT 1, p_page_size int DEFAULT 50)
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
     v_page int := GREATEST(p_page, 1);
     v_rows jsonb;
     v_total_rows bigint;
   BEGIN
     -- jsonb_agg(t) sin ORDER BY propio no garantiza el orden de la
     -- subconsulta -- el paginado de esta RPC depende de que la página N
     -- siempre muestre las mismas filas en el mismo orden que el cliente
     -- espera (fecha_generacion desc, id desc).
     SELECT COALESCE(jsonb_agg(t ORDER BY t.fecha_generacion DESC, t.id DESC), '[]'::jsonb) INTO v_rows
     FROM (
       SELECT id, fecha_generacion, pdf_url, pdf_nombre, estado, total_monto, created_by, created_at
       FROM ordenes_pago
       ORDER BY fecha_generacion DESC, id DESC
       LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
     ) t;
     SELECT COUNT(*) INTO v_total_rows FROM ordenes_pago;
     RETURN jsonb_build_object('rows', v_rows, 'total_rows', v_total_rows);
   END;
   $$;
   REVOKE EXECUTE ON FUNCTION public.buscar_ordenes_pago(int, int) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.buscar_ordenes_pago(int, int) TO service_role;
   ```
   Las 8 columnas seleccionadas replican exactamente el `.map()` de
   `ordenes-historial/route.ts:13-22` (`id, fecha_generacion, pdf_url,
   pdf_nombre, estado, total_monto, created_by, created_at`) — ni una más,
   ni una menos.
3. **Comportamiento a preservar:** orden `fecha_generacion desc, id desc`;
   el shape `{total, ordenes: [...]}` de la respuesta HTTP no cambia, solo
   pasa a ser paginado (`total` ahora refleja `total_rows` real, no
   `ordenes.length` de la página).
4. **Archivos exactos:** nueva migración;
   `lib/server/repositories/cuentas-pagar.ts` (nueva `buscarOrdenesPago`,
   `getOrdenesPago()` sin parámetros se conserva sin cambios — ningún otro
   caller la usa hoy fuera de esta ruta, pero no hay razón para eliminarla
   si no estorba); `app/api/cuentas-pagar/ordenes-historial/route.ts`
   (acepta `?page=&pageSize=`, llama la RPC en vez de `getOrdenesPago()`
   completo); `app/components/cuentas/hooks/useCuentasPagar.ts` (agregar
   paginación al tab historial, reutilizando `components/ui/Pager.tsx` de
   3B-2).
5. **Nuevos:** 1 migración. **Modificados:** 3 archivos.
6. **Migración/RPC:** la función `buscar_ordenes_pago` de arriba,
   `SECURITY DEFINER`, `search_path` fijo, `REVOKE`/`GRANT` a
   `service_role`.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente.
9. **Riesgo:** P2 (volumen bajo hoy, sin bug activo, pero crece con cada
   lote de pago procesado).
10. **Pruebas:** equivalencia JS-vs-RPC sobre fixture con >1 página de
    órdenes, comparando las 8 columnas exactas y el orden.
11. **Criterio de aceptación:** paridad 100% en las 8 columnas y el orden;
    **confirmado por `Glob` que no existe hoy ningún test de
    `ordenes-historial` (`app/api/__tests__/` no tiene un archivo para esa
    ruta)** — no hay test existente que preservar; el criterio de
    aceptación de este bloque son únicamente los tests nuevos del punto 10.
12. **Rollback:** revertir el PR.
13. **Horas:** 8-9h.
14. **Tamaño:** chico-mediano, 1 PR.
15. **Evidencia:** tabla de paridad con las 8 columnas.

#### 3B-12 — Agregado SQL — resumen de documentos de proveedores (hallazgo nuevo encontrado durante la propia auditoría del plan)

1. **Problema:** F25 — `getAllProveedorDocumentos()`
   (`lib/server/repositories/proveedores.ts:80-86`) trae **todas** las filas
   de `proveedor_documentos` (`proveedor_id, tipo, estado_validacion`) sin
   límite. **Leído completo el único consumidor**
   (`app/api/proveedores/documentos-resumen/route.ts:1-51`): cruza esas
   filas con `getProveedores()`, y por cada proveedor con `portal_estado`
   ya iniciado (`!proveedor.portal_estado` se salta) calcula (a)
   `incompleta++` si no subió los 4 tipos de `TIPOS_REQUERIDOS`
   (`CONSTANCIA_SITUACION_FISCAL`, `INE`, `COMPROBANTE_DOMICILIO`,
   `COMPROBANTE_BANCARIO` — comparado vía `Set` de tipos subidos, duplicados
   del mismo tipo no afectan el resultado), (b) `conErrores++` si **algún**
   documento de ese proveedor tiene `estado_validacion === 'revision'`
   (`.some()`, duplicados tampoco afectan). La respuesta final es
   exactamente `{incompleta, conErrores}` — dos enteros, nada de detalle por
   proveedor. Es un conteo, no hace falta traer cada fila de documentos a
   Node.
2. **Decisión — la RPC calcula los 2 conteos directo en SQL, preservando la
   semántica de "cualquiera" (duplicados no importan) y el filtro de
   `portal_estado`:**
   ```sql
   CREATE OR REPLACE FUNCTION public.proveedor_documentos_resumen()
   RETURNS jsonb
   LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
     WITH tipos_requeridos AS (
       SELECT unnest(ARRAY['CONSTANCIA_SITUACION_FISCAL','INE','COMPROBANTE_DOMICILIO','COMPROBANTE_BANCARIO']) AS tipo
     ),
     por_proveedor AS (
       SELECT
         p.id,
         (SELECT COUNT(DISTINCT tr.tipo) FROM tipos_requeridos tr
          WHERE EXISTS (SELECT 1 FROM proveedor_documentos pd WHERE pd.proveedor_id = p.id AND pd.tipo = tr.tipo)
         ) = (SELECT COUNT(*) FROM tipos_requeridos) AS completa,
         EXISTS (SELECT 1 FROM proveedor_documentos pd WHERE pd.proveedor_id = p.id AND pd.estado_validacion = 'revision') AS con_error
       FROM proveedores p
       WHERE p.portal_estado IS NOT NULL
     )
     SELECT jsonb_build_object(
       'incompleta', COUNT(*) FILTER (WHERE NOT completa),
       'conErrores', COUNT(*) FILTER (WHERE con_error)
     )
     FROM por_proveedor;
   $$;
   REVOKE EXECUTE ON FUNCTION public.proveedor_documentos_resumen() FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.proveedor_documentos_resumen() TO service_role;
   ```
   `documentos-resumen/route.ts` reemplaza su cuerpo completo (líneas 18-46)
   por una sola llamada a esta RPC, **desestructurando `{data, error}`**
   (`supabaseAdmin.rpc()` siempre devuelve ese sobre, nunca el valor crudo —
   `Response.json(await supabaseAdmin.rpc(...))` expondría `{data:
   {incompleta, conErrores}, error: null}` al cliente en vez del shape
   esperado, un error real que se corrige aquí):
   ```ts
   const { data, error } = await supabaseAdmin.rpc('proveedor_documentos_resumen')
   if (error) {
     console.error('[proveedores/documentos-resumen]', error)
     return Response.json({ error: 'Error obteniendo resumen de documentación' }, { status: 500 })
   }
   return Response.json(data)
   ```
   `getAllProveedorDocumentos()` (`proveedores.ts:80-86`) se elimina, sin
   otro caller que la use (confirmado por grep).
3. **Comportamiento a preservar:** exactamente `{incompleta, conErrores}`
   como enteros, con la misma semántica "duplicados no importan" (vía
   `EXISTS`/`COUNT(DISTINCT tr.tipo)`, nunca contando filas de documento una
   por una) y el mismo filtro `portal_estado IS NOT NULL`.
4. **Archivos exactos:** nueva migración;
   `lib/server/repositories/proveedores.ts` (elimina
   `getAllProveedorDocumentos`); `app/api/proveedores/documentos-resumen/route.ts`
   (reemplaza el cuerpo del `GET`).
5. **Nuevos:** 1 migración. **Modificados:** 2 archivos. **Eliminados:**
   `getAllProveedorDocumentos`.
6. **Migración/RPC:** la función de arriba, `SECURITY DEFINER`,
   `search_path` fijo, `REVOKE`/`GRANT` a `service_role`.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente.
9. **Riesgo:** P2 hoy (volumen bajo), sube con el objetivo de capacidad de
   proveedores (más proveedores → más filas de documentos).
10. **Pruebas:** para un fixture con proveedores en cada combinación
    (completo/incompleto, con/sin error, con documentos duplicados del
    mismo tipo, proveedores sin `portal_estado`), comparar el resultado del
    código JS actual vs la RPC — deben coincidir exactamente, incluidos los
    casos de duplicados (el bug que introduciría un `jsonb_object_agg`
    ingenuo, ya descartado en el diseño); `app/api/__tests__/proveedores-documentos-resumen-route.test.ts`
    (ya existe) corre sin modificar sus aserciones.
11. **Criterio de aceptación:** paridad 100% en el punto 10, incluidos los
    casos de duplicados; el test existente pasa sin modificarse.
12. **Rollback:** revertir los 2 archivos; `getAllProveedorDocumentos` se
    restaura desde el historial de git si hace falta.
13. **Horas:** 7-8h.
14. **Tamaño:** chico, 1 PR.
15. **Evidencia:** tabla de paridad del punto 10 (incluidos los casos de
    duplicados) + test existente en verde.

---

### EF-3C — Correctness serverless y operaciones externas

#### 3C-1 — Eliminar `triggerSheetsSync()` y sus 31 call sites

1. **Problema:** F10 — `lib/integrations/sheets/trigger.ts` usa
   `Map`+`setTimeout` de proceso, no coalesce entre instancias serverless;
   además redundante ahora que existe el botón manual
   (`AdminSheets.tsx`+`sync-down/route.ts`).
2. **Decisión:** eliminar `trigger.ts` y las 31 llamadas a
   `triggerSheetsSync(...)` (quitar la línea + import, sin tocar el resto de
   cada ruta) en los 28 archivos de ruta reales (verificado por grep
   exhaustivo: son 31 llamadas en 28 archivos, 3 de ellos con 2 llamadas
   cada uno, marcados ×2 abajo):
   `app/api/clientes/route.ts`, `app/api/integrations/drive/upload/route.ts`,
   `app/api/items/[id]/route.ts` (×2), `app/api/productos/route.ts`,
   `app/api/cuentas-cobrar/[id]/subir-complemento/route.ts`,
   `app/api/cuentas-pagar/generar-orden-pago/route.ts`,
   `app/api/cuentas-cobrar/[id]/registrar-pago/route.ts`,
   `app/api/cuentas-pagar/route.ts`,
   `app/api/cuentas-cobrar/[id]/subir-factura/route.ts`,
   `app/api/cuentas-pagar/[id]/registrar-pago/route.ts`,
   `app/api/cuentas-pagar/[id]/subir-factura/route.ts`,
   `app/api/cuentas-cobrar/route.ts`,
   `app/api/cotizaciones/[id]/totales/route.ts`,
   `app/api/cotizaciones/[id]/route.ts` (×2),
   `app/api/cotizaciones/[id]/emitir/route.ts`,
   `app/api/cotizaciones/route.ts`,
   `app/api/cotizaciones/[id]/aprobar/route.ts`,
   `app/api/cotizaciones/[id]/general/route.ts`,
   `app/api/cotizaciones/[id]/cancelar/route.ts`,
   `app/api/cotizaciones/[id]/items/route.ts`,
   `app/api/cotizaciones/[id]/items/[itemId]/route.ts` (×2),
   `app/api/cotizaciones/[id]/items/bulk/route.ts`,
   `app/api/proveedores/route.ts`, `app/api/proyectos/[id]/tipo/route.ts`,
   `app/api/proveedores/[id]/route.ts`, `app/api/proyectos/[id]/route.ts`,
   `app/api/proyectos/route.ts`, `app/api/proyectos/[id]/etapa/route.ts`.
3. **Comportamiento a preservar:** las escrituras a Postgres de las 28
   rutas siguen exactamente igual — solo se quita el disparo de sync.
4. **Archivos exactos:** los 28 de arriba + `lib/integrations/sheets/trigger.ts`
   (eliminar) + los 18 tests que hoy hacen `vi.mock('@/lib/integrations/sheets/trigger', ...)`
   para poder testear sus rutas sin disparar el sync real (confirmado por
   grep exhaustivo de `__tests__/` -- ronda de verificación previa a 3C-1
   encontró un 18º archivo, `cuentas-cobrar-route.test.ts`, ausente de esta
   lista original), que pasan a **quitar ese mock por
   completo** (ya no hay nada que mockear) en vez de dejar un mock de un
   módulo que no existe:
   `app/api/__tests__/productos-route.test.ts`,
   `app/api/__tests__/proveedores-route.test.ts`,
   `app/api/__tests__/proyectos-etapa-route.test.ts`,
   `app/api/__tests__/clientes-route.test.ts`,
   `app/api/__tests__/cotizacion-emitir-route.test.ts`,
   `app/api/__tests__/cotizacion-item-patch-route.test.ts`,
   `app/api/__tests__/cotizacion-secciones-route.test.ts`,
   `app/api/__tests__/cotizaciones-items-bulk-route.test.ts`,
   `app/api/__tests__/cotizaciones-items-create-route.test.ts`,
   `app/api/__tests__/cuentas-cobrar-registrar-pago-route.test.ts`,
   `app/api/__tests__/cuentas-cobrar-route.test.ts`,
   `app/api/__tests__/cuentas-cobrar-subir-factura-route.test.ts`,
   `app/api/__tests__/cuentas-pagar-registrar-pago-route.test.ts`,
   `app/api/__tests__/cuentas-pagar-route.test.ts`,
   `app/api/__tests__/cuentas-pagar-subir-factura-route.test.ts`,
   `app/api/__tests__/proyectos-detail-route.test.ts`,
   `app/api/__tests__/cotizacion-aprobar-route.test.ts`,
   `app/api/__tests__/cotizacion-detail-route.test.ts`.
5. **Eliminados:** `trigger.ts`. **Modificados:** los 28 archivos de ruta +
   los 18 tests de arriba (quitar su mock de `trigger`).
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** 3C-2.
8. **Orden:** primero de EF-3C.
9. **Riesgo:** P1 — remoción mecánica, riesgo bajo por archivo, alto en
   volumen de archivos tocados.
10. **Pruebas:** `npx tsc --noEmit`, `npm run lint`, `npm test` (incluidos
    los 18 tests del punto 4 con su mock quitado, deben seguir pasando sin
    él porque ya no hay nada que mockear), `smoke`+`critical` completos —
    ninguno debería referenciar `triggerSheetsSync`.
11. **Criterio de aceptación:** grep de `triggerSheetsSync` en todo el repo
    devuelve 0; los 18 tests pasan sin su mock de `trigger`; CI completo en
    verde.
12. **Rollback:** revertir el PR completo.
13. **Horas:** 8-10h (sube por los 18 tests a ajustar además de las 28
    rutas).
14. **Tamaño:** grande en archivos, chico en complejidad, 1 PR.
15. **Evidencia:** el grep del punto 11 + confirmación de que los 18 tests
    pasan sin el mock.

#### 3C-2 — Paginar lectura completa de `sync-down.ts` (con desempate estable)

1. **Problema:** F9 — `.limit(5000)` en `syncTableDown`
   (`sync-down.ts:29-66`), 9 tablas de `TABLE_SCHEMAS`. Un desempate
   estable en el `ORDER BY` no hace segura la
   paginación por `OFFSET` (lo que hace `.range()` de supabase-js
   internamente) — si se inserta o borra una fila entre dos páginas
   consultadas, las filas siguientes se desplazan y `OFFSET` recalcula desde
   cero cada vez, así que una fila puede quedar duplicada (si se borró algo
   antes del offset) u omitida (si se insertó algo antes del offset), sin
   importar cuán estable sea el `ORDER BY`. El fix real es paginar por
   keyset (continuar desde el último valor leído con `WHERE (col, pk) <
   (último, último_pk)`), igual técnica que 3B-5/3B-6.
2. **Decisión:** reemplazar `.limit(5000)` por un loop de **keyset**, no de
   `.range()`. `cuentas_cobrar`/`cuentas_pagar`
   SÍ tienen columna `created_at` real en Postgres (confirmado en
   `db/migrations/20260410_cuentas_cobrar_completa.sql:41,63` y
   `20260410_cuentas_pagar_estados.sql:37,59`), pero **no** aparece en
   `schema.columns` de `TABLE_SCHEMAS` (esa lista son las columnas que se
   exportan a la pestaña de Sheets, no todas las columnas de la tabla —
   confirmado leyendo `schema.ts`). Un diseño que hiciera
   `.select(schema.columns.join(', '))` y luego intentara leer
   `last[schema.orderBy ?? 'created_at']` del resultado fallaría — para esas 2
   tablas, `created_at` nunca viajaría en la fila seleccionada, así que el
   cursor quedaría `undefined` después de la primera página y el loop no
   avanzaría (bucle infinito repitiendo la misma página, o corte falso
   según cómo compare `.or()` un valor `undefined`). El `select` debe pedir
   siempre la columna de cursor (y el `pk`) aunque no esté en
   `schema.columns` — el mapeo a filas de Sheets sigue iterando solo
   `schema.columns`, así que una columna extra seleccionada nunca se filtra
   hacia la hoja, solo se usa para el cursor. **3C-2 implementa ÚNICAMENTE el keyset — sin ningún parámetro de
   heartbeat.** Ese parámetro `onHeartbeat`/tipo `SyncHeartbeat` se define
   recién en 3C-3 — si 3C-2 se mergea como
   su propio PR (el grafo de dependencias los declara secuenciales, PRs
   separados) antes de que exista 3C-3, código que ya lo usara no compilaría
   (`assertHeartbeatOk` sería un identificador indefinido). 3C-2 deja
   `syncTableDown` sin ningún parámetro de heartbeat — 3C-3 es quien, en su
   propio PR, modifica esta misma función (ya mergeada) para agregarle el
   parámetro `onHeartbeat`/tipo `SyncHeartbeat` y la llamada a
   `assertHeartbeatOk` (ver 3C-3, que declara ese cambio explícitamente
   sobre el código que 3C-2 ya dejó):
   ```ts
   async function syncTableDown(spreadsheetId, schema) {
     const PAGE_SIZE = 1000
     const cursorCol = schema.orderBy ?? 'created_at'
     // El select siempre incluye la columna de cursor y el pk, aunque no
     // estén en schema.columns (ej. cuentas_cobrar/cuentas_pagar no
     // exportan created_at a Sheets pero sí la tienen en Postgres) --
     // dedupe con un Set por si orderBy/pk ya están en columns.
     const selectCols = [...new Set([...schema.columns, cursorCol, schema.pk])]
     let rows = []
     let cursorOrderVal = null
     let cursorPk = null
     while (true) {
       let query = supabaseAdmin
         .from(schema.table)
         .select(selectCols.join(', '))
         .order(cursorCol, { ascending: true })
         .order(schema.pk, { ascending: true })
         .limit(PAGE_SIZE)
       if (cursorOrderVal !== null && cursorPk !== null) {
         query = query.or(`${cursorCol}.gt.${cursorOrderVal},and(${cursorCol}.eq.${cursorOrderVal},${schema.pk}.gt.${cursorPk})`)
       }
       const { data, error } = await query
       if (error) throw error
       if (!data || data.length === 0) break
       rows.push(...data) // fila completa incluida cursorCol/pk aunque no vayan a Sheets -- el mapeo posterior filtra por schema.columns
       if (data.length < PAGE_SIZE) break
       const last = data[data.length - 1]
       cursorOrderVal = last[cursorCol]
       cursorPk = last[schema.pk]
     }
     // ... resto de syncTableDown (construir filas para Sheets mapeando
     // solo schema.columns -- nunca selectCols -- , overwriteSheet) igual que hoy
   }
   ```
   `schema.ts` no necesita ningún cambio — `selectCols` se calcula en
   `sync-down.ts` a partir de lo que `schema.ts` ya expone (`columns`,
   `orderBy`, `pk`), sin tocar `TABLE_SCHEMAS`.
3. **Comportamiento a preservar:** mismo shape de columnas, mismo
   comportamiento de `overwriteSheet` (sobrescribe la pestaña completa,
   ahora sin truncar y sin el riesgo de duplicar/omitir filas bajo
   inserciones/borrados concurrentes).
4. **Archivos exactos:** `lib/integrations/sheets/sync-down.ts` (función
   `syncTableDown`, reemplaza `.range()` por el loop de keyset de arriba).
5. **Modificados:** ese archivo (no hace falta tocar `schema.ts`).
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3C-1 (secuenciado, no técnico). **Salientes:**
   3C-3.
8. **Orden:** después de 3C-1.
9. **Riesgo:** P1.
10. **Pruebas:** unitaria con mock de Supabase que devuelve >1000 filas en
    páginas simuladas, confirma acumulación completa; **prueba de
    concurrencia simulada:** insertar una fila entre 2 llamadas de página
    mockeadas de forma que un `.range()` habría duplicado/omitido una fila,
    confirmar que el keyset no lo hace (cada página filtra estrictamente
    por encima del último cursor leído, no por posición); **prueba
    específica para `cuentas_cobrar`/`cuentas_pagar`:** mock de
    2 páginas para uno de esos 2 schemas (cuyo `columns` no incluye
    `created_at`), confirma que `selectCols` sí pide `created_at` aunque no
    esté en `columns`, que el cursor avanza correctamente entre páginas
    (no queda `undefined`), y que las filas de Sheets construidas al final
    NO incluyen `created_at` como columna extra (el mapeo sigue filtrando
    por `schema.columns` exacto).
11. **Criterio de aceptación:** los tests del punto 10 pasan, incluida la
    prueba de concurrencia simulada y la prueba específica de
    `cuentas_cobrar`/`cuentas_pagar`.
12. **Rollback:** revertir a `.limit(5000)`.
13. **Horas:** 8-9h (sube por el fix de columnas de cursor ausentes de
    `schema.columns` en `cuentas_cobrar`/`cuentas_pagar`, con su test
    dedicado).
14. **Tamaño:** chico-mediano, 1 PR.
15. **Evidencia:** los tests del punto 10, incluida la prueba de
    concurrencia simulada y la de columnas de cursor.

#### 3C-3 — Lock de Sheets con lease, renovación, recuperación de huérfanos, auth y sin error crudo expuesto

1. **Problema:** F11 — diseños previos de este plan tenían: lease sin
   renovación (una sync de 9 tablas puede tardar más de 600s y otro proceso
   reclama el lock a medio trabajo); `acquire` podía no devolver `false`
   real con 0 filas afectadas (una función `LANGUAGE sql` con `RETURNING`
   sobre 0 filas no produce ninguna fila, no un valor `false`); sin función
   de renovación; endpoint de estado sin autenticación; error técnico
   guardado/expuesto crudo; y pasar `gen_random_uuid()` como si fuera
   invocable desde TypeScript (es una función SQL, no algo que TS pueda
   "llamar" al construir el payload de un `rpc()`).
2. **Decisión — schema y funciones corregidas:**
   ```sql
   CREATE TABLE IF NOT EXISTS sheets_sync_status (
     id boolean PRIMARY KEY DEFAULT true CHECK (id),
     state text NOT NULL DEFAULT 'idle' CHECK (state IN ('idle','running','error')),
     run_id uuid,
     started_at timestamptz,
     lease_expires_at timestamptz,
     finished_at timestamptz,
     triggered_by text,
     rows_synced integer,
     tables_failed integer,
     error_message text
   );
   INSERT INTO sheets_sync_status (id) VALUES (true) ON CONFLICT DO NOTHING;
   -- Esta tabla se crea con RLS, mismo patrón que
   -- loadtest_runs/idempotency_keys/pago_operations que sí lo tienen desde
   -- su propia migración. Sin políticas, solo `service_role` (que bypasea
   -- RLS) accede.
   ALTER TABLE public.sheets_sync_status ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON public.sheets_sync_status FROM PUBLIC, anon, authenticated;
   GRANT ALL ON public.sheets_sync_status TO service_role;

   CREATE OR REPLACE FUNCTION public.acquire_sheets_sync_lock(p_run_id uuid, p_triggered_by text, p_lease_seconds int DEFAULT 600)
   RETURNS boolean
   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
   AS $$
   DECLARE v_rows int;
   BEGIN
     UPDATE sheets_sync_status
     SET state = 'running', run_id = p_run_id, started_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         -- Reiniciar también rows_synced/tables_failed al adquirir -- si
         -- no, una corrida nueva que falla antes de llamar
         -- release_sheets_sync_lock dejaría los conteos de la corrida
         -- ANTERIOR visibles en /status como si fueran de esta.
         triggered_by = p_triggered_by, finished_at = NULL, error_message = NULL,
         rows_synced = NULL, tables_failed = NULL
     WHERE state != 'running' OR lease_expires_at < now();
     GET DIAGNOSTICS v_rows = ROW_COUNT;
     RETURN v_rows > 0;
   END;
   $$;

   CREATE OR REPLACE FUNCTION public.renew_sheets_sync_lease(p_run_id uuid, p_lease_seconds int DEFAULT 600)
   RETURNS boolean
   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
   AS $$
   DECLARE v_rows int;
   BEGIN
     UPDATE sheets_sync_status
     SET lease_expires_at = now() + make_interval(secs => p_lease_seconds)
     WHERE run_id = p_run_id AND state = 'running';
     GET DIAGNOSTICS v_rows = ROW_COUNT;
     RETURN v_rows > 0;
   END;
   $$;

   CREATE OR REPLACE FUNCTION public.release_sheets_sync_lock(p_run_id uuid, p_state text, p_rows_synced int, p_tables_failed int, p_error_message text)
   RETURNS boolean
   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
   AS $$
   DECLARE v_rows int;
   BEGIN
     -- Validar el estado permitido para un release (nunca 'running' --
     -- eso solo lo pone acquire_sheets_sync_lock) y limpiar
     -- lease_expires_at -- una vez liberado el lock, ese lease ya no
     -- significa nada; dejarlo con un valor viejo podría confundir una
     -- lectura de /status que no revise `state` primero.
     IF p_state NOT IN ('idle', 'error') THEN
       RAISE EXCEPTION 'release_sheets_sync_lock: estado % no permitido -- solo idle/error', p_state;
     END IF;
     UPDATE sheets_sync_status
     SET state = p_state, finished_at = now(), rows_synced = p_rows_synced,
         tables_failed = p_tables_failed, error_message = p_error_message,
         lease_expires_at = NULL
     WHERE run_id = p_run_id;
     GET DIAGNOSTICS v_rows = ROW_COUNT;
     RETURN v_rows > 0;
   END;
   $$;
   REVOKE EXECUTE ON FUNCTION public.acquire_sheets_sync_lock(uuid, text, int) FROM PUBLIC, anon, authenticated;
   REVOKE EXECUTE ON FUNCTION public.renew_sheets_sync_lease(uuid, int) FROM PUBLIC, anon, authenticated;
   REVOKE EXECUTE ON FUNCTION public.release_sheets_sync_lock(uuid, text, int, int, text) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.acquire_sheets_sync_lock(uuid, text, int) TO service_role;
   GRANT EXECUTE ON FUNCTION public.renew_sheets_sync_lease(uuid, int) TO service_role;
   GRANT EXECUTE ON FUNCTION public.release_sheets_sync_lock(uuid, text, int, int, text) TO service_role;
   ```
   **`run_id` se genera en Node** (`const runId = crypto.randomUUID()`,
   global de Node ≥19/el runtime de Next) y se pasa como parámetro — nunca
   un literal `gen_random_uuid()` armado desde TS.
   **Firma del heartbeat — corregida para que un lease
   perdido detenga la escritura a Sheets, no siga en silencio:** un diseño
   anterior llamaba `onHeartbeat()` sin mirar su resultado — si
   `renew_sheets_sync_lease` devuelve `false` (otro proceso ya reclamó el
   lock porque el lease expiró), el proceso viejo seguía escribiendo en el
   MISMO spreadsheet que el nuevo dueño, pudiendo corromper filas a medio
   sobrescribir entre los dos. El heartbeat ahora devuelve `boolean` y
   `sync-down.ts` aborta si es `false`. **Este bloque es quien agrega
   `SyncHeartbeat`/`assertHeartbeatOk`/`SheetsSyncLeaseLostError` y el
   parámetro `onHeartbeat` a `syncTableDown`/`syncAllDown` — 3C-2 (ya
   mergeado en este punto) los dejó sin ningún parámetro de heartbeat,
   precisamente para no depender de código que todavía no existía en su
   propio PR:**
   ```ts
   // lib/integrations/sheets/sync-down.ts
   export type SyncHeartbeat = () => Promise<boolean> // true = lease vigente, false = perdido

   export class SheetsSyncLeaseLostError extends Error {}

   async function assertHeartbeatOk(onHeartbeat: SyncHeartbeat): Promise<void> {
     const stillOwns = await onHeartbeat()
     if (!stillOwns) {
       throw new SheetsSyncLeaseLostError('Lease de sync de Sheets perdido a medio camino -- abortando para no escribir sobre el nuevo dueño del lock')
     }
   }

   async function syncTableDown(
     spreadsheetId: string,
     schema: TableSchema,
     onHeartbeat?: SyncHeartbeat,
   ): Promise<SyncDownResult> {
     const { tab, table } = schema
     try {
       // ... (loop de páginas por keyset de 3C-2) ...
       while (true) {
         // ... query de la página (3C-2) ...
         rows.push(...(data ?? []))
         if (onHeartbeat) await assertHeartbeatOk(onHeartbeat) // renueva y verifica tras CADA página
         if (!data || data.length < PAGE_SIZE) break
         // ... avanzar cursor (3C-2) ...
       }
       // ... resto igual (construir filas para Sheets, overwriteSheet) ...
       return { tab, table, rows: rows.length, ok: true }
     } catch (err: unknown) {
       // El catch real de sync-down.ts (código actual, confirmado)
       // envuelve TODO el cuerpo de la función y convierte cualquier
       // excepción en {ok:false, error}, sin distinguir tipos -- si
       // assertHeartbeatOk lanza SheetsSyncLeaseLostError dentro del loop
       // de arriba, ESTE mismo catch la atraparía y la convertiría en un
       // resultado parcial normal, nunca llegaría a syncAllDown/la ruta
       // para producir el 409 descrito. Por eso se relanza ANTES de la
       // conversión genérica -- es la única excepción que este catch
       // nunca absorbe.
       if (err instanceof SheetsSyncLeaseLostError) throw err
       const message = err instanceof Error ? err.message : String(err)
       console.error(`[Sheets/sync-down] ERROR en ${tab}:`, message)
       return { tab, table, rows: 0, ok: false, error: message }
     }
   }

   export async function syncAllDown(spreadsheetId: string, onHeartbeat?: SyncHeartbeat): Promise<SyncDownSummary> {
     for (const schema of TABLE_SCHEMAS) {
       const result = await syncTableDown(spreadsheetId, schema, onHeartbeat) // propaga SheetsSyncLeaseLostError sin capturarla -- syncAllDown no tiene try/catch propio
       results.push(result)
       if (onHeartbeat) await assertHeartbeatOk(onHeartbeat) // y también entre tablas
     }
     // ... resto igual ...
   }
   ```
   `app/api/integrations/sheets/sync-down/route.ts` llama
   `acquire_sheets_sync_lock`, luego `syncAllDown(spreadsheetId, async () =>
   { const { data, error } = await supabaseAdmin.rpc('renew_sheets_sync_lease', {
   p_run_id: runId, p_lease_seconds: 600 }); if (error) throw error; return
   data === true })` — **destructurar `error` explícitamente y no solo
   `data` importa: un diseño que ignorara `error` de la
   llamada RPC (red, Postgres caído, timeout) devolvería `data ===
   undefined`, indistinguible de un lease genuinamente perdido (`data ===
   false`) — ambos casos producirían el mismo 409 "otra
   sincronización tomó el control", ocultando un problema de
   infraestructura detrás de un mensaje de negocio incorrecto.** Un error de la llamada se relanza tal cual (nunca se convierte en `false`),
   y `assertHeartbeatOk` distingue los 2 casos explícitamente:
   ```ts
   async function assertHeartbeatOk(onHeartbeat: SyncHeartbeat): Promise<void> {
     const stillOwns = await onHeartbeat() // puede lanzar si la RPC falló -- eso se propaga tal cual, no se envuelve
     if (!stillOwns) {
       throw new SheetsSyncLeaseLostError('Lease de sync de Sheets perdido a medio camino -- abortando para no escribir sobre el nuevo dueño del lock')
     }
   }
   ```
   La renovación (y su verificación) ocurre tras cada página de cada tabla
   (potencialmente varias veces por tabla si la tabla tiene miles de filas,
   ej. `items_cotizacion` con el volumen de 3A-3) y entre tablas, nunca solo
   una vez al final de las 9. **Si `syncAllDown` lanza
   `SheetsSyncLeaseLostError`** (lease genuinamente perdido — `renew`
   respondió `false` sin error): la ruta lo captura por separado del resto
   de errores — **no llama `release_sheets_sync_lock`** (ya no es dueña del
   lock, el `run_id` guardado en la tabla ya es de otro proceso; llamar
   `release` con su propio `run_id` viejo no afectaría esa fila igual, pero
   omitirlo es más claro), loguea el evento con `requestId`, y responde 409
   ("otra sincronización tomó el control, reintentar") al cliente. **Si el
   fallo real es de la propia llamada RPC de renovación** (ahora relanzado
   tal cual por el heartbeat en vez de convertido en `false`), su destino
   depende de dónde ocurrió, pero en ningún caso se confunde con un lease
   perdido: si ocurrió dentro del loop de páginas de una tabla (dentro de
   `syncTableDown`), el catch de esa función (3C-2, corregido para
   relanzar solo `SheetsSyncLeaseLostError`) lo absorbe como el fallo de
   ESA tabla — se refleja en `summary.errors`/`tables_failed`, la
   sincronización sigue con la tabla siguiente, y la ruta llama
   `release_sheets_sync_lock` con `p_state = 'error'`; si ocurrió en el
   heartbeat **entre tablas** (el de `syncAllDown`, que no tiene su propio
   try/catch), se propaga sin capturar hasta el catch genérico de la ruta,
   que responde 500 vía `buildErrorResponse`. Ninguno de los 2 caminos
   produce el 409 reservado para un lease genuinamente perdido. Si
   `syncAllDown` termina normalmente, la ruta llama `release_sheets_sync_lock`
   con `p_state = summary.errors > 0 ? 'error' : 'idle'` y
   **`p_error_message` construido por la propia ruta como resumen seguro**
   (ej. `` `${summary.errors} de ${summary.results.length} tablas
   fallaron: ${nombresDeLasQueFallaron.join(', ')}` ``) — **nunca** el
   `error`/`message` crudo de la API de Sheets o de Postgres (ese detalle
   técnico va solo a `console.error`/logger, con `requestId`, igual que el
   resto del repo desde EF-2 1E-2). `GET
   /api/integrations/sheets/status` (nuevo) exige `requireAnySection(['cotizaciones'])`
   — la misma auth que ya tiene `POST /sync-down` — antes de responder;
   nunca público. `AdminSheets.tsx` muestra un estado "parcial, revisar"
   distinto del verde de éxito cuando `state==='error'`.
3. **Comportamiento a preservar:** `syncTableDown()`/`syncAllDown()`
   conservan su lógica interna de paginación (3C-2, ahora keyset) y su
   shape de retorno — el parámetro `onHeartbeat` es opcional (`undefined`
   fuera de este flujo se comporta exactamente igual que antes de este
   bloque, sin verificación).
4. **Archivos exactos:** nueva migración (tabla + 3 funciones);
   `lib/integrations/sheets/sync-down.ts` (agregar `SyncHeartbeat`,
   `assertHeartbeatOk`, `SheetsSyncLeaseLostError`, y el parámetro
   `onHeartbeat` a `syncTableDown`/`syncAllDown`);
   `app/api/integrations/sheets/sync-down/route.ts`;
   `app/api/integrations/sheets/status/route.ts` (nuevo);
   `app/admin/components/AdminSheets.tsx`.
5. **Nuevos:** 1 migración, `status/route.ts`. **Modificados:**
   `sync-down.ts`, `sync-down/route.ts`, `AdminSheets.tsx`.
6. **Migración/RPC:** las 3 funciones de arriba.
7. **Dependencias entrantes:** 3C-2. **Salientes:** 3C-4.
8. **Orden:** después de 3C-2.
9. **Riesgo:** P1.
10. **Pruebas:** unitaria de `acquire`/`release` garantizando `boolean` real
    incluso con 0 filas afectadas (mock de `GET DIAGNOSTICS`/conteo real
    contra `serenata-erp-test`); test de `syncTableDown` con mock de una
    tabla de 3 páginas, confirmando que `assertHeartbeatOk` se invoca 3
    veces (una por página) más 1 vez al terminar la tabla en `syncAllDown` —
    **no una sola vez al final de las 9 tablas**; test de renovación real
    (simular una sync de >600s con `renew` llamado a mitad vía el
    heartbeat, confirmar que otro `acquire` no lo reclama antes de que el
    lease renovado expire); test de huérfano real (lease vencido sin
    renovación, otro proceso SÍ lo reclama, y el proceso viejo que intenta
    liberar tarde con su `run_id` ya no afecta el estado del nuevo dueño);
    **test de aborto por lease perdido (también cierra el bug del catch de `syncTableDown`):** mock de `onHeartbeat` que devuelve
    `false` en la 2ª página de una tabla de 3 páginas — confirmar que
    `syncTableDown` **relanza** `SheetsSyncLeaseLostError` (no la absorbe
    en su catch genérico junto con cualquier otro error) inmediatamente
    (no sigue leyendo la 3ª página ni escribe a Sheets), y que la ruta
    responde 409 sin llamar `release_sheets_sync_lock`; **test para
    distinguir lease perdido de fallo real de la RPC de renovación:** mock de
    `supabaseAdmin.rpc('renew_sheets_sync_lease', ...)` devolviendo
    `{data: null, error: {message: 'timeout'}}` (falla la llamada, no
    "lease perdido") en la 2ª página de una tabla — confirmar que el
    heartbeat relanza ese error (no lo convierte en `false`), que
    `syncTableDown` lo absorbe como fallo de esa tabla (`{ok:false}`, no
    `SheetsSyncLeaseLostError`) y la sincronización sigue con la tabla
    siguiente, y que la ruta responde `p_state='error'`/500 según
    corresponda — **nunca 409** para este caso; mismo mock pero disparado
    en el heartbeat **entre tablas** de `syncAllDown` — confirmar que ahí
    sí se propaga sin capturar hasta el catch genérico de la ruta (500 vía
    `buildErrorResponse`), nunca 409; **test para
    `release_sheets_sync_lock`:** llamarla con `p_state='running'` —
    confirmar que lanza excepción (estado no permitido); confirmar que
    tras un `release` exitoso, `lease_expires_at` queda `NULL`; confirmar
    que un `acquire` posterior sobre un run distinto no hereda
    `rows_synced`/`tables_failed` de la corrida anterior; `GET /status` sin sesión → 401/403;
    `error_message` nunca contiene el string crudo de un error simulado de
    Sheets (solo el resumen seguro); confirmar que `anon`/`authenticated`
    no pueden leer ni escribir `sheets_sync_status` (RLS habilitado, sin
    políticas) mientras `service_role` sí puede.
11. **Criterio de aceptación:** los 11 casos del punto 10 pasan
    determinísticamente.
12. **Rollback:** revertir el PR; tabla queda sin uso si se revierte el
    código.
13. **Horas:** 23-26h (sube por el aborto verificado en el heartbeat +
    corregir el catch de `syncTableDown` para relanzar
    `SheetsSyncLeaseLostError` antes de su conversión genérica a
    `{ok:false}` + distinguir lease perdido de fallo real de RPC + RLS +
    limpieza de `lease_expires_at`/validación de estado/reinicio de
    métricas en `release`/`acquire`).
14. **Tamaño:** grande, 1 PR.
15. **Evidencia:** los 11 tests del punto 10, incluido el conteo exacto de
    invocaciones de `onHeartbeat`.

#### 3C-4 — Retención de `rate_limits` + safety-net diario de Sheets (vía el lock compartido)

1. **Problema:** F15 — `rate_limits`
   (`db/migrations/20260909_rate_limits.sql`) sin política de retención;
   además, decisión pendiente de una red de seguridad periódica para Sheets
   ahora que se elimina el intento de tiempo-casi-real (3C-1). Además,
   ninguna medición real respalda que `syncAllDown()` corriendo contra el
   volumen objetivo quepa dentro de un `maxDuration` de función serverless
   — sin esa medición, el safety-net podría estar diseñado sobre una
   premisa falsa (que las 9 tablas siempre caben en una sola invocación).
2. **Decisión:** en `app/api/keep-alive/route.ts`, agregar `export const
   maxDuration = 60` (mismo patrón ya usado por
   `generar-orden-pago`/`generar-pdf`, ambos con `export const maxDuration
   = 60` confirmado — confirma que el plan de Vercel en
   uso soporta al menos 60s por invocación) y `DELETE FROM rate_limits
   WHERE window_start < now() - interval '24 hours'` (24h, muy por encima
   de las ventanas reales de 15min/1h usadas hoy), **mismo patrón try/catch
   best-effort que la limpieza de `idempotency_keys` ya existente
   (líneas 39-56) — pero no la misma query: el precedente real de
   `idempotency_keys` filtra por `created_at < now() - interval '7 days'
   AND status_code IS NOT NULL` (columna `created_at`, retención de 7
   días, y excluye filas pendientes a propósito, confirmado leyendo
   `keep-alive/route.ts:39-56`) — `window_start` es una columna real de
   `rate_limits`, la tabla que este bloque sí limpia, nunca de
   `idempotency_keys`.** El safety-net de Sheets: genera `const runId =
   crypto.randomUUID()`, llama `acquire_sheets_sync_lock(runId,
   'cron:keep-alive', 600)` — si no lo consigue (sync manual en curso o
   lease de otro cron vivo), se salta esa corrida silenciosamente
   (best-effort); si lo consigue, corre `syncAllDown(spreadsheetId,
   heartbeat)` con el mismo callback de renovación por página de 3C-3
   (`assertHeartbeatOk` en cada página, ver 3C-3), y libera con el mismo
   criterio de éxito/parcial.

   **Validación obligatoria de duración contra el volumen objetivo, con
   remediación ya decidida (no "a definir") si falla:** antes de aceptar
   el safety-net diario como solución cerrada, se mide **empíricamente**
   cuánto tarda `syncAllDown()` corriendo contra `serenata-erp-test` ya
   sembrado al volumen objetivo de 3A-3 (`items_cotizacion`≥5,500, el
   resto≥1,200), en el entorno serverless real de 3A-1, con
   `maxDuration=60`. Se exige que la medición quede por debajo de 50s
   (margen de 10s). Si pasa: el safety-net queda como está, corriendo una
   vez al día vía el cron ya existente de `vercel.json`
   (`{"crons":[{"path":"/api/keep-alive","schedule":"0 8 * * *"}]}`, sin
   cambios a ese archivo).

   **Si la medición supera los 50s (mismo
   modelo simplificado que 3B-7/3D-0: 3C-4 cierra igual, `Cerrado`, una vez
   que retención+safety-net+medición están entregados — nada fuera de este
   bloque depende de que el safety-net quepa en una sola invocación,
   `Salientes: ninguna` en el punto 7)**, se agrega el hallazgo `F15b` a la matriz (sección 4) con
   la medición real adjunta, y se abre una fila nueva `3C-4b` en el
   tracker — bloque correctivo con su propia especificación de 15 puntos —
   que se resuelve, antes de cerrar EF-3 (nunca en silencio, mismo
   criterio que F14b/`3B-7b`), con este procedimiento ya decidido, en 2
   pasos fijos, sin decisiones de diseño pendientes al momento de
   ejecutarlo:
   - **Paso (a) — subir el techo:** subir `maxDuration` al máximo que el
     plan de Vercel en uso permita (verificar el límite real del plan
     contratado, documentado en `docs/ENV.md`, en vez de asumir un
     número) y volver a medir. Si con ese `maxDuration` la medición baja
     de (nuevo_maxDuration − 10s), el safety-net queda así, sin tocar más
     nada.
   - **Paso (b) — chunking determinista, solo si (a) no alcanza:** nueva
     migración agrega `next_table_index int NOT NULL DEFAULT 0` a
     `sheets_sync_status` (la tabla de 3C-3). `vercel.json` cambia el cron
     de `keep-alive` de diario a horario:
     `{"crons":[{"path":"/api/keep-alive","schedule":"0 * * * *"}]}`. La
     llamada a `syncAllDown` se reemplaza por una nueva
     `syncTablesChunk(spreadsheetId, heartbeat, startIndex, chunkSize)`
     que procesa como máximo `chunkSize` tablas de `TABLE_SCHEMAS`
     empezando en el índice `startIndex` (orden fijo del array, nunca
     reordenado), y devuelve el índice siguiente
     (`(startIndex + tablasProcesadas) % TABLE_SCHEMAS.length`). La ruta
     lee `next_table_index` de `sheets_sync_status` antes de adquirir el
     lock, pasa `CHUNK_TABLES = 3` como `chunkSize` (constante fija, no
     configurable por env var), y al terminar (éxito o parcial) escribe
     el índice devuelto de vuelta en `next_table_index` como parte del
     mismo `UPDATE` que ya hace `release_sheets_sync_lock` (columna
     agregada al `UPDATE` existente, mismo commit de esa función). El
     lock se libera al final de cada invocación exactamente igual que
     hoy — nunca se mantiene abierto entre una invocación horaria y la
     siguiente. Con `CHUNK_TABLES=3` sobre 9 tablas, un ciclo completo
     (las 9 tablas sincronizadas al menos una vez) se completa en 3
     invocaciones horarias, es decir, en un plazo peor-caso de ~3 horas —
     muy por debajo de cualquier ventana de staleness aceptable para un
     espejo de solo consulta como Sheets.

     **Paso (c) — reanudación por cursor dentro de una sola tabla, solo si
     (b) tampoco alcanza (bajar `CHUNK_TABLES` a
     1 no resuelve nada si el cuello de botella es UNA tabla que por sí
     sola ya excede el margen — el paso (b) por sí solo asume que el
     problema siempre es "demasiadas tablas por invocación", nunca "una
     tabla demasiado grande"):** si la medición de la tabla más grande
     (`items_cotizacion`, al volumen objetivo de 3A-3) por sí sola, aislada
     con `CHUNK_TABLES=1`, sigue sin caber en el margen, `next_table_index`
     deja de ser suficiente — se agrega una segunda columna a
     `sheets_sync_status` (misma migración del paso (b)):
     `next_page_cursor jsonb` (`{orderVal, pk}` o `null`, mismo shape que
     el cursor de keyset de 3C-2). `syncTablesChunk` recibe además
     `resumeCursor` y, para la tabla en curso, arranca el loop de páginas
     de `syncTableDown` (3C-2) desde ese cursor en vez de desde el
     principio; si el heartbeat/deadline interno de la invocación se
     agota a mitad de una tabla, la invocación persiste el cursor de la
     última página completada en `next_page_cursor` (junto con
     `next_table_index` sin avanzar — sigue siendo la misma tabla) y
     retorna; la siguiente invocación horaria retoma exactamente esa
     página. Al completar la última página de una tabla, `next_page_cursor`
     vuelve a `null` y `next_table_index` avanza normalmente al esquema
     siguiente (mismo mecanismo del paso (b)). Con esto, ninguna tabla —
     sin importar su volumen — puede exceder el margen: en el peor caso
     una tabla enorme se sincroniza a lo largo de varias invocaciones
     horarias en vez de en una sola, pero cada invocación individual sigue
     cabiendo en `maxDuration`.
3. **Comportamiento a preservar:** el keep-alive sigue respondiendo
   200/500 según Supabase/Drive exactamente igual que hoy — Sheets nunca es
   parte de ese `ok` boolean; si el paso (b) de la remediación llega a
   activarse, la limpieza de `rate_limits`/`idempotency_keys` sigue
   corriendo en cada invocación (horaria), sin depender de en qué punto
   del ciclo de 9 tablas esté Sheets.
4. **Archivos exactos:** `app/api/keep-alive/route.ts`; **si y solo si
   F15b se activa (paso (b), y `next_page_cursor` además si hace falta el
   paso (c)):** nueva migración (columnas `next_table_index` y, si el
   paso (c) se activa, `next_page_cursor`);
   `lib/integrations/sheets/sync-down.ts` (nueva `syncTablesChunk`, sin
   modificar `syncTableDown`/`syncAllDown` existentes — `syncTablesChunk`
   las reutiliza internamente sobre un subconjunto de `TABLE_SCHEMAS`, y
   si el paso (c) se activa, pasa `resumeCursor` al loop de páginas de
   `syncTableDown`); `vercel.json` (cron a horario).
5. **Modificados:** `app/api/keep-alive/route.ts` (siempre); los 3
   archivos adicionales del punto 4, solo si F15b se activa.
6. **Migraciones/RPC:** ninguna nueva para el alcance base — reutiliza las
   de 3C-3; las columnas `next_table_index`/`next_page_cursor` son la
   única migración nueva, y solo si F15b se activa.
7. **Dependencias entrantes:** 3C-3. **Salientes:** ninguna.
8. **Orden:** después de 3C-3.
9. **Riesgo:** P2 (retención) / P1 (safety-net); **P0 condicional** si la
   medición de duración no pasa el margen de 50s (activa F15b).
10. **Pruebas:** extender `app/api/__tests__/keep-alive-route.test.ts` con:
    borra solo `rate_limits` viejas, un fallo no tumba el keep-alive; se
    salta si no adquiere el lock; adquiere+corre+libera con éxito/parcial; y
    la **medición empírica de duración** descrita arriba, documentada con el
    número exacto obtenido y si pasó o no el margen de 50s. **Si F15b se
    activa además:** test de `syncTablesChunk` con mock de `TABLE_SCHEMAS`
    de 9 elementos, `chunkSize=3`, confirmando que 3 invocaciones
    sucesivas (índices 0, 3, 6) cubren las 9 tablas exactamente una vez
    cada una y el índice vuelve a 0 en la 4ª invocación (ciclo cerrado);
    test de que `next_table_index` se persiste correctamente incluso
    cuando una invocación termina en estado `'error'` parcial (el avance
    de índice no depende de que la invocación haya sido 100% exitosa).
11. **Criterio de aceptación:** los tests del punto 10 pasan; el test
    existente de `idempotency_keys` sigue en verde sin modificarse; la
    medición de duración pasa el margen — 3C-4 cierra (`Cerrado`) en
    cualquiera de los 2 casos; si no pasa, `F15b`/`3C-4b` se crean como
    fila independiente del tracker con la medición adjunta, y se
    resuelve con los pasos (a)/(b) ya decididos arriba (nunca con un
    diseño nuevo a definir en el momento), sin condicionar el cierre de
    3C-4 mismo.
12. **Rollback:** revertir las secciones agregadas a `keep-alive/route.ts`;
    si F15b se activó, revertir también la migración de `next_table_index`,
    `syncTablesChunk` y el cron de `vercel.json` a diario.
13. **Horas:** 8-9h para el alcance base (sube por la medición empírica
    obligatoria); +6-8h adicionales si F15b se activa y hay que
    implementar el paso (b) (tratado como bloque de remediación separado
    en el tracker, no absorbido en las horas base de 3C-4).
14. **Tamaño:** chico-mediano, 1 PR para el alcance base; +1 PR propio para
    la remediación F15b si se activa.
15. **Evidencia:** tests del punto 10 + la medición de duración con
    resultado pasa/no-pasa explícito; si F15b se activa, además el test de
    ciclo de `syncTablesChunk` y la medición post-remediación confirmando
    que sí queda por debajo del margen.

---

### EF-3D — Mantenibilidad

#### 3D-0 — Characterization tests de `page.tsx` (incluye la interacción flush/reconciliación auditada)

1. **Problema:** `tests/e2e/critical`/`tests/e2e/live` prueban resultado
   final, no la secuencia interna de drenado/retry/unmount que un refactor
   puede romper sin que el resultado final cambie en un test corto.
   **Auditado:** `reconciliacionEnCursoRef`
   (`page.tsx:784,788,897,901`) es un guard interno de
   `reconciliarConServidor` — confirmado por grep completo del archivo que
   **ningún** otro código (`flushPendingSaves`, `aprobar`, `generarPDF`,
   `generarCotizacion`, `cancelarCotizacion`) lo lee ni lo espera. No hay
   sincronización explícita hoy entre una reconciliación en vuelo y una
   transición de negocio — eso es el comportamiento real a documentar antes
   de tocar el archivo, no algo que "se verifique al implementar".
2. **Decisión:** nuevo archivo
   `app/cotizaciones/[id]/__tests__/page-autosave-characterization.test.tsx`,
   `@testing-library/react` (`render`/`renderHook`, ya en `package.json`
   como `^16.3.3`) + `vi.useFakeTimers()` + mocks de `fetch` con control
   fino de resolución, contra el `page.tsx` actual sin modificar. **12
   casos con ID individual:**
   - **T1** Autosave General: debounce de 800ms dispara el PATCH esperado.
   - **T2** Autosave Totales: ídem.
   - **T3** Autosave Notas: ídem.
   - **T4** Autosave celda de item: ídem.
   - **T5** Drenado: segunda edición de la misma celda mientras el PATCH
     anterior sigue en vuelo → no dispara un segundo fetch en paralelo,
     dispara una ronda más al resolver el primero.
   - **T6** Retry: forzar `itemCellRetryNeededRef` y confirmar exactamente
     1 ronda adicional.
   - **T7** Conflicto en Notas (grupo de 1 campo): 409 → banner de
     conflicto, `'usar'` revierte el campo, `'mantener'` reintenta con
     `base` refrescada.
   - **T8** Conflicto en Totales (grupo multi-campo): 409 → banner de
     conflicto, `'usar'` revierte todo el grupo, `'mantener'` reintenta el
     grupo completo con `base` refrescada.
   - **T9** Unmount: desmontar con PATCH/drenado en vuelo → sin warning de
     React, sin timer colgado.
   - **T10** Flush-before-transition: `aprobar()` con campo dirty → el
     flush se resuelve antes que el fetch de `approve_cotizacion`.
   - **T11** Interleaving, orden A — la reconciliación resuelve antes que
     el flush: disparar una
     reconciliación (simulando un evento
     `general_confirmed` recibido por Presence) que quede en vuelo (mock de
     `fetch` de la relectura sin resolver todavía), invocar
     `aprobar()` con un campo General dirty pendiente, y resolver la
     reconciliación ANTES que el flush del paso de aprobar. **Predicción
     cerrada a partir del análisis del código real (`page.tsx:884-891`), a
     verificar
     con el test, no a asumir por default:** `flushPendingSaves()` envía el
     PATCH de General inmediatamente (no espera a `reconciliacionEnCursoRef`,
     confirmado por grep — no hay ningún `await`/chequeo cruzado entre
     ambos); cuando la reconciliación en vuelo finalmente resuelve,
     `applyGeneralOnly(updated)` se invoca solo si `!generalLockHeldRef.current
     && !generalDirtyRef.current` (línea 890) — como el campo estaba dirty
     al momento de iniciar `aprobar()`, y las funciones `persist*Autosave`
     limpian su `*DirtyRef` recién cuando su propio PATCH resuelve (no antes
     de enviarlo), la ventana exacta donde `generalDirtyRef.current` pasa a
     `false` determina si la reconciliación (que puede resolver en cualquier
     momento, sin relación con el flush) pisa el valor recién confirmado por
     el flush con una lectura potencialmente más vieja. **La predicción es
     que el guard existente evita la pérdida** — pero el orden temporal
     exacto entre "la reconciliación resuelve" y "el flush limpia el dirty
     ref" no está serializado en ningún punto del código, así que es una
     condición de carrera *posible en el diseño* aunque los guards
     existentes reduzcan su ventana.
   - **T12** Interleaving, orden B — el flush resuelve antes que la
     reconciliación: mismo montaje que T11, pero el flush del paso de
     aprobar se resuelve ANTES que la reconciliación en vuelo.
   T11/T12 aseguran el valor final de `general` en el form state contra la
   misma predicción (el assert inicial de cada uno es exactamente la
   predicción). **Cómo un test
   que descubre una pérdida real puede seguir cerrando este bloque en
   verde, sin contradecir que 3D-0 es test-only:** si al correr T11/T12
   la predicción se cumple, el assert ya escrito pasa tal cual y 3D-0
   cierra normalmente, sin hallazgo nuevo. **Si la predicción falla en
   alguno de los 2** (el
   test sale rojo porque el valor final observado no es el predicho —
   eso, un test en rojo, es la señal misma de que hay una carrera real,
   no una sutileza a interpretar), **el assert de ESE caso se reescribe
   para afirmar el valor realmente observado** (el bug, documentado
   explícitamente como tal en un comentario del test — "characterization
   test: esto es lo que el código hace hoy, no lo que debería hacer") —
   así el archivo completo de 3D-0 vuelve a estar en verde, cumpliendo su
   propio criterio de aceptación de "documenta lo actual", **incluido un
   comportamiento defectuoso cuando ese es el comportamiento real**. Ese
   test así reescrito (afirmando el bug) es exactamente el que 3D-0b
   hereda y **reemplaza** por uno que afirma el valor correcto — el test
   corregido de 3D-0b es el que debe fallar contra el código de hoy y
   pasar solo después de aplicar el fix (rojo→verde real, no
   verde→verde). **Modelo de estados
   simplificado, sin contradicción entre bloques:** 3D-0 en sí mismo nunca
   corrige código y **siempre cierra normalmente (`Cerrado`) una vez que
   sus 12 casos están en verde documentando la realidad** — encontrar un
   bug real en T11/T12 no bloquea 3D-0 ni a nadie que no dependa
   específicamente de la reconciliación: se
   activa el hallazgo condicional **`F26`, ya reservado para esta
   situación exacta en la matriz de la sección 4** (no se inventa un `F27` nuevo — la
   matriz ya tiene una fila condicional `F26` con la descripción literal
   "Characterization test de
   3D-0 revela una carrera/pérdida real en la interacción
   flush/reconciliación", que es exactamente este caso) y se abre un
   **bloque correctivo nuevo `3D-0b`**
   (mismo mecanismo que `3B-7b`/`3C-4b`), con su propia
   especificación completa de 15 puntos —archivos propios (el/los
   archivo(s) de `page.tsx`/futuro hook donde viva la corrección, ej. un
   ref de "flush de General en vuelo" que `reconciliarConServidor` deba
   respetar igual que ya respeta `generalDirtyRef`), pruebas propias (como
   mínimo, T11/T12 vueltos a correr en
   verde contra el fix, ahora afirmando el valor correcto) y rollback
   propio. **Solo 3D-6** (la extracción de la propia reconciliación)
   depende de `3D-0b` cuando existe — 3D-1..3D-5 nunca dependieron de si
   T11/T12 revelan un bug o no (no tocan la reconciliación) y proceden sin
   esperar nada de esto. Nunca se preserva un bug real encontrado
   solo porque ya existía antes de este plan, y nunca se corrige a mitad
   de un bloque declarado test-only.
3. **Comportamiento a preservar:** N/A — documenta lo actual. Si T11/T12
   revelan un bug real, ese comportamiento específico no se
   preserva, pero tampoco se corrige aquí (ver punto 2): la
   corrección vive en el bloque `3D-0b` nuevo, sin bloquear el cierre de
   3D-0.
4. **Archivos exactos:** el archivo de test de arriba.
5. **Nuevos:** ese archivo.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** 3D-1, 3D-2, 3D-3,
   3D-4, 3D-5, 3D-6 (todos lo usan como red de seguridad, ninguno espera a
   `3D-0b`, salvo 3D-6 que sí depende de `3D-0b` si esa fila llega a
   existir).
8. **Orden:** primero de EF-3D.
9. **Riesgo:** P0 de proceso — sin esto, 3D-5 (item cells) no tiene una red
   de seguridad proporcional a su historial real de bugs (Fase 8.7.1,
   8.7.2).
10. **Pruebas:** son las pruebas — este bloque ES la suite de
    caracterización.
11. **Criterio de aceptación:** los 12 casos (T1-T12) cubiertos y en verde
    contra el código actual — **este es el único criterio de cierre de
    3D-0, sin excepción**; si T11 o T12 revelan un bug real, ese mismo
    criterio se sigue cumpliendo en cuanto el assert se reescribe para
    afirmar el valor observado (punto 2), y el bloque cierra igual —
    `3D-0b` es una fila nueva del tracker, no una condición de cierre de
    3D-0.
12. **Rollback:** eliminar el archivo — no afecta producto.
13. **Horas:** 18-22h (sube por los 12 casos individuales).
14. **Tamaño:** grande, 1 PR — no toca `page.tsx`.
15. **Evidencia:** los 12 tests (T1-T12) en verde, cada uno con una nota de qué
    comportamiento real documenta; si T11/T12 revelaron un
    bug real, la nota lo dice explícitamente y referencia `F26`/`3D-0b`.

#### 3D-0b — Fix de la carrera flush/reconciliación en General/Totales (F26)

1. **Problema:** confirmado empíricamente por T12 de 3D-0 (test real, no
   hipótesis): si el PATCH de un campo de General/Totales resuelve
   **antes** que una reconciliación ya en vuelo (`reconciliarConServidor`,
   disparada por un evento `*_confirmed` de Presence que llegó mientras el
   PATCH todavía viajaba), la reconciliación aplica su lectura — capturada
   ANTES de que el PATCH commiteara — y pisa el valor recién confirmado
   con uno más viejo. El guard existente en `applyGeneralOnly`/
   `applyTotalsOnly` (`isFieldBusy = dirty || saving`, page.tsx:712,729)
   solo mira si el campo está *actualmente* ocupado, nunca si la
   reconciliación en vuelo partió de un instante anterior al último PATCH
   confirmado — exactamente el mismo problema que `localWriteAtRef`/
   `escrituraLocalPosterior` ya resuelve para **partidas** (page.tsx:362-364,
   804-807), pero que General/Totales nunca heredaron. T11 (orden inverso:
   la reconciliación resuelve primero) sí queda protegido por el guard de
   dirty/lock existente — no hay pérdida en ese orden, no se toca.
2. **Decisión:** portar el mismo patrón de `localWriteAtRef` a
   General/Totales, por campo:
   - Dos refs nuevas: `generalFieldConfirmedAtRef =
     useRef<Partial<Record<QuotationGeneralField, number>>>({})` y
     `totalsFieldConfirmedAtRef` (mismo tipo, para
     `QuotationTotalsField`).
   - En el `.then` de éxito de `sendGeneralFieldPatchRound`/
     `sendTotalsFieldPatchRound` (donde ya se refresca
     `generalServerRef.current`/`totalsServerRef.current`, page.tsx:1039,
     1120), agregar `generalFieldConfirmedAtRef.current[field] =
     Date.now()` / `totalsFieldConfirmedAtRef.current[field] = Date.now()`
     — el mismo instante en que el campo se considera "confirmado por el
     servidor".
   - `applyGeneralOnly`/`applyTotalsOnly` reciben un parámetro nuevo
     `pedidoEn: number` (el mismo `Date.now()` que `reconciliarConServidor`
     ya captura al arrancar, página.tsx:791, hoy sin usar para estos dos).
     Su `isFieldBusy` interno se extiende: además de
     `dirty || saving`, un campo también cuenta como "ocupado" (se salta
     esta reconciliación) si `generalFieldConfirmedAtRef.current[field] !==
     undefined && generalFieldConfirmedAtRef.current[field]! >= pedidoEn`
     — el campo tiene una confirmación más nueva (o de exactamente el mismo
     instante) que el momento en que esta lectura de reconciliación arrancó,
     así que aplicarla la pisaría con algo más viejo.
   - `reconciliarConServidor` pasa `pedidoEn` en sus dos llamadas
     (page.tsx:890-891): `applyGeneralOnly(updated, pedidoEn)`,
     `applyTotalsOnly(updated, pedidoEn)`.
3. **Comportamiento a preservar:** T1-T10 de 3D-0 (todo lo que no toca esta
   carrera específica) sigue exactamente igual. T11 de 3D-0 (orden A) sigue
   pasando sin cambios — el guard nuevo es un `||` adicional, nunca quita
   protección existente.
4. **Archivos exactos:** `app/cotizaciones/[id]/page.tsx`.
5. **Modificados:** ese archivo únicamente — ningún archivo nuevo (extiende
   funciones/refs ya existentes, no crea un hook nuevo; la extracción a
   hooks es 3D-1..3D-7, fuera de alcance aquí).
6. **Migraciones/RPC:** ninguna — el fix es enteramente de estado de
   cliente.
7. **Dependencias entrantes:** 3D-0. **Salientes:** 3D-6 (la extracción de
   `useQuotationReconciliation` hereda este fix ya aplicado — sin esto,
   3D-6 estaría extrayendo y congelando un bug conocido en un hook nuevo).
8. **Orden:** después de 3D-0, antes de 3D-6; no bloquea 3D-1..3D-5 (no
   tocan la reconciliación).
9. **Riesgo:** P1 — corrige una pérdida de dato real ya confirmada por
   test, en el módulo READY de colaboración; mitigado por ser una extensión
   aditiva de un guard existente (nunca reduce protección) y por el punto
   11 (T11 y T12 deben seguir/pasar a pasar en verde).
10. **Pruebas:** el propio `page-autosave-characterization.test.tsx` de
    3D-0 se reutiliza tal cual — **T12 (que hoy documenta el bug) se
    reescribe para afirmar el valor CORRECTO** (`'Valor local del
    usuario'`, no la lectura vieja), como characterization test corregido
    que debe fallar contra el código de ANTES de este fix y pasar después
    (rojo→verde real). T11 se re-corre sin cambios (verde en ambos
    lados). Se agrega un T13 nuevo: dos campos DISTINTOS de General (p. ej.
    `locacion` confirmado, `cliente` todavía dirty) con una reconciliación
    en vuelo de por medio — confirma que el fix es **por campo**, no por
    sección completa (el campo confirmado se protege, el campo todavía
    dirty se salta igual que siempre por el guard original).
11. **Criterio de aceptación:** T1-T11 y el T12 reescrito (ahora afirmando
    el valor correcto) más el T13 nuevo, todos en verde contra el código
    con el fix aplicado; el T12 reescrito confirmado en rojo contra el
    código de 3D-0 sin este fix (evidencia de que el test realmente
    ejercita el bug, no un falso positivo).
12. **Rollback:** revertir el PR — 3D-0's test suite vuelve a documentar el
    bug tal cual (T12 original).
13. **Horas:** 6-8h (fix acotado a 2 refs + 1 parámetro nuevo en 2
    funciones + su verificación con el test ya existente).
14. **Tamaño:** chico, 1 PR.
15. **Evidencia:** diff completo de `page.tsx` (mínimo, aditivo) + el
    archivo de test de 3D-0 con T12 reescrito y T13 agregado, ambos en
    verde contra el fix, más el T12 reescrito confirmado en rojo contra el
    código pre-fix (adjuntar el output de esa corrida).

#### 3D-1 — `useQuotationMutationTracker`

1. **Problema:** `trackMutation`/`pendingMutationsRef` (líneas 375-389,
   según el mapa de responsabilidades de `page.tsx`) son usados por
   General/Totales/Notas/Items y por `flushPendingSaves` — extraerlos
   después de las secciones dejaría cada una con su propia copia acoplada.
2. **Decisión:** extraer a `hooks/useQuotationMutationTracker.ts` un hook
   mínimo que expone `trackMutation<T>(promise: Promise<T>): Promise<T>` y
   `pendingMutationsRef` (confirmado el tipo exacto en `page.tsx:375-382`:
   `const pendingMutationsRef = useRef<Set<Promise<unknown>>>(new Set())`,
   y `trackMutation` es el `useCallback` que hace
   `pendingMutationsRef.current.add(promise)` al entrar y
   `promise.finally(() => pendingMutationsRef.current.delete(promise))` al
   salir) — código movido verbatim, sin cambiar el tipo `Set<Promise<unknown>>`
   ni la firma de `trackMutation`.
3. **Comportamiento a preservar:** exactamente el mismo, sin cambios de
   lógica.
4. **Archivos exactos:** nuevo `hooks/useQuotationMutationTracker.ts`;
   `page.tsx` (quitar esas líneas, usar el hook).
5. **Nuevos:** el hook. **Modificados:** `page.tsx`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-0. **Salientes:** 3D-2, 3D-3, 3D-4, 3D-5
   (todos lo consumen para `trackMutation`).
8. **Orden:** primero de la secuencia de extracción, después de 3D-0.
9. **Riesgo:** P1 (bajo en sí mismo, pero es la base de todo lo que sigue —
   un error aquí se propaga a los 4 bloques siguientes).
10. **Pruebas:** los 12 casos (T1-T12) de 3D-0 se re-ejecutan con los imports
    actualizados, sin modificar sus aserciones.
11. **Criterio de aceptación:** los 12 casos (T1-T12) de 3D-0 pasan igual;
    `tests/e2e/critical/cotizaciones-editar.spec.ts` y
    `tests/e2e/live/cotizaciones-colaboracion.spec.ts` sin modificar.
12. **Rollback:** revertir el PR.
13. **Horas:** 3-4h.
14. **Tamaño:** chico, 1 PR.
15. **Evidencia:** diff mostrando código movido idéntico.

#### 3D-2 — `useQuotationGeneralAutosave`

1. **Problema:** autosave/dirty/lock/focus/drenado de "General" inline en
   `page.tsx` (refs relacionadas a `general*`, `generalFieldDrainRef`,
   `getGeneralFieldValue`/`sendGeneralFieldPatchRound`/
   `persistGeneralFieldAutosave`/`markGeneralFieldDirty`/
   `flushGeneralDirtyFields`/`resolveGeneralFieldConflict`,
   `patchQuotationGeneral`).
2. **Decisión:** extraer a `hooks/useQuotationGeneralAutosave.ts`,
   consumiendo `useQuotationMutationTracker` (3D-1) para `trackMutation`.
3. **Comportamiento a preservar exactamente:** debounce
   `GENERAL_AUTOSAVE_DELAY_MS` (800ms), detección de conflicto 409 y su
   resolución (`'usar'`/`'mantener'` revierte o reintenta el grupo completo
   atómico), drenado de rondas en vuelo (`generalFieldDrainRef`).
4. **Archivos exactos:** nuevo `hooks/useQuotationGeneralAutosave.ts`;
   `page.tsx`.
5. **Nuevos:** el hook. **Modificados:** `page.tsx`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-1. **Salientes:** 3D-6 (`flushGeneralDirtyFields`
   es consumido por `flushPendingSaves`, que 3D-7 termina de componer).
8. **Orden:** después de 3D-1, antes de 3D-3.
9. **Riesgo:** P1 — toca el módulo READY de colaboración; mitigado por ser
   extracción pura (punto 3) y por el criterio de aceptación (punto 11).
10. **Pruebas:** los 12 casos (T1-T12) de 3D-0 relevantes a General, sin modificar.
11. **Criterio de aceptación:** los casos de 3D-0 pasan; `critical`/`live`
    en verde; revisión manual de que el código movido es idéntico.
12. **Rollback:** revertir el PR.
13. **Horas:** 8-10h.
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** diff completo + `live` en verde sobre el commit final.

#### 3D-3 — `useQuotationTotalesAutosave`

1. **Problema:** autosave/dirty/lock/focus/drenado de la sección "Totales"
   inline en `page.tsx` (`totalsFieldDrainRef`, `totalsFieldRetryNeededRef`,
   `totalsFieldDirtyRef`, `totalsFieldSavingRef`, `totalsFieldBaseRef`,
   `getTotalsFieldValue`/`sendTotalsFieldPatchRound`/
   `persistTotalsFieldAutosave`/`markTotalsFieldDirty`/
   `flushTotalsDirtyFields`/`resolveTotalsFieldConflict`,
   `patchQuotationTotales`, `TOTALS_AUTOSAVE_DELAY_MS`). **Los
   campos reales de "Totales" son
   `porcentaje_fee`/`iva_activo`/`descuento_tipo`/`descuento_valor`**
   (confirmado leyendo `page.tsx:58-61,260-263,673,727` — el tipo
   `QuotationTotalsField` y `buildTotalsSnapshot` operan exactamente sobre
   esos 4 — `descripcion`/`categoria`/`precio_unitario`/`x_pagar` son
   campos de **partidas** (`items_cotizacion`), no de Totales; ese grupo
   atómico de autofill de producto pertenece a 3D-5 (item cells), no a
   este bloque — movido ahí, ver 3D-5). El conflicto atómico multi-campo
   real de esta sección es sobre los 4 campos de Totales: si el usuario
   cambia el porcentaje de fee, el IVA, o el tipo/valor de descuento
   mientras otro proceso ya los actualizó, la RPC rechaza el grupo
   completo (mismo invariante de "todo o nada").
2. **Decisión:** extraer a `hooks/useQuotationTotalesAutosave.ts`,
   consumiendo `useQuotationMutationTracker` (3D-1) para `trackMutation`,
   código movido verbatim (solo cambia el archivo contenedor y la forma de
   conectarlo a `page.tsx` vía props/retorno del hook).
3. **Comportamiento a preservar exactamente:** debounce
   `TOTALS_AUTOSAVE_DELAY_MS` (800ms); el conflicto atómico multi-campo
   sobre `porcentaje_fee`/`iva_activo`/`descuento_tipo`/`descuento_valor`
   — si CUALQUIER campo del grupo choca, se rechaza el grupo completo,
   nada se aplica a medias (invariante de `ARCHITECTURE.md`); `'usar'`
   revierte TODOS los campos del grupo al valor real del servidor,
   `'mantener'` reintenta el PATCH completo con la `base` de todo el
   grupo ya refrescada.
4. **Archivos exactos:** nuevo `hooks/useQuotationTotalesAutosave.ts`;
   `page.tsx` (quitar el clúster, importar y usar el hook).
5. **Nuevos:** el hook. **Modificados:** `page.tsx`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-1. **Salientes:** 3D-6/3D-7
   (`flushTotalsDirtyFields` es consumido por `flushPendingSaves`).
8. **Orden:** después de 3D-2, antes de 3D-4.
9. **Riesgo:** P1 — el conflicto atómico multi-campo es el punto más
   delicado de este bloque específico; revisión manual obligatoria de que
   se preservó exacto (punto 11).
10. **Pruebas:** los 12 casos (T1-T12) de 3D-0 relevantes a Totales se re-ejecutan
    con los imports actualizados, sin modificar sus aserciones — en
    particular el caso de conflicto multi-campo.
11. **Criterio de aceptación:** los casos de 3D-0 pasan sin modificarse;
    `tests/e2e/critical/cotizaciones-editar.spec.ts` y
    `tests/e2e/live/cotizaciones-colaboracion.spec.ts` (incluye el caso de
    conflicto de Totales) en verde sin modificar sus aserciones; revisión
    manual línea por línea confirmando que el código movido es idéntico
    salvo nombres de import/export.
12. **Rollback:** revertir el PR.
13. **Horas:** 8-10h.
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** diff completo del PR + confirmación de que `live` corrió
    en verde sobre el commit final, con foco explícito en el spec de
    conflicto multi-campo.

#### 3D-4 — `useQuotationNotasAutosave`

1. **Problema:** autosave/dirty/lock/focus de la sección "Notas" inline en
   `page.tsx` (`notasDirtyRef`, `notasLockHeldRef`, `notasFocusedRef`,
   `notasAutosaveTimerRef`, `persistNotasAutosave`,
   `NOTAS_AUTOSAVE_DELAY_MS`) — el más simple de los 3 clústeres de sección:
   un solo campo de texto, sin conflicto multi-campo (a diferencia de
   General/Totales).
2. **Decisión:** extraer a `hooks/useQuotationNotasAutosave.ts`,
   consumiendo `useQuotationMutationTracker` (3D-1), código movido verbatim.
3. **Comportamiento a preservar exactamente:** debounce
   `NOTAS_AUTOSAVE_DELAY_MS` (800ms); sin conflicto de grupo (es un solo
   campo, la resolución de 409 en Notas revierte o reintenta ese único
   campo, no un grupo).
4. **Archivos exactos:** nuevo `hooks/useQuotationNotasAutosave.ts`;
   `page.tsx` (quitar el clúster, importar y usar el hook).
5. **Nuevos:** el hook. **Modificados:** `page.tsx`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-1. **Salientes:** 3D-6/3D-7
   (`persistNotasAutosave`/su flush equivalente es consumido por
   `flushPendingSaves`).
8. **Orden:** después de 3D-3, antes de 3D-5.
9. **Riesgo:** P2 (el más simple de los 3 clústeres de sección — sin
   conflicto multi-campo que preservar).
10. **Pruebas:** los 12 casos (T1-T12) de 3D-0 relevantes a Notas se re-ejecutan con
    los imports actualizados, sin modificar sus aserciones.
11. **Criterio de aceptación:** los casos de 3D-0 pasan sin modificarse;
    `tests/e2e/critical/cotizaciones-editar.spec.ts` y
    `tests/e2e/live/cotizaciones-colaboracion.spec.ts` en verde sin
    modificar sus aserciones; revisión manual de que el código movido es
    idéntico salvo nombres de import/export.
12. **Rollback:** revertir el PR.
13. **Horas:** 4-5h.
14. **Tamaño:** chico, 1 PR.
15. **Evidencia:** diff completo del PR + confirmación de que `live` corrió
    en verde sobre el commit final.

#### 3D-5 — `useQuotationItemCellsAutosave` (máximo riesgo del refactor)

1. **Problema:** el clúster más grande — drenado real por celda (Fase
   8.7.2), `itemDirtyCellsRef`, `itemCellDrainRef` (`Map<string, Promise>`),
   `itemCellRetryNeededRef`, `rowMutationQueueRef`, `sendItemCellPatchRound`,
   `flushItemCellDirtyFields`, `resolveItemCellConflict`,
   `getItemCellConflict`, `patchQuotationItem`/`createQuotationItemRow`/
   `deleteQuotationItemRow`. Este código ya causó bugs reales dos veces
   (Fase 8.7.1, 8.7.2). **El conflicto atómico
   multi-campo de autofill de producto** (`descripcion`/`categoria`/
   `precio_unitario`/`x_pagar`, confirmado en `page.tsx:138-235` —
   `PatchConflictError`/`buildAtomicConflictRecord` sobre exactamente esos
   4 campos de partida) **es de este bloque, no de 3D-3** (esos 4 nombres
   son campos de `items_cotizacion`, no de la sección Totales — corregido
   y movido aquí, ver 3D-3).
2. **Decisión:** extraer a `hooks/useQuotationItemCellsAutosave.ts`, en su
   propio PR, sin combinar con ningún otro cambio, después de 3D-4.
3. **Comportamiento a preservar exactamente:** el drenado real por celda
   (una edición nueva mientras el PATCH anterior está en vuelo encola la
   siguiente en vez de perderse o duplicar fetch), actualización de `base`
   tras cada PATCH confirmado; **el conflicto atómico multi-campo del
   autofill de producto** (`descripcion`/`categoria`/`precio_unitario`/
   `x_pagar`) — si CUALQUIER campo del grupo choca, se rechaza el grupo
   completo, nada se aplica a medias; `'usar'` revierte TODOS los campos
   del grupo al valor real del servidor, `'mantener'` reintenta el PATCH
   completo con la `base` de todo el grupo ya refrescada (mismo invariante
   de "todo o nada" que Totales, aplicado aquí a los campos de partida).
4. **Archivos exactos:** nuevo `hooks/useQuotationItemCellsAutosave.ts`;
   `page.tsx`.
5. **Nuevos:** el hook. **Modificados:** `page.tsx`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-0, 3D-1, 3D-2, 3D-3, 3D-4 (secuencial
   estricto). **Salientes:** 3D-6.
8. **Orden:** después de 3D-4, antes de 3D-6.
9. **Riesgo:** **P0 de implementación** (no del hallazgo de mantenibilidad,
   que es P1/P2 — el riesgo P0 es de regresión dado el historial real de
   bugs en este código exacto).
10. **Pruebas:** casos "Drenado"/"Retry"/"Unmount" de 3D-0 sin modificar,
    como red de seguridad primaria; **caso nuevo:** el
    conflicto atómico multi-campo de autofill de producto (movido desde
    3D-3) — forzar un 409 en `descripcion`/`categoria`/`precio_unitario`/
    `x_pagar` con solo uno de los 4 en conflicto real, confirmar que el
    grupo completo se rechaza (ningún campo se aplica a medias), que
    `'usar'` revierte los 4 al valor del servidor, y que `'mantener'`
    reintenta el PATCH completo con la `base` de los 4 ya refrescada;
    **prueba manual adicional obligatoria** en el entorno serverless real
    de 3A-1: editar la misma celda repetidamente con el PATCH anterior en
    vuelo, confirmar que no se pierde ninguna edición y no aparece un 409
    contra uno mismo.
11. **Criterio de aceptación:** los casos de 3D-0 en verde **y** la prueba
    manual documentada en el PR (captura o descripción paso a paso) — este
    bloque no cierra solo con CI verde.
12. **Rollback:** revertir el PR completo, aislado del resto.
13. **Horas:** 18-22h.
14. **Tamaño:** grande, 1 PR propio.
15. **Evidencia:** diff completo + prueba manual documentada.

#### 3D-6 — `useQuotationReconciliation` (cierra F17, con el characterization test de interleaving ya escrito en 3D-0)

1. **Problema:** `reconciliarConServidor` (líneas ~785-903),
   `applyGeneralOnly`/`applyTotalsOnly`/`applyNotasOnly`/`resyncPartidas` y
   `reconciliacionEnCursoRef` siguen inline en `page.tsx`, transversales a
   las 4 secciones. **Ya auditado (3D-0, punto 1):** no hay sincronización
   explícita hoy entre esto y `flushPendingSaves`/acciones de negocio — el
   characterization test de interleaving de 3D-0 ya documentó el
   comportamiento real que esta extracción debe reproducir sin cambiarlo.
2. **Decisión:** extraer a `hooks/useQuotationReconciliation.ts`, recibiendo
   como parámetros los setters/refs expuestos por 3D-2 (General), 3D-3
   (Totales), 3D-4 (Notas) y 3D-5 (Item cells) — por eso corre después de
   los 4. Expone `reconciliarConServidor(...)` con la misma firma que hoy
   usa `page.tsx`.
3. **Comportamiento a preservar exactamente:** `reconciliacionEnCursoRef`
   sigue evitando reconciliaciones solapadas; preserva lo que el usuario
   está escribiendo (no pisa filas en edición, restaura foco/cursor). **Si
   los casos T11/T12 de 3D-0 confirmaron la predicción** (el guard de
   dirty-ref evita la pérdida en ambos órdenes de resolución): ese
   comportamiento verificado se reproduce idéntico tras la extracción. **Si
   T11 o T12 revelaron una condición de carrera
   real (3D-0 cerró igual, per su modelo de estados — ver 3D-0, punto 2 —
   pero abrió `3D-0b`):** 3D-6 no arranca hasta que el bloque correctivo
   `3D-0b` esté `Cerrado` — la corrección de ese bloque (ej. un ref de
   "flush en vuelo" que la reconciliación deba respetar) ya vive en
   `page.tsx` antes de que empiece esta extracción, así que 3D-6 simplemente
   mueve código ya corregido, sin diseñar ni aplicar el fix él mismo — nunca
   se preserva el bug encontrado, y nunca se corrige a mitad de una
   extracción que se declara comportamiento-preservado.
4. **Archivos exactos:** nuevo `hooks/useQuotationReconciliation.ts`;
   `page.tsx`.
5. **Nuevos:** el hook. **Modificados:** `page.tsx`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-0 (siempre, ya cerrado con sus 12 casos
   en verde), 3D-2, 3D-3, 3D-4, 3D-5, y `3D-0b` si esa fila llegó a
   crearse (ver 3D-0, punto 2 — la única dependencia condicional de esta
   secuencia). **Salientes:**
   3D-7.
8. **Orden:** después de 3D-5, antes de 3D-7.
9. **Riesgo:** P0 de implementación — junto con 3D-5, el clúster más
   acoplado del modelo de colaboración.
10. **Pruebas:** T11/T12 de 3D-0 sin modificar; `live`
    completo de `cotizaciones-colaboracion.spec.ts` +
    `cotizaciones-colaboracion-escala.spec.ts`; prueba manual en el entorno
    serverless real con 2 pestañas editando simultáneamente.
11. **Criterio de aceptación:** los tests del punto 10 en verde, incluida la
    prueba manual documentada — no cierra solo con CI verde.
12. **Rollback:** revertir el PR, aislado de 3D-7.
13. **Horas:** 18-20h.
14. **Tamaño:** grande, 1 PR propio.
15. **Evidencia:** diff completo + prueba manual + resultado de T11/T12
    documentado explícitamente (qué comportamiento real
    confirmó).

#### 3D-7 — `useQuotationBusinessActions`

1. **Problema:** `aprobar()`, `generarPDF()`, `generarCotizacion()`,
   `crearComplementaria()`, `cancelarCotizacion()` viven inline en
   `page.tsx`. **No las 5 hacen lo mismo,
   confirmado leyendo el código real:** `aprobar()` (`page.tsx:2251-2264`),
   `generarPDF()` (`page.tsx:2270-2280`) y `generarCotizacion()`
   (`page.tsx:2281-2298`) sí llaman `flushPendingSaves()`
   (`page.tsx:1537-1566`) y sí usan el guard síncrono
   `transitionInFlightRef` (`page.tsx:2250`) antes de mutar estado del
   servidor. **`crearComplementaria()` (`page.tsx:2299`) es solo
   `() => { if (cotizacion) router.push(buildComplementariaUrl(id,
   cotizacion)) }` — navega, no llama `flushPendingSaves` ni usa
   `transitionInFlightRef` en absoluto** (no hay nada que mutar en el
   servidor, solo redirige). **`cancelarCotizacion()` (`page.tsx:2300`) es
   `async` (hace `fetch POST /api/cotizaciones/[id]/cancelar`), pero
   tampoco llama `flushPendingSaves()` ni usa `transitionInFlightRef`** —
   usa su propio guard independiente, el estado `cancelando` (deshabilita
   el botón mientras la request está en vuelo), sin flush previo de
   cambios locales pendientes.
2. **Decisión — explícita, no "extracción verbatim" genérica: se preserva la asimetría real tal
   cual, no se introduce un cambio funcional nuevo.** Las 5 funciones se
   mueven a `hooks/useQuotationBusinessActions.ts` exactamente como están
   hoy — `aprobar`/`generarPDF`/`generarCotizacion` con su
   flush+guard, `crearComplementaria` como navegación pura,
   `cancelarCotizacion` con su propio guard `cancelando` sin flush. **Esta
   asimetría (cancelar sin flush de cambios pendientes) no es un hallazgo
   nuevo de este plan** — no se corrige aquí, porque hacerlo sería un
   cambio de comportamiento de producto (¿debería un cambio local sin
   guardar sobrevivir a una cancelación?) fuera del alcance de una
   extracción, no un bug que el inventario de hallazgos (sección 4) haya
   identificado. Si el usuario quiere cerrarla, es una decisión de
   producto para una fila nueva de hallazgo, con aprobación explícita —
   nunca decidida unilateralmente dentro de un bloque de refactor. El
   hook depende de los flush de 3D-2/3D-3/3D-4/3D-5 para componer
   `flushPendingSaves()` (usado solo por los 3 primeros), y de
   `useQuotationReconciliation` (3D-6) si `3D-0b` llegó a existir (ver
   3D-6, punto 3).
3. **Comportamiento a preservar exactamente:** `aprobar`/`generarPDF`/
   `generarCotizacion` nunca corren con cambios locales sin confirmar
   (flush primero, guard síncrono `transitionInFlightRef` movido
   verbatim); `crearComplementaria` sigue siendo navegación pura sin
   flush; `cancelarCotizacion` sigue sin flush ni `transitionInFlightRef`,
   con su propio guard `cancelando` — **la asimetría de las 5 se preserva
   exactamente, no se uniforma**; el mensaje de error "Hay cambios recientes que no se
   guardaron correctamente..." se preserva idéntico.
4. **Archivos exactos:** nuevo `hooks/useQuotationBusinessActions.ts`;
   `page.tsx`.
5. **Nuevos:** el hook. **Modificados:** `page.tsx`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-0, 3D-2, 3D-3, 3D-4, 3D-5, 3D-6.
   **Salientes:** 3D-8.
8. **Orden:** después de 3D-6, penúltimo de EF-3D.
9. **Riesgo:** P1 — actúa como test de integración de todo lo anterior.
10. **Pruebas:** `live` de aprobar/cancelar bajo concurrencia (Fase 8.7,
    existente); prueba manual "editar y aprobar inmediatamente"; **caso
    nuevo:** confirmar por código (no solo por comportamiento
    observado) que `crearComplementaria`/`cancelarCotizacion` en el hook
    extraído siguen sin llamar `flushPendingSaves`/usar
    `transitionInFlightRef` — un diff que "silenciosamente" les agregara
    ese guard sería un cambio funcional no autorizado por este bloque.
11. **Criterio de aceptación:** tests del punto 10 en verde sin
    modificarse, incluida la confirmación de que la asimetría no cambió.
12. **Rollback:** revertir el PR.
13. **Horas:** 8-10h.
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** diff completo del PR + los 2 tests del punto 10 en
    verde, documentados con el commit final sobre el que corrieron.

#### 3D-8 — Verificación y cierre del refactor de `page.tsx`

1. **Problema:** confirmar que 3D-0..3D-7 dejaron el archivo mejor y sin
   regresión antes de dar por cerrada esta parte de F16/F17. **Este bloque debe ser doc-only independiente, ejecutado
   DESPUÉS de que el PR de 3D-7 ya esté mergeado** — no puede ir "dentro
   del PR de 3D-7", porque su propia
   dependencia (3D-7 `Cerrado`) todavía no existiría en ese momento (un
   bloque no puede depender de sí mismo estando a medio mergear).
2. **Decisión:** correr `live` completo (no solo cotizaciones) una vez con
   todos los bloques de `page.tsx` mergeados, medir tamaño final del
   archivo, actualizar `ARCHITECTURE.md` (sección "Edición colaborativa")
   documentando los 6 hooks nuevos (`useQuotationMutationTracker`,
   `useQuotationGeneralAutosave`, `useQuotationTotalesAutosave`,
   `useQuotationNotasAutosave`, `useQuotationItemCellsAutosave`,
   `useQuotationReconciliation`) y `useQuotationBusinessActions`. **Bloque
   doc-only (el 6to de los 6 bloques doc-only del plan, junto a
   3A-0/3A-6/3E-1/3E-2/3E-3 — ver la regla uniforme de la sección 9),
   mismo mecanismo de 2 commits que todos
   los demás:** commit de contenido (actualiza `ARCHITECTURE.md`, marca la
   fila `3D-8` `Cerrado` con "Commit SHA" pendiente) + commit de
   sincronización inmediato siguiente (llena el SHA real), ambos directo a
   `main`.
3. **Comportamiento a preservar:** N/A, verificación.
4. **Archivos exactos:** `ARCHITECTURE.md`.
5. **Modificados:** ese archivo.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3D-0, 3D-1, 3D-2, 3D-3, 3D-4, 3D-5, 3D-6,
   3D-7 completos y **mergeados a `main`** (no solo "listos" — el `live`
   completo de este bloque corre contra `main`, así que 3D-7 debe estar
   ahí, no en su propia rama todavía). **Salientes:** ninguna.
8. **Orden:** último de EF-3D en `page.tsx`, estrictamente después del
   merge de 3D-7.
9. **Riesgo:** N/A.
10. **Pruebas:** `live` completo.
11. **Criterio de aceptación:** `live` completo en verde; tamaño final de
    `page.tsx` documentado (baja de 2,388 líneas, cifra real confirmada
    contra el repo en esta ronda 12 — el número final a reportar aquí se
    mide después del merge, no antes).
12. **Rollback:** revertir el commit de contenido.
13. **Horas:** 4-5h.
14. **Tamaño:** chico, 2 commits doc-only (contenido + sincronización) —
    **siempre después del merge de 3D-7, nunca dentro de su PR**.
15. **Evidencia:** `wc -l` antes/después.

#### 3D-9 — `DomainError` en rutas financieras

1. **Problema:** F18, subconjunto financiero:
   `cuentas-pagar/[id]/registrar-pago/route.ts:89,114` (`rpcError.message`
   crudo), `cuentas-cobrar/[id]/registrar-pago/route.ts:110,134` (ídem),
   `cuentas-pagar/generar-orden-pago/route.ts:54,137`
   (`JSON.stringify(error)` como `details`),
   `cotizaciones/[id]/cancelar/route.ts:18-21` +
   `lib/server/quotations/cancellation.ts:19,32` (mensajes que re-envuelven
   `cuentasError.message`/`error.message`).
2. **Decisión:** envolver cada catch con `buildErrorResponse` (mismo helper
   de EF-2 1E-2), mapeando a `DomainError` con `safeMessage` genérico +
   logging estructurado del detalle real solo en servidor.
   `cancellation.ts` lanza `DomainError` directo en vez de construir `Error`
   con mensaje de Postgres interpolado.
3. **Comportamiento a preservar:** contrato `{error, requestId}`; status
   codes existentes.
4. **Archivos exactos:** los 4 archivos de ruta del punto 1 +
   `lib/server/quotations/cancellation.ts`.
5. **Modificados:** los 5.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** en paralelo con 3D-10/3D-11.
9. **Riesgo:** P1 (fuga de detalle técnico de Postgres al cliente).
10. **Pruebas:** extender tests existentes de cada ruta simulando error de
    Postgres/RPC, confirmar que la respuesta nunca contiene el mensaje
    crudo ni `JSON.stringify(error)`.
11. **Criterio de aceptación:** tests del punto 10 pasan; grep de
    `JSON.stringify(error)`/`rpcError.message` en los 5 archivos da 0.
12. **Rollback:** revertir el PR.
13. **Horas:** 8-10h.
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** tests + grep del punto 11.

#### 3D-10 — `buildErrorResponse` en rutas de Portal (`toErrorMessage` intacto)

1. **Problema:** F18, subconjunto Portal. **`toErrorMessage()`
   (`lib/server/portal/error-message.ts:12-19`) no se toca** — es correcta y
   ya la usa `buildErrorResponse()` (`lib/server/errors/domain-error.ts:47,57`)
   para extraer detalle técnico **solo para el log** (`logStructured`), nunca
   para la respuesta HTTP (que solo lleva `safeMessage`/`MENSAJE_GENERICO`+
   `requestId`). El bug real: las 8 rutas de Portal construyen su respuesta
   directo con `Response.json({ error: toErrorMessage(error) }, { status:
   500 })` en su catch genérico (confirmado leyendo las 8: `login`,
   `signup`, `signup/confirmar`, `documentos` GET+POST, `cuentas`,
   `cuentas/[id]/factura`, `me`, `perfil` GET+PUT), bypaseando
   `buildErrorResponse` por completo.
2. **Decisión:** las 8 rutas (`portal/login`, `portal/signup`,
   `portal/signup/confirmar`, `portal/documentos` GET+POST,
   `portal/cuentas`, `portal/cuentas/[id]/factura`, `portal/me`,
   `portal/perfil`) cambian su catch genérico a `return
   buildErrorResponse(error, '<nombre-de-ruta>')` — igual patrón que las 3
   rutas de EF-2 1E-2. Si alguna depende hoy de que un error controlado
   (ej. `23505` de correo duplicado en signup) llegue con mensaje útil vía
   ese catch, se convierte en `throw new DomainError({code, status,
   safeMessage, cause: error})` explícito antes del catch genérico.
   **`portal/cuentas/[id]/factura` trae, desde 3A-4, un `instanceof
   LoadtestOverrideRejectedError` explícito agregado ANTES del catch
   genérico crudo** (para producir 400 sin esperar a este bloque) — al
   migrar esta ruta a `buildErrorResponse`, ese `instanceof` queda
   redundante (un `DomainError` con `status: 400` ya se maneja solo) y
   **se elimina** como parte de este mismo cambio, no se deja como código
   muerto conviviendo con el nuevo catch.
3. **Comportamiento a preservar:** los `Response.json({error}, {status:4xx})`
   explícitos ya existentes antes del catch genérico (validación, 401, 429)
   no se tocan.
4. **Archivos exactos:** los 8 archivos de ruta.
5. **Modificados:** los 8. **No modificado:** `error-message.ts`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** en paralelo con 3D-9/3D-11.
9. **Riesgo:** P1.
10. **Pruebas:** por cada ruta, simular error crudo de Supabase → respuesta
    `MENSAJE_GENERICO`+`requestId`, nunca crudo; `error-message.test.ts`
    corre sin modificar; casos migrados a `DomainError` (punto 2) tienen su
    propio test ajustado a esa nueva forma controlada.
11. **Criterio de aceptación:** tests del punto 10 pasan para las 8 rutas;
    `error-message.test.ts` sin cambios; `smoke/portal-signup.spec.ts`/
    `critical/portal-factura.spec.ts` sin modificar aserciones.
12. **Rollback:** revertir las 8 rutas.
13. **Horas:** 8-10h.
14. **Tamaño:** mediano, 1 PR.
15. **Evidencia:** tests del punto 10 + confirmación de que
    `error-message.test.ts` no cambió.

#### 3D-11 — `DomainError` en rutas de Proyectos

1. **Problema:** F18, subconjunto Proyectos —
   `app/api/proyectos/[id]/route.ts:45-51` (handler `PUT`, confirmado) y
   `app/api/proyectos/[id]/tipo/route.ts:6` (handler también `PUT`,
   confirmado) exponen
   `error.message`/`JSON.stringify(error)` crudo en el catch genérico de su
   `PUT` respectivo. **`TipoYaAsignadoError` no aplica a las 2
   rutas por igual, confirmado por grep exhaustivo (solo 2 archivos en
   todo el repo la referencian: su definición en
   `lib/server/projects/tipo-assignment.ts` y su único consumidor,
   `app/api/proyectos/[id]/tipo/route.ts:22-24`):**
   `app/api/proyectos/[id]/route.ts` **no tiene ningún manejo de excepción
   de dominio antes de su catch genérico** — su `PUT` es
   `try { ... } catch (error) { return Response.json({ error:
   \`Error actualizando proyecto: ${...}\` }, { status: 500 }) }`, sin
   ninguna rama previa; **`app/api/proyectos/[id]/tipo/route.ts` sí la
   tiene**, mapeada a **409** (`if (error instanceof TipoYaAsignadoError)
   return Response.json({ error: error.message }, { status: 409 })`,
   confirmado — **nunca 400**) antes de su catch
   genérico.
2. **Decisión:** replicar el patrón ya implementado en
   `app/api/proyectos/[id]/etapa/route.ts` (única ruta de Proyectos que ya
   usa `buildErrorResponse`/`DomainError` desde EF-2 1E-2, confirmado)
   — envolver el
   catch genérico de las 2 rutas con `return buildErrorResponse(error,
   '<nombre-de-ruta>')`. En `app/api/proyectos/[id]/route.ts` esto es
   sustituir el ÚNICO catch que tiene (no hay ninguna rama de excepción de
   dominio que preservar ahí). En
   `app/api/proyectos/[id]/tipo/route.ts`, preservando intacto el `if
   (error instanceof TipoYaAsignadoError) return Response.json({ error:
   error.message }, { status: 409 })` que ya mapea esa excepción a 409
   antes de llegar al catch genérico — **ese 409 no cambia a 400 ni a
   ningún otro código, es el status correcto y ya validado del código
   real**.
3. **Comportamiento a preservar:** el mapeo de `TipoYaAsignadoError` a 409
   en `tipo/route.ts`, sin cambio; `app/api/proyectos/[id]/route.ts` no
   tenía ningún mapeo de dominio que preservar — solo su catch genérico
   deja de exponer `error.message`/`JSON.stringify(error)`.
4. **Archivos exactos:** `app/api/proyectos/[id]/route.ts`,
   `app/api/proyectos/[id]/tipo/route.ts`;
   `app/api/__tests__/proyectos-tipo-route.test.ts` (nuevo, ver punto 10).
5. **Modificados:** esos 2 archivos de ruta +
   `app/api/__tests__/proyectos-detail-route.test.ts` (agrega el caso de
   error crudo genérico — **sin ningún caso de `TipoYaAsignadoError`, esa
   ruta nunca lo lanza**). **Nuevo:**
   `proyectos-tipo-route.test.ts`.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** en paralelo con 3D-9/3D-10.
9. **Riesgo:** P2 (menor volumen de exposición que financieras/portal).
10. **Pruebas:** **confirmado que `app/api/proyectos/[id]/route.ts` (`PUT`)
    ya tiene test (`proyectos-detail-route.test.ts`, 2 casos: un update
    exitoso y una falla de validación con 400, ninguno de excepción de
    dominio); `app/api/proyectos/[id]/tipo/route.ts` no
    tiene ningún archivo de test hoy (confirmado, ninguno coincide)** —
    para la primera ruta se extiende el test existente
    **con un único caso nuevo: error crudo genérico → mensaje genérico +
    `requestId`, nunca `error.message`/`JSON.stringify(error)`** (no hay
    caso de `TipoYaAsignadoError` que agregar ahí, esa ruta no la lanza);
    para
    la segunda se crea `app/api/__tests__/proyectos-tipo-route.test.ts`
    (nuevo) **con 2 casos: error crudo genérico → mensaje genérico +
    `requestId`; y `TipoYaAsignadoError` real (lanzada antes del catch
    genérico) → sigue respondiendo 409 con `error.message` (su forma
    actual, sin cambio)**.
11. **Criterio de aceptación:** los tests del punto 10 en verde (1 caso
    nuevo en `proyectos-detail-route.test.ts`, 2 casos en
    `proyectos-tipo-route.test.ts`); grep de
    `error.message`/`JSON.stringify(error)` en los 2 archivos da 0 fuera
    del manejo ya controlado de `TipoYaAsignadoError` (409, intacto).
12. **Rollback:** revertir los 2 archivos de ruta + el test nuevo.
13. **Horas:** 6-7h (sube por separar los tests exactamente según
    qué excepción de dominio tiene cada ruta — ninguna en `[id]/route.ts`,
    `TipoYaAsignadoError` solo en `tipo/route.ts`).
14. **Tamaño:** chico, puede ir en el mismo PR que 3D-9 o 3D-10 si conviene
    agrupar la ronda de `DomainError`, o en el suyo propio.
15. **Evidencia:** tests del punto 10 + el grep del punto 11.

#### 3D-12 — `Document Ingestion Core` (códigos, sin fallback nuevo, magic-byte fuera de alcance)

1. **Problema:** F19 — validación duplicada con diferencias reales: nombre
   de campo (`factura_proveedor_xml/pdf` en CxP vs `factura_xml/pdf` en CxC
   y Portal) y obligatoriedad del PDF (obligatorio en CxP y Portal,
   opcional en CxC).
2. **Decisión:**
   ```ts
   export type FacturaValidationErrorCode =
     | 'XML_REQUIRED' | 'XML_INVALID_TYPE'
     | 'PDF_REQUIRED' | 'PDF_INVALID_TYPE'
     | 'FILE_TOO_LARGE'

   export function validateFacturaFiles(params: {
     xml: File | null
     pdf: File | null
     pdfRequired: boolean
   }): { ok: true } | { ok: false; code: FacturaValidationErrorCode; field: 'xml' | 'pdf' }
   ```
   en `lib/server/uploads/factura-validation.ts`. **Tabla completa
   código → mensaje para las 3 rutas (verificada leyendo los 3 archivos
   completos):**

   | Código | CxP (`cuentas-pagar/[id]/subir-factura`) | CxC (`cuentas-cobrar/[id]/subir-factura`) | Portal (`portal/cuentas/[id]/factura`) |
   |---|---|---|---|
   | `XML_REQUIRED` | "Se requiere archivo XML de factura proveedor" | "Se requiere archivo XML de factura" | "Se requiere el archivo XML de tu factura" |
   | `PDF_REQUIRED` | "Se requiere archivo PDF de factura proveedor" | **N/A — nunca se emite** (`pdfRequired: false`, el PDF es opcional en CxC, confirmado que la ruta ni siquiera comprueba su ausencia) | "Se requiere el archivo PDF de tu factura" |
   | `XML_INVALID_TYPE` | "El archivo XML debe ser de tipo text/xml o application/xml" | "El archivo XML debe ser de tipo text/xml o application/xml" | "El archivo XML debe ser de tipo text/xml o application/xml" |
   | `PDF_INVALID_TYPE` | "El archivo PDF debe ser de tipo application/pdf" | "El archivo PDF debe ser de tipo application/pdf" (solo si se mandó un PDF — la comprobación está guardada por `pdfFile &&`, confirmado) | "El archivo PDF debe ser de tipo application/pdf" |
   | `FILE_TOO_LARGE` | "El archivo excede el límite de 10 MB" | "El archivo excede el límite de 10 MB" (compara `xmlFile.size` y, si existe, `pdfFile.size`) | "El archivo excede el límite de 10 MB" |

   `pdfRequired`: `true` desde CxP/Portal, `false` desde CxC (`PDF_REQUIRED`
   nunca se construye para esa ruta — el módulo expone el código en el
   tipo `FacturaValidationErrorCode` porque es válido para las otras 2
   rutas, pero `validateFacturaFiles({..., pdfRequired: false})` jamás lo
   devuelve). **El
   fallback por extensión (`.name.endsWith('.xml')`/`.pdf'`) ya existe hoy en
   las 3 rutas y se preserva tal cual dentro del módulo — no se agrega ni se
   generaliza.**
   **Magic-byte validation: explícitamente fuera de alcance de EF-3** — no
   es un hallazgo confirmado (mención hipotética en
   `docs/archive/auditoria-ingenieria-2026-09.md`), implicaría elegir/vetear
   una librería nueva. Declarado aquí para que no quede en silencio, no
   entra a la matriz como diferido porque nunca fue un hallazgo.
3. **Comportamiento a preservar:** mensaje exacto y obligatoriedad de cada
   ruta.
4. **Archivos exactos:** nuevo `lib/server/uploads/factura-validation.ts`;
   `app/api/cuentas-pagar/[id]/subir-factura/route.ts`,
   `app/api/cuentas-cobrar/[id]/subir-factura/route.ts`,
   `app/api/portal/cuentas/[id]/factura/route.ts`.
5. **Nuevos:** el módulo. **Modificados:** las 3 rutas.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** ninguna. **Salientes:** ninguna.
8. **Orden:** independiente.
9. **Riesgo:** P2.
10. **Pruebas:** los 3 tests existentes de las rutas sin modificar
    aserciones de mensaje (incluida la ausencia de `PDF_REQUIRED` en CxC);
    test nuevo del módulo (`pdfRequired` true/false,
    tipos válidos/inválidos por MIME y por extensión, tamaño límite,
    y las **14 combinaciones código×ruta aplicables** de la tabla del
    punto 2 (la tabla tiene 15 casillas — 5
    códigos × 3 rutas — pero `PDF_REQUIRED` está marcado "N/A — nunca se
    emite" para CxC, así que solo 14 combinaciones son casos reales de
    prueba; la casilla N/A no es un caso a verificar, es la ausencia
    documentada de uno).
11. **Criterio de aceptación:** los 3 existentes + el nuevo en verde,
    incluida la tabla completa código×ruta (14 combinaciones aplicables).
12. **Rollback:** revertir las 3 rutas.
13. **Horas:** 8-9h (sube por la tabla completa de 3 rutas y su
    verificación exhaustiva, en vez de 2 ejemplos).
14. **Tamaño:** chico-mediano, 1 PR.
15. **Evidencia:** los tests del punto 10.

---

### EF-3E — Baseline final y cierre

#### 3E-1 — Baseline diagnóstico final (gate real, SHA del código final)

1. **Decisión:** repetir 3A-6 (ambos entornos, mismos 8 escenarios,
   telemetría SQL/Vercel best-effort, **y el mismo ciclo obligatorio de 8
   pasos por target —`runId` distinto, cleanup de huérfanos, seed
   idéntico, verificación de conteos iniciales idénticos, snapshot,
   k6, snapshot, cleanup— especificado en 3A-6 punto 1, sin excepción**)
   sobre el commit final de EF-3, fijado a `loadtest-target` con push
   forzado, dentro de la ventana de `concurrency` compartida con `e2e.yml`.
2. **Criterio de aceptación:** **aquí los umbrales sí son gate real** —
   cualquier escenario que no pase se documenta como fila nueva de la
   matriz, resuelta o diferida con aprobación explícita, antes de declarar
   cerrado EF-3.
3. **Archivos:** `docs/archive/ef-3-baseline-final.md` (100% `.md`).
   **2 commits, regla uniforme de 3A-0 (nunca 1):** commit de contenido
   (crea el archivo, marca la fila `3E-1` `Cerrado` con "Commit SHA"
   pendiente) + commit de sincronización inmediato siguiente (llena el SHA
   real ya existente) — ambos directo a `main`.
4. **Dependencias entrantes:** EF-3B+3C+3D completos.
5. **Horas:** 7-8h.
6. **Tamaño:** chico, 2 commits doc-only (ver punto 3).

#### 3E-2 — Reconciliación documental final

1. **Decisión:** recorrer las 40 filas base del tracker de
   `docs/EF-3_ENGINEERING_HARDENING.md` **más cualquier fila condicional
   presente** (`3B-7b`/`3C-4b`/`3D-0b`, según cuáles se hayan activado) y
   confirmar contra GitHub (PRs,
   merge SHAs, checks) que cada una dice la verdad; incorporar 3E-1;
   cerrar/registrar cada hallazgo de la matriz (25 base + hasta 3
   condicionales activadas, ninguno sin marcar); actualizar
   `ARCHITECTURE.md` con el estado arquitectónico final
   agregado; mover `docs/EF-3_ENGINEERING_HARDENING.md` a
   `docs/archive/ef-3-engineering-hardening.md`; `ROADMAP.md` pasa
   Engineering Hardening a "Cerrado" (EF-1+EF-2+EF-3), enlazando al archivo
   movido; `ACTIVE_WORK.md` refleja el cierre.
2. **Archivos exactos:** el canónico (movido), `ARCHITECTURE.md`,
   `ROADMAP.md`, `ACTIVE_WORK.md`. **2 commits, regla uniforme de 3A-0
   (nunca 1):** commit de contenido (mueve el canónico, actualiza los otros
   3 archivos, marca la fila `3E-2` `Cerrado` con "Commit SHA" pendiente) +
   commit de sincronización inmediato siguiente (llena el SHA real ya
   existente, ya en `docs/archive/ef-3-engineering-hardening.md`) — ambos
   directo a `main`.
3. **Dependencias entrantes:** 3E-1 + tracker al día por la política de
   actualización continua de 3A-0.
4. **Criterio de aceptación:** **las 38
   filas base restantes** (las 40 menos `3E-2` y `3E-3` — un bloque no
   puede verificar que su propia fila ya está en un estado
   final mientras todavía se está cerrando, y `3E-3` corre después de
   este bloque, así que tampoco puede estar terminada todavía) más
   cualquier fila condicional presente, todas con estado final verificado
   contra GitHub — este bloque verifica esas 38 filas ajenas, y **recién
   entonces** cierra su propia fila `3E-2` como parte de su propio commit
   (punto 2, arriba — igual que cualquier otro bloque cierra su propia
   fila al final de su propio trabajo, sin necesitar verificarse a sí
   mismo externamente). `3E-3` (la última fila base) queda deliberadamente
   `Pendiente` — es el único bloque que corre después de este;
   todas las filas de la matriz (base + condicionales activadas) cerradas
   o diferidas con aprobación **salvo que dependan específicamente de la
   verificación que hace 3E-3** (ninguna lo hace: 3E-3 verifica el
   tracker/la matriz, no cierra ningún hallazgo propio). Al terminar este
   bloque, `3E-3` es la única fila `Pendiente` del tracker completo.
5. **Horas:** 3-4h (baja porque el tracker ya estuvo al día durante toda la
   ejecución).
6. **Tamaño:** chico, 2 commits doc-only (ver punto 2).

#### 3E-3 — Cierre formal de Engineering Hardening

1. **Problema:** sin este bloque, nada verifica el estado final del
   tracker/matriz **después** de que 3E-2 ya movió el canónico a
   `docs/archive/` y cerró su propia fila — alguien tendría que confiar en
   que "ya quedó todo bien" sin una verificación explícita y sin ningún
   commit que lo registre.
2. **Decisión:** correr
   `node scripts/validate-ef3-tracker.mjs --require-final --except 3E-3`
   (el modo `--require-final` de 3A-0b — el modo
   estructural por sí solo no verifica que las filas hayan *terminado*,
   solo que el tracker esté bien formado; `--except 3E-3` excluye la
   propia fila, que sigue `Pendiente` mientras esta verificación corre)
   contra `docs/archive/ef-3-engineering-hardening.md` (3A-0b ya localiza
   la ruta archivada) y confirmar que **las 39 filas restantes** (las 40
   base menos la propia `3E-3`, más cualquier condicional presente) están
   `Cerrado`, `No aplica`, o **`Diferido con aprobación` con su nota de
   aprobación explícita no vacía** (las
   secciones 6/7/9 de este plan sí permiten `Diferido con aprobación`
   como cierre legítimo de una fila — este bloque no puede contradecirlas
   tratando solo `Cerrado`/`No aplica` como válidos; `--require-final`
   ya implementa exactamente esta regla de 3 estados, ver 3A-0b) — nunca
   `Bloqueado`/`En curso`/`Pendiente`; recorrer la matriz de hallazgos
   (sección 4) y confirmar que las 25 base + condicionales activadas
   están todas en *bloque cerrado*, *no aplica*, o *diferido* con
   aprobación explícita registrada. **Bloque doc-only (el
   6to, junto a 3A-0/3A-6/3D-8/3E-1/3E-2), mismo mecanismo de 2 commits que
   todos los demás — la única fila cuyo cierre ocurre DESPUÉS de que el
   canónico ya se movió a `docs/archive/`, así que ambos commits editan
   ese archivo archivado, no el activo (que ya no existe en ese punto):**
   commit de contenido (agrega al archivo archivado la sección final
   "EF-3 cerrado — verificación de 3E-3" con el resultado de la
   verificación de arriba, marca la fila `3E-3` `Cerrado` con "Commit SHA"
   pendiente) + commit de sincronización inmediato siguiente (llena el SHA
   real), ambos directo a `main`.
3. **Comportamiento a preservar:** N/A, verificación final.
4. **Archivos exactos:** `docs/archive/ef-3-engineering-hardening.md`
   (agrega la sección final de cierre).
5. **Modificados:** ese archivo.
6. **Migraciones/RPC:** ninguna.
7. **Dependencias entrantes:** 3E-2. **Salientes:** ninguna — último bloque
   del plan.
8. **Orden:** último de los 40.
9. **Riesgo:** N/A.
10. **Pruebas:** corrida real de
    `validate-ef3-tracker.mjs --require-final --except 3E-3` contra el
    archivo archivado, confirmando 0 filas fuera de
    `Cerrado`/`No aplica`/`Diferido con aprobación` (con nota válida)
    entre las 39 restantes.
11. **Criterio de aceptación:** la corrida del punto 10 sale limpia; la
    matriz de hallazgos no deja ninguna fila sin marcar.
12. **Rollback:** revertir el commit de contenido (el archivo archivado
    vuelve al estado que dejó 3E-2).
13. **Horas:** 3-4h (por el entregable real de la sección de cierre).
14. **Tamaño:** chico, 2 commits doc-only.
15. **Evidencia:** el log de la corrida de `validate-ef3-tracker.mjs` del
    punto 10, pegado en la sección final de cierre del archivo archivado.

---

## 7. Criterio objetivo de cierre de Engineering Hardening

Se declara cerrado cuando, **todos**:

1. Las 40 filas base del tracker más cualquier fila condicional presente
   (`3B-7b`/`3C-4b`/`3D-0b`) están `Cerrado` — **con PR+merge SHA si son
   bloques con rama, o con Commit SHA si son de los 6 bloques doc-only**
   (3A-0/3A-6/3D-8/3E-1/3E-2/3E-3 — un criterio
   único de "PR+merge SHA" no aplica a los doc-only, que nunca abren PR) —
   o `No
   aplica` — ninguna `Diferido con aprobación` salvo que una fila
   condicional activada u otro hallazgo nuevo
   real de la ejecución la tenga con aprobación explícita registrada del
   usuario.
2. `docs/archive/ef-3-baseline-final.md` compara ambos entornos contra el
   baseline previo; cualquier umbral no alcanzado quedó resuelto o diferido
   con aprobación.
3. CI completo (`test` con `tracker-lint`, `fresh-db`, `live`,
   `smoke-and-critical`) verde en cada PR de EF-3.
4. `docs/EF-3_ENGINEERING_HARDENING.md` movido a `docs/archive/` con tracker
   100% cerrado; `ARCHITECTURE.md`/`ROADMAP.md`/`ACTIVE_WORK.md` reflejan el
   estado real.
5. El validador de tracker (3A-0b) pasa en el estado final.
6. Todas las filas de la matriz de hallazgos (sección 4) — las 25 base y
   cualquiera de las 3 condicionales (F14b, F15b, F26) que se haya
   activado — terminaron en *bloque cerrado* o *no aplica*; ninguna quedó
   como *diferido* salvo con aprobación explícita registrada.

---

## 8. Estimación recalculada

Recalculada desde cero sumando el punto 13 ("Horas") de cada uno de los 40
bloques tal como quedaron en esta ronda (no arrastrada de una ronda
anterior):

| Subfase | Bloques | Suma por bloque (h) | Horas |
|---|---|---|---|
| EF-3A | 8 (3A-0, 3A-0b, 3A-1..3A-6) | 5-6 + 10-12 + 18-20 + 11-13 + 9-10 + 20-23 + 40-46 + 7-8 | 120-138h |
| EF-3B | 12 (3B-1..3B-12) | 10-12 + 16-18 + 13-15 + 20-23 + 11-13 + 11-13 + 9-11 + 6-7 + 9-10 + 19-23 + 8-9 + 7-8 | 139-162h |
| EF-3C | 4 (3C-1..3C-4) | 8-10 + 8-9 + 23-26 + 8-9 | 47-54h |
| EF-3D | 13 (3D-0..3D-12) | 18-22 + 3-4 + 8-10 + 8-10 + 4-5 + 18-22 + 18-20 + 8-10 + 4-5 + 8-10 + 8-10 + 6-7 + 8-9 | 119-144h |
| EF-3E | 3 (3E-1..3E-3) | 7-8 + 3-4 + 3-4 | 13-16h |
| **Total (alcance base, 40 bloques)** | **40** | — | **438-514h** |

**No incluidas en el total de arriba, porque son condicionales y solo
existen si su gate/medición/test respectivo falla** (nunca se asumen por
adelantado, sección 4):
- **F14b / `3B-7b`** (remediación si 3B-7 no pasa el gate de latencia
  serverless sin caché): sin estimación de horas propia — se trata como
  bloque nuevo, dimensionado cuando (si) ocurre, igual que cualquier
  hallazgo real encontrado durante la ejecución.
- **F15b / `3C-4b`** (remediación si 3C-4 no pasa el margen de duración de
  `maxDuration`, paso (b) de chunking determinista — ver 3C-4 punto 2):
  **+6-8h**, ya estimadas dentro de la propia especificación de 3C-4 al ser
  un procedimiento ya decidido, no abierto.
- **F26 / `3D-0b`** (remediación si T11/T12 de 3D-0 revelan una
  carrera/pérdida real): sin estimación de
  horas propia — bloque correctivo nuevo, dimensionado cuando (si) se abre,
  con su propia especificación de 15 puntos igual que el resto del plan.

El tiempo total sigue sin ser la
prioridad — dimensiona la iniciativa, no compromete fecha. (La ronda 12,
externa, no modificó ningún SQL/RPC/decisión de diseño — solo 6 textos
descriptivos — así que la estimación por bloque no cambió frente a la v11.)

---

## 9. Organización de PRs y ejecución entre sesiones

- **3A-0 primero, siempre; 3A-0b antes que cualquier rama de código de
  producto.**
- Rama dedicada por bloque, PR en borrador desde el primer commit útil.
- Bloques grandes (3A-5, 3B-2, 3B-4, 3B-10, 3D-0, 3D-5, 3D-6, 3C-3) se
  parten en varios PRs si su spec lo indica.
- Ningún bloque nuevo arranca hasta que el anterior esté `Cerrado` en el
  tracker (criterio de aceptación + CI verde + sincronización post-merge en
  `main`, inmediata, no solo en la rama), salvo las paralelizaciones
  explícitas del grafo (sección 5).
- Actualización continua: `En curso` al empezar (con sincronización
  inmediata a `main`, no solo en la rama); checkpoint en `ACTIVE_WORK.md` si la sesión corta a
  medias; evidencia+estado en la rama antes de pedir review;
  `Cerrado`+PR+SHA inmediatamente después del merge.
- La excepción doc-only de `CLAUDE.md` aplica a los **6 bloques doc-only**:
  3A-0,
  3A-6, 3D-8, 3E-1, 3E-2, 3E-3, y
  las sincronizaciones puntuales del tracker — todos diff 100% `.md`, y
  todos usan el mismo mecanismo de 2 commits (contenido + sincronización,
  regla uniforme de 3A-0) empujados juntos en un solo push. Todo
  lo demás (incluido 3A-0b) sigue rama + PR normal.
- Los bloques condicionales (`3B-7b` para F14b, `3C-4b` para F15b, `3D-0b`
  para F26) no existen como fila del tracker hasta que su
  gate/medición/test los activa; si se activan, se agregan como fila nueva
  del tracker con su propio ID, siguen rama + PR normal (tocan código, no
  son doc-only) y se insertan en el grafo de dependencias en el punto
  exacto que su bloque de origen especifica (3B-7, 3C-4 y 3D-0/3D-6
  respectivamente).

---

**Nada de este plan se ha ejecutado.** La primera acción tras la aprobación
es 3A-0 (que ahora, además de crear el canónico completo, aplica las 6
correcciones textuales de la ronda 12 directamente en el contenido que
escribe — ver la tabla de auditoría de esta ronda al inicio del documento).
**Usuario confirmó ejecución del plan — 3A-0 arranca con este mismo commit.**

---

## 10. Historial de rondas de auditoría

Una línea por ronda real, sin fijar de antemano un número de líneas (ver la
corrección de la ronda 12 en 3A-0, punto 2 — un historial con un número de
líneas fijo queda obsoleto en cuanto el plan pasa por una ronda más):

1. **Ronda 1** — primera versión completa del plan EF-3, cubriendo los 5
   frentes A-E de la auditoría de ingeniería original (`docs/archive/auditoria-ingenieria-2026-09.md`).
2. **Ronda 2** — segunda revisión de alcance y bloques iniciales.
3. **Ronda 3** — tercera revisión, cierre de huecos de especificación
   previos a la v5. (El detalle línea por línea de las rondas 1-3 no
   sobrevivió como tabla independiente en este documento — solo su
   resultado acumulado, la v5 "final", quedó como base de las rondas
   documentadas desde la 4 en adelante. Documentado así, sin fabricar
   detalle que no se preservó — "fallar explícito, nunca en silencio".)
4. **Ronda 4** — corrige 18 hallazgos: separa 3A-0/3A-0b (doc-only vs
   rama+PR), corrige `.limit(5000)` vs `db.max_rows` real de PostgREST,
   redefine el cleanup de Drive por carpeta dedicada de `runId`, cierra
   campos de búsqueda de Cotizaciones y RPCs de 3B-8/3B-9/3B-13, y
   rediseña el lock de Sheets con `plpgsql`+`GET DIAGNOSTICS`.
5. **Ronda 5** — cierra 13 huecos: parámetros exactos de k6, RPC de
   telemetría de `pg_stat_statements`, override de folder de Drive para
   uploads, módulo propio de cleanup masivo paginado, y el resultado
   esperado del characterization test de reconciliación.
6. **Ronda 6** — deduplica 3C-4 (estaba repetido), cierra la remediación de
   duración del cron en 2 pasos fijos, separa 3D-0 en test-only puro con
   `3D-0b` condicional si revela una carrera real, y corrige el mecanismo
   de "segundo commit" de los bloques doc-only.
7. **Ronda 7** — 14 correcciones: valida hasta 3 filas condicionales en el
   tracker, cierra la tabla exacta de 13 variables de entorno de 3A-1,
   resuelve `signPortalSession` desde un script `.mjs` vía endpoint interno,
   corrige el cleanup de reservas de folio y RLS de `loadtest_runs`, y
   corrige el esquema real de `pg_stat_statements` (`extensions`, no
   `public`).
8. **Ronda 8** — corrige `deleteByIdsInChunks` eliminada por error,
   `LoadtestOverrideRejectedError` sin `buildErrorResponse` en la ruta de
   Portal, prueba de equivalencia de `3B-6` que se comparaba contra sí
   misma, y corrige "10 con acción" a "12 con acción" en el inventario.
9. **Ronda 9** — 13 hallazgos grandes: tabla de variables de 3A-1 dividida
   en runtime/scripts, validación Zod en el endpoint de sesión de Portal,
   especificación exhaustiva de los 8 escenarios de k6, rediseño del modal
   de copiar partidas en 2 pasos, fallback de `proyecto_nombre` en la RPC
   de CxP, y rediseño completo del sistema de tracker/cierre (2 rutas de
   archivo, 6 bloques doc-only, mecanismo de 2 commits uniforme).
10. **Ronda 10** — 12 correcciones: rediseño completo de
    `editar-concurrente.js` (setup() real de k6, conexión Realtime
    observadora dedicada), evento `item_confirmed` cerrado contra el código
    real, política canónica de redondeo decimal-seguro (`round2`), y
    remediación por cursor de página dentro de una tabla para 3C-4.
11. **Ronda 11** — 8 correcciones: fix de `Date.now()` vs `performance.now()`
    en la métrica de latencia de Realtime, patrón de endpoint interno para
    `createDriveFolder`, `SMOKE` fixtureCount real en `uploads.js`, y ajustes
    de consistencia numérica (38 filas, 11 tablas, "décima primera versión").
12. **Ronda 12** — primera auditoría externa e independiente (verificación
    de ~60 afirmaciones puntuales contra el repo real vía exploración de
    solo lectura, no autorrevisión): 6 correcciones textuales — versión de
    la Sección 1, historial de cambios de 3A-0 sin número fijo, conteo real
    de casos de prueba de 3A-1 (14, no 11), descripción real del cleanup de
    `idempotency_keys` en 3C-4, y los consumidores reales de
    `getCotizaciones()`/`getProveedores()` en 3B-4/3B-6. Veredicto: **seguro
    para implementar**, ninguna corrección tocó SQL/RPC/decisión de diseño.

---

## 11. Tracker de los 40 bloques

Una fila por bloque (sección 2). Campos por tipo de bloque según la tabla de
la sección 6 (3A-0, punto 2): un bloque **con rama** tiene "Rama"/"PR"/
"Commit de merge" reales y "Commit SHA" vacío hasta mergear; un bloque
**doc-only** (3A-0, 3A-6, 3D-8, 3E-1, 3E-2, 3E-3) tiene "Rama"/"PR"/"Commit
de merge" siempre en `N/A` y usa "Commit SHA" en su lugar. "Criterio de
aceptación" y "Evidencia" de cada fila son el punto 11 y 15 de la
especificación de ese bloque en la Sección 6 de este mismo documento —
referenciados ahí, no duplicados aquí (evita una tabla de 40 filas con
contenido multi-párrafo repetido). "Nota" es el campo "Decisión o bloqueo
pendiente" del punto 3A-0 — vacío salvo un `Diferido con aprobación`, que
exige aquí la nota de aprobación explícita no vacía (regla de 3 estados de
`--require-final`, ver 3A-0b).

| ID | Estado | Dependencias | Rama | PR | Commit SHA | Commit de merge | Nota | Próxima acción |
|---|---|---|---|---|---|---|---|---|
| 3A-0 | Cerrado | ninguna | N/A | N/A | `09ad7fc` | N/A | | Arrancar 3A-0b |
| 3A-0b | Cerrado | 3A-0 | `claude/hopeful-allen-jql9xp` | [#34](https://github.com/EduardoTerwogt/serenata-erp/pull/34) | — | `94e5944` | | — |
| 3A-1 | Pendiente | 3A-0b | — | — | — | — | | Bloqueado por paso manual del usuario (crear proyecto Vercel aislado + secretos, ver spec 3A-1 punto 2) |
| 3A-2 | Pendiente | 3A-1 | — | — | — | — | | — |
| 3A-3 | Pendiente | 3A-1 | — | — | — | — | | — |
| 3A-4 | Pendiente | 3A-1 | — | — | — | — | | — |
| 3A-5 | Pendiente | 3A-1, 3A-2, 3A-3, 3A-4 | — | — | — | — | | — |
| 3A-6 | Pendiente | 3A-1, 3A-2, 3A-3, 3A-4, 3A-5 | N/A | N/A | — | N/A | | — |
| 3B-1 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#35](https://github.com/EduardoTerwogt/serenata-erp/pull/35) | `bdc87b9` | `a317144` | | Arrancar 3B-2 |
| 3B-2 | Cerrado | 3B-1 | `claude/hopeful-allen-jql9xp` | [#36](https://github.com/EduardoTerwogt/serenata-erp/pull/36) | `e85662c` | `f251a3c` | | Arrancar 3B-3 |
| 3B-3 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#37](https://github.com/EduardoTerwogt/serenata-erp/pull/37) | `4020aed` | `5179b8e` | | Arrancar el siguiente bloque independiente (3B-4, 3B-5, 3B-6, 3B-8, 3B-9, 3B-11, 3B-12, 3C-1, 3D-0) |
| 3B-4 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#38](https://github.com/EduardoTerwogt/serenata-erp/pull/38) | `01633a1` | `3ce5678` | | Arrancar el siguiente bloque independiente (3B-5, 3B-6, 3B-8, 3B-9, 3B-11, 3B-12, 3C-1, 3D-0) |
| 3B-5 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#39](https://github.com/EduardoTerwogt/serenata-erp/pull/39) | `cc76bf1` | `1eeee6f` | | Arrancar el siguiente bloque independiente (3B-6, 3B-8, 3B-9, 3B-11, 3B-12, 3C-1, 3D-0) |
| 3B-6 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#40](https://github.com/EduardoTerwogt/serenata-erp/pull/40) | `c67cd4f` | `baec49b` | | Arrancar el siguiente bloque independiente (3B-8, 3B-9, 3B-11, 3B-12, 3C-1, 3D-0) |
| 3B-7 | Pendiente | 3A-1 | — | — | — | — | | — |
| 3B-8 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#41](https://github.com/EduardoTerwogt/serenata-erp/pull/41) | `13e2646` | `7e233c5` | | Arrancar el siguiente bloque independiente (3B-9, 3B-11, 3B-12, 3C-1, 3D-0) |
| 3B-9 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#42](https://github.com/EduardoTerwogt/serenata-erp/pull/42) | `85b28f6` | `3d48178` | | Arrancar el siguiente bloque independiente (3B-11, 3B-12, 3C-1, 3D-0) |
| 3B-10 | Pendiente | 3B-1 | — | — | — | — | | — |
| 3B-11 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#43](https://github.com/EduardoTerwogt/serenata-erp/pull/43) | `7f7497a` | `bd69268` | | Arrancar el siguiente bloque independiente (3B-12, 3C-1, 3D-0) |
| 3B-12 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#44](https://github.com/EduardoTerwogt/serenata-erp/pull/44) | `814ba3e` | `101b243` | | Arrancar el siguiente bloque independiente (3C-1, 3D-0) |
| 3C-1 | Cerrado | ninguna | `claude/hopeful-allen-jql9xp` | [#45](https://github.com/EduardoTerwogt/serenata-erp/pull/45) | `a6c734a` | `753c982` | | Arrancar el siguiente bloque independiente (3C-2, 3D-0) |
| 3C-2 | Cerrado | 3C-1 | `claude/hopeful-allen-jql9xp` | [#46](https://github.com/EduardoTerwogt/serenata-erp/pull/46) | `25def7c` | `6723280` | | Arrancar el siguiente bloque independiente (3C-3, 3D-0) |
| 3C-3 | Cerrado | 3C-2 | `claude/hopeful-allen-jql9xp` | [#47](https://github.com/EduardoTerwogt/serenata-erp/pull/47) | `7e3a873` | `71881de` | | Arrancar el siguiente bloque independiente (3C-4, 3D-0) |
| 3C-4 | Pendiente | 3C-3 | — | — | — | — | | Bloqueado: la medición empírica obligatoria del punto 2 exige volumen objetivo (items_cotizacion≥5500) en el entorno serverless real de 3A-1 — hoy `serenata-erp-test` tiene 11 filas. Pausado por decisión del usuario hasta que 3A-1/3A-3 se resuelvan (setup manual de Vercel pendiente) |
| 3D-0 | En curso | ninguna | `claude/hopeful-allen-jql9xp` | [#48](https://github.com/EduardoTerwogt/serenata-erp/pull/48) | — | — | | — |
| 3D-0b | Pendiente | 3D-0 | — | — | — | — | | Bloque activado por F26 (T12 de 3D-0 confirmó la carrera real) -- ver especificación en la sección 6 |
| 3D-1 | Pendiente | 3D-0 | — | — | — | — | | — |
| 3D-2 | Pendiente | 3D-1 | — | — | — | — | | — |
| 3D-3 | Pendiente | 3D-2 | — | — | — | — | | — |
| 3D-4 | Pendiente | 3D-3 | — | — | — | — | | — |
| 3D-5 | Pendiente | 3D-0, 3D-1, 3D-2, 3D-3, 3D-4 | — | — | — | — | | — |
| 3D-6 | Pendiente | 3D-0, 3D-0b, 3D-2, 3D-3, 3D-4, 3D-5 | — | — | — | — | | — |
| 3D-7 | Pendiente | 3D-0, 3D-2, 3D-3, 3D-4, 3D-5, 3D-6 | — | — | — | — | | — |
| 3D-8 | Pendiente | 3D-0, 3D-1, 3D-2, 3D-3, 3D-4, 3D-5, 3D-6, 3D-7 | N/A | N/A | — | N/A | | — |
| 3D-9 | Pendiente | ninguna | — | — | — | — | | — |
| 3D-10 | Pendiente | ninguna | — | — | — | — | | — |
| 3D-11 | Pendiente | ninguna | — | — | — | — | | — |
| 3D-12 | Pendiente | ninguna | — | — | — | — | | — |
| 3E-1 | Pendiente | 3B-1, 3B-2, 3B-3, 3B-4, 3B-5, 3B-6, 3B-7, 3B-8, 3B-9, 3B-10, 3B-11, 3B-12, 3C-1, 3C-2, 3C-3, 3C-4, 3D-0, 3D-1, 3D-2, 3D-3, 3D-4, 3D-5, 3D-6, 3D-7, 3D-8, 3D-9, 3D-10, 3D-11, 3D-12 | N/A | N/A | — | N/A | | — |
| 3E-2 | Pendiente | 3E-1 | N/A | N/A | — | N/A | | — |
| 3E-3 | Pendiente | 3E-2 | N/A | N/A | — | N/A | | — |

**Filas condicionales** (`3B-7b`/`3C-4b`/`3D-0b`) — no existen todavía;
se agregan solo si su gate/medición/test respectivo (3B-7/3C-4/3D-0) las
activa, siguiendo la regla de proceso de 3A-0b (primero PR que actualiza
matriz+grafo+validador, después la fila).

