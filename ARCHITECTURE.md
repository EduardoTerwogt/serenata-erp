# Arquitectura

## Mapa del repo

```
app/                          # Next.js App Router
├── api/                      # API routes (REST)
│   ├── cotizaciones/         # CRUD + aprobar + cancelar + generar-pdf
│   │   └── [id]/             # general, totales, notas, items/[itemId]  ← escrituras por sección
│   ├── cuentas-cobrar/       # documentos, registrar-pago, complementos
│   ├── cuentas-pagar/        # documentos, registrar-pago, órdenes de pago
│   ├── proyectos/            # CRUD, tareas, cronograma, hoja de llamado, reporte de cierre
│   ├── proveedores/          # CRUD, historial, resumen de documentos
│   ├── portal/               # Portal de proveedores (sesión propia, no NextAuth)
│   ├── planeacion/           # extract-ai, pendientes, match, notas
│   ├── service-templates/    # Plantillas de servicios
│   ├── clientes/ productos/ tipos-proyecto/  # Catálogos
│   ├── dashboard/            # Métricas y gastos fijos
│   ├── admin/                # Usuarios y sync a Sheets
│   ├── integrations/         # Google Drive y Sheets activos; Calendar parcial
│   ├── keep-alive/ folio/    # Cron y reserva de folio
│   └── auth/                 # NextAuth v5
├── cotizaciones/             # lista · nueva · [id] detalle (pantalla colaborativa)
├── proyectos/                # lista · [id] · tipos
├── cuentas/                  # cobrar + pagar (tabs)
├── proveedores/              # lista + modal de detalle
├── portal/                   # login · signup · confirmar-identidad · panel
├── planeacion/               # extracción + pendientes
├── plantillas-servicios/     # lista · nueva · [id]/editar
├── admin/                    # usuarios · sheets
├── dashboard/ login/         # métricas y acceso
└── components/               # componentes atados a una pantalla

components/                   # Reutilizables: quotations/, ui/, layout/, navigation/
hooks/                        # useQuotationForm, useQuotationPresence, useServiceTemplateForm, usePrefetch
lib/
├── api-auth.ts               # requireSection() / requireAnySection() / requireAuthenticated()
├── proxy-handler.ts          # lógica de proxy.ts (testable sin importar next-auth)
├── auth-callbacks.ts         # callbacks jwt/session de NextAuth (testables por separado)
├── authz.ts  types.ts  supabase.ts  supabase-browser.ts
├── db.ts                     # SOLO fachada: reexporta repositories
├── validation/schemas.ts     # Zod
├── client/api.ts             # getJson/postJson/putJson/FormData/binary + 401 compartido
├── quotations/               # cálculos, formato, mappers
├── parsers/                  # eventInfoParser (fallback regex)
├── integrations/google/      # drive, sheets, calendar (parcial)
├── api/cache.ts               # CacheManager en memoria (ver gotcha de serverless)
└── server/                   # server-only
    ├── supabase-admin.ts     # cliente service_role -- `import 'server-only'`, nunca al navegador
    ├── repositories/         # acceso a datos por dominio
    ├── quotations/           # approval, cancel, folio (con su propio caché), persistence
    ├── cuentas/              # estados y transiciones
    ├── projects/             # tareas, autofill de documentos
    ├── errors/               # DomainError + safeMessage
    ├── observability/        # logger estructurado con requestId
    └── pdf/                  # cotización, orden de pago, hoja de llamado, reporte de cierre

db/migrations/                # SQL numerado; se aplica A MANO en Supabase
tests/e2e/{smoke,critical,live}/
docs/                         # ACTIVE_WORK · ROADMAP · decisions/ · archive/
```

## Capas

