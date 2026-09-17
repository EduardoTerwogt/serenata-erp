# Roadmap

**Última actualización:** 2026-09-17

Dirección general del producto. Responde **¿hacia dónde vamos?** — no es el prompt de
una sesión de trabajo. Para lo que se está construyendo ahora,
`docs/ACTIVE_WORK.md`.

**Engineering Hardening (EF-1+EF-2+EF-3) está cerrado por completo.** Las 3
iniciativas — 12 sub-bloques (EF-1), 6 sub-bloques (EF-2) y 41 bloques
(EF-3) — terminaron. Historia completa de EF-3 (40 bloques base + 4
condicionales, matriz de 28 hallazgos, gate real de carga):
[`docs/archive/ef-3-engineering-hardening.md`](archive/ef-3-engineering-hardening.md).
**No hay ninguna iniciativa de Engineering Hardening en curso** — lo que
sigue es producto, y se define en Chat con el estado real del sistema a la
vista (deliberadamente no precomprometido aquí para no priorizar con
información vieja).

**F28 — RESUELTO (2026-09-17).** El hallazgo de EF-3 sobre la race de
concurrencia en la rotación del cookie de sesión de `next-auth`
([`nextauthjs/next-auth#8897`](https://github.com/nextauthjs/next-auth/issues/8897),
sigue abierto upstream) se retomó y cerró en la misma sesión en que se
documentó el diferimiento. Fix: PR
[#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71) (mergeado,
commit `136fee9`) — `proxy.ts` deja de envolver con `auth()` (causa real:
reemitía el cookie de sesión en cada invocación) y usa `getToken()` en su
lugar. Verificado con un test e2e nuevo de concurrencia real contra el
entorno de test. Detalle completo:
[`docs/decisions/010-f28-diferir-race-cookie-nextauth.md`](decisions/010-f28-diferir-race-cookie-nextauth.md).

---

## Cerrado — Engineering Hardening (EF-1 + EF-2 + EF-3)

**EF-1 mergeado a `main`** (PR [#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29),
2026-09-13): baseline, 1C-1, 1E-1, 1C-2a/b (bulk de partidas), 1B-3, 1B-4,
1E-3a/b/c (idempotencia financiera) + 7 hallazgos de una auditoría posterior
del propio PR. Detalle completo, decisiones y hallazgos: `docs/archive/` y
[`docs/decisions/008`](decisions/008-idempotencia-cliente-orden-fingerprint-normalize-persist.md).

**EF-2 mergeado a `main`** (PR [#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31),
2026-09-13, commit `980464c`): 1A-1/1A-2 (resiliencia y reconexión de
Realtime), 1B-1 (aislar `supabaseAdmin`), 1B-2a/1B-2b (revocación de sesión
de staff vía `session_version`, [`docs/decisions/009`](decisions/009-revocacion-sesion-staff-session-version.md)),
1D-1 (`after()` para broadcasts fire-and-forget), 1D-3 (retiro de 3 de 4
cachés locales, medido con p95 real contra Preview), 1E-2 (`DomainError` +
logger estructurado en 3 rutas). Dos rondas de auditoría del propio PR
encontraron y corrigieron hallazgos reales antes de mergear — detalle en
`docs/archive/` una vez se archive la bitácora de la sesión.

**EF-3 cerrado (2026-09-14 a 2026-09-17)** — plan v12, 12 rondas de
auditoría (la última, externa e independiente contra el repo real). 41
bloques repartidos en 5 subfases (3A tooling/carga, 3B escalabilidad de
datos, 3C correctness serverless, 3D mantenibilidad, 3E cierre). Detalle
completo, tracker final y matriz de 28 hallazgos:
[`docs/archive/ef-3-engineering-hardening.md`](archive/ef-3-engineering-hardening.md).
Los frentes A-E de abajo reflejan el estado real tras EF-3.

### Frentes

| Frente | Qué resuelve | P | Estado tras EF-3 |
|---|---|---|---|
| **A. Escalabilidad del acceso a datos** | El patrón "traer toda la tabla y filtrar en JS". Incluía un bug latente: `getCuentasPagar()` tenía `.limit(500)` y varias rutas buscaban por ID dentro de esa lista, así que con 501+ cuentas una cuenta válida respondía "no encontrada" sin error ni log. | P0 | **Cerrado por EF-3 (3B-1..3B-12).** RPCs server-side para CxC/CxP/Órdenes de pago/Dashboard/resumen de documentos de proveedores (paginación, búsqueda, totales y agregados en SQL). El `.limit(500)` de `getCuentasPagar()` fue eliminado de paso en 3B-10 al reemplazar `getResumenDashboard()` por agregados SQL. |
| **B. Correctness serverless** | Trabajo que asumía un proceso único de larga vida corriendo en funciones efímeras: broadcasts con `void Promise`, caches en `Map`, debounce de Sheets con `setTimeout`. Incluía un evento `bulk` de Realtime que se descartaba en silencio. | P0/P1 | **Prácticamente cerrado.** Broadcasts vía `after()` (EF-2 1D-1). Las 4 cachés locales retiradas — las 3 de EF-2 (1D-3) más `folio.ts` en 3B-7 (`CacheManager`/`invalidateFolioCache()` removidos, la RPC de preview se llama directo). `triggerSheetsSync()` y sus 31 call sites eliminados (3C-1); `sync-down.ts` paginado (3C-2); lock de Sheets con lease/renovación/recuperación de huérfanos (3C-3); retención de `rate_limits` + safety-net diario vía el mismo lock (3C-4). El evento `bulk` de Realtime descartado en silencio no fue parte del alcance de EF-3 — sigue sin tocar. |
| **C. Superficie de riesgo** | `supabaseAdmin` accesible desde cualquier ruta, sin revocación de sesión para staff, `CRON_SECRET` que falla abierto si no existe, e idempotencia que trata cualquier error de INSERT como duplicado. | P1 | **Parcial, sin cambio en EF-3.** `supabaseAdmin` aislado (EF-2 1B-1) y revocación de sesión de staff (EF-2 1B-2a/1B-2b) siguen siendo lo único resuelto. `CRON_SECRET` fail-open e idempotencia de INSERT no fueron parte del alcance de EF-3 — siguen pendientes. Además, EF-3 encontró un hallazgo nuevo de esta misma familia: **F28**, race de concurrencia real en la rotación del cookie de sesión de `next-auth` — **resuelto** en PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71), ver más arriba y `docs/decisions/010-f28-diferir-race-cookie-nextauth.md`. |
| **D. Mantenibilidad** | `app/cotizaciones/[id]/page.tsx` con ~2,400 líneas y demasiadas responsabilidades, manejo de errores inconsistente, y lógica de upload duplicada en tres módulos. | P1/P2 | **Cerrado por EF-3 (3D-0..3D-12).** `page.tsx` bajó de 2,388 a ~660 líneas extrayendo los 7 hooks planeados, incluido `useQuotationItemCellsAutosave` (3D-5 — inicialmente pausado por decisión del usuario, retomado y cerrado dentro de EF-3 con prueba manual real contra `serenata-erp-loadtest`). `DomainError`+logger adoptado en ~15 rutas más (financieras, Portal completo, Proyectos). Deduplicación de upload de factura hecha (`lib/server/uploads/factura-validation.ts`, CxP/CxC/Portal). |
| **E. Pruebas de carga** | Los tests actuales prueban correctness con 2-10 sesiones, no capacidad. Faltaba una suite (k6) que respondiera objetivamente "¿aguanta si mañana entran 100 personas?". | P1 | **Cerrado, con respuesta real y un hallazgo diferido.** Los 8 escenarios k6 (3A-5/3A-6) y el gate real de 8 escenarios × local/serverless (3E-1) corrieron sobre el código final de EF-3. `http_req_duration` (p95<800ms/p99<1500ms) pasó siempre en los 7 escenarios concurrentes, en ambos entornos. `http_req_failed` (rate<1%) solo pasó en `portal.js` (150 VUs limpio) — los otros 6 escenarios rompían por **F28** (ver Frente C), no por capacidad real del sistema. Root-caused a fondo y **resuelto** (PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71)); no fue deuda oculta. |

**Hallazgos completos, con el detalle de cada caso y la norma arquitectónica que debe
quedar establecida al cerrar cada frente:**
[`docs/archive/auditoria-ingenieria-2026-09.md`](archive/auditoria-ingenieria-2026-09.md).

Los 41 bloques de EF-3, auditados contra el código real (12 rondas) y
ejecutados de punta a punta, quedan en
[`docs/archive/ef-3-engineering-hardening.md`](archive/ef-3-engineering-hardening.md).

---

## Siguiente

**Agrupar Cuentas por Pagar por proveedor+proyecto para facturación** —
iniciativa aprobada, en ejecución. Hoy se pide factura por cada item de
cotización por separado; cuando un proveedor tiene varios items dentro del
mismo proyecto, deben agruparse para facturar (y pagar) el total acumulado
en una sola operación, incluyendo el caso de facturas complementarias.
Tracker completo, diseño y bloques: [`docs/PLAN.md`](PLAN.md).

---

## Después

**Sin definir a propósito.** Al cerrar Engineering Hardening por completo (EF-2 y
EF-3) se prioriza en Chat, con el estado real del sistema a la vista.

El material candidato está en el roadmap de producto de 2026-09-04 (Fase 5, del que
ya se entregaron el Portal, el Dashboard con gastos fijos, y las bases de Proyectos y
Cuentas) más lo que surja de las dos iniciativas de arriba. Sigue pendiente de ese
documento: Cuentas agrupadas por proyecto y cruce fiscal, los agregados del Cotizador
(copiar entre cotizaciones, columna Costo + IVA, calculadora de impuestos), Proyectos
como herramienta de PM con asistente sobre el historial, y cerrar la migración visual.

Ninguno de esos está comprometido todavía.

---

## Features a medias

Están construidos parcialmente **a propósito**. No "arreglarlos" de paso sin
confirmar: cerrarlos es una iniciativa con alcance propio, no un fix incidental.

- **Google Calendar desde Proyectos** — la UI existe, el flujo end-to-end no cierra.
  En Planeación sí funciona; no asumir que es lo mismo.
- **Complementos de pago (CFDI)** — se suben y se registran, pero el XML no se parsea
  y la conciliación automática contra cuentas por cobrar no está hecha.
- **Órdenes de pago** — el CRUD y el PDF funcionan; los flujos de aprobación y firma
  no existen.
- **Plantillas de servicios** — completas para cotizaciones nuevas; la integración con
  cotizaciones COMPLEMENTARIA es parcial.

**Rediseño visual (Fase 5.7)** salió de esta lista el 2026-09-11: verificado que las
pantallas y primitivos que quedaban pendientes ya usan los tokens `--sn-*`. Detalle
en `DESIGN_SYSTEM.md`.

Si aparece otro feature a medias, documentarlo aquí.

---

## Cerrado

- **Fase 8.7.2, Drenado real por celda + sincronización de migraciones
  (2026-09-12).** Cerró 2 bugs reportados (avisos de "editando" que no se
  actualizaban, Totales sin recalcular tras agregar fila) con las causas E-I sobre
  el drenado por celda, base refrescada tras cada PATCH y comparación de conflicto
  normalizada — y, verificando ese cierre, encontró y corrigió 2 migraciones de
  producción atrasadas (`delete_item_cotizacion` no existía ahí) que además habrían
  revertido en silencio 2 fixes ya aplicados por separado, un bug real en el
  drenado (`itemDirtyCellsRef` se limpiaba antes de tiempo) y datos de test
  acumulados rompiendo el límite de PostgREST en `GET /api/productos`. Historia:
  `docs/archive/fase-8.7.2-drenado-partidas-y-sincronizacion.md`.
- **Fase 8.7.1, Serializar mutaciones de partidas contra Generar/Aprobar
  (2026-09-11).** Una auditoría sobre el cierre de Fase 8.7 encontró que
  `flushPendingSaves` solo cubría cuatro de las nueve vías de mutación de partidas y
  que ninguna escritura de partidas revisaba el `estado` de la cotización dueña.
  Cerrado con un guard transaccional (`FOR SHARE`) en las tres RPCs de escritura de
  partidas + flush completo de las cinco vías que faltaban. Historia:
  `docs/archive/fase-8.7.1-estado-guard-partidas.md`.
- **Fase 8.7, Cierre real de Collaboration (2026-09-11).** Cerró los cinco huecos
  de la auditoría de Fase 8 (flush real previo a Generar/Aprobar, cleanup de
  Presence en reconexión, prueba live de Aprobar bajo concurrencia, `409`
  explícito por UUID cruzado, `ARCHITECTURE.md` actualizado) y declaró
  Cotizaciones READY. Historia: `docs/archive/fase-8.7-cierre-collaboration.md`.
- **Colaboración en cotizaciones (Fases 0-8).** Edición simultánea con modelo
  server-authoritative, conflictos por campo, Realtime solo Presence.
  Historia: `docs/archive/fases-colaboracion-0-8.md`.
- **Roadmap de producto Fases 1-4 (2026-09-04).** Limpieza de deuda, riesgos, los 5
  fixes del incidente del 3 de septiembre y los ajustes de uso real.
- **Fase 5 parcial.** Portal de proveedores, Dashboard ejecutivo con gastos fijos, y
  las bases de Proyectos y Cuentas.

---

## Cómo se mantiene

Una iniciativa entra a **Siguiente** cuando se prioriza, pasa a `ACTIVE_WORK.md`
cuando arranca, y vuelve aquí como **Cerrado** cuando termina. Si generó una bitácora
larga, esa bitácora se archiva — no se queda en los documentos vivos.

No todo lo que se trabaja pasa por aquí. Al abrir sesión (`serenata-iniciar-fase`),
lo que no está ya en este documento se clasifica por alcance: si toma más de una
sesión, agrega un módulo/feature o cambia una capa/arquitectura, entra primero a
**Siguiente** o **Después** antes de arrancar. Si es un ajuste puntual de una sola
sesión, se trabaja directo sin tocar este documento y solo queda registrado en
`docs/ACTIVE_WORK.md` al cerrar.

**Iniciativas grandes (varias sesiones/bloques) usan `docs/PLAN.md`** como tracker
de nombre fijo — no un archivo nuevo por iniciativa. Nace como borrador desde la
primera idea confirmada (antes de que el plan esté terminado, para que sea visible
entre cuentas de Claude distintas), se refina en vivo editando el archivo, se
ejecuta bloque por bloque, y al cerrar la iniciativa se archiva con `git mv` a
`docs/archive/<slug-descriptivo>.md` — mismo patrón que usó Engineering Hardening,
con nombre fijo en vez de uno por iniciativa. Detalle completo del ciclo en el
propio `docs/PLAN.md`.
