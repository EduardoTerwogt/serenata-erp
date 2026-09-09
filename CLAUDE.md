# Serenata ERP

## Proyecto

- **App:** https://serenata-erp.vercel.app
- **Repo:** https://github.com/EduardoTerwogt/serenata-erp
- **Rama:** `main` (única)
- **Stack:** Next.js 16 (App Router) + TypeScript + React 19 + Supabase (PostgreSQL, cliente directo + RPCs) + Tailwind CSS v4 + Vercel
- **Nota:** `prisma` aparece en `package.json` pero NO es la capa de datos activa. No usarlo — todo va por `supabaseAdmin` / `supabase` y RPCs.

**Antes de tocar nada, leer [`docs/ESTADO.md`](docs/ESTADO.md):** qué está terminado, qué está a medias y qué está en rojo ahora mismo.

---

## Git — setup y reglas

### Al inicio de cada sesión
```bash
git config --global user.name "EduardoTerwogt"
git config --global user.email "eduardoterwogt@gmail.com"
source /home/user/serenata-erp/.env.local.tokens 2>/dev/null
git remote set-url origin https://${GITHUB_TOKEN}@github.com/EduardoTerwogt/serenata-erp.git

# GitHub main es la fuente de verdad — forzar local = origin/main SIEMPRE
git fetch origin main
git checkout main
git reset --hard origin/main
```

`.env.local.tokens` está cubierto por `.gitignore` (`.env*`) y **no viaja en el repo**: en un entorno nuevo hay que crearlo con el `GITHUB_TOKEN` que dé el usuario. Si el token falla → pedir uno nuevo y actualizar ese archivo.

### Reglas
- Siempre `main`. Nunca ramas. Nunca PRs.
- **GitHub `main` = verdad absoluta.** El `main` local del sandbox es desechable: puede traer commits legacy del proxy git. Nunca preservar divergencias, nunca hacer cherry-pick para "rescatar" commits locales, nunca pushear sin haber reseteado antes a `origin/main`.
- Commit + push después de cada cambio funcional. Push a `main` dispara deploy en Vercel.
- **Ejecución entre sesiones:** una sesión nueva con tareas en cola de una sesión anterior NUNCA las ejecuta ni pushea automáticamente al abrir — confirmar primero con el usuario qué se va a hacer. `.claude/hooks/pre-push-gate.mjs` (registrado en `.claude/settings.json`) es el control técnico: bloquea el primer `git push` de cada sesión para forzar una pausa explícita; el segundo intento en la misma sesión pasa.

---

## MCP Supabase — conexiones y regla de producción

Dos conexiones al servidor MCP oficial de Supabase, configuradas como Custom Connectors en claude.ai (Settings → Connectors), no en un archivo del repo:
- `supabase-test`: lectura y escritura completas — proyecto de prueba (`serenata-erp-test`), aislado de producción.
- `supabase-prod`: escritura habilitada, bajo la regla siguiente.

**Regla sobre producción:**
- Los cambios de esquema en producción están PRE-APROBADOS mientras no borren nada existente (tablas, columnas, filas, constraints, funciones/RPCs): si es aditivo o es una mejora, aplicar sin esperar confirmación.
- Borrar algo existente solo se permite cuando es para SUSTITUIRLO (recrear una función/RPC, renombrar una columna). Un borrado que elimina una capacidad sin reemplazo requiere mostrar el SQL exacto en el chat y esperar confirmación explícita.
- Cada cambio aplicado a producción se guarda como migración numerada en `db/migrations/` y se commitea, para que el historial no se desincronice de lo que la base tiene de verdad.

---

## Reglas de trabajo

**Autonomía de ejecución.** Todo cambio que requeriría pedir permiso (editar código, correr comandos, tests, build, push) está PRE-APROBADO si se cumplen las 4 condiciones: (1) ya se revisó el cambio, (2) no altera funcionalidad existente como efecto secundario, (3) no elimina features, (4) no bloquea features — y los tests que le corresponden ya corrieron en verde. Cumplido eso, proceder sin pausar.

