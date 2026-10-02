# Plan de la iniciativa activa

**Estado:** En refinamiento (2026-10-02, auditado) — "#124: Producción y Vercel a Ohio (`us-east-2`, `cle1`)". Pendiente de aprobación del usuario.

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

## Auditoría del plan (Dev Sr + Data Sr, 2026-10-02)

Verificado contra el código, la base de producción y la de test. Cada hallazgo
ya está incorporado en el orden y el checklist de abajo.

| # | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| A1 | **P0** | **Orden imposible:** el borrador pausaba test durante R1–R3, pero el PR de R2 necesita CI (el job `live` corre contra test) y el merge a `main` dispara `live` contra test pausado. | **R2 va primero**, con test activo: PR en verde y Preview probado. El corte (R3) se hace **sin merge**: variables nuevas + *redeploy* de producción. El PR se mergea después de reactivar test (R4). |
| A2 | **P0** | **Faltaba comparar permisos.** `esquema-huella.sql` no cubre GRANTs de tablas, extensiones ni políticas de `realtime.messages`. Supabase tiene la opción `auto_expose_new_tables` (ver `supabase/config.toml`): si el proyecto nuevo nace sin ella, las tablas que crean las migraciones quedan **sin GRANT para `service_role`** y la app entera falla. Hoy producción tiene 245 GRANTs para `service_role`, 245 para `postgres` y 231 para `anon` y `authenticated`. | Al crear el proyecto, dejar la Data API y la exposición automática igual que en la vieja. Agregar a R1 una comparación de GRANTs por tabla y rol, extensiones con su esquema, políticas de `realtime.messages`, RLS habilitado por tabla y ajustes de roles. Todo debe dar 0 diferencias. |
| A3 | **P0** | **Reproducir las 141 migraciones en un Supabase real nunca se ha hecho.** Test tiene 132 registros en su historial, no 141: se armó con una mezcla de MCP y SQL Editor. Solo CI (`fresh-db`, Supabase local) lo prueba. | Mantener **producción vieja activa durante R1**: si una migración falla en el proyecto nuevo, se corrige o se recrea el proyecto sin afectar producción. Con el límite de 2 activos, se pausa test **después** de R2 y solo durante R1–R3. |
| A4 | P1 | El checklist proponía verificar con `GET /api/internal/env-check`, pero esa ruta responde **404 en producción** (solo vive con `LOADTEST_MODE`). Además es una guarda de seguridad: su constante debe proteger el ref nuevo **y** el viejo mientras exista. | Quitar esa verificación. La región y el ref se confirman con la API de Vercel (deploy en `cle1`, `READY`) y con la base (filas creadas en la verificación funcional). En `env-check`, constante con **los dos refs** hasta borrar el viejo. |
| A5 | P1 | La verificación funcional crea datos en producción (cotización `SH001`, proveedor de Portal, PDF en Drive) y el script de reinicio se borró del repo (`624d91d`). Sin él, la limpieza sería manual y propensa a error. | Recuperar `scripts/db/reset-transaccional.sql` de la historia de git y adaptarlo: **lista de tablas que se conservan** (`usuarios`, `tipos_proyecto`, `tipo_proyecto_etapas`, `tipo_proyecto_tarea_default`) en vez de una lista de tablas a vaciar, para que sobreviva a cambios de esquema. Se ejecuta en una sola transacción que se verifica sola (`SH001`, 0 filas en el resto, `auditar_consistencia()` = 0). Se corre una vez en el proyecto nuevo **antes** del corte para probarlo. Los PDFs de Drive se borran a mano. |
| A6 | P1 | **Versión de Postgres:** el proyecto nuevo nacerá con la imagen vigente, que puede ser **más nueva que la de test**. El borrador decía "queda alineada", y no está garantizado. | Al crearlo, comparar versión y arquitectura. Si producción queda por delante, se actualiza test desde el panel en R4. |
| A7 | P1 | Los hashes de contraseña de los 2 usuarios pasan por la sesión de Claude al copiarlos con MCP. | Copiarlos por MCP sin escribirlos nunca en archivos ni en el repo. Recomendado: que los 2 usuarios cambien su contraseña después del corte. |
| A8 | P1 | Las pestañas abiertas con el JavaScript viejo siguen apuntando al proyecto viejo (`NEXT_PUBLIC_*` se incrusta al compilar). | Avisar a los usuarios que recarguen después del corte. La vieja sigue activa hasta R4, así que no hay errores durante la transición. |
| A9 | P2 | Un Preview en `cle1` contra test (Ohio) prueba la región nueva **antes** de tocar producción. | Se usa en R2 como prueba de humo de `cle1`. |
| A10 | P2 | El conector de Supabase de esta sesión es por cuenta (ve los dos proyectos); el proyecto nuevo aparecerá solo. `CLAUDE.md` describe conectores separados por entorno. | En R4, revisar en claude.ai si `supabase-prod` tiene el ref fijo y corregir `CLAUDE.md` si ya no aplica. |
| A11 | P2 | Seguir en `sfo1` con la base en Ohio durante el corte cruzaría el continente. | Se acepta por minutos: entre el *redeploy* del corte y el merge del PR (R4). |