**1. Auth y autorización.** `proxy.ts` (convención de Next.js 16, sustituye a
`middleware.ts`) es un wrapper fino (`export default auth(proxyHandler)`); toda
la lógica real vive en `lib/proxy-handler.ts` para poder testearla sin arrastrar
`NextAuth({...})` (que Vitest no resuelve bajo Next 16). Valida sesión y
secciones permitidas antes de llegar a página o API. Dentro de cada route,
`requireSection('cotizaciones')` repite la comprobación. Secciones: `admin`,
`dashboard`, `cotizaciones`, `proyectos`, `cuentas`, `responsables`,
`planeacion`. El portal de proveedores tiene sesión propia, independiente de
NextAuth.

**Revocación de sesión de staff (`session_version`, EF-2 1B-2b).** Igual que el
Portal (`db/migrations/20260909_portal_session_version.sql`), `usuarios` tiene
una columna `session_version` que `admin_update_usuario()` (RPC) incrementa
cuando cambia `active`/`sections`/`password_hash`/`email` (nunca con solo
`name`). El JWT lleva ese valor como claim. `proxy.ts`/`lib/proxy-handler.ts`
solo verifica de forma **optimista** que el claim exista y sea un entero ≥ 0
(sin tocar Postgres, corre en Edge en cada navegación); `requireAuthenticated()`
(`lib/api-auth.ts`) sí consulta la fila real una vez por request de API y
diferencia sesión revocada (`401`, fuerza `signOut()`+relogin) de un error
transitorio de Postgres (`503`, sesión intacta — nunca logout masivo por una
caída de DB). Detalle completo y alternativas descartadas:
[`docs/decisions/009`](docs/decisions/009-revocacion-sesion-staff-session-version.md).

**Rutas máquina-a-máquina (sin sesión de NextAuth).** `proxy.ts` intercepta
*toda* ruta no listada en `isPublicPath()` (`lib/proxy-handler.ts`) y exige
sesión — incluidas rutas API que nunca reciben cookies porque las llama un
script o un cron, no un browser. Estas rutas se agregan a `isPublicPath()`
y se protegen con su propio guard fail-closed (secreto/token propio, 404 en
vez de 403 para no delatar que existen): `/api/integrations/drive/authorize`
y `/api/integrations/drive/callback` (sección `admin` vía `requireSection`
dentro de la ruta), `/api/keep-alive` (`CRON_SECRET`),
`/api/internal/env-check` (`LOADTEST_MODE`+`LOADTEST_ENV_SECRET`, EF-3A
3A-1 — usado por `scripts/loadtest/env-check.mjs`, nunca por un usuario).
Olvidar esta lista para una ruta nueva de este tipo produce un 401 confuso
del middleware, no del guard propio de la ruta — visto en un run real de
`load-test.yml` durante 3A-1.

**2. Páginas.** Delegan en hooks y componentes por dominio. La excepción deliberada
es `app/cotizaciones/[id]/page.tsx`, que concentra la lógica de edición
colaborativa (ver abajo).

**3. Cliente.** Las llamadas pasan por `lib/client/api.ts`, que centraliza parseo
de errores, JSON, FormData y binario. No duplicar ese manejo en cada hook.

**4. Dominio server-side.** Un repositorio por dominio en
`lib/server/repositories/`. `lib/db.ts` quedó como fachada de compatibilidad; no
volver a concentrarle lógica.

**5. PDFs.** `lib/server/pdf/` con `jspdf` + `jspdf-autotable`. Se suben a Google
Drive; si ya existe `drive_file_id`, se **actualiza** el archivo en vez de crear
uno nuevo.

**6. Datos.** Supabase directo para lecturas y escrituras simples; **RPCs de
PostgreSQL** para todo lo que deba ser atómico: aprobar y cancelar cotización,
reservar folio, registrar pago, guardar cotización y los PATCH por sección.
`lib/supabase.ts` expone **solo** el cliente anónimo; el cliente
`service_role` vive aislado en `lib/server/supabase-admin.ts` con
`import 'server-only'` como primera línea — importarlo desde un componente
cliente rompe el build en vez de filtrar la llave al navegador (EF-2 1B-1).

