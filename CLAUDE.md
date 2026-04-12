@AGENTS.md

# Serenata ERP

## Proyecto

- **App:** https://serenata-erp.vercel.app
- **Repo:** https://github.com/EduardoTerwogt/serenata-erp
- **Rama:** `main`
- **Stack:** Next.js 16 (App Router) + TypeScript + React 19 + Supabase (PostgreSQL, cliente directo + RPCs) + Tailwind CSS v4 + Vercel
- **Nota:** `prisma` aparece en `package.json` pero NO es la capa activa de datos. No usarlo — todo el acceso va por `supabaseAdmin` / `supabase` y RPCs.

---

## Git — Setup y reglas

### Setup al inicio de cada sesión
```bash
git config --global user.name "EduardoTerwogt"
git config --global user.email "eduardoterwogt@gmail.com"
source /home/user/serenata-erp/.env.local.tokens 2>/dev/null
git remote set-url origin https://${GITHUB_TOKEN}@github.com/EduardoTerwogt/serenata-erp.git
```

### Reglas
- Siempre `main`. Nunca ramas. Nunca PRs.
- Commit + push después de cada cambio funcional.
- Push a `main` dispara deploy automático en Vercel.
- Si el token falla → pedir al usuario uno nuevo y actualizar `.env.local.tokens`.

---

## Reglas de trabajo

**Planear antes de tocar código:**
- Proponer approach y confirmar con el usuario ANTES de implementar.
- Si hay dudas, hacer las preguntas necesarias hasta tener claridad total.
- Escribir el plan → ejecutar → replanear si algo cambia.

**No modificar features existentes:**
- Solo modificar lo que se planea cambiar. Nunca alterar funcionalidad existente como efecto secundario.
- Antes de push, verificar que ningún feature existente fue afectado.

**Usar herramientas disponibles:**
- Usar /simplify después de implementar para revisar calidad y reuso.
- Usar subagents para problemas complejos — desglosar, delegar, mantener contexto limpio.

**Respuestas concisas:**
- Usar la menor cantidad de palabras posible manteniendo claridad. Optimizar uso de tokens.

**Si el usuario debe ejecutar algo manualmente** (Supabase, Vercel, etc.) → dar paso a paso exacto.

**Bugs = acción inmediata:**
- Trazar → encontrar causa raíz → arreglar. Sin atajos ni retries ciegos.
- Si algo falla, diagnosticar por qué antes de intentar otra cosa.

**Aprender de errores en sesión:**
- Si un approach falla, documentar por qué y no repetirlo.
- Cada error es información para la siguiente decisión.

---

## Contexto de negocio

ERP para productora audiovisual mexicana (Serenata House). Módulos:

- **Cotizaciones**: Items desglosados con folio auto-incremental (SH001, SH002...). Tipos: PRINCIPAL y COMPLEMENTARIA. Estados: BORRADOR → EMITIDA → APROBADA | CANCELADA. Al aprobar → crea Proyecto + Cuentas cobrar/pagar automáticamente.
- **Proyectos**: Evento/producción aprobada. Estados: PREPRODUCCION → RODAJE → POSTPRODUCCION → FINALIZADO. Ligado 1:1 a cotización aprobada.
- **Cuentas por Cobrar**: Lo que el cliente debe pagar. Generadas al aprobar. Facturas (PDF+XML), complementos de pago, pagos parciales.
- **Cuentas por Pagar**: Lo que se paga a cada responsable. Item con responsable → cuenta por pagar. Órdenes de pago agrupadas.
- **Responsables**: Colaboradores/freelancers. Datos bancarios, roles, historial de proyectos.
- **Planeación**: Extracción AI de eventos desde mensajes informales (email/WhatsApp). Claude Sonnet parsea fechas, locaciones, proyectos. Se validan y convierten en cotizaciones en lote.
- **Plantillas de Servicios**: Templates reutilizables con items pre-configurados para cotizaciones nuevas.
- **Google Sheets (espejo)**: Sheets acompaña a Supabase como mirror de consulta externa. **Supabase es fuente de verdad**; las escrituras en la app se sincronizan hacia Sheets automáticamente. Nunca tratar Sheets como origen — siempre escribir contra Supabase.

