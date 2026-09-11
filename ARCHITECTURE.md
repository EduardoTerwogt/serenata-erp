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
├── api-auth.ts               # requireSection() / requireAnySection()
├── authz.ts  types.ts  supabase.ts  supabase-browser.ts
├── db.ts                     # SOLO fachada: reexporta repositories
├── validation/schemas.ts     # Zod
├── client/api.ts             # getJson/postJson/putJson/FormData/binary
├── quotations/               # cálculos, formato, mappers
├── parsers/                  # eventInfoParser (fallback regex)
├── integrations/google/      # drive, sheets, calendar (parcial)
└── server/                   # server-only
    ├── repositories/         # acceso a datos por dominio
    ├── quotations/           # approval, cancel, folio, persistence
    ├── cuentas/              # estados y transiciones
    ├── projects/             # tareas, autofill de documentos
    └── pdf/                  # cotización, orden de pago, hoja de llamado, reporte de cierre

db/migrations/                # SQL numerado; se aplica A MANO en Supabase
tests/e2e/{smoke,critical,live}/
docs/                         # ACTIVE_WORK · ROADMAP · decisions/ · archive/
```

## Capas

**1. Auth y autorización.** `proxy.ts` (convención de Next.js 16, sustituye a
`middleware.ts`) valida sesión y secciones permitidas antes de llegar a página o
API. Dentro de cada route, `requireSection('cotizaciones')` repite la comprobación.
Secciones: `admin`, `dashboard`, `cotizaciones`, `proyectos`, `cuentas`,
`responsables`, `planeacion`. El portal de proveedores tiene sesión propia,
independiente de NextAuth.

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

## Edición colaborativa

`app/cotizaciones/[id]/page.tsx` + `hooks/useQuotationPresence.ts`.

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
  la base del campo y un conflicto real devuelve `409` al caller.
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
- No hay OT ni CRDT, y no hacen falta: son campos de un registro, no texto compartido.
- Reconexión, auth y refresh de token están en la infraestructura genérica
  `lib/realtime/useRealtimeChannel.ts`; `useQuotationPresence` es un wrapper fino.

**Aún no generalizado a propósito:** el protocolo `base`/`mutation_id`/conflict sigue
siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos exista
como segundo consumidor real, no antes.

Por qué se construyó así: [`docs/decisions/002`](docs/decisions/002-modelo-de-conflictos-por-campo.md)
y [`docs/decisions/003`](docs/decisions/003-realtime-solo-presence.md). El recorrido
completo, con los defectos que se encontraron en el camino:
[`docs/archive/fases-colaboracion-0-8.md`](docs/archive/fases-colaboracion-0-8.md).

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
| Proyectos (detalle, tareas, cronograma, tipos, reporte de cierre) | smoke de proyectos |
| Proveedores (lista + modal, historial, régimen fiscal) | `tests/e2e/critical/proveedores.spec.ts` |
| Portal de proveedores (signup, login, confirmar identidad, subir factura) | `smoke/portal-signup.spec.ts`, `critical/portal-factura.spec.ts` |
| Planeación (extracción AI, pendientes, soft delete) | `critical/planeacion.spec.ts` |
| Plantillas de servicios (cotizaciones nuevas) | `critical/plantillas-servicios.spec.ts` |
| Admin de usuarios y sync a Google Sheets | `critical/admin-usuarios.spec.ts` |
| Dashboard (incluye gastos fijos) | `lib/server/repositories/dashboard.ts` + sus tests |

**Edición colaborativa de cotizaciones: READY.** La auditoría de Fase 8 dejó cinco
huecos abiertos, cerrados en la Fase 8.7: flush real previo a toda transición de
estado, cleanup de Presence en reconexión, prueba live de Aprobar bajo concurrencia,
`409` explícito ante un UUID de partida cruzado entre cotizaciones, y esta misma
descripción. Una auditoría posterior sobre ese mismo cierre encontró que el flush
solo cubría cuatro de las nueve vías de mutación de partidas y que ninguna escritura
revalidaba el estado de la cotización — cerrado en Fase 8.7.1 (flush completo de las
cinco vías restantes + guard de estado transaccional en `patch_item_cotizacion`/
`upsert_items_cotizacion`/`delete_item_cotizacion`, ver más arriba). Cubierta por
pruebas de concurrencia reales contra Supabase de prueba
(`tests/e2e/live/`) — ver `docs/ACTIVE_WORK.md` para el detalle de cada bloque. Es el
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
| Infraestructura | `usuarios`, `rate_limits`, `idempotency_keys` |

**RLS** está habilitado en las tablas pero **sin políticas de lectura**, así que la
llave anónima no lee nada. Es la razón de que la colaboración no use
`postgres_changes` — ver `docs/decisions/003-realtime-solo-presence.md`.

## Gotchas del repo

Trampas reales, no teóricas. Cada una costó un bug:

- **Cotizaciones COMPLEMENTARIA afectan al Proyecto de la PRINCIPAL.** Al aprobarse
  suman al proyecto y las cuentas del padre. No tratarlas como independientes.
- **Escribir en cotizaciones / proyectos / cuentas dispara sync a Google Sheets.** Si
  el sync rompe, revisar `lib/integrations/` antes de culpar al write.
- **Reservar folio es atómico vía RPC.** Generar folios en JS garantiza carreras.
- **Rate limiting corre sobre Postgres**, no sobre un store dedicado (no hay cuenta
  de pago de Vercel). Funciona al volumen actual; la interfaz
  `checkRateLimit(key, max, windowSeconds)` está aislada para poder migrar a Redis
  sin tocar los callers.
- **`lib/db.ts` es solo fachada** que reexporta repositorios. No meterle lógica.
- **Las migraciones se aplican a mano** en el SQL Editor de Supabase; no hay CLI ni
  aplicación automática. `npm run check-migrations` solo lista y valida nombres.
- **No mezclar refactors de UI con cambios de schema/RPC/SQL** en el mismo bloque.