**7. Errores seguros al cliente.** `lib/server/errors/domain-error.ts`
(`DomainError` con `code`/`status`/`safeMessage`) + `lib/server/observability/log.ts`
(logger JSON con `requestId`). Un error no-`DomainError` siempre se
traduce a un mensaje genérico seguro; el detalle técnico real solo va al log,
nunca al cliente. El contrato `{error: string}` se extiende con `requestId`,
nunca se reemplaza. Adoptado (EF-2 1E-2 + EF-3 3D-9/3D-10/3D-11) en: subir
factura (CxC/CxP), `proyectos/[id]/etapa`, `proyectos/[id]` PUT,
`proyectos/[id]/tipo` PUT, cancelación de cotización, registrar-pago
(CxC/CxP), generar-orden-pago, y las 8 rutas de Portal (login, signup,
signup/confirmar, documentos, cuentas, `cuentas/[id]/factura`, me, perfil).
No está adoptado todavía en el resto de las rutas — ver `docs/ROADMAP.md`.

## Edición colaborativa

`app/cotizaciones/[id]/page.tsx` + `hooks/useQuotationPresence.ts`.

**Refactor de `page.tsx` (EF-3D, 3D-0b..3D-8):** el archivo bajó de 2,388 a
1,484 líneas (-38%) extrayendo 6 clústeres de estado+lógica a hooks
dedicados bajo `hooks/`, más un módulo compartido de tipos/helpers puros en
`lib/quotations/collaboration.ts` (creado para evitar un ciclo de imports
`page.tsx` ↔ `hooks/*`):

| Hook | Sección que gobierna |
|---|---|
| `useQuotationMutationTracker` | `trackMutation()` genérico — registra toda promesa de mutación en vuelo, usado por el resto de los hooks de abajo para que `flushPendingSaves` pueda esperarlos |
| `useQuotationGeneralAutosave` | Cliente/proyecto/fecha de entrega/locación: dirty, lock, foco, drenado, conflicto por campo |
| `useQuotationTotalesAutosave` | % fee/IVA/descuento: mismo patrón, dueño de su propio estado (no vivía en `page.tsx` antes) |
| `useQuotationNotasAutosave` | Notas internas: mismo patrón, campo único sin conflicto multi-campo |
| `useQuotationReconciliation` | `reconciliarConServidor`/`resyncPartidas` — reconciliación por polling/broadcast de las 4 secciones |
| `useQuotationBusinessActions` | `aprobar`/`generarPDF`/`generarCotizacion`/`crearComplementaria`/`cancelarCotizacion`, con la asimetría original de flush+guard preservada exactamente |

**`useQuotationItemCellsAutosave` (3D-5) NO se extrajo.** Ese bloque quedó
**pausado por decisión explícita del usuario**: además de ser el de mayor
riesgo de implementación, su propio criterio de aceptación exige una
prueba manual contra el entorno serverless real de 3A-1, bloqueada por el
mismo setup de Vercel pendiente que bloquea 3A-1/3B-7/3C-4. Como
consecuencia, todo el autoguardado por celda de partidas (`itemDirtyCellsRef`,
`itemFocusedCellsRef`, `itemSavingCellsRef`, `itemCellDrainRef`,
`itemCellRetryNeededRef`, `itemCellBaseRef`, `itemCellConflicts`,
`rowMutationQueueRef`, `pendingRowRemovalsRef`, `pendingRowCreationsRef`,
`patchQuotationItem`/`createQuotationItemRow`/`deleteQuotationItemRow`,
`sendItemCellPatchRound`, `persistItemCellAutosave`,
`flushItemCellDirtyFields`, `handleItemFieldFocus/Blur/Change`,
`handleAddRow`/`handleImportItems`/`handleRemoveRow`,
`handleSelectProduct`/`handleResponsableChange`, `retryItemGroupPatch`,
`resolveItemCellConflict`/`getItemCellConflict`) sigue viviendo inline en
`page.tsx`. `useQuotationReconciliation` y `useQuotationBusinessActions`
(3D-6/3D-7) reciben esos refs y `flushItemCellDirtyFields` directo de
`page.tsx` como parámetros, en vez de desde un hook propio — misma firma
interna que tendrían si 3D-5 ya existiera, distinto origen de esos
parámetros. Cuando 3D-5 se retome, esas dos firmas se actualizan para
recibirlos del nuevo hook.