Pedir aprobación SOLO cuando haya una decisión de negocio, arquitectura o UX/UI que no esté clara o tenga más de un camino razonable. Fixes pequeños y seguros (typos, edits puntuales, doc) van directo, explicando brevemente qué se hará.

Si un plan ya fue aprobado, hay autorización para ejecutar todas sus etapas sin volver a pedir permiso — siempre que cada etapa pase sus tests antes de avanzar y que se verifique que lo pusheado a `main` quedó **en verde y funcionando de verdad** (no solo que el push tuvo éxito: confirmar build, deploy y comportamiento real, incluido el job `live` de CI). Si algo no queda en verde, diagnosticar la causa raíz de inmediato y no avanzar hasta resolverlo.

**No modificar features existentes.** Solo tocar lo que se planea cambiar. Antes del push, verificar que ningún feature existente se vio afectado.

**Bugs = acción inmediata.** Trazar → causa raíz → arreglar. Sin atajos ni retries ciegos. Si algo falla, diagnosticar por qué antes de intentar otra cosa.

**Aprender de errores en sesión.** Si un approach falla, documentar por qué y no repetirlo.

**Respuestas concisas.** La menor cantidad de palabras posible manteniendo claridad.

**Si el usuario debe ejecutar algo manualmente** (Supabase, Vercel, GitHub Secrets) → dar el paso a paso exacto.

---

## Contexto de negocio

ERP para productora audiovisual mexicana (Serenata House). Módulos:

- **Cotizaciones**: items desglosados, folio auto-incremental (SH001, SH002…). Tipos PRINCIPAL y COMPLEMENTARIA. Estados BORRADOR → EMITIDA → APROBADA | CANCELADA. Al aprobar → crea Proyecto + cuentas por cobrar/pagar.
- **Proyectos**: evento/producción aprobada. PREPRODUCCION → RODAJE → POSTPRODUCCION → FINALIZADO. Incluye tareas, cronograma, tipos de proyecto, hoja de llamado y reporte de cierre.
- **Cuentas por cobrar**: lo que el cliente debe. Facturas (PDF+XML), complementos de pago, pagos parciales.
- **Cuentas por pagar**: lo que se paga a cada proveedor. Órdenes de pago agrupadas con PDF real en Drive.
- **Proveedores** (antes "responsables", tabla `proveedores`): colaboradores/freelancers. Datos bancarios, régimen fiscal, roles, historial.
- **Portal de proveedores**: signup, confirmación de identidad y carga de facturas por parte del proveedor. Sesión propia, independiente de NextAuth.
- **Planeación**: extracción AI de eventos desde mensajes informales (email/WhatsApp) con Claude. Se validan y se convierten en cotizaciones en lote.
- **Plantillas de servicios**: templates reutilizables de items.
- **Dashboard**: métricas y gastos fijos.
- **Google Sheets (espejo)**: mirror de consulta externa. **Supabase es la fuente de verdad**; nunca escribir contra Sheets como origen.

---

## Arquitectura

Ver [`ARCHITECTURE.md`](ARCHITECTURE.md) para el mapa completo del repo y las capas. Resumen:

- `app/` — App Router: páginas y API routes REST.
- `components/`, `hooks/` — reutilizables de UI y estado de formularios/presencia.
- `lib/` — dominio: `client/api.ts` (fetch), `validation/schemas.ts` (Zod), `quotations/`, `integrations/google/`.
- `lib/server/` — server-only: `repositories/` (acceso a datos por dominio), `quotations/`, `cuentas/`, `projects/`, `pdf/`.
- `lib/db.ts` — **solo fachada** que reexporta repositorios. No meterle lógica.
- `db/migrations/` — SQL numerado, se aplica **a mano** en el SQL Editor de Supabase.