---

## Features parciales / pendientes

Antes de modificar cualquiera de estos, PREGUNTAR al usuario:

- **Google Calendar desde Proyectos**: UI presente pero el flow end-to-end no está completo. No asumir que funciona como en planeación.
- **Complementos de pago (CFDI)**: Upload y registro funcional, pero la conciliación automática con cuentas por cobrar no está completa.
- **Órdenes de pago**: CRUD funciona, pero flujos de aprobación/firma pueden estar pendientes.
- **Plantillas de servicios**: Completas para cotizaciones nuevas; integración con cotizaciones complementarias es parcial.

Si se detecta otro feature a medias, documentarlo aquí en lugar de "arreglarlo" sin consultar.

---

## Arquitectura

```
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
│   ├── integrations/         # Google Drive, Sheets, Calendar
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
└── ui/                       # Primitivos (Button, Input, Badge, Card, Alert...)

hooks/                        # Custom hooks
├── useQuotationForm.ts       # Estado de formulario + autocomplete con cache
├── useServiceTemplateForm.ts # Estado de plantillas
└── usePrefetch.ts            # Prefetch de datos

lib/                          # Lógica de negocio y utilidades
├── api-auth.ts               # requireSection() para proteger API routes
├── authz.ts                  # Utilidades de permisos por sección
├── db.ts                     # Fachada que re-exporta todos los repositories
├── supabase.ts               # Cliente Supabase (admin + browser)
├── types.ts                  # Interfaces TypeScript de todo el dominio
├── validation/schemas.ts     # Schemas Zod para validación de payloads
├── client/api.ts             # Helpers fetch: getJson, postJson, putJson, etc.
├── quotations/               # Cálculos, formateo, mappers de cotizaciones
├── parsers/                  # eventInfoParser (regex fallback)
├── integrations/             # Google Drive, Sheets, Calendar
└── server/                   # Lógica server-only
    ├── pdf/                  # Generación PDF (jspdf + autotable)
    ├── quotations/           # Approval, cancel, folio, persistence
    ├── repositories/         # Data access layer por dominio
    └── cuentas/              # Helpers de estado de cuentas

db/migrations/                # SQL para ejecutar en Supabase
```

---

## Patrones clave

**Auth en API routes:**
```typescript
const authResult = await requireSection('cotizaciones')
if (authResult.response) return authResult.response
```
Secciones: `admin`, `dashboard`, `cotizaciones`, `proyectos`, `cuentas`, `responsables`, `planeacion`.

**Validación de payloads:**
```typescript
const validation = validate(CotizacionCreateSchema, body)
if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
const parsed = validation.data
```

**Route params en Next.js 16 — params es Promise:**
```typescript
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
```

**Formularios:** react-hook-form + Zod resolvers. `useQuotationForm` cachea catálogos a nivel módulo (5min TTL).

**PDF:** jspdf + jspdf-autotable. Archivos en `lib/server/pdf/`. Se suben a Google Drive.

**Soft delete:** `planeacion_pendientes` usa columna `eliminada: boolean`. GET filtra `eliminada = false`.

---

## Gotchas (trampas del repo)