- **PostgreSQL es la única autoridad.** El navegador solo hace mutaciones vía
  API/RPC y emite Presence; nunca broadcasts de negocio. La política RLS de
  `realtime.messages` solo permite `presence` a `authenticated`.
- **El servidor emite el broadcast confirmado después del commit.** Ese evento es el
  mecanismo **primario** de invalidación y reconciliación.
- **El polling es fallback, no la garantía primaria.** Corre cada 20 s
  (`RECONCILIACION_MS`, `app/cotizaciones/[id]/page.tsx`), al reconectar y al volver
  la pestaña al frente. Preserva lo que el usuario está escribiendo y el cursor.
- Los avisos son **best-effort**: si el canal no está unido, `send()` cae a REST,
  devuelve 403 y el error se traga — medido, no supuesto.
- Las escrituras van por sección (`general`, `totales`, `notas`, `items/[itemId]`)
  y los RPCs bloquean fila y aplican solo las claves recibidas. Cada fila tiene un
  UUID estable, generado en el cliente y nunca reasignado; si un id ya pertenece a
  una fila de OTRA cotización, la creación responde `409` explícito en vez de
  aplicarse a medias o pisar la fila ajena en silencio.
- **Conflictos por campo con `409`.** No es last-write-wins ciego: se compara contra
  la base del campo y un conflicto real devuelve `409` al caller. Un PATCH
  multi-campo (autofill de producto: `descripcion`/`categoria`/`precio_unitario`/
  `x_pagar`; responsable: `responsable_id`/`responsable_nombre`) es atómico en la
  RPC — si CUALQUIER campo choca, se rechaza completo, nada se aplica a medias
  (Fase 8.7.2). La resolución respeta esa atomicidad: "Usar" revierte TODOS los
  campos del grupo al valor real del servidor, "Mantener" reintenta el PATCH
  completo con la `base` de todo el grupo ya refrescada — nunca un campo aislado.
- **Toda escritura de partidas revalida el `estado` de la cotización (Fase 8.7.1).**
  `patch_item_cotizacion`, `upsert_items_cotizacion` (alta individual y masiva) y
  `delete_item_cotizacion` bloquean la fila de `cotizaciones` bajo `FOR SHARE` antes
  de tocar la partida; si el estado ya no es `BORRADOR`/`EMITIDA`, rechazan con
  `{estado_invalido, estado_actual}` (`409` en la ruta) en vez de aplicar la
  escritura. `FOR SHARE` (no `FOR UPDATE`) porque dos escrituras de partidas
  *distintas* no deben bloquearse entre sí — solo bloquean contra el `FOR UPDATE`
  exclusivo de `emitir_cotizacion`/`approve_cotizacion` (ver abajo), que es lo único
  que cambia el estado.
- **Ninguna transición de estado (`Generar`, `Aprobar`, `Generar PDF`) corre con
  cambios locales sin confirmar.** Antes de disparar la RPC, se fuerza el debounce
  pendiente de las cuatro secciones y se espera toda mutación en vuelo — incluidas
  seleccionar producto, cambiar responsable, alta/baja de fila e importar partidas
  (Fase 8.7.1: antes de eso, `flushPendingSaves` solo veía los cuatro autoguardados
  por debounce; esas cinco vías, sin debounce, eran invisibles para el flush); un
  `409`/`500` aborta la transición. `emitir_cotizacion` y `approve_cotizacion`
  revalidan además su propio estado (`BORRADOR`→`EMITIDA`, `EMITIDA`→`APROBADA`)
  dentro de la misma transacción bajo `FOR UPDATE` — el mismo guard en los dos RPCs,
  no solo en uno — y ese `FOR UPDATE` espera a que cualquier escritura de partida en
  vuelo suelte su `FOR SHARE` antes de leer/cambiar el estado: ninguna escritura de
  partida puede aterrizar en una cotización que ya quedó `APROBADA`, y
  `cuentas_pagar`/`cuenta_cobrar` siempre se calculan del mismo snapshot que terminó
  aprobado, sea cual sea el orden real de la carrera.