---

## Patrones clave

**Auth en API routes:**
```ts
const authResult = await requireSection('cotizaciones')
if (authResult.response) return authResult.response
```
Secciones: `admin`, `dashboard`, `cotizaciones`, `proyectos`, `cuentas`, `responsables`, `planeacion`. Algunas rutas usan `requireAnySection()`; seguir el patrón que ya exista, no inventar otro.

**Validación de payloads:**
```ts
const validation = validate(CotizacionCreateSchema, body)
if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
const parsed = validation.data
```

**Route params en Next.js 16 — `params` es Promise:**
```ts
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
```

**Formularios:** react-hook-form + resolvers de Zod. `useQuotationForm` cachea catálogos a nivel módulo (TTL 5 min).

**PDF:** jspdf + jspdf-autotable en `lib/server/pdf/`. Se suben a Google Drive.

**Soft delete:** `planeacion_pendientes.eliminada: boolean`. GET filtra `eliminada = false`.

---

## Gotchas (trampas del repo)

- **Aprobar / cancelar cotizaciones usa RPCs con efectos laterales.** Aprobar crea Proyecto + cuentas por cobrar + cuentas por pagar en una transacción; cancelar revierte. **Nunca recrear eso manualmente** — llamar la RPC existente en `lib/server/quotations/`.
- **Reservar folio es atómico vía RPC.** No generar folios en JS: race conditions garantizadas.
- **Guardar la cotización preserva los ids de las partidas.** `save_cotizacion` antes borraba y recreaba todo con ids nuevos, y esa era la causa raíz de que se perdieran ediciones ajenas. No revertir ese comportamiento.
- **Las escrituras de la pantalla de detalle van por sección**, no por guardado total: `PATCH /api/cotizaciones/[id]/{general,totales,notas}` y `.../items/[itemId]`. Cada una toca solo lo suyo y aplica **solo las claves recibidas**, con bloqueo de fila en el RPC. No sustituirlas por un save completo.
- **Leer partidas siempre con `ORDER BY orden`.** Sin eso, Postgres las devuelve en orden arbitrario y ese orden cambia al actualizar una fila.
- **La colaboración no depende de los avisos de Realtime.** `channel.send()` cae a REST cuando el canal no está unido, eso da 403 y el error se traga. La convergencia la garantiza la reconciliación contra la base cada 5 s. Detalle en `docs/ESTADO.md`.
- **Escribir en cotizaciones/proyectos/cuentas dispara sync a Google Sheets.** Si el sync rompe, revisar `lib/integrations/` antes de culpar al write.
- **Actualizar un PDF reusa `drive_file_id`.** Si existe, se actualiza el archivo en Drive en vez de crear uno nuevo. No borrar el campo sin entender el flow.
- **Cotizaciones COMPLEMENTARIA afectan al Proyecto del padre.** Al aprobarse suman al proyecto/cuentas de la PRINCIPAL. No tratarlas como independientes.
- **`params` es Promise en Next.js 16.**
- **Prisma está en deps pero NO se usa.**
- **El `main` local del sandbox NO es fuente de verdad.** Al inicio de sesión siempre `git fetch origin main && git reset --hard origin/main`.

---

## Base de datos

- **Motor:** Supabase (PostgreSQL). `supabaseAdmin` server-side, `supabase` (anon) client-side.
- **Migraciones:** SQL en `db/migrations/`, se ejecutan **manualmente** en el SQL Editor. `npm run check-migrations` solo lista y valida los nombres; no aplica nada.
- **RLS:** habilitado en las tablas pero **sin políticas**, así que la llave anónima no lee nada. Por eso la colaboración no usa `postgres_changes`: suscribirse desde el navegador exigiría exponer todas las cotizaciones a la llave pública.

