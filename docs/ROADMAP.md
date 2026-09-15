# Roadmap

**Última actualización:** 2026-09-15

Dirección general del producto. Responde **¿hacia dónde vamos?** — no es el prompt de
una sesión de trabajo. Para lo que se está construyendo ahora,
`docs/ACTIVE_WORK.md`.

Queda una iniciativa comprometida en curso: Engineering Hardening (EF-1 y EF-2
cerrados, **EF-3 autorizado y en ejecución** — plan v12,
[`docs/EF-3_ENGINEERING_HARDENING.md`](EF-3_ENGINEERING_HARDENING.md), 40
bloques, tracker en la Sección 11 de ese documento). **Lo que sigue después
es producto y se define en Chat una vez cerrada por completo** —
deliberadamente, para no priorizar features con información vieja.

---

## Ahora — Engineering Hardening (EF-1/EF-2 cerrados, EF-3 en ejecución)

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

**EF-3 autorizado (2026-09-14)** — plan v12, 12 rondas de auditoría (la
última, externa e independiente contra el repo real). 40 bloques repartidos
en 5 subfases (3A tooling/carga, 3B escalabilidad de datos, 3C correctness
serverless, 3D mantenibilidad, 3E cierre). Detalle completo, tracker en
vivo y matriz de 25-28 hallazgos:
[`docs/EF-3_ENGINEERING_HARDENING.md`](EF-3_ENGINEERING_HARDENING.md). Los
frentes A-E de abajo reflejan lo que EF-2 cerró y lo que EF-3 cierra.

### Frentes

| Frente | Qué resuelve | P | Estado tras EF-2 |
|---|---|---|---|
| **A. Escalabilidad del acceso a datos** | El patrón "traer toda la tabla y filtrar en JS". Incluye un bug latente: `getCuentasPagar()` tiene `.limit(500)` y varias rutas buscan por ID dentro de esa lista, así que con 501+ cuentas una cuenta válida responde "no encontrada" sin error ni log. | P0 | **Sin tocar.** EF-2 1D-3 encontró un caso más del mismo patrón (`previewNextQuotationFolio()` sin límite/filtro, `docs/ACTIVE_WORK.md` → Deuda técnica) pero no lo corrigió — fuera de alcance por decisión del plan. |
| **B. Correctness serverless** | Trabajo que asume un proceso único de larga vida corriendo en funciones efímeras: broadcasts con `void Promise`, caches en `Map`, debounce de Sheets con `setTimeout`. Incluye un evento `bulk` de Realtime que se descarta en silencio y que la reconciliación oculta. | P0/P1 | **Parcial.** Broadcasts de cotizaciones ahora van por `after()` (1D-1). 3 de 4 cachés locales retirados (1D-3) — `folio` se quedó, ver gotcha de serverless en `ARCHITECTURE.md`. Debounce de Sheets y el evento `bulk` descartado siguen sin tocar. |
| **C. Superficie de riesgo** | `supabaseAdmin` accesible desde cualquier ruta, sin revocación de sesión para staff, `CRON_SECRET` que falla abierto si no existe, e idempotencia que trata cualquier error de INSERT como duplicado. | P1 | **Parcial.** `supabaseAdmin` aislado con `server-only` (1B-1). Revocación de sesión de staff implementada (1B-2a/1B-2b). `CRON_SECRET` e idempotencia de INSERT siguen sin tocar. |
| **D. Mantenibilidad** | `app/cotizaciones/[id]/page.tsx` con ~2,400 líneas y demasiadas responsabilidades, manejo de errores inconsistente, y lógica de upload duplicada en tres módulos. | P1/P2 | **Muy avanzado (EF-3D, PR #49).** `page.tsx` bajó de 2,388 a 1,484 líneas (-38%) extrayendo 6 hooks (3D-0b..3D-4, 3D-6, 3D-7); solo falta `useQuotationItemCellsAutosave` (3D-5, pausado por decisión del usuario, requiere prueba manual serverless de 3A-1). `DomainError`+logger adoptado en ~15 rutas más (3D-9/10/11: financieras, Portal completo, Proyectos). Deduplicación de upload de factura hecha (3D-12, `lib/server/uploads/factura-validation.ts`, CxP/CxC/Portal). |
| **E. Pruebas de carga** | Los tests actuales prueban correctness con 2-10 sesiones, no capacidad. Falta una suite (k6/Artillery) que responda objetivamente "¿aguanta si mañana entran 100 personas?". | P1 | **Sin tocar.** |

**Hallazgos completos, con el detalle de cada caso y la norma arquitectónica que debe
quedar establecida al cerrar cada frente:**
[`docs/archive/auditoria-ingenieria-2026-09.md`](archive/auditoria-ingenieria-2026-09.md).

Los 40 bloques concretos de EF-3 ya están definidos y auditados contra el
código real (12 rondas) en `docs/EF-3_ENGINEERING_HARDENING.md` — arrancan
con este mismo commit (3A-0).

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
