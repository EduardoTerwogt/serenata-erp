# Variables de entorno

No hay `.env.example` en el repo. Los valores reales viven en Vercel
(producción) y en GitHub Actions Secrets (CI).


```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# JWT Secret legacy del proyecto (Dashboard -> Settings -> API). Firma los
# tokens cortos de app/api/realtime/token que autorizan canales privados de
# Realtime -- ver db/migrations/20260909_realtime_broadcast_authorization.sql.
SUPABASE_JWT_SECRET=

# Auth (NextAuth v5). AUTH_SECRET es la única variable canónica: firma la
# sesión de staff (NextAuth + lib/session-token.ts) y la del Portal
# (lib/portal-auth.ts). NEXTAUTH_SECRET ya no se lee -- no configurarla.
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

# Ambiente de prueba — secretos de GitHub Actions. Excepción puntual desde
# EF-3A 3A-1: algunas (ver bloque de carga más abajo) también viven, con el
# mismo valor, como Environment Variables del proyecto Vercel AISLADO de
# loadtest -- nunca en el Vercel de producción real.
TEST_SUPABASE_URL=
TEST_SUPABASE_ANON_KEY=
TEST_SUPABASE_SERVICE_ROLE_KEY=
TEST_SUPABASE_JWT_SECRET=        # JWT Secret legacy de serenata-erp-test, para el job `live`
DRIVE_TEST_FOLDER_ID=            # 1cofExiUSPDRq9CeH6oU-WSBev1I56m-a
GOOGLE_DRIVE_REFRESH_TOKEN_TEST=
PLAYWRIGHT_TEST_EMAIL=
PLAYWRIGHT_TEST_PASSWORD=
NEXT_PUBLIC_E2E_TEST_HOOKS=      # 'true' SOLO en el job `live` -- expone lib/supabase-browser.ts como window.__e2eSupabaseBrowser para que Playwright pueda inspeccionar canales de Realtime reales (tests/e2e/live/realtime-channel-reconnection.spec.ts). Nunca en Vercel.

# Carga (EF-3A 3A-1) — .github/workflows/load-test.yml + proyecto Vercel
# aislado (rama de despliegue loadtest-target, nunca main)
TEST_SHEETS_SPREADSHEET_ID=      # spreadsheet de test para GOOGLE_SHEETS_SPREADSHEET_ID -- nunca el de producción
LOADTEST_MODE=                   # 'true' -- guard de GET /api/internal/env-check, junto con LOADTEST_ENV_SECRET
LOADTEST_ENV_SECRET=             # el mismo valor va también como Environment Variable del proyecto Vercel aislado
VERCEL_TOKEN=                    # personal access token de Vercel, scope acotado al proyecto aislado -- usado por wait-for-deployment.mjs y `vercel logs`
LOADTEST_VERCEL_PROJECT_ID=      # Project ID del proyecto Vercel aislado (Settings -> General)
LOADTEST_VERCEL_TEAM_ID=         # solo si el proyecto vive bajo un team de Vercel, no una cuenta personal
LOADTEST_SERVERLESS_URL=         # URL real que Vercel asignó al proyecto aislado tras el primer deploy
```

El folder de Drive de prueba es exclusivo de CI y reemplaza a los dos folders reales dentro del job `live`, así que ningún test puede escribir en las carpetas de producción.

---