**Conclusión:** el enfoque (proyecto nuevo + migraciones + comparación + corte por
variables) es el más seguro disponible en el plan Free. Clonar o restaurar a otra
región requiere un plan de pago, y un `pg_dump` saltaría la comprobación de que
el repo reproduce producción, que es valiosa por sí misma. Las correcciones de
arriba eliminan el bloqueo de CI (A1), la falla silenciosa por permisos (A2) y el
riesgo de alargar la caída si la reproducción falla (A3).

## Estrategia de corte (corregida)

1. **R0** verificar y capturar con todo activo.
2. **R2** PR de código con test activo; CI en verde; el Preview prueba `cle1`.
   No se mergea.
3. **Pausar test** (límite de 2 activos). Producción vieja sigue sirviendo.
4. **R1** crear la producción nueva, migrar, comparar **en vivo** contra la vieja,
   copiar datos y probar el script de reinicio.
5. **R3 corte:** variables de Production y Development en Vercel → *Redeploy*
   de producción (sin merge) → verificación funcional → reinicio.
6. **R4:** pausar la vieja, reactivar test, mergear el PR (`cle1` + `env-check`)
   con CI en verde, 7 días de rollback, borrar la vieja.

**Rollback** (en cualquier punto hasta R4): restaurar las 4 variables viejas en
Vercel y *Redeploy*. La vieja sigue activa hasta R4 y pausada 7 días después.

## Bloques

| Bloque | Qué | Quién |
|---|---|---|
| **R0 Verificaciones y capturas** | Regiones disponibles, límites del plan Free, capturas de paneles, huella completa de la vieja (A2). | Usuario + Claude |
| **R2 PR de código** | `vercel.json` → `cle1`, `env-check` con los dos refs (A4), script de reinicio recuperado (A5), decisión 021 que reemplaza 018, docs. CI verde y Preview probado. | Claude |
| **R1 Producción nueva** | Pausar test; crear el proyecto; migrar; comparar todo contra la vieja (A2, A6); copiar datos (A7); ensayo del reinicio. | Usuario crea; Claude aplica y verifica |
| **R3 Corte** | Variables, *Redeploy*, verificación funcional, reinicio, aviso de recarga (A8). | Usuario (Vercel) + Claude |
| **R4 Cierre** | Pausar la vieja, reactivar test, mergear el PR, alinear la versión de test (A6), 7 días, borrar la vieja, conectores y docs. | Usuario + Claude |

## Checklist completo

Lo que dice **(usuario)** solo se hace desde un panel con tu cuenta; Claude da el
paso a paso exacto en ese momento. Ningún secreto se pega en el chat ni en el
repo: las llaves van directo de Supabase a Vercel.

### R0 — Antes de empezar (todo activo, sin cambios)

- [ ] **(usuario)** Supabase → New project → lista de regiones: confirmar que no
      hay México y que existe `us-east-2`.
- [ ] **(usuario)** Vercel → Project Settings → Functions → Function Region:
      confirmar que `cle1` está disponible en tu plan.