- **Drenado real por celda, no un solo intento (Fase 8.7.2).** Editar la misma
  celda otra vez mientras su PATCH anterior sigue en vuelo no dispara un segundo
  `fetch` en paralelo ni se pierde: `itemCellDrainRef`/`itemCellRetryNeededRef`
  encolan la edición más nueva y el drenado manda una ronda más con el valor final
  en cuanto la ronda en curso resuelve — con la `base` de cada celda refrescada al
  valor que el servidor acaba de confirmar, para no generar un `409` contra uno
  mismo por seguir editando sin blur.
- No hay OT ni CRDT, y no hacen falta: son campos de un registro, no texto compartido.
- Reconexión, auth y refresh de token están en la infraestructura genérica
  `lib/realtime/useRealtimeChannel.ts`; `useQuotationPresence` es un wrapper fino.
  Un remount inmediato del mismo topic (StrictMode, cambio de `key`) espera la
  remoción del canal anterior antes de reconectar -- ver gotcha de
  `removeChannel()` más abajo, EF-2 1A-1.

**Aún no generalizado a propósito:** el protocolo `base`/`mutation_id`/conflict sigue
siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos exista
como segundo consumidor real, no antes.

Por qué se construyó así: [`docs/decisions/002`](docs/decisions/002-modelo-de-conflictos-por-campo.md),
[`docs/decisions/003`](docs/decisions/003-realtime-solo-presence.md) y
[`docs/decisions/007`](docs/decisions/007-guard-de-estado-for-share-vs-for-update.md)
(por qué el guard de estado en escrituras de partidas usa `FOR SHARE`, no `FOR
UPDATE`). El recorrido completo, con los defectos que se encontraron en el camino:
[`docs/archive/fases-colaboracion-0-8.md`](docs/archive/fases-colaboracion-0-8.md).

## Idempotencia de cliente (pagos y bulk-import de partidas)

`lib/client/pagoIdempotency.ts` (`runIdempotentPagoSubmit`, compartido por
`useCuentasPagar`/`useCuentasCobrar`) y `lib/client/bulkImportIdempotency.ts`
(`runIdempotentBulkImportSubmit`, usado por `handleImportItems` en
`app/cotizaciones/[id]/page.tsx`) orquestan reintentos seguros de doble clic,
retry de red o pestaña caída a medio submit, contra `withIdempotency`
(`lib/server/idempotency.ts`, tabla `idempotency_keys`) del lado servidor.

- Orden fijo: `fingerprint (sobre el archivo/payload ORIGINAL) →
  readPendingOperation → reconciliar si aplica → normalize()/construir
  payload → createPendingOperation() (solo si la identidad es nueva) →
  fetch → clear (solo en éxito)`. Detalle completo y por qué el orden
  importa: [`docs/decisions/008`](docs/decisions/008-idempotencia-cliente-orden-fingerprint-normalize-persist.md).
- El TTL de `pendingOperation` es un gatillo real de reconciliación, no una
  marca ignorada: un registro vencido (`stale`) siempre reconcilia contra
  `/estado` antes de reenviar, aunque el fingerprint sea idéntico.
  `not_found`/`ambiguous` nunca son terminales — solo permiten un retry
  EXACTO (mismo `operationId`, mismo payload), nunca una identidad nueva.
- La limpieza de la identidad pendiente distingue `origin: 'createdNow' |
  'reusedExisting'`: un fallo local antes del `fetch` solo limpia cuando la
  identidad se generó en este mismo submit (nunca salió ningún request);
  una identidad reutilizada de un intento anterior nunca se limpia por un
  fallo local, porque ese intento anterior pudo haber hecho commit.
