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
docs/                         # ESTADO.md
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

- Canal de Supabase Realtime por cotización: presence + broadcast. Los avisos son
  **best-effort**: si el canal no está unido, `send()` cae a REST, devuelve 403 y
  el error se traga.
- La convergencia real la da la **reconciliación contra la base** cada 5 s, al
  reconectar y al volver la pestaña al frente. Preserva lo que el usuario está
  escribiendo y el cursor.
- Las escrituras van por sección (`general`, `totales`, `notas`, `items/[itemId]`)
  y los RPCs bloquean fila y aplican solo las claves recibidas.
- No hay OT ni CRDT, y no hacen falta: son campos de un registro, no texto
  compartido. El modelo es último-en-escribir-gana por campo.

Detalle completo, defectos arreglados y lo que falta: [`docs/ESTADO.md`](docs/ESTADO.md).

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
