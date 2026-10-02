# Plan de la iniciativa activa

**Estado:** Borrador (2026-10-02) — "#124: Producción y Vercel a Ohio (`us-east-2`, `cle1`)". Pendiente de aprobación del usuario.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Simplificación del modelo de datos" (2026-10-02)
— historia en `docs/archive/simplificacion-modelo-datos.md`, resultado en
`docs/decisions/020-simplificacion-modelo-datos.md`.


**Cola de iniciativas (2026-10-02), en este orden:** **#124** (este plan) →
**#123** nueva lógica de cuentas (su plan se escribe al cerrar #124) → **#110**
frente 2 v2 (plan auditado guardado en el issue).

---

# #124 — Producción y Vercel a Ohio (`us-east-2` / `cle1`)

## Decisión (2026-10-02)

Opción **B**: todo en Ohio. Vercel `sfo1` → `cle1` (Cleveland) y la base de
producción se recrea en `us-east-2`. La base de test **no se mueve** (ya está en
`us-east-2`).

| Medición del usuario desde la oficina (cloudping, 3 corridas) | Promedio |
|---|---|
| `us-east-2` Ohio | ~60 ms |
| `us-east-1` Virginia | ~64 ms |
| `us-west-1` California | ~77 ms |
| `us-west-2` Oregon (producción hoy) | ~80 ms |
| `mx-central-1` México | ~14 ms, pero Supabase y Vercel no lo ofrecen (pendiente de confirmar en sus paneles; ver R0) |

Por qué: Vercel y la base quedan en la misma región (la distancia entre ambas se
paga varias veces por petición) y el usuario gana ~20 ms por petición frente a
Oregon. Es el momento más barato: producción tiene 17 filas. Test ya está en
Ohio con su dataset y sus secretos de CI, así que no se toca.

Corrige la decisión 018: eligió `sfo1` como "lo más cercano a Oregon", aunque
Vercel tiene región en Oregon (`pdx1`). Se reemplaza por una decisión nueva.

## Inventario de producción (verificado 2026-10-02 contra la base)

- **Datos:** `usuarios` 2, `tipos_proyecto` 3, `tipo_proyecto_etapas` 12. El
  resto de las tablas de `public`: 0 filas. Sin secuencias en `public`.
- **Sin uso:** Supabase Auth (0 usuarios), Storage (0 buckets), Vault (0
  secretos), Edge Functions (0), `pg_cron` (no instalado), publicación
  `supabase_realtime` sin tablas.
- **Extensiones:** `plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`,
  `supabase_vault`, `pg_trgm` (en `extensions`), `plpgsql_check`.
- **Ajustes de roles** (no viven en migraciones): `authenticator` con
  `safeupdate`, `statement_timeout=8s` y `lock_timeout=8s`; `anon` 3 s;
  `authenticated` 8 s. Son los valores de fábrica de Supabase: hay que
  confirmar que el proyecto nuevo trae los mismos.
- **Historial de migraciones:** producción no tiene el esquema
  `supabase_migrations`, porque se aplicaron a mano. La fuente de verdad son los
  141 archivos de `db/migrations/` en el orden de `_manifest.json`.
- **Diferencias ya existentes con test:** test corre Postgres 17.6.1.166 en
  x86_64; producción, 17.6.1.084 en aarch64. Test tiene la publicación
  `supabase_realtime_messages_publication` y `supautils` en el preload de
  `authenticator`, que producción no tiene (imagen más vieja). La producción
  nueva saldrá con la imagen vigente: queda alineada con test.
- **Lo que la app lee de Supabase:** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y
  `SUPABASE_JWT_SECRET` (la llave legacy que firma los tokens de Realtime en
  `app/api/realtime/token/route.ts`). Ninguna conexión directa a Postgres.
- **Ref fijo en código:** `app/api/internal/env-check/route.ts`
  (`PRODUCTION_SUPABASE_REF`) y su test.
- **CSP** (`next.config.ts`): `*.supabase.co` con comodín, no requiere cambio.

## Estrategia de corte

- **Sin tocar la producción vieja hasta el final.** Con el límite de 2
  proyectos activos del plan Free, durante la ventana se **pausa test** (no
  producción); se crea la producción nueva; se hace el corte; se pausa la
  producción vieja y se reactiva test. La producción vieja pausada es el
  rollback.
- **Ventana de congelamiento:** nadie usa producción entre la copia de las 17
  filas (R1) y el corte (R3). La app no tiene uso real hoy.
- **Rollback (minutos):** reactivar la producción vieja, restaurar en Vercel las
  4 variables anteriores, revertir `vercel.json` a `sfo1` y redeploy.

## Bloques