- `bulk_replace_items_cotizacion` (RPC) rechaza con `P1410` tanto una fila
  de `reemplazar_ids` con `revision` desfasada como una que ya no existe
  (borrada por una operación concurrente) — antes solo cubría el primer
  caso, y el segundo dejaba que `INSERT ... ON CONFLICT` la recreara de
  cero. Prueba de regresión: `tests/e2e/live/bulk-replace-items-rpc.spec.ts`.

## Reglas que se respetan

1. No meter lógica de datos en páginas si cabe en un hook, servicio o repositorio.
2. `lib/db.ts` se queda como fachada.
3. No mezclar refactors de UI con cambios de schema/RPC/SQL.
4. Toda transición financiera pasa por un endpoint explícito, nunca por un `PUT`
   genérico desde la UI.
5. Extraer primitivos de UI solo ante repetición real.
6. Un cambio de esquema en producción se guarda **siempre** como migración numerada
   en `db/migrations/` y se commitea, para que el historial no se desincronice de
   lo que la base tiene de verdad.

## Módulos y cobertura

Lo que existe y funciona hoy, con la prueba que lo respalda. Si un módulo no tiene
evidencia, no cuenta como terminado.

| Módulo | Evidencia |
|---|---|
| Cotizaciones (CRUD, folio atómico, PDF, emitir) | `tests/e2e/critical/cotizaciones-*.spec.ts`, live `basic.spec.ts` |
| Aprobar / cancelar cotización (RPC transaccional) | live: crear → emitir → aprobar → cuentas → cancelar y revertir |
| Cuentas por cobrar (factura, complemento, pagos parciales) | crítico + live de concurrencia |
| Cuentas por pagar (factura, pagos, órdenes de pago con PDF real) | `lib/server/pdf/orden-pago-pdf.ts`, live de concurrencia |
| Registrar pago sin carreras (cobrar y pagar) | `tests/e2e/live/cuentas-*-concurrency.spec.ts` |
| Idempotencia de cliente (pagos y bulk-import de partidas) | `lib/client/__tests__/pagoIdempotency.test.ts`, `bulkImportIdempotency.test.ts`, `lib/server/__tests__/idempotency.test.ts`, `tests/e2e/live/bulk-replace-items-rpc.spec.ts` |
| Proyectos (detalle, tareas, cronograma, tipos, reporte de cierre) | smoke de proyectos |
| Proveedores (lista + modal, historial, régimen fiscal) | `tests/e2e/critical/proveedores.spec.ts` |
| Portal de proveedores (signup, login, confirmar identidad, subir factura) | `smoke/portal-signup.spec.ts`, `critical/portal-factura.spec.ts` |
| Planeación (extracción AI, pendientes, soft delete) | `critical/planeacion.spec.ts` |
| Plantillas de servicios (cotizaciones nuevas) | `critical/plantillas-servicios.spec.ts` |
| Admin de usuarios y sync a Google Sheets | `critical/admin-usuarios.spec.ts` |
| Sync manual Supabase→Sheets con lock/lease (huérfanos, sin error crudo expuesto) | `lib/integrations/sheets/__tests__/sync-down.test.ts`, `app/api/__tests__/sheets-sync-down-route.test.ts`, `app/api/__tests__/sheets-status-route.test.ts` |
| Dashboard (incluye gastos fijos) | `lib/server/repositories/dashboard.ts` + sus tests |
| Revocación de sesión de staff (`session_version`) | `__tests__/proxy.test.ts`, `__tests__/auth-callbacks.test.ts`, `lib/__tests__/api-auth.test.ts`, `tests/e2e/live/staff-session-revocation.spec.ts` |
| Resiliencia de Realtime (backoff, convergencia en remount, refresco de token) | `lib/realtime/__tests__/useRealtimeChannel.test.ts`, `tests/e2e/live/realtime-channel-reconnection.spec.ts` |