- [ ] Confirmar en la documentación de Supabase que un proyecto pausado no
      cuenta para el límite de 2 activos y cuánto tarda en reactivarse.
- [ ] **(usuario)** Capturas de la producción vieja:
      - Settings → API / Data API: esquemas expuestos, *max rows*, *extra search
        path* y exposición automática de tablas nuevas.
      - Settings → JWT: expiración.
      - Realtime → Settings.
      - Database → Settings: SSL y restricciones de red.
      - Authentication → Settings, solo como referencia (la app no usa Supabase Auth).
- [ ] Claude, huella completa de la vieja guardada en el scratchpad (no en el repo):
      - `esquema-huella.sql`;
      - GRANTs de tablas por rol;
      - extensiones con su esquema y versión;
      - políticas de `realtime.messages`;
      - RLS por tabla;
      - `pg_db_role_setting`.

### R2 — PR de código (test activo)

- [ ] `vercel.json`: `"regions": ["cle1"]`.
- [ ] `app/api/internal/env-check/route.ts`: proteger el ref nuevo **y** el
      viejo, y su test.
- [ ] `scripts/db/reset-transaccional.sql` recuperado de `624d91d^`, adaptado:
      lista de tablas que se conservan, confirmación con el ref nuevo y
      verificación en la misma transacción. Se borra del repo en R4.
- [ ] `docs/decisions/021-region-ohio.md`, y la 018 marcada como reemplazada.
- [ ] `ARCHITECTURE.md` (región), `docs/ENV.md`, `.claude/rules/migraciones.md`
      y `docs/inventario-tablas.md`.
- [ ] CI en verde (`test`, `fresh-db`, `smoke-and-critical`, `live`).
- [ ] Claude: el Preview del PR quedó en `cle1` (API de Vercel) y responde login
      y `/cuentas` contra test.

### R1 — Producción nueva

- [ ] **(usuario)** Pausar `serenata-erp-test`. No correr CI hasta R4.
- [ ] **(usuario)** Crear `serenata-erp` en **`us-east-2`**, organización "App
      develop", plan Free, con la Data API y la exposición automática **igual
      que en la vieja** (A2). Guardar la contraseña de la base en tu gestor.
- [ ] **(usuario)** Settings → API: confirmar que existen las llaves legacy
      `anon` y `service_role` y el JWT Secret legacy. Si no, **se detiene**: el
      token de Realtime depende de él.
- [ ] Claude: versión de Postgres, arquitectura y extensiones disponibles,
      comparadas con test (A6).
- [ ] Claude: aplicar las 141 migraciones en el orden de `_manifest.json`, una
      por una, registradas en el historial. Si alguna falla, se corrige en el
      repo antes de seguir (la vieja sigue sirviendo).
- [ ] Claude, comparación **en vivo** vieja ↔ nueva, todo en 0 diferencias o
      explicado:
      - `check-schema-parity --esquema`;
      - GRANTs por tabla y rol (`service_role` 245);
      - extensiones;
      - políticas de `realtime.messages`;
      - RLS;
      - ajustes de roles (`authenticator`: `safeupdate`, 8 s, 8 s).
- [ ] Claude: `plpgsql-check.sql` = 0 errores; advisors con solo los INFO
      esperados.
- [ ] **(usuario)** Replicar los ajustes capturados en R0; Claude los compara
      campo por campo.
- [ ] Claude: copiar las 17 filas con sus ids. Los hashes no se escriben en
      ningún archivo (A7).
- [ ] Claude: ensayo del reinicio en el proyecto nuevo; debe terminar sin
      cambios. Después: `auditar_consistencia()` = 0 y `preview_next_folio` =
      `SH001`.
- [ ] Congelamiento: nadie usa producción desde la copia hasta el corte.

### R3 — Corte (Vercel)