| Bloque | Qué | Quién |
|---|---|---|
| **R0 Verificaciones previas** (sin cambios) | Ver "Checklist → Antes de empezar". Si algo falla (sobre todo las llaves legacy), se detiene y se decide. | Usuario + Claude |
| **R1 Producción nueva** | Crear `us-east-2`, aplicar migraciones, comparar esquema y ajustes contra la vieja, copiar datos, guardas en 0. | Usuario crea; Claude aplica y verifica |
| **R2 PR de código** | `vercel.json` → `cle1`, ref de producción en `env-check` y su test, decisión nueva que reemplaza 018, docs. CI en verde; **no se mergea hasta R3**. | Claude |
| **R3 Corte** | Variables de Vercel, merge del PR (despliega `cle1` con las variables nuevas), verificación funcional completa. | Usuario (Vercel) + Claude |
| **R4 Cierre** | Pausar la vieja, reactivar test, ventana de rollback de 7 días, borrar la vieja, conectores y documentación final. | Usuario + Claude |

## Checklist completo

Marcar cada casilla al hacerla. Lo que dice **(usuario)** solo se puede hacer
desde un panel con tu cuenta; Claude te da el paso a paso exacto en ese momento.

### Antes de empezar (R0)

- [ ] **(usuario)** Supabase → New project → lista de regiones: confirmar que no
      hay región de México (si la hay, se reevalúa la decisión).
- [ ] **(usuario)** Vercel → Project Settings → Functions → Function Region:
      confirmar que `cle1` (Cleveland) está disponible en el plan actual y que
      no hay región de México.
- [ ] Confirmar en la documentación de Supabase que un proyecto **pausado** no
      cuenta para el límite de 2 proyectos activos del plan Free.
- [ ] **(usuario)** Captura de los paneles de la producción vieja, para
      replicarlos: Settings → API (Data API: esquemas expuestos, *max rows*,
      *extra search path*), Settings → JWT (expiración), Realtime → Settings, y
      Database → Settings (SSL, restricciones de red).
- [ ] Claude: huella del esquema de la producción vieja
      (`scripts/db/esquema-huella.sql`) y respaldo en SQL de las 17 filas
      (`usuarios`, `tipos_proyecto`, `tipo_proyecto_etapas`, con sus ids).

### Supabase: proyecto nuevo (R1)

- [ ] **(usuario)** Pausar `serenata-erp-test` (Dashboard → Settings → General →
      Pause). CI `live` y `escala.yml` fallan mientras dure; no correrlos.
- [ ] **(usuario)** Crear el proyecto `serenata-erp` en **`us-east-2`**, en la
      organización "App develop" (plan Free). Guardar la contraseña de la base
      en tu gestor.
- [ ] **(usuario)** En Settings → API, confirmar que existen las llaves legacy
      `anon` y `service_role` y el **JWT Secret legacy**. Si el proyecto nuevo
      solo ofrece las llaves nuevas (`sb_publishable_…`/`sb_secret_…`) o no da
      el secreto HS256, **se detiene**: el token de Realtime
      (`app/api/realtime/token`) depende de él. Test, creado el 2026-09-04, sí
      lo tiene.
- [ ] Claude: confirmar la versión de Postgres, la arquitectura y las
      extensiones disponibles; instalar `pg_trgm` en `extensions` y
      `plpgsql_check` (lo hacen las migraciones).
- [ ] Claude: aplicar las 141 migraciones en el orden de `_manifest.json`, cada
      una registrada en el historial del proyecto.
- [ ] Claude: `scripts/check-schema-parity.mjs --esquema <vieja> <nueva>` = 0
      diferencias en `public`, más las políticas de `realtime.messages`.
      Explicar cualquier diferencia antes de seguir.
- [ ] Claude: `scripts/db/plpgsql-check.sql` = 0 errores.
- [ ] Claude: comparar los ajustes de roles (`pg_db_role_setting`) contra la
      vieja; `authenticator` debe traer `safeupdate`, `statement_timeout=8s` y
      `lock_timeout=8s`.
- [ ] **(usuario)** Replicar los ajustes capturados en R0 (Data API, JWT,
      Realtime, Database). Claude compara campo por campo con las capturas.
- [ ] Claude: copiar las 17 filas con sus mismos ids (`usuarios` con hash de
      contraseña y `session_version`).
- [ ] Claude: `auditar_consistencia()` = 0 violaciones;
      `preview_next_folio` devuelve `SH001`.
- [ ] Claude: advisors de seguridad y rendimiento de Supabase: solo los INFO
      `rls_enabled_no_policy` esperados (igual que la vieja).

### Código y repositorio (R2, un PR)

- [ ] `vercel.json`: `"regions": ["cle1"]`. Aplica también a los Previews, que
      quedan junto a test en Ohio.
