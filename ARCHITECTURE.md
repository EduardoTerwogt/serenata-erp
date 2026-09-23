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
├── session-token.ts          # getEdgeSessionToken()/getNodeSessionToken() -- decodifica el JWT (getToken(), next-auth/jwt) sin pasar por auth(), nunca reemite Set-Cookie (F28)
├── auth-callbacks.ts         # callbacks jwt/session de NextAuth (testables por separado)
├── authz.ts  types.ts  supabase.ts  supabase-browser.ts
├── db.ts                     # SOLO fachada: reexporta repositories
├── validation/schemas.ts     # Zod
├── client/api.ts             # getJson/postJson/putJson/FormData/binario + 401 compartido
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
`middleware.ts`) decodifica el JWT de sesión con `getEdgeSessionToken()`
(`lib/session-token.ts`, wrapper de `getToken()` de `next-auth/jwt`) y llama a
`proxyHandler(req, token)` -- **ya no envuelve con `auth()`** (F28, ver gotchas:
`auth()` usado como middleware reemitía el cookie de sesión en cada invocación).
Toda la lógica real vive en `lib/proxy-handler.ts` para poder testearla sin
arrastrar `NextAuth({...})` (que Vitest no resuelve bajo Next 16). Valida sesión
y secciones permitidas antes de llegar a página o API. Dentro de cada route,
`requireSection('cotizaciones')` repite la comprobación -- también vía
`getNodeSessionToken()`, no `auth()`. Secciones: `admin`, `dashboard`,
`cotizaciones`, `proyectos`, `cuentas`, `responsables`, `planeacion`. El portal
de proveedores tiene sesión propia, independiente de NextAuth.

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