- [ ] **(usuario)** Environment Variables → **Production**: reemplazar
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET`. Anotar en tu gestor
      los valores viejos (rollback).
- [ ] **(usuario)** Lo mismo en **Development**. **Preview no se toca.**
- [ ] **(usuario)** Deployments → el deploy de producción actual → *Redeploy*,
      sin caché de build (las `NEXT_PUBLIC_*` se incrustan al compilar).
- [ ] Claude: el deploy nuevo quedó `READY` (API de Vercel).
- [ ] Verificación funcional en producción:
  - [ ] Login y logout de los 2 usuarios de staff.
  - [ ] Crear una cotización: folio `SH001`; guardar partidas; Claude confirma
        las filas **en la base nueva**.
  - [ ] Colaboración en vivo con dos sesiones: el aviso "X está editando"
        aparece (Realtime firmado con el JWT secret nuevo).
  - [ ] Generar el PDF y verificar que sube a Drive (carpeta de producción).
  - [ ] Crear un proveedor con acceso al Portal; login en el Portal y extracción
        con AI.
  - [ ] Aprobar la cotización: aparecen sus cuentas en `/cuentas` (periodo,
        resumen, opciones y avisos).
  - [ ] Admin → `auditar_consistencia()` = 0.
  - [ ] Cron `/api/keep-alive` con `CRON_SECRET`: responde OK.
- [ ] Claude: correr el reinicio; debe quedar `SH001`, 0 filas fuera de la lista
      de conservadas y `auditar_consistencia()` = 0.
- [ ] **(usuario)** Borrar de Drive los PDFs de la verificación.
- [ ] **(usuario)** Avisar a los usuarios que recarguen la app (A8). Recomendado:
      que los 2 usuarios cambien su contraseña (A7).

### R4 — Cierre

- [ ] **(usuario)** Pausar la producción vieja (`fwmyoqokcjtldiofuxdg`).
- [ ] **(usuario)** Reactivar `serenata-erp-test`.
- [ ] Mergear el PR de R2 con CI en verde; Claude confirma el deploy de
      producción en `cle1`.
- [ ] Si producción quedó con una versión de Postgres más nueva que test:
      **(usuario)** actualizar test desde su panel (A6).
- [ ] `escala.yml` una vez, como línea base nueva.
- [ ] A los 7 días: **(usuario)** borrar la vieja; Claude quita su ref de
      `env-check` y borra `reset-transaccional.sql` (PR chico).
- [ ] **(usuario)** Conector `supabase-prod` en claude.ai: si tiene ref fijo,
      apuntarlo al nuevo. Claude ajusta `CLAUDE.md` si hace falta (A10).
- [ ] **(usuario)** `.env.local` de tu máquina, si apunta a producción.
- [ ] Proyecto Vercel aislado de carga (`loadtest-target`): toma `cle1` la
      próxima vez que se fije a un SHA de `main`; apunta a test, sin cambios.
- [ ] `docs/ACTIVE_WORK.md`, `docs/ROADMAP.md`, cerrar #124, archivar este plan.

### Lo que no cambia (verificado)

Google OAuth y Drive (mismo dominio), `ANTHROPIC_API_KEY`, `AUTH_SECRET` (las
sesiones abiertas siguen válidas: mismos ids y `session_version` copiados),
`CRON_SECRET`, el cron de Vercel, los secretos de GitHub Actions (todos de test),
la CSP (`*.supabase.co`), el entorno Preview de Vercel y la base de test.

## Riesgos

Ninguno queda abierto sin una acción en el checklist:

| Riesgo | Cómo queda cubierto |
|---|---|
| Sin llaves legacy | Se detecta en R1, antes de copiar datos o tocar Vercel. |
| Permisos o ajustes distintos | Comparación en vivo y capturas (A2). |
| Migración que falla en Supabase real | La vieja sigue sirviendo (A3). |
| Corte fallido | Rollback por variables más *Redeploy*, en minutos. |
| Datos de prueba que quedan en producción | Reinicio transaccional probado antes del corte (A5). |
| CI bloqueado | Orden corregido (A1). |

## Tracker

| Bloque | Estado |
|---|---|
| R0 Verificaciones y capturas | Pendiente |
| R2 PR de código | Pendiente |
| R1 Producción nueva | Pendiente |
| R3 Corte y verificación | Pendiente |
| R4 Cierre | Pendiente |