**Edición colaborativa de cotizaciones: READY.** La auditoría de Fase 8 dejó cinco
huecos abiertos, cerrados en la Fase 8.7: flush real previo a toda transición de
estado, cleanup de Presence en reconexión, prueba live de Aprobar bajo concurrencia,
`409` explícito ante un UUID de partida cruzado entre cotizaciones, y esta misma
descripción. Una auditoría posterior sobre ese mismo cierre encontró que el flush
solo cubría cuatro de las nueve vías de mutación de partidas y que ninguna escritura
revalidaba el estado de la cotización — cerrado en Fase 8.7.1 (flush completo de las
cinco vías restantes + guard de estado transaccional en `patch_item_cotizacion`/
`upsert_items_cotizacion`/`delete_item_cotizacion`, ver más arriba). Una tercera
ronda (Fase 8.7.2) cerró dos bugs más de estado en el cliente (avisos de "editando"
que no se actualizaban, Totales sin recalcular tras agregar fila) con drenado real
por celda, `base` refrescada tras cada PATCH y resolución de conflicto atómica para
grupos multi-campo (ver más arriba) — y, verificando ese cierre, encontró y corrigió
2 migraciones de producción atrasadas que habrían revertido en silencio 2 fixes ya
aplicados por separado (`docs/decisions/005-migraciones-manuales-append-only.md`).
Cubierta por pruebas de concurrencia reales contra Supabase de prueba
(`tests/e2e/live/`) — historia completa de cada fase en `docs/archive/`. Es el
módulo de referencia: lo que aquí funciona (Postgres como única autoridad, broadcast
confirmado como mecanismo primario, conflictos por campo y por identidad con `409`,
polling solo como fallback) es el patrón a replicar en Proyectos y Cuentas cuando
necesiten edición colaborativa.

Lo que está construido **a medias a propósito** vive en `docs/ROADMAP.md`.

## Tablas

El schema real es la suma de `db/migrations/*.sql` — esa es la referencia
autoritativa, no una tabla en un documento. Agrupadas por dominio:

| Dominio | Tablas |
|---|---|
| Cotizaciones | `cotizaciones` (id = folio texto SH001), `items_cotizacion`, `cotizacion_folio_reservations`, `cotizacion_collaboration_events` |
| Catálogos | `clientes`, `productos`, `service_templates` |
| Proyectos | `proyectos`, `tipos_proyecto`, `tipo_proyecto_etapas`, `tipo_proyecto_tarea_default`, `proyecto_tareas`, `proyecto_tarea_checklist`, `proyecto_documentos` |
| Cuentas | `cuentas_cobrar`, `cuentas_pagar`, `documentos_cuentas_cobrar`, `documentos_cuentas_pagar`, `pagos_comprobantes`, `ordenes_pago` |
| Proveedores | `proveedores` (antes `responsables`), `proveedor_documentos`, `historial_responsable`, `historial_cambios_responsable_item` |
| Planeación | `planeacion_pendientes`, `planeacion_event_notas` (soft delete en `eliminada`), `extraction_logs` |
| Dashboard | `gastos_fijos` |
| Infraestructura | `usuarios`, `rate_limits`, `idempotency_keys`, `sheets_sync_status` |

**RLS** está habilitado en las tablas pero **sin políticas de lectura**, así que la
llave anónima no lee nada. Es la razón de que la colaboración no use
`postgres_changes` — ver `docs/decisions/003-realtime-solo-presence.md`.

## Gotchas del repo

Trampas reales, no teóricas. Cada una costó un bug:

- **Cotizaciones COMPLEMENTARIA afectan al Proyecto de la PRINCIPAL.** Al aprobarse
  suman al proyecto y las cuentas del padre. No tratarlas como independientes.
- **Escribir en cotizaciones / proyectos / cuentas YA NO dispara sync a Google
  Sheets automáticamente** (EF-3 3C-1, `triggerSheetsSync()` eliminado — 31
  call-sites). El sync Supabase→Sheets es **manual** hoy, vía
  `POST /api/integrations/sheets/sync-down` (botón en `/admin`,
  `AdminSheets.tsx`), protegido por un lock con lease en `sheets_sync_status`
  (3C-3: `acquire_sheets_sync_lock`/`renew_sheets_sync_lease`/
  `release_sheets_sync_lock`, keyset pagination en `sync-down.ts`). Un
  safety-net diario vía el cron de `keep-alive` está planeado (3C-4) pero
  **pausado** hasta que el volumen de prueba objetivo esté disponible (ver
  tracker de EF-3).