**5. PDFs.** `lib/server/pdf/` con `jspdf` + `jspdf-autotable` — 4 generadores
(cotización, orden de pago, hoja de llamado, reporte de cierre), cada uno con su
propio shape de datos de entrada, sin schema compartido. **El comportamiento con
Drive no es uniforme entre los 4** (verificado leyendo cada ruta, 2026-09-21):
solo Cotización reusa `drive_file_id` (`driveService.updateFile()` si ya existe);
Orden de pago sube siempre un archivo nuevo (`uploadFileToDrive()`, API distinta,
sin reuso); Hoja de llamado y Reporte de cierre no suben a Drive en absoluto — es
descarga directa. **Cotización** (rediseño PR #86), **Orden de pago** (PR #88)
y **Hoja de llamado** (bloque 3) ya no usan autotable: dibujo manual en mm con Inter embebida
(`lib/server/pdf/fonts/inter.ts`) y helpers compartidos
(`lib/server/pdf/pdf-draw.ts`), paginación real (encabezado compacto,
encabezados repetidos, pie "Página N de M"). Los
cambios de formato se diseñan en Claude Design y se implementan en código
(`docs/decisions/015-pdfs-disenados-en-claude-design.md`, plan en
`docs/PLAN.md`); no hay editor de plantillas ni tabla de plantillas en uso.

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

## Cuentas por Pagar agrupadas por proveedor+proyecto

`cuentas_pagar` sigue siendo el ledger detallado por renglón (1:1 con
`items_cotizacion`, `x_pagar > 0`) — `cuentas_pagar_grupos` es una capa de
agrupación encima, no un reemplazo. Un proveedor con varios renglones
dentro del mismo proyecto factura y cobra el **total acumulado del grupo**,
no renglón por renglón. Por qué se diseñó así, alternativas descartadas y
la lección de proceso sobre desplegar a producción: [`docs/decisions/011`](docs/decisions/011-agrupacion-cuentas-pagar-por-proveedor-proyecto.md).

- **`reconcile_cuenta_pagar_grupo(cuenta_id)`** es la única función que
  mantiene la agrupación consistente — la llaman `approve_cotizacion`
  (cuentas nuevas, principal y complementaria), `reasignar_responsable_cuenta_pagar`
  (reasignación de proveedor) y la migración retroactiva de datos. Nunca se
  reimplementa la lógica de agrupación en un cuarto lugar.
- Un índice único parcial (`cuentas_pagar_grupos_abierto_unique` sobre
  `(proyecto_id, responsable_id) WHERE estado = 'ABIERTO'`) es lo que hace
  segura la creación de grupos bajo concurrencia — dos aprobaciones casi
  simultáneas del mismo proveedor+proyecto no pueden crear dos grupos
  `ABIERTO`.
- Reasignar el proveedor de una cuenta cuyo grupo ya no está `ABIERTO` se
  rechaza con `RAISE EXCEPTION` (código `P1412`), nunca con un jsonb de
  error — `reasignar_responsable_cuenta_pagar` escribe
  `items_cotizacion`/`cuentas_pagar` ANTES de llamar a la reconciliación,
  dentro de la misma transacción; solo una excepción real hace que Postgres
  revierta también esas escrituras previas, no solo la reconciliación.
- `registrar_pago_grupo_factura` prorratea el pago hacia las cuentas hija
  sobre su **saldo pendiente** (no su `x_pagar` original), con la última
  hija (orden estable por `id`) recibiendo el residuo exacto — garantiza
  `SUM(hijas.monto_pagado) = grupo.monto_pagado` siempre, incluso en pagos
  parciales sucesivos. Mismo mecanismo de idempotencia (`pago_operations`,
  `operation_id`) que `registrar_pago_cuenta_pagar`.
- `generar-orden-pago` toma grupos `FACTURADO` como fuente, elegibles solo
  si **todas** las cotizaciones que le aportan renglones (principal +
  cualquier complementaria) tienen su evento ya realizado — un `UNION ALL`
  preserva el criterio anterior (cuenta individual `PENDIENTE` con evento
  realizado) para cualquier fila que todavía no tenga `grupo_id`.
- El Portal de Proveedores (`GET /api/portal/cuentas`) factura por grupo:
  `{ grupos: [...] }`, con las cuentas legacy sin `grupo_id` todavía
  representadas como grupos sintéticos de un solo renglón (visibles, nunca
  facturables por esa vía) — nunca desaparecen de la vista del proveedor
  mientras la migración retroactiva no las alcance.
- La UI interna (`CuentaDetailModal`) muestra la tarjeta "Grupo de
  facturación" con el desglose de renglones hermanos solo cuando
  `cuenta.grupo_id` no es null; el cruce fiscal se calcula sobre
  `grupo.monto_total`, nunca sobre el `x_pagar` del renglón individual.

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
| Cotizaciones (CRUD, folio atómico, PDF, emitir) | `tests/e2e/critical/cotizaciones-*.spec.ts`, live `basic.spec.ts`, `lib/server/pdf/__tests__/cotizacion-pdf.test.ts` (fuente embebida, paginación) |
| Aprobar / cancelar cotización (RPC transaccional) | live: crear → emitir → aprobar → cuentas → cancelar y revertir |
| Cuentas por cobrar (factura, complemento, pagos parciales) | crítico + live de concurrencia |
| Cuentas por pagar (factura, pagos, órdenes de pago con PDF real; utilidad de proyecto y cierre fiscal estimado — chip "Utilidad" + tabla Quién/Cuánto/Cuándo en `CuentasPorProyecto.tsx`, cálculo puro en `lib/shared/cierre-proyecto.ts`) | `lib/server/pdf/orden-pago-pdf.ts`, live de concurrencia, `lib/shared/__tests__/cierre-proyecto.test.ts`, `tests/e2e/critical/cuentas-cierre-proyecto.spec.ts` |
| Registrar pago sin carreras (cobrar y pagar) | `tests/e2e/live/cuentas-*-concurrency.spec.ts` |
| Idempotencia de cliente (pagos y bulk-import de partidas) | `lib/client/__tests__/pagoIdempotency.test.ts`, `bulkImportIdempotency.test.ts`, `lib/server/__tests__/idempotency.test.ts`, `tests/e2e/live/bulk-replace-items-rpc.spec.ts` |
| Proyectos (detalle, tareas, cronograma, tipos, reporte de cierre) | smoke de proyectos |
| Proveedores (lista + modal, historial, régimen fiscal (moral / física / RESICO), revisión de documentos del Portal: validar/marcar en revisión con motivo) | `tests/e2e/critical/proveedores.spec.ts`, `app/api/__tests__/proveedores-documentos-route.test.ts`, `proveedores-documentos-id-route.test.ts` |
| Portal de proveedores (signup, login, confirmar identidad; subir factura + simulador de factura; alias; documentos con auto-clasificación híbrida, borrado y reemplazo automático del mismo tipo al subir uno nuevo; matching de identidad solo por INE; "Tus cuentas con Serenata" como tabla paginada al fondo de "Cuentas y facturas", ya no un tab propio) | `smoke/portal-signup.spec.ts`, `smoke/portal-documentos.spec.ts`, `smoke/portal-mis-datos.spec.ts`, `critical/portal-factura.spec.ts` |
| Clientes (catálogo editable: lista + modal, mismo patrón `PUT`+soft-delete `activo` que Proveedores; `cliente_id` como FK real en `cotizaciones`/`proyectos`/`cuentas_cobrar`/`historial_responsable`, dual-write con clasificación de 3 cubetas para el backfill) | `app/api/__tests__/clientes-route.test.ts` (sin e2e dedicado todavía), `lib/validation/__tests__/schemas.test.ts` (casos `cliente_id`), `docs/decisions/014-cliente-id-fk-clasificacion.md` |
| Planeación (extracción AI, pendientes, soft delete) | `critical/planeacion.spec.ts` |
| Plantillas de servicios (cotizaciones nuevas) | `critical/plantillas-servicios.spec.ts` |
| Admin de usuarios y sync a Google Sheets | `critical/admin-usuarios.spec.ts` |
| Sync manual Supabase→Sheets con lock/lease (huérfanos, sin error crudo expuesto) | `lib/integrations/sheets/__tests__/sync-down.test.ts`, `app/api/__tests__/sheets-sync-down-route.test.ts`, `app/api/__tests__/sheets-status-route.test.ts` |
| Dashboard (incluye gastos fijos) | `lib/server/repositories/dashboard.ts` + sus tests |
| Revocación de sesión de staff (`session_version`) | `__tests__/proxy.test.ts`, `__tests__/auth-callbacks.test.ts`, `lib/__tests__/api-auth.test.ts`, `tests/e2e/live/staff-session-revocation.spec.ts` |
| Resiliencia de Realtime (backoff, convergencia en remount, refresco de token) | `lib/realtime/__tests__/useRealtimeChannel.test.ts`, `tests/e2e/live/realtime-channel-reconnection.spec.ts` |
| Infraestructura de carga real (k6, targets local/serverless, identidades de staff/Portal, volumen sembrado, cleanup por `runId` en Postgres+Drive, telemetría de `pg_stat_statements`) | `docs/archive/ef-3-engineering-hardening.md` §11 (3A-1..3A-6), `docs/archive/ef-3-baseline-previo.md` |

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
| Cuentas | `cuentas_cobrar`, `cuentas_pagar`, `cuentas_pagar_grupos`, `documentos_cuentas_cobrar`, `documentos_cuentas_pagar`, `pagos_comprobantes`, `ordenes_pago` |
| Proveedores | `proveedores` (antes `responsables`), `proveedor_documentos`, `historial_responsable`, `historial_cambios_responsable_item` |
| Planeación | `planeacion_pendientes`, `planeacion_event_notas` (soft delete en `eliminada`), `extraction_logs` |
| Dashboard | `gastos_fijos` |
| Infraestructura | `usuarios`, `rate_limits`, `idempotency_keys`, `sheets_sync_status`, `loadtest_runs` |

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
  safety-net diario vía el cron de `keep-alive` (`app/api/keep-alive/route.ts`,
  EF-3 3C-4) llama `syncAllDown()` bajo el mismo lock, best-effort
  (try/catch, nunca hace fallar `keep-alive`), más retención de
  `rate_limits` (`window_start<24h`). La validación empírica de cuánto
  tarda `syncAllDown()` contra Sheets real quedó fuera de alcance de
  Engineering Hardening por decisión explícita del usuario (2026-09-16) —
  el spreadsheet aislado de loadtest resultó inaccesible y reconfigurarlo,
  o decidir el futuro de la integración de Sheets, es una decisión de
  producto aparte. Detalle: `docs/archive/ef-3-engineering-hardening.md`.
- **Reservar folio es atómico vía RPC** (`reserve_next_cotizacion_folio()`
  al confirmar; `preview_next_cotizacion_folio_principal()` para el
  preview de la rama principal, EF-3 3B-7 — la rama de complementarias
  sigue en JS, `folio.ts`). Generar folios en JS sin RPC garantiza
  carreras. El caché en memoria de `previewNextQuotationFolio()` fue
  retirado en 3B-7 (ver el gotcha de `CacheManager` más abajo) — la RPC se
  llama directo en cada invocación, con p95 medido de 23ms.
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
  de proceso. Las 4 cachés locales que existían quedaron retiradas por
  completo tras EF-3 3B-7 (`folio.ts`, el último): ya no queda ningún
  `CacheManager` activo en el repo.
- **Los generadores de `lib/server/pdf/` no comparten convenciones entre
  sí** (auditado 2026-09-21; Cotización, Orden de pago y Hoja de llamado se
  rehicieron después, ver capa 5 — lo de abajo aplica a Reporte de cierre): `pdf-base-config.ts` define helpers
  (`drawPdfHeader`, `drawDivider`, `drawSectionHeading`) que **ningún**
  generador usa — cada uno reimplementa su propio header con números
  mágicos; `formatCurrencyPdf()` (base-config) y el `fmtMoney()` local de
  `reporte-cierre-pdf.ts` dan salidas ligeramente distintas. Más importante
  para cualquier cambio futuro: **Reporte de cierre no repite
  header/footer/logo si el contenido fuerza una segunda página** — `checkPageSpace()`/
  `addPage()` solo resetean `currentY`, la página 2 (si llega a existir)
  queda sin logo ni footer. No asumir soporte de multipágina real solo
  porque el código tiene `addPage()`.
- **`RealtimeClient.removeChannel()` (`@supabase/realtime-js`) solo da de
  baja el canal si `unsubscribe()` resuelve `'ok'`.** Con `'timed out'` o
  `'error'` el canal queda registrado en el cliente igual, y
  `.channel(topic)` lo reutiliza en el siguiente `connect()`/remount para
  ese mismo topic. `useRealtimeChannel.ts` (`removeChannelWithRetry`)
  reintenta con backoff acotado antes de liberar el topic — cualquier código
  nuevo que llame `removeChannel()` directamente debe revisar el status
  devuelto, nunca asumir que "la promesa resolvió" significa "el canal ya no
  existe" (EF-2 1A-1, expuesto por auditoría del PR #31).
- **F28 — RESUELTO (2026-09-17, PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71), commit `136fee9`).**
  `next-auth` v5 rotaba el cookie de sesión en casi cada request autenticado
  porque `auth()` usado como middleware (`proxy.ts = auth(proxyHandler)`)
  invoca internamente la acción `session()` de `@auth/core`, que para
  `strategy:'jwt'` siempre re-firma y reemite `Set-Cookie` — sin throttle de
  `updateAge` (ese throttle solo existe en la rama de sesiones de base de
  datos). Bajo requests verdaderamente simultáneos contra la misma sesión,
  eso causaba una race de concurrencia real (coincide con el issue upstream,
  aún abierto sin fix,
  [`nextauthjs/next-auth#8897`](https://github.com/nextauthjs/next-auth/issues/8897)).
  Confirmado en el gate de carga real de EF-3 3E-1: 6 de 8 escenarios
  rompieron `http_req_failed<1%` de forma idéntica en `local` y `serverless`
  (duración/latencia sí pasaban siempre). **Fix:** `proxy.ts`/
  `lib/proxy-handler.ts` y `lib/api-auth.ts` dejan de envolver con `auth()` y
  usan `getToken()` (`lib/session-token.ts`) — decodifica sin efectos
  secundarios, nunca emite `Set-Cookie`. Verificado con
  `tests/e2e/live/staff-session-concurrent-rotation.spec.ts` (15 requests
  concurrentes reales contra la misma sesión, en verde contra `main`).
  Detalle completo, causa raíz exacta y verificación:
  [`docs/decisions/010-f28-diferir-race-cookie-nextauth.md`](docs/decisions/010-f28-diferir-race-cookie-nextauth.md).
  **Pendiente de atender en algún momento, no bloqueante:** ni el paso
  `SMOKE` de `scripts/loadtest/k6/_diag-cookies-concurrent.js` ni el job
  `serverless` de `load-test.yml` ejercen las 5 VUs sostenidas contra el
  umbral real `http_req_failed<1%` — ese gate nunca quedó cableado como job
  permanente (solo se usó antes vía ramas throwaway durante el diagnóstico
  original). El test e2e ya prueba el mecanismo real bajo concurrencia
  genuina, así que no bloquea nada, pero si se quiere la confirmación a
  escala hay que correr el script a mano fuera de `SMOKE=1`. Ver
  `docs/ACTIVE_WORK.md`.
  **Corrección sobre 3A-6:** el baseline diagnóstico previo (3A-6,
  `docs/archive/ef-3-baseline-previo.md`) había atribuido un patrón de
  fallas casi idéntico (5/7 escenarios rotos, `portal.js` limpio) a
  contención de CPU/socket del runner compartido de GitHub Actions donde
  corrían juntos la app y los generadores de carga k6. Esa hipótesis **no
  se sostiene**: el mismo patrón reprodujo igual contra `serverless`
  (infraestructura propia de Vercel, sin ningún runner compartido
  posible). Es casi seguro que 3A-6 ya estaba viendo F28, nunca
  confirmable entonces porque `serverless` no llegó a correr (bloqueado
  por un rate-limit real de Vercel esa sesión). El target `local` de
  `load-test.yml` sigue sirviendo para humo funcional (`SMOKE=1`); el
  target `serverless` es la fuente válida de percentiles de capacidad.
- **Dashboard usa 5 RPCs SQL agregadas** (`dashboard_kpis_cuentas`/
  `dashboard_egresos_por_bucket`/`dashboard_actividad_cotizaciones`/
  `dashboard_actividad_proyectos`/`dashboard_cotizaciones_recientes`, EF-3
  3B-10) en vez de traer las tablas completas a JS y agregar ahí. De paso
  eliminó el `.limit(500)` real que tenía `getCuentasPagar()` y que topaba
  el KPI "por pagar". `getPagosComprobantesEnRango()` no se tocó (ya
  filtraba server-side).
- **`cuentas_por_proyecto()` necesita índice en `cuentas_pagar.proyecto_id`
  (F27, EF-3 3E-1).** Sin él, la RPC hacía un seq scan completo de
  `cuentas_pagar` por cada proyecto consultado — medido y corregido con
  `CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_proyecto_id` (migración
  `20260916_fix_cuentas_por_proyecto_missing_index.sql`, aplicada a test y
  producción). No explicó por sí solo el hallazgo más grande del gate de
  carga de 3E-1 — ver F28 arriba.
- **`parseFacturaXML()` parseaba CFDI por regex sobre el texto plano, no por
  estructura -- causó un bug real de duplicación (reportado 2026-09-19 con
  un CFDI real vía Portal, folio SH076): un CFDI válido trae
  `cfdi:Traslado`/`cfdi:Retencion` **dos veces** (una por cada
  `cfdi:Concepto`, desglose por renglón, y otra en el `cfdi:Impuestos` a
  nivel `cfdi:Comprobante`, resumen agregado); sumar por regex sobre el XML
  completo sin distinguir nivel contaba ambas ocurrencias -- el caso real
  leyó IVA trasladado $6,400.00 cuando el XML declaraba $3,200.00
  (exactamente el doble). Los fixtures de test anteriores solo tenían el
  nivel documento, por eso no se detectó antes.** Fix definitivo
  (`lib/server/xml/factura-parser.ts`): se reemplazó la extracción por
  regex por un parser XML real (`fast-xml-parser`, con `removeNSPrefix`
  para ser independiente del prefijo de namespace). Con árbol real,
  `comprobante.Impuestos` es inequívocamente el nodo hermano de
  `comprobante.Conceptos` -- el bug de duplicación (y toda la clase de bugs
  de "el regex no entiende jerarquía") queda eliminado por construcción,
  no por una regla de scoping de texto. `lib/server/xml/factura-parser.test.ts`
  cubre: estructura real de dos niveles (single/multi-concepto), namespace
  arbitrario (no solo `cfdi:`), un tag colisionante dentro de `Complemento`
  (`Traslado` de otro complemento, que con un scoping por regex sí se
  habría sumado por error), múltiples líneas de la misma tasa de impuesto,
  y XML mal formado. `CampoMismatchFactura`/`MismatchFactura`
  (`lib/server/xml/factura-parser.ts`) no cambiaron -- son independientes
  del método de parseo. `complemento-parser.ts` (complementos de pago) NO
  se migró -- solo lee atributos planos a nivel único, sin riesgo de
  duplicación por anidamiento; se deja como está hasta que haga falta.
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
- **El matching de identidad del Portal (Fase 5.5) solo se dispara con INE,
  nunca con la Constancia de Situación Fiscal (bug real, 2026-09-20).**
  Antes `POST /api/portal/documentos` corría `buscarCandidatosMatch()` con
  el nombre extraído de cualquiera de los dos documentos -- hay
  proveedores que facturan por medio de terceros (la constancia trae el
  RFC/nombre de un intermediario, no el de quien realmente colabora con
  Serenata), y cruzar por ese nombre fusionaba o pedía confirmar la cuenta
  equivocada. La constancia sigue disparando extracción de IA (para
  `regimen_fiscal`); solo dejó de alimentar el matching. Ver
  `docs/decisions/013-portal-documentos-verdad-unica.md`.
- **`proveedor_documentos.estado_validacion` nunca se movía de `pendiente`
  -- ningún mecanismo, automático ni manual, lo escribía (bug real,
  2026-09-20; `proveedor_documentos_resumen()` ya contaba "documentación
  con errores" leyendo ese campo, pero nada lo poblaba).** Resuelto
  híbrido: `POST /api/portal/documentos` auto-clasifica con la misma IA
  que ya lee INE/constancia (`validado` si el dato esperado se pudo leer,
  `revision` con motivo si no); comprobante de domicilio/bancario no
  pasan por IA y quedan `pendiente` hasta revisión manual. Staff corrige
  cualquier estado desde una sección "Documentos" nueva en
  `app/proveedores/components/ProveedorModal.tsx`, vía
  `PATCH /api/proveedores/[id]/documentos/[docId]` (mismo
  `DocumentoEstadoValidacionSchema` que ya usaban `cuentas_pagar`/
  `cuentas_cobrar`, sin ningún frontend conectado hasta ahora). Detalle y
  motivo de la decisión: `docs/decisions/013-portal-documentos-verdad-unica.md`.
- **Cada tipo de documento del Portal (constancia, INE, comprobante de
  domicilio, comprobante bancario) es de "verdad única": subir uno nuevo
  borra el anterior del mismo tipo (registro + archivo en Drive,
  best-effort), para que el proveedor solo tenga uno vigente por tipo.**
  Empezó acotado a la constancia -- bug real (2026-09-20): subir una
  segunda con régimen distinto no actualizaba nada en Mis datos ni
  Cuentas y facturas, porque `regimen_fiscal` solo se seteaba si el
  proveedor **no tenía ninguno todavía** ("nunca pisar lo que staff
  corrigió a mano"). Decisión explícita del usuario: la constancia manda,
  siempre la más reciente -- se quitó ese guard (cada constancia legible
  pisa el régimen anterior sin excepción) y luego se generalizó el
  reemplazo a los otros 3 tipos, mismo pedido explícito. `uploadFileToDrive()`
  nunca devolvió el `fileId` por separado (solo la URL) -- en vez de
  ensanchar esa firma (12+ callers en rutas de facturas/pagos que solo
  consumen el string), se agregó `extractDriveFileId()`
  (`lib/integrations/google/drive.ts`) que lo deriva del patrón
  `.../file/d/{fileId}/...` que la URL siempre tiene. Detalle completo:
  `docs/decisions/013-portal-documentos-verdad-unica.md`.