- **Aprobar / cancelar cotizaciones usa RPCs con efectos laterales.** Aprobar crea Proyecto + Cuentas por cobrar + Cuentas por pagar en una transacción. Cancelar revierte. **Nunca recrear manualmente** — siempre llamar la RPC existente en `lib/server/quotations/`.
- **Reservar folio es atómico vía RPC.** No generar folios en JS — race conditions garantizadas.
- **Escribir en cotizaciones/proyectos/cuentas dispara sync a Google Sheets.** Si algo rompe el sync, revisar `lib/integrations/` antes de culpar al write.
- **Actualizar un PDF reusa `drive_file_id`.** Si existe, se actualiza el archivo de Drive en vez de crear uno nuevo. No borrar el campo sin entender el flow.
- **Cotizaciones COMPLEMENTARIA afectan al Proyecto del padre.** Al aprobarse, suman al proyecto/cuentas de la PRINCIPAL. No tratarlas como independientes.
- **Planeación guarda `planeacion_pendientes` + `planeacion_event_notas`.** Las notas contextuales son extraídas por Claude AI y asociadas por evento/fecha — no confundir con notas de usuario.
- **`planeacion_pendientes.eliminada` es soft delete.** GET debe filtrar `eliminada = false`. No usar DELETE físico.
- **`params` es Promise en Next.js 16.** Siempre `await params` antes de usar.
- **Prisma está en deps pero NO se usa.** Ver nota en Stack. Todo va por Supabase + RPCs.

---

## Base de datos

- **Motor:** Supabase (PostgreSQL)
- **Clientes:** `supabaseAdmin` para server-side, `supabase` (anon) para client-side
- **Migraciones:** SQL en `db/migrations/`. Se ejecutan manualmente en Supabase SQL Editor.
- **RPCs:** Operaciones complejas (aprobar cotización, reservar folio, cancelar) usan funciones PostgreSQL.

| Tabla | Descripción |
|-------|-------------|
| `cotizaciones` | Cotizaciones (id=folio texto SH001) |
| `items_cotizacion` | Items de cada cotización |
| `clientes` | Catálogo de clientes |
| `productos` | Catálogo de productos/servicios |
| `proyectos` | Proyectos (creados al aprobar cotización) |
| `cuentas_cobrar` | Cuentas por cobrar al cliente |
| `cuentas_pagar` | Cuentas por pagar a responsables |
| `responsables` | Colaboradores/freelancers |
| `plantillas_servicios` | Plantillas de items reutilizables |
| `planeacion_pendientes` | Eventos pendientes de planeación |
| `extraction_logs` | Log de uso de Claude API |

---

## Testing

**TODOS los checks deben pasar antes de push:**
```bash
npm test                  # 1. Vitest — unit tests
npm run build             # 2. Verificar build (simula deploy Vercel)
npm run test:e2e:smoke    # 3. Playwright — smoke tests
npm run test:e2e:critical # 4. Playwright — critical tests
```

Si cualquiera falla → diagnosticar, arreglar, re-ejecutar. No hacer push hasta que los 4 pasen.

- Unit tests: `lib/**/__tests__/*.test.ts`
- E2E tests: `tests/e2e/{smoke,critical,live}/*.spec.ts`
- CI: GitHub Actions ejecuta tests en cada push a main.

---

## Variables de entorno

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth (NextAuth)
AUTH_SECRET=
AUTH_TRUST_HOST=true
AUTH_USERS='[{"id":"...","email":"...","passwordHash":"...","name":"...","sections":["..."]}]'
NEXTAUTH_URL=

# AI (Planeación)
ANTHROPIC_API_KEY=

# Google integrations
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URL=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_KEY=
GOOGLE_SHEETS_MAIN_SPREADSHEET_ID=
```

---

## Convenciones

- **UI:** Tema oscuro. Fondo `gray-900`/`gray-800`, texto `gray-300`/`white`, acentos naranja `#ff8000` (orange-500/600).
- **Imports:** Alias `@/` = raíz. Ej: `import { supabaseAdmin } from '@/lib/supabase'`
- **Tipos:** `lib/types.ts`. Schemas: `lib/validation/schemas.ts`.
- **API routes:** Siempre `requireSection()` para auth. Retornar `Response.json()`.
- **Idioma código:** Español/inglés mixto (como existe). UI en español.
- **No crear archivos innecesarios:** Preferir editar existentes.
