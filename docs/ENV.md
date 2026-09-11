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
TEST_SUPABASE_JWT_SECRET=        # JWT Secret legacy de serenata-erp-test, para el job `live`
DRIVE_TEST_FOLDER_ID=            # 1cofExiUSPDRq9CeH6oU-WSBev1I56m-a
GOOGLE_DRIVE_REFRESH_TOKEN_TEST=
PLAYWRIGHT_TEST_EMAIL=
PLAYWRIGHT_TEST_PASSWORD=
```

El folder de Drive de prueba es exclusivo de CI y reemplaza a los dos folders reales dentro del job `live`, así que ningún test puede escribir en las carpetas de producción.

---

