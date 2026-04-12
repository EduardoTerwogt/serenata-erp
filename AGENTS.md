[AGENTS.md](https://github.com/user-attachments/files/26662769/AGENTS.md)
# Serenata ERP

## Proyecto

- **App:** https://serenata-erp.vercel.app
- **Repo:** https://github.com/EduardoTerwogt/serenata-erp
- **Rama de trabajo:** `main`
- **Stack:** Next.js 16 (App Router) + TypeScript + React 19 + Supabase (PostgreSQL, cliente directo + RPCs) + Tailwind CSS v4 + Vercel
- **Nota importante:** `prisma` aparece en `package.json` pero NO es la capa activa de datos. No usarlo. Todo el acceso va por `supabaseAdmin` / `supabase` y RPCs.

---

## Git y flujo de trabajo

### Reglas obligatorias
- Trabajar **directo sobre `main`**.
- **No crear branches.**
- **No abrir PRs.**
- Hacer cambios pequeños, seguros y verificables.
- Después de cada cambio funcional terminado, hacer **commit directo a `main`**.
- Push a `main` dispara deploy automático en Vercel.

### Antes de tocar código
- Para cambios medianos, sensibles o riesgosos: proponer un plan corto y confirmar con el usuario antes de implementar.
- Para fixes pequeños y seguros: ejecutar directo explicando brevemente qué se hará.
- Si hay dudas reales sobre el requerimiento, aclararlas antes de cambiar código.
- No asumir comportamientos que no estén confirmados en el repo.

### Regla principal
- **No romper funcionalidad existente.**
- Solo modificar lo necesario para el cambio pedido.
- Evitar refactors amplios no solicitados.

---

## Contexto de negocio

ERP para productora audiovisual mexicana (Serenata House).

### Módulos principales
- **Cotizaciones**: Items desglosados con folio auto-incremental (`SH001`, `SH002`, etc.). Tipos: `PRINCIPAL` y `COMPLEMENTARIA`. Estados: `BORRADOR` → `EMITIDA` → `APROBADA` | `CANCELADA`. Al aprobar, crea Proyecto + Cuentas por cobrar/pagar automáticamente.
- **Proyectos**: Evento/producción aprobada. Estados: `PREPRODUCCION` → `RODAJE` → `POSTPRODUCCION` → `FINALIZADO`. Se crea desde la cotización `PRINCIPAL` aprobada y puede acumular impacto de `COMPLEMENTARIA` aprobadas.
- **Cuentas por Cobrar**: Lo que el cliente debe pagar. Se generan al aprobar. Manejan facturas PDF/XML, complementos de pago y pagos parciales.
- **Cuentas por Pagar**: Lo que se paga a cada responsable. Un item con responsable genera cuenta por pagar. Manejan órdenes de pago agrupadas.
- **Responsables**: Colaboradores/freelancers. Datos bancarios, roles e historial de proyectos.
- **Planeación**: Extracción AI de eventos desde mensajes informales (email/WhatsApp). Claude Sonnet parsea fechas, locaciones y proyectos. Luego se validan y convierten en cotizaciones en lote.
- **Plantillas de Servicios**: Templates reutilizables con items preconfigurados para cotizaciones nuevas.
- **Google Sheets (espejo)**: Sheets acompaña a Supabase como mirror de consulta externa. **Supabase es la fuente de verdad**. Nunca tratar Sheets como origen; siempre escribir contra Supabase.

---

## Features parciales / pendientes

Antes de modificar cualquiera de estos, preguntar al usuario:

- **Google Calendar desde Proyectos**: La UI está presente pero el flow end-to-end no está completo. No asumir que funciona.
- **Complementos de pago (CFDI)**: El upload y registro funcionan, pero la conciliación automática con cuentas por cobrar no está cerrada.
- **Órdenes de pago**: El CRUD funciona, pero puede haber flujos de aprobación/firma aún incompletos.
- **Plantillas de servicios**: Completas para cotizaciones nuevas; la integración con cotizaciones complementarias es parcial.

Si se detecta otro feature a medias, **no completarlo por cuenta propia**. Primero confirmarlo con el usuario.

---

## Arquitectura

```text
app/                          # Next.js App Router
├── api/                      # API routes (REST)
│   ├── cotizaciones/         # CRUD + aprobar + cancelar + PDF
│   ├── cuentas-cobrar/       # CRUD + documentos + pagos
│   ├── cuentas-pagar/        # CRUD + documentos + órdenes de pago
│   ├── proyectos/            # CRUD + hoja de llamado
│   ├── responsables/         # CRUD + historial
│   ├── planeacion/           # extract-ai, pendientes, match, notas
│   ├── service-templates/    # CRUD plantillas
│   ├── clientes/             # Catálogo de clientes
│   ├── productos/            # Catálogo de productos
│   ├── integrations/         # Google Drive y Sheets activos; Calendar parcial
│   └── auth/                 # NextAuth
├── cotizaciones/             # Pages: lista, nueva, [id] detalle
├── proyectos/                # Pages: lista, [id] detalle
├── cuentas/                  # Page: cobrar + pagar (tabs)
├── responsables/             # Pages: lista, nueva, [id] detalle
├── planeacion/               # Pages: extracción + pendientes
├── plantillas-servicios/     # Pages: lista, nueva, [id]/editar
└── admin/sheets/             # Google Sheets sync

components/                   # Componentes reutilizables
├── quotations/               # Secciones del formulario de cotización
└── ui/                       # Primitivos UI

hooks/                        # Custom hooks
├── useQuotationForm.ts       # Estado de formulario + autocomplete con cache
├── useServiceTemplateForm.ts # Estado de plantillas
└── usePrefetch.ts            # Prefetch de datos

lib/                          # Lógica de negocio y utilidades
├── api-auth.ts               # requireSection() para proteger API routes
├── authz.ts                  # Permisos por sección
├── db.ts                     # Fachada que re-exporta repositories
├── supabase.ts               # Cliente Supabase (admin + browser)
├── types.ts                  # Interfaces del dominio
├── validation/schemas.ts     # Schemas Zod
├── client/api.ts             # Helpers fetch
├── quotations/               # Cálculos y mappers de cotizaciones
├── parsers/                  # eventInfoParser (regex fallback)
├── integrations/             # Google Drive y Sheets activos; Calendar parcial
└── server/                   # Lógica server-only
    ├── pdf/                  # Generación PDF
    ├── quotations/           # Approval, cancel, folio, persistence
    ├── repositories/         # Data access layer
    └── cuentas/              # Helpers de estado de cuentas

db/migrations/                # SQL para ejecutar manualmente en Supabase
```

---

## Patrones clave

### Auth en API routes
```ts
const authResult = await requireSection('cotizaciones')
if (authResult.response) return authResult.response
```

También existe `requireAnySection()` en algunas rutas. Usar el patrón que ya corresponda en el repo; no inventar uno nuevo.

### Validación de payloads
```ts
const validation = validate(CotizacionCreateSchema, body)
if (!validation.ok) {
  return Response.json({ error: validation.error }, { status: 400 })
}
const parsed = validation.data
```

### Route params en Next.js 16
`params` es `Promise`:

```ts
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
}
```

### Formularios
- `react-hook-form`
- Zod
- `useQuotationForm` cachea catálogos a nivel módulo (TTL 5 min)

### PDFs
- `jspdf` + `jspdf-autotable`
- ubicados en `lib/server/pdf/`
- se suben a Google Drive

### Soft delete
- `planeacion_pendientes` usa `eliminada: boolean`
- GET debe filtrar `eliminada = false`

---

## Gotchas del repo

- **Aprobar / cancelar cotizaciones usa RPCs con efectos laterales.** Aprobar crea Proyecto + Cuentas por cobrar + Cuentas por pagar en transacción. Cancelar revierte. **Nunca recrear esto manualmente**.
- **Reservar folio es atómico vía RPC.** No generar folios en JS.
- **Escribir en cotizaciones/proyectos/cuentas dispara sync a Google Sheets.** Si algo rompe el sync, revisar primero `lib/integrations/`.
- **Actualizar un PDF reusa `drive_file_id`.** Si ya existe, actualiza el archivo en Drive en vez de crear uno nuevo.
- **Cotizaciones `COMPLEMENTARIA` afectan al Proyecto padre.** No tratarlas como entidades totalmente independientes.
- **Planeación guarda `planeacion_pendientes` + `planeacion_event_notas`.** Las notas contextuales vienen de la extracción AI y no son lo mismo que notas manuales.
- **`planeacion_pendientes.eliminada` es soft delete.** No hacer delete físico.
- **`params` es Promise en Next.js 16.**
- **Prisma no se usa.** Todo va por Supabase + RPCs.

---

## Base de datos

- **Motor:** Supabase (PostgreSQL)
- **Server-side:** `supabaseAdmin`
- **Client-side:** `supabase`
- **Migraciones:** SQL en `db/migrations/`, se ejecutan manualmente en Supabase SQL Editor
- **RPCs:** aprobar cotización, reservar folio, cancelar, etc.

### Tablas importantes
- `cotizaciones`
- `items_cotizacion`
- `clientes`
- `productos`
- `proyectos`
- `cuentas_cobrar`
- `cuentas_pagar`
- `responsables`
- `plantillas_servicios`
- `planeacion_pendientes`
- `extraction_logs`

---

## Testing

Antes de commit/push a `main`, correr lo que aplique al cambio:

```bash
npm test
npm run build
npm run test:e2e:smoke
npm run test:e2e:critical
```

### Regla de oro
- No pushear con tests en rojo si el cambio los afecta.
- Si algo falla, diagnosticar antes de reintentar.
- Si una suite e2e falla por entorno y no por el cambio, dejarlo claro en la respuesta al usuario y en el commit si aplica.

### Ubicaciones
- Unit tests: `lib/**/__tests__/*.test.ts`
- E2E tests: `tests/e2e/{smoke,critical,live}/*.spec.ts`

---

## Variables de entorno

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth (NextAuth v5)
AUTH_SECRET=
AUTH_TRUST_HOST=true
AUTH_USERS='[{"id":"...","email":"...","passwordHash":"...","name":"...","sections":["..."]}]'
NEXTAUTH_URL=

# AI (Planeación)
ANTHROPIC_API_KEY=

# Google — OAuth base
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Google Drive
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_FOLDER_ID_CUENTAS=

# Google Sheets
GOOGLE_SHEETS_SPREADSHEET_ID=

# Google Calendar (parcial)
GOOGLE_CALENDAR_ID=

# Cron
CRON_SECRET=
```

---

## Convenciones

- **UI:** tema oscuro. Fondo `gray-900` / `gray-800`, texto `gray-300` / `white`, acento naranja `#ff8000`
- **Imports:** usar alias `@/`
- **Tipos:** `lib/types.ts`
- **Schemas:** `lib/validation/schemas.ts`
- **API routes:** usar `requireSection()` o `requireAnySection()` según corresponda
- **Idioma del código:** español/inglés mixto, como ya existe en el repo
- **UI en español**
- **No crear archivos innecesarios:** preferir editar existentes cuando encaje naturalmente; crear nuevos solo si mejora claridad o separación de responsabilidades