- **Reservar folio es atómico vía RPC.** Generar folios en JS garantiza carreras.
- **Rate limiting corre sobre Postgres**, no sobre un store dedicado (no hay cuenta
  de pago de Vercel). Funciona al volumen actual; la interfaz
  `checkRateLimit(key, max, windowSeconds)` está aislada para poder migrar a Redis
  sin tocar los callers.
- **`lib/db.ts` es solo fachada** que reexporta repositorios. No meterle lógica.
- **Las migraciones se aplican a mano** en el SQL Editor de Supabase; no hay CLI ni
  aplicación automática. `npm run check-migrations` solo lista y valida nombres.
- **No mezclar refactors de UI con cambios de schema/RPC/SQL** en el mismo bloque.
- **`PUT /api/cuentas-pagar` (recibe `id` en el body, no es ruta `[id]`) no
  acepta `estado`/`fecha_pago`/`monto_pagado`** — esos campos son
  transicionales y solo se tocan vía los endpoints explícitos de
  registrar-pago. Si el body trae cualquiera de los tres, responde `400` y
  rechaza el update completo, incluso si viene mezclado con `notas`/
  `orden_pago_id` (sí permitidos) — nunca aplica parcialmente.
- **`CacheManager` en memoria (`lib/api/cache.ts`) no persiste entre
  instancias serverless de Vercel.** Medido en EF-2 1D-3: la misma ruta
  (`/api/folio`) osciló entre 486ms y 3664ms de p95 en 3 corridas idénticas
  contra un Preview real, según si la petición caía en la misma instancia
  tibia que la anterior o no. Nunca es una garantía de caché-hit, solo una
  mitigación best-effort — si una ruta necesita latencia consistente, la
  solución real es una consulta más barata (filtro/límite/RPC), no un `Map`
  de proceso. Causa raíz de la deuda documentada en `docs/ACTIVE_WORK.md`
  para `previewNextQuotationFolio()`.
- **`RealtimeClient.removeChannel()` (`@supabase/realtime-js`) solo da de
  baja el canal si `unsubscribe()` resuelve `'ok'`.** Con `'timed out'` o
  `'error'` el canal queda registrado en el cliente igual, y
  `.channel(topic)` lo reutiliza en el siguiente `connect()`/remount para
  ese mismo topic. `useRealtimeChannel.ts` (`removeChannelWithRetry`)
  reintenta con backoff acotado antes de liberar el topic — cualquier código
  nuevo que llame `removeChannel()` directamente debe revisar el status
  devuelto, nunca asumir que "la promesa resolvió" significa "el canal ya no
  existe" (EF-2 1A-1, expuesto por auditoría del PR #31).
- **`GET /api/productos` (carga completa sin `q`, usada por
  `useQuotationForm` para el autofill client-side) tiene `.limit(2000)`
  explícito — antes no tenía ninguno y dependía en silencio del tope por
  defecto de PostgREST (1000 filas).** Costó el mismo bug dos veces
  (Fase 8.7.2 y PR #48, EF-3 3D-0): fixtures de `tests/e2e/live/` sin
  cleanup completo acumularon >1000 filas en `serenata-erp-test`, y el
  producto recién creado por un test quedaba fuera de la respuesta según
  orden alfabético, sin error ni log. `cleanupOrphanedTestProductos()`
  (`tests/e2e/utils/live-cleanup.ts`) borra la tabla completa en cada
  `beforeAll` relevante (seguro por `workers:1`/`fullyParallel:false` en
  `playwright.config.ts` — ningún spec corre en paralelo) en vez de filtrar
  por antigüedad. El `.limit(2000)` es un tope explícito, no paginación
  real: un catálogo de producción que algún día lo supere (hoy 40 filas)
  volvería a perder productos del autofill en silencio — sigue siendo el
  patrón "traer todo el catálogo" del Frente A del roadmap, sin resolver.