- [ ] `app/api/internal/env-check/route.ts`: `PRODUCTION_SUPABASE_REF` al ref
      nuevo, y su test (`app/api/__tests__/internal-env-check-route.test.ts`).
- [ ] Decisión nueva `docs/decisions/021-region-ohio.md` que reemplaza la 018 (la
      018 queda marcada como reemplazada).
- [ ] `ARCHITECTURE.md` (sección de región), `docs/ENV.md`,
      `.claude/rules/migraciones.md` y `docs/inventario-tablas.md`: el ref nuevo.
- [ ] CI completo en verde en el PR; **no mergear hasta el corte**.

### Vercel (R3, corte)

- [ ] **(usuario)** Environment Variables → entorno **Production**: reemplazar
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET` por los del proyecto
      nuevo. Guardar los valores viejos para el rollback.
- [ ] **(usuario)** Lo mismo en el entorno **Development**, que también apunta
      a producción (`docs/ENV.md`).
- [ ] **(usuario)** **No tocar** el entorno Preview: sigue en test.
- [ ] Mergear el PR de R2. El deploy de `main` toma `cle1` y las variables
      nuevas; las `NEXT_PUBLIC_*` se incrustan al compilar, así que un deploy
      nuevo es obligatorio.
- [ ] Claude: confirmar con la API de Vercel que el deploy de producción corre
      en `cle1` y quedó `READY`.

### Verificación funcional en producción (R3)

- [ ] `GET /api/internal/env-check` reporta el ref nuevo.
- [ ] Login de staff con los 2 usuarios y logout.
- [ ] Login del Portal de proveedores.
- [ ] Crear una cotización de prueba: folio `SH001`, guardar partidas.
- [ ] Colaboración en vivo: dos sesiones en la misma cotización ven el aviso
      "X está editando" (Realtime con el token firmado por el JWT secret nuevo).
- [ ] Generar el PDF y verificar que sube a Drive (carpetas de producción).
- [ ] Extracción con AI en el Portal (Anthropic).
- [ ] `/cuentas` carga periodo, resumen, opciones y avisos.
- [ ] Admin → `auditar_consistencia()` = 0.
- [ ] Cron `/api/keep-alive`: corrida manual con `CRON_SECRET` responde OK.
- [ ] Borrar los datos de prueba creados en esta verificación (o reiniciar con
      el procedimiento vigente) y dejar `SH001` como siguiente folio.

### Cierre (R4)

- [ ] **(usuario)** Pausar la producción vieja (`fwmyoqokcjtldiofuxdg`).
- [ ] **(usuario)** Reactivar `serenata-erp-test`; Claude corre CI completo y
      `escala.yml` una vez.
- [ ] Ventana de rollback: 7 días con la vieja pausada; después **(usuario)** se
      borra.
- [ ] **(usuario)** Conector `supabase-prod` en claude.ai (Settings →
      Connectors): si tiene el ref fijo, apuntarlo al proyecto nuevo.
- [ ] **(usuario)** `.env.local` de tu máquina: los 4 valores nuevos si apunta a
      producción.
- [ ] Proyecto Vercel aislado de carga (`loadtest-target`): toma `cle1` la
      próxima vez que se fije a un SHA de `main`; apunta a test, sin cambios de
      variables.
- [ ] `docs/ACTIVE_WORK.md`, `docs/ROADMAP.md` y el issue #124 cerrados;
      archivar este plan.

### Lo que no cambia (verificado)

Google OAuth y Drive (el dominio de la app es el mismo), `ANTHROPIC_API_KEY`,
`AUTH_SECRET`, `CRON_SECRET`, el cron de Vercel, los secretos de GitHub Actions
(todos son de test) y la CSP.

## Riesgos y cómo quedan resueltos

- **Proyecto nuevo sin llaves legacy** → se detecta en R1, antes de copiar nada
  ni tocar Vercel; si pasa, se decide el cambio de código con los datos en la
  mano.
- **Ajuste de panel que no está en migraciones** → capturas en R0 y comparación
  campo por campo en R1; ajustes de roles comparados por SQL.
- **Esquema distinto** → `check-schema-parity` vieja↔nueva en 0 antes del corte.
- **Corte fallido** → rollback en minutos con la vieja intacta y pausada.
- **Pérdida de datos** → no hay uso real; ventana de congelamiento y respaldo SQL
  de las 17 filas.

## Tracker

| Bloque | Estado |
|---|---|
| R0 Verificaciones previas | Pendiente |
| R1 Producción nueva | Pendiente |
| R2 PR de código | Pendiente |
| R3 Corte y verificación | Pendiente |
| R4 Cierre | Pendiente |