| Tabla | Descripción |
|---|---|
| `cotizaciones` | Cotizaciones (id = folio texto SH001) |
| `items_cotizacion` | Partidas de cada cotización |
| `clientes`, `productos` | Catálogos |
| `proyectos` | Creados al aprobar una cotización |
| `cuentas_cobrar`, `cuentas_pagar` | Cuentas por cobrar y por pagar |
| `proveedores` | Colaboradores/freelancers (antes `responsables`) |
| `plantillas_servicios` | Plantillas de items |
| `planeacion_pendientes`, `planeacion_event_notas` | Planeación (soft delete en `eliminada`) |
| `usuarios` | Usuarios del portal |
| `extraction_logs` | Log de uso de la API de Claude |

---

## Testing

Detalle completo en [`TESTING.md`](TESTING.md). Lo mínimo:

```bash
npx tsc --noEmit
npm run lint
npm test                  # Vitest — 351 tests
npm run test:e2e:smoke    # Playwright con APIs mockeadas
npm run test:e2e:critical # Playwright con APIs mockeadas
npm run build             # si toca TS/TSX, rutas o config de Next
```

`npm run test:e2e:live` corre contra Supabase y Drive de prueba **reales** y solo funciona en CI (necesita secretos). Es el único nivel que puede delatar un bug de persistencia o de colaboración.

**Regla de oro: no pushear con tests en rojo.** Y un test solo se modifica cuando un cambio de producto lo justifica — nunca para que deje de fallar.

---

## Variables de entorno

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth (NextAuth v5)
AUTH_SECRET=
AUTH_TRUST_HOST=true
NEXTAUTH_URL=
# AUTH_USERS + AUTH_USERS_DEV_FALLBACK=true -- SOLO desarrollo/test. Nunca en
# producción: si Supabase falla, el login falla (no cae a esta lista). Ver
# lib/auth-utils.ts.
AUTH_USERS='[{"id":"...","email":"...","passwordHash":"...","name":"...","sections":["..."]}]'

# AI (Planeación)
ANTHROPIC_API_KEY=

# Google — OAuth base
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Google Drive (PDFs de cotizaciones, órdenes de pago, facturas)
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_FOLDER_ID_CUENTAS=

# Google Sheets (mirror)
GOOGLE_SHEETS_SPREADSHEET_ID=

# Google Calendar (parcial — solo desde planeación)
GOOGLE_CALENDAR_ID=

# Cron (keep-alive)
CRON_SECRET=

# Ambiente de prueba — SOLO secretos de GitHub Actions, NUNCA en Vercel
TEST_SUPABASE_URL=
TEST_SUPABASE_ANON_KEY=
TEST_SUPABASE_SERVICE_ROLE_KEY=
DRIVE_TEST_FOLDER_ID=            # 1cofExiUSPDRq9CeH6oU-WSBev1I56m-a
GOOGLE_DRIVE_REFRESH_TOKEN_TEST=
PLAYWRIGHT_TEST_EMAIL=
PLAYWRIGHT_TEST_PASSWORD=
```

El folder de Drive de prueba es exclusivo de CI y reemplaza a los dos folders reales dentro del job `live`, así que ningún test puede escribir en las carpetas de producción.

---

## Convenciones

- **UI:** tema oscuro con los tokens de `app/globals.css` (`bg-app`, `bg-surface`, `bg-row`, `text-content`, `border-hairline`, `rounded-panel`, acento `#FF5A1A`). **No usar `gray-*` ni `#f97316`**: son del estilo anterior. Ver [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
- **Imports:** alias `@/` = raíz. Ej: `import { supabaseAdmin } from '@/lib/supabase'`.
- **Tipos:** `lib/types.ts`. Schemas: `lib/validation/schemas.ts`.
- **API routes:** siempre `requireSection()` / `requireAnySection()`. Retornar `Response.json()`.
- **Idioma:** código español/inglés mixto (como ya existe); UI en español.
- **No crear archivos innecesarios:** preferir editar los existentes.
