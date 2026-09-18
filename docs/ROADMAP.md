# Roadmap

**Última actualización:** 2026-09-18

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

**Sin definir a propósito.** Con Engineering Hardening y la agrupación de
Cuentas por Pagar cerradas (ver "Cerrado" abajo), lo que sigue se prioriza
en Chat con el estado real del sistema a la vista — deliberadamente no
precomprometido aquí. Material candidato en "Después".

---

## Después

**Sin definir a propósito.** Se prioriza en Chat, con el estado real del
sistema a la vista. Ninguno de los puntos de abajo está comprometido todavía
ni tiene alcance de iniciativa definido — son observaciones puntuales del
usuario, por módulo, **sin agrupar ni planear**. Antes de arrancar cualquiera,
agruparlos en iniciativas coherentes (algunos ya se ven relacionados entre
módulos, p.ej. Cuentas por Cobrar con la lógica de agrupación por
proveedor+proyecto que ya existe en Cuentas por Pagar) y decidir orden y
alcance en Chat.

### Observaciones sin agrupar (2026-09-18)

**Cotizaciones — edición**
- Datos generales: alinear títulos con las entradas (cliente, proyecto, etc.
  a la izquierda; fecha de cotización a la derecha).
- Sacar "Nota de evento" de Datos generales; que sea un pop-up encima,
  similar al de alertas en Cuentas.
- Partidas: renombrar "X Pagar" a "Costo Unitario". "Costo + IVA" pasa a ser
  Costo Unitario × Cantidad, renombrado "Costo Total". El IVA se saca de
  Partidas pero debe seguir apareciendo en la sección de Impuestos —
  evaluar una columna oculta en Partidas con Costo Total + IVA. Margen =
  Importe − Costo Total.
- Debajo de Totales/Utilidad, agregar una sección de notas visible en el PDF.
- Botón "crear plantilla" en Partidas, para crear plantillas de servicios
  nuevas desde ahí mismo.
- Forzar el signo $ en "P. Unitario" y "Costo Unitario".
- Unificar el formato de todos los dropdowns/menús desplegables de la
  cotización al que ya se usa en Descripción y Datos generales.
- Botón "Vista previa" del PDF antes de generarlo — solo visualización, no
  editable.
- Ajustar ancho de columnas para que todo sea legible, sin partidas
  cortadas.
- En Descuento, el 0 debe ser solo placeholder/sugerencia (como en
  cliente/proyecto), no un valor puesto literalmente.

**Cuentas**
- Por Cobrar: replicar la lógica de agrupación de Por Pagar — si una cuenta
  por cobrar todavía no tiene factura y se crea una cotización
  complementaria, sumar ambas en una sola factura por el monto total; si ya
  hay factura emitida, la complementaria sí se crea como partida aparte.
- Tabla de Por Cobrar: agregar columna Proyecto (junto a cliente,
  pagado/total y estado).
- En el dropdown de cuenta, mostrar impuestos a pagar del proyecto y
  utilidad bruta/neta del proyecto — revisar UI para la mejor forma,
  siguiendo el lenguaje de diseño tipo Apple.
- Definir cómo hacer el historial de cuentas sin que sea una lista
  interminable con muchos proyectos — evaluar agrupar por mes/año.
- Rediseñar el PDF de ficha de órdenes de pago.

**Planeación**
- Evaluar quitar esta sección completa (ver relación con el RAG/chatbot en
  "General").

**Plantillas**
- En el header de la tarjeta, mostrar el precio total de la plantilla a la
  derecha, con la utilidad como subtítulo debajo — el subtítulo de utilidad
  solo aparece si se conoce el costo; si no se sabe cuánto pagamos por el
  servicio, no se agrega.

**Portal**
- Datos personales: separar "nombre completo" y "alias" en dos campos.
- Documentación: evaluar si todos los documentos necesitan extracción AI —
  la mayoría sigue siempre el mismo formato; considerar un lector de texto
  que no consuma tokens para esos casos.
- Habilitar opción de "ver" para visualizar los documentos ya subidos.
- Cuentas y facturas: la sección de subir factura se mantiene; unificar el
  diseño del dropdown con el resto de la app. Migrar "Tus cuentas con
  Serenata" a un tab nuevo llamado "Historial", como plantea el mockup del
  design system.
  - Donde hoy está "Tus cuentas con Serenata", poner una calculadora que
    muestre el régimen fiscal del proveedor y el desglose de la factura
    seleccionada (subtotal, IVA, retenciones según régimen, total a pagar).
  - Si aplican retenciones, agregar una explicación breve y simple de por
    qué se retiene y por qué ese es el total; si solo es IVA, no mostrar
    ningún comentario/explicación.

**Dashboard**
- Estado de resultados y balance general, con opción de exportar a Sheets.

**General**
- Traer catálogo de clientes a una vista donde se pueda visualizar, editar
  y borrar.
- Editor de PDFs: poder editar el formato de todos los PDFs tipo
  Canva/herramienta de diseño.
- Construir un RAG — posiblemente como chatbot desplegable en la esquina
  inferior derecha (motivo detrás de evaluar quitar Planeación).
- Limpiar todos los datos de prueba actuales, tanto en la app como en BD,
  para arrancar con todo limpio.
- Migrar la administración que hoy vive en un Sheets externo hacia la app,
  para tener toda la info de la empresa cargada ahí.
- Refinar el módulo de Proyectos — requiere trabajo, alcance todavía sin
  definir.

Material previo (roadmap de producto de 2026-09-04, Fase 5) ya entregado o
superpuesto con lo de arriba: agregados del Cotizador (copiar entre
cotizaciones, columna Costo + IVA, calculadora de impuestos — ver Cotizaciones
arriba), Proyectos como herramienta de PM con asistente sobre el historial
(ver General arriba), y cerrar la migración visual.

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

- **Agrupar Cuentas por Pagar por proveedor+proyecto para facturación
  (2026-09-18).** `cuentas_pagar` era 1:1 por renglón de cotización — un
  proveedor con varios renglones en el mismo proyecto recibía una solicitud
  de factura por cada uno por separado. 8 bloques: esquema
  (`cuentas_pagar_grupos`) + reconciliación automática, integración en
  aprobación/reasignación, facturación + pago agrupados + órdenes de pago +
  UI interna, Portal de Proveedores (contrato agrupado), migración
  retroactiva de datos, agrupar los listados internos ("Lista"/"Por
  proyecto", no solo el modal de detalle), reordenar el modal de detalle, y
  un hotfix de una regresión encontrada al cerrar (`proyecto_id` faltante en
  `cuentas_cobrar` para cotizaciones complementarias, causada por un
  `CREATE OR REPLACE` escrito sobre una copia vieja de `approve_cotizacion`).
  PR [#73](https://github.com/EduardoTerwogt/serenata-erp/pull/73) y
  [#74](https://github.com/EduardoTerwogt/serenata-erp/pull/74) mergeados a
  `main`. Historia completa, diseño y tracker de los 8 bloques:
  [`docs/archive/agrupacion-cuentas-pagar-por-proveedor-proyecto.md`](archive/agrupacion-cuentas-pagar-por-proveedor-proyecto.md);
  decisión de diseño: [`docs/decisions/011`](decisions/011-agrupacion-cuentas-pagar-por-proveedor-proyecto.md).
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
