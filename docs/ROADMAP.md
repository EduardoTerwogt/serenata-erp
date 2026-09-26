# Roadmap

**Última actualización:** 2026-09-26 (rediseño de Cuentas cerrado y en producción)

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
| **B. Correctness serverless** | Trabajo que asumía un proceso único de larga vida corriendo en funciones efímeras: broadcasts con `void Promise`, caches en `Map`, debounce de Sheets con `setTimeout`. Incluía un evento `bulk` de Realtime que se descartaba en silencio. | P0/P1 | **Prácticamente cerrado.** Broadcasts vía `after()` (EF-2 1D-1). Las 4 cachés locales retiradas — las 3 de EF-2 (1D-3) más `folio.ts` en 3B-7 (`CacheManager`/`invalidateFolioCache()` removidos, la RPC de preview se llama directo). `triggerSheetsSync()` y sus 31 call sites eliminados (3C-1); `sync-down.ts` paginado (3C-2); lock de Sheets con lease/renovación/recuperación de huérfanos (3C-3); retención de `rate_limits` + safety-net diario vía el mismo lock (3C-4). El evento `bulk` de Realtime ya no se descarta (`hooks/useQuotationPresence.ts` deja pasar `operation: 'bulk'` sin `item_id`); desde 2026-09-23 un test live causal (`cotizaciones-colaboracion.spec.ts`, importar partidas) exige que el otro colaborador converja por el evento y no por el poll de 20s. |
| **C. Superficie de riesgo** | `supabaseAdmin` accesible desde cualquier ruta, sin revocación de sesión para staff, `CRON_SECRET` que falla abierto si no existe, e idempotencia que trata cualquier error de INSERT como duplicado. | P1 | **Parcial, sin cambio en EF-3.** `supabaseAdmin` aislado (EF-2 1B-1) y revocación de sesión de staff (EF-2 1B-2a/1B-2b) siguen siendo lo único resuelto. `CRON_SECRET` fail-open e idempotencia de INSERT también están resueltos (verificado 2026-09-23): `app/api/keep-alive/route.ts` falla cerrado (500) sin el secreto (1B-3) y `lib/server/idempotency.ts` solo trata `23505` como duplicado. Además, EF-3 encontró un hallazgo nuevo de esta misma familia: **F28**, race de concurrencia real en la rotación del cookie de sesión de `next-auth` — **resuelto** en PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71), ver más arriba y `docs/decisions/010-f28-diferir-race-cookie-nextauth.md`. |
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

Sin iniciativa definida. El rediseño de Cuentas se cerró el 2026-09-26 (ver
"Cerrado"); lo siguiente se prioriza en Chat.

---

## Después

**Sin definir a propósito.** Se prioriza en Chat, con el estado real del
sistema a la vista. Ninguno de los puntos de abajo está comprometido todavía
ni tiene alcance de iniciativa definido.

### Deuda técnica (2026-09-26)

La resuelve una sesión dedicada (decisión del usuario, 2026-09-26). Lista
viva en `docs/ACTIVE_WORK.md` → "Deuda técnica". La de más peso:

- **Latencia en paralelo de las RPCs de Cuentas.** En `serenata-erp-test`
  (dataset de carga: unos 2,200 proyectos y 13,000 conceptos al año), cada
  RPC tarda poco sola, con cómputo chico: `shared_buffers` de 224 MB y un
  CPU lento (3M filas de `generate_series` tardan 875 ms).
  - Tiempos solos: `cuentas_periodo` (mes) 527 ms, `cuentas_resumen` 346,
    `cuentas_avisos_items` 316, `cuentas_opciones` 236.
  - Cuando coinciden, a veces pasan los 8 s y PostgREST las cancela
    (`57014`, `statement_timeout=8s` de `authenticator`). Pasó a lo largo
    del día en varias RPCs de Cuentas.
  - Una carga de `/cuentas` dispara `periodo`, `resumen` y `opciones` en
    paralelo, y cada una recalcula `cuentas_conceptos` (~200 ms) desde cero.
  - Descartado: memoria (~15 MB por llamada, sin temp files) e I/O
    (hit 100 %). Hipótesis principal: saturación o throttling de CPU.
  - Hoy producción tiene pocos datos; con el volumen del dataset de carga
    tendría el mismo riesgo.
  - Tres frentes, a decidir juntos:
    - (1) Ver el CPU de test en el dashboard de Supabase y el tamaño de
      cómputo.
    - (2) Derivar `cuentas_conceptos` una vez por petición o con caché
      invalidada en escrituras (cambio de arquitectura: plan primero).
    - (3) Que `cuentas-periodo-rendimiento.spec.ts` no entre por
      `/cuentas`: la carga de la propia página compite con el calentamiento.
  - Ese test sigue intermitente aun con "mejor de dos rondas" (`ea4cb85`).
  - **Sesión 22: frente 3 aplicado** (usuario decidió frente 3 ahora, frente
    2 como contingencia si el 3 no alcanza, frente 1 fuera de alcance). El
    test ahora entra por `/cotizaciones`. Pendiente confirmar en 2-3 corridas
    reales de `live` — una sola corrida verde no alcanza dado el historial
    (falló en `f01097d` y 3 veces en #97). Si vuelve a fallar, frente 2 pasa
    a ser la siguiente iniciativa en `docs/PLAN.md`.

### Sueltos pendientes (2026-09-19, actualizado 2026-09-21)

- **Dashboard — estado de resultados y balance + export a Sheets.**
  Pendiente definir alcance contable exacto (devengado vs. flujo de caja,
  categorías de gasto, balance con activos/pasivos o solo P&L) antes de
  poder planear el detalle — decisión de negocio previa a cualquier diseño
  técnico. Dejado explícitamente fuera de la agrupación de "Siguiente" por
  decisión del usuario (2026-09-19); ya existe un bloque `fiscal` en
  `getResumenDashboard()` (cash-basis, no resta `gastos_fijos`) y un export
  a Sheets tabla-por-tabla (no de reporte calculado) como punto de partida
  cuando se retome.
- **Fuera de alcance, sin cambios:** Planeación (evaluar quitar la sección,
  ligado a RAG/chatbot); RAG/chatbot; migrar administración de Sheets
  externo a la app; refinar módulo de Proyectos; limpieza de datos de
  prueba (app + BD).
- **`cliente_id_backfill_clasificacion` — decidir si se borra** cuando se
  confirme que terminó la reconciliación manual de ambiguous/no_match
  (decisión 014). Desde 2026-09-23 está cerrada a la Data API (RLS + sin
  grants para anon/authenticated); mientras siga, no hay riesgo.
- **Presence más fluido (opcional).** Tras #93 el aviso de edición tarda
  hasta 15 s en reflejarse en ráfagas, por el límite del servidor de 5
  eventos de Presence por cliente en 30 s (decisión 016). Si se quiere más
  fluidez: pedir a Supabase subir `max_client_presence_events_per_window`
  del proyecto y ajustar el presupuesto de `lib/realtime/presence-publisher.ts`
  en consecuencia. El usuario dio la colaboración por cerrada (2026-09-24).
- **Rediseño del PDF de reporte de cierre** — diferido el 2026-09-23 de la
  iniciativa "Actualización de formatos PDF vía Claude Design" (cerrada, ver
  "Cerrado"): se hace junto con la definición del módulo de Proyectos, porque
  su contenido depende de ella. Mismo flujo que los otros 3 PDFs (Claude
  Design → `.zip` → Claude Code, prompt en `docs/PROMPTS.md`);
  `lib/server/pdf/reporte-cierre-pdf.ts` sigue con el formato anterior
  mientras tanto.

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

- **Rediseño de la sección Cuentas (2026-09-26).** `/cuentas` rediseñada en
  Claude Design e implementada en 10 bloques (B0, B1b, B1–B8), después de
  siete rondas de auditoría contra código y datos reales (D1–D34).
  - Lectura por periodo (año → mes → proyecto), con la derivación en SQL
    (`cuentas_conceptos`, `cuentas_periodo`, `cuentas_opciones`) y test de
    paridad contra TS.
  - Pagos a proveedor en total a transferir (snapshot del CFDI).
  - Complementos por pago (PPD), detalle del concepto, avisos y órdenes de
    pago atómicas con desglose inmutable.
  - Reabrir y correcciones solo para admin: anular pagos, dar de baja
    documentos, corregir datos.
  - Incluye el filtro de estado (pendientes/cerradas) que estaba diferido
    desde 2026-09-21.
  - PRs [#94](https://github.com/EduardoTerwogt/serenata-erp/pull/94),
    [#95](https://github.com/EduardoTerwogt/serenata-erp/pull/95) y
    [#96](https://github.com/EduardoTerwogt/serenata-erp/pull/96) (`f01097d`).
  - Migraciones `20260925_*` a `20261006_*` en producción.
  - Reglas: [`docs/decisions/017`](decisions/017-rediseno-cuentas.md).
    Historia: [`docs/archive/rediseno-cuentas.md`](archive/rediseno-cuentas.md).
- **Colaboración en vivo — aviso "X está editando" pegado (2026-09-24).** Dos
  causas raíz: (1) bug de `@supabase/realtime-js` 2.100.0 que no aplicaba las
  bajas de Presence, y (2) el servidor cerraba el canal por exceder 5 eventos de
  Presence en 30 s (heartbeat de 15 s + un `track()` por tecla; 427 cierres en
  24 h en test). `realtime-js` fijado en 2.112.0 (`overrides`; ≥ 2.113 rompe
  nuestro JWT de Realtime), presupuesto de Presence en el cliente, sin
  heartbeat, y el aviso se quita solo al salir de la sección/celda (la
  inactividad de 5 s suelta solo el bloqueo de datos). Detalle:
  [`docs/decisions/016`](decisions/016-presence-realtime-js-fijado-y-presupuesto.md).
  PR [#93](https://github.com/EduardoTerwogt/serenata-erp/pull/93) (`3487981`);
  probado a mano por el usuario, que dio el feature de colaboración por cerrado.
- **Folios CC/CP por año (2026-09-24).** `generate_folio_cc/cp` pasan a
  `siguiente_folio(serie)`: año en curso (hora CDMX) y consecutivo que
  reinicia cada año (CC-2027-00001), sobre la tabla `folio_contadores`
  (2026 continúa desde las secuencias viejas). Corrige también el truncado
  de `LPAD` en números ≥ 100000 y quita EXECUTE a anon/authenticated.
  Migración `20260924_folios_cc_cp_por_anio.sql`.
- **Pasos manuales post-deuda técnica (2026-09-24).** M1: `NEXTAUTH_SECRET`
  fuera de Production y Preview en Vercel (solo la lee NextAuth como fallback
  de `AUTH_SECRET`, que existe en todos los entornos); redeploy de prod y
  Preview, sesiones de staff y Portal abiertas sobrevivieron y login/logout
  OK. M2: los Previews usaban la base de **producción** — separados a
  `serenata-erp-test` (Supabase y Google). V1: colaboración verificada en
  Preview con 2 usuarios (bug leve de Presence, resuelto después — ver arriba). V2: no
  existe login con Google; Drive de prod funcionando; Drive apagado en
  Preview.
- **Advisor de Supabase sin WARN (2026-09-24).** `search_path` fijo vía
  `ALTER FUNCTION … SET` (sin reescribir cuerpos, decisión 005) en las 10
  funciones marcadas, y `pg_trgm` movida de `public` a `extensions` (los
  índices GIN siguen válidos y en uso). Migración
  `20260924_advisor_search_path_pg_trgm.sql`, PR
  [#91](https://github.com/EduardoTerwogt/serenata-erp/pull/91). Quedan solo
  los INFO `rls_enabled_no_policy`, esperados (la app usa `service_role`).
- **Deuda técnica post-EF-3 (2026-09-23).** Auditoría contra `main`
  (`9b3b303`) + cierre de lo que seguía vivo, en un solo PR:
  RLS + `REVOKE` de anon/authenticated en `cliente_id_backfill_clasificacion`
  (el único ERROR del advisor; en prod anon tenía CRUD completo sobre 168
  filas), aplicado en test y prod; PDFs de Cotización/Orden de pago/Hoja de
  llamado con `compress: true` (el isotipo PNG de 4 KB se incrustaba como RGB
  crudo de ~590 KB; −83 a −96% de peso, 0 píxeles distintos); `AUTH_SECRET`
  como única variable de sesión (sin fallback a `NEXTAUTH_SECRET`);
  `tracker-lint` (validador del tracker de EF-3, ya archivado) retirado de
  CI; locator ambiguo del flake de `portal-documentos.spec.ts` corregido; y
  test live causal para el evento `bulk` de Realtime. `CRON_SECRET` e
  idempotencia de INSERT resultaron ya resueltos. `SUPABASE_JWT_SECRET`
  distinto entre Production y Preview se reclasificó como auditoría de
  configuración, no deuda: es lo correcto si cada entorno apunta a su propio
  proyecto Supabase (verificación manual en Vercel pendiente, ver
  `docs/ACTIVE_WORK.md`).
- **Actualización de formatos PDF vía Claude Design (2026-09-23).** Cada PDF
  se diseña una vez en Claude Design sobre el design system de Serenata y el
  HTML se implementa directo en su generador jsPDF — reemplaza al "Editor de
  PDFs" cancelado (ver abajo). Bloques 1 Cotización
  (PR [#86](https://github.com/EduardoTerwogt/serenata-erp/pull/86)), 2 Orden
  de pago (PR [#88](https://github.com/EduardoTerwogt/serenata-erp/pull/88))
  y 3 Hoja de llamado
  (PR [#89](https://github.com/EduardoTerwogt/serenata-erp/pull/89))
  cerrados y en producción. El bloque 4 (Reporte de cierre) se difirió a
  "Después" hasta definir el módulo de Proyectos. Se extrajeron helpers de
  dibujo compartidos a `lib/server/pdf/pdf-draw.ts` e Inter embebida a
  `lib/server/pdf/fonts/inter.ts`. Historia completa:
  [`docs/archive/actualizacion-formatos-pdf-claude-design.md`](archive/actualizacion-formatos-pdf-claude-design.md).
  Motivo del cambio de enfoque:
  [`docs/decisions/015-pdfs-disenados-en-claude-design.md`](decisions/015-pdfs-disenados-en-claude-design.md).
- **Editor de PDFs — cancelado y eliminado (2026-09-23).** Editor visual de
  plantillas dentro de la app (PR [#81](https://github.com/EduardoTerwogt/serenata-erp/pull/81),
  [#83](https://github.com/EduardoTerwogt/serenata-erp/pull/83); bloques 0-7
  parcial). Una auditoría encontró que ningún PDF de producción llegó a usar
  el motor de plantillas, y el usuario solo necesitaba definir cada diseño
  una vez. Se eliminó todo el código (ruta `/editor-pdfs`, API, renderer,
  schema, repositorio, sección de permisos `editor-pdfs`) y la tabla
  `pdf_plantillas` (migración `20260923_drop_pdf_plantillas_editor_pdfs.sql`). Lo sustituye el flujo Claude Design →
  código (`docs/decisions/015-pdfs-disenados-en-claude-design.md`). Historia:
  [`docs/archive/editor-pdfs-cancelado.md`](archive/editor-pdfs-cancelado.md).
- **Sueltos post-PR #76 — Portal (simulador de factura), utilidad de
  proyecto y `cliente_id` FK (cerrado parcial, 2026-09-21).** 3 de los 4
  bloques agrupados el 2026-09-19: simulador de factura del Portal (PR
  [#77](https://github.com/EduardoTerwogt/serenata-erp/pull/77), commit
  `647686b`); dropdown de impuestos a pagar y utilidad bruta/neta de
  proyecto, y `cliente_id` como FK real en Clientes (ambos en PR
  [#79](https://github.com/EduardoTerwogt/serenata-erp/pull/79), commit
  `578f53b`). El 4° bloque (filtro de estado en Cuentas) se diferió por
  decisión del usuario para dar paso a la iniciativa "Editor de PDFs" — ver
  "Después" → "Sueltos pendientes". Historia completa, diseño y tracker:
  [`docs/archive/sueltos-portal-utilidad-cliente-id-fk.md`](archive/sueltos-portal-utilidad-cliente-id-fk.md).
- **Plantillas, Cotizaciones, Portal, Clientes y Cuentas — 6 bloques en
  paralelo (2026-09-19).** Cerró la primera iniciativa agrupada del roadmap
  de producto (agrupada 2026-09-18, aprobada tras 6 rondas de auditoría
  externa): header de tarjeta con utilidad en Plantillas; UI de edición de
  Cotizaciones (paridad completa Nueva/Editar en Vista previa, Nota de
  evento y Crear plantilla; botones unificados al primitivo `Button`;
  alineación de Datos Generales; remoción de la columna "Costo + IVA" de
  Partidas) + la fórmula Costo Unitario/Costo Total corregida en
  `approve_cotizacion`/`patch_item_cotizacion` (antes no multiplicaba por
  Cantidad); Portal de Proveedores (columna `alias` separada de `nombre`,
  ver documentos ya subidos, tab "Historial"); catálogo de Clientes
  editable (`PUT` + soft-delete, mismo patrón que Proveedores); rediseño
  del PDF de orden de pago con logo. PR
  [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) mergeado a
  `main`. Quedaron fuera, documentados como "Sueltos" en "Después": dropdown
  de impuestos/utilidad de proyecto, historial de cuentas por mes/año,
  calculadora de régimen fiscal, estado de resultados/balance, y
  `cliente_id` como FK real. Historia completa, diseño y tracker de los 6
  bloques:
  [`docs/archive/plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md`](archive/plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md).
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
