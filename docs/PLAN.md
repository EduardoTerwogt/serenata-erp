# Plan de la iniciativa activa

**Estado:** En refinamiento (2026-10-02, dos auditorías) — "#124: Producción y Vercel a Ohio (`us-east-2`, `cle1`)". Pendiente de aprobación del usuario.

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

## Auditoría 2 (Dev Sr + Data Sr, 2026-10-02, antes de aprobar)

Segunda revisión del plan ya corregido. Cuatro hallazgos cambian la ejecución.

| # | Severidad | Hallazgo (verificado) | Corrección |
|---|---|---|---|
| B1 | **P0** | **La copia de datos habría fallado.** La migración `20260906_post_rename_fase52_proyectos_pm_schema.sql` **siembra** los 3 tipos de proyecto y sus 12 etapas con UUID nuevos. Copiar las filas de la vieja con sus ids choca con la restricción única de `nombre`. Además `20260924_folios_cc_cp_por_anio.sql` siembra `folio_contadores`, que en la vieja está vacío. Comparé contenido: tipos y etapas de la vieja son **idénticos** al sembrado (nombres, orden, etapa final), y ningún código ni tabla con datos referencia sus ids. | Solo se copian los **2 usuarios**. Tipos y etapas se quedan como los siembran las migraciones (se verifica que el contenido sea igual). El reinicio corre **después** de migrar y deja `folio_contadores` vacío. Al final, conteo de filas por tabla nueva = vieja. |
| B2 | **P0** | **Aplicar 141 migraciones (1.3 MB) por MCP significa que Claude reescribe cada archivo como texto:** no es copia byte a byte, y son horas de generación. CI nunca usa ese camino: `migrations.yml` aplica con el Supabase CLI (`supabase start` sobre `supabase/migrations/`, que arma `build-supabase-migrations.mjs`). | Aplicar con **el mismo motor que CI**: el usuario corre **un comando** del Supabase CLI (`db push`) en su máquina, con la URL del *session pooler* (IPv4). Es determinista, tarda minutos y deja el historial registrado. El MCP queda solo como respaldo. La comparación de esquema contra la vieja sigue siendo la prueba final. |
| B3 | P1 | Crear el proyecto por MCP (`create_project`) no deja elegir la contraseña de la base ni las opciones de Data API/exposición automática (riesgo A2). | El usuario crea el proyecto desde el panel (2 minutos): elige la contraseña (la necesita el CLI) y ve esas opciones. |
| B4 | P1 | **Otro orden imposible:** R2 iba a fijar en `env-check` el ref nuevo, que no existe hasta R1. | `env-check` se actualiza en R4, antes del merge y con test activo. La ruta está muerta en producción y solo protege las pruebas de carga, que no corren durante la ventana. El script de reinicio no se commitea: es DML de una sola vez; Claude lo corre por MCP desde el scratchpad, con el ref nuevo en la confirmación. |
| B5 | P2 | La decisión 018 no pudo demostrar su mejora porque no hubo medición antes y después. | Línea base de latencia **antes** del corte y la misma medición después: 5 cargas de `/cuentas` y de una cotización, tiempos de la pestaña Network de DevTools o `preview-latency.yml` sobre producción si sus rutas lo permiten. Se registra en la decisión 021. |

**Conclusión:** con B1–B4 el plan es el más seguro y eficiente disponible en el
plan Free:
- El esquema se aplica con el motor que CI ya prueba en cada PR.
- La única copia de datos son 2 filas.
- La vieja sirve tráfico hasta el corte.
- El rollback es cambiar 4 variables y volver a desplegar.

## Automatización y trabajo manual

**Plan Pro temporal: descartado.** "Restore to a new project" copia **en la
misma región** que el origen (documentación de Supabase) y el límite de 2
proyectos se resuelve pausando por MCP.

**Lo hace Claude:**
- Con el MCP de Supabase: pausar y reactivar proyectos, huellas y comparaciones,
  reinicio, copia de los 2 usuarios, guardas y advisors.
- Con el MCP de Vercel (si se reautentica con acceso al team
  `eduardoterwogts-projects`; hoy da 403): variables no secretas, *Redeploy* y
  verificar región y estado de los deploys.
- El PR de código y la documentación.

**Descartado:** la integración Supabase ↔ Vercel del Marketplace. Sincroniza a
**todos** los entornos y pisaría Preview (el incidente del 2026-09-24).

**Manual del usuario:**
1. Aprobar el plan y reautenticar el conector de Vercel con acceso al team.
2. Confirmar `cle1` en el panel de Vercel.
3. Una captura de Settings → API / Data API (y Realtime → Settings) de la vieja.
4. Crear el proyecto en el panel (`us-east-2`), con las mismas opciones de Data API.
5. Correr **un comando** del CLI que Claude deja listo (aplica las 141 migraciones).
6. Pegar 2 secretos en Vercel (Production y Development).
7. Medición de latencia antes y después (B5) y verificación funcional con dos
   navegadores (~15 min); borrar de Drive los PDFs de prueba.
8. A los 7 días, borrar la vieja desde el panel.

## Estrategia de corte

1. **R0** verificar, capturar y medir la latencia base, con todo activo.
2. **R2** PR (`vercel.json` → `cle1`, decisión 021, docs) con test activo; CI
   verde; el Preview prueba `cle1` contra test. No se mergea.
3. **R1** pausar test → el usuario crea el proyecto → `db push` → comparación en
   vivo contra la vieja → reinicio → copiar 2 usuarios → conteos iguales.
4. **R3** variables en Vercel → *Redeploy* (sin merge) → verificación funcional →
   reinicio → medición después.
5. **R4** pausar la vieja → reactivar test → commit con el ref nuevo en
   `env-check` → CI verde → merge (`cle1`) → 7 días → borrar la vieja.

**Rollback** hasta R4: restaurar las 4 variables viejas y *Redeploy*. La vieja
sigue activa hasta R4 y pausada 7 días después.

## Bloques

| Bloque | Qué | Quién |
|---|---|---|
| **R0 Verificaciones, capturas y línea base** | Regiones, límites del plan Free, capturas, huella completa de la vieja, latencia antes. | Usuario + Claude |
| **R2 PR de código** | `vercel.json` → `cle1`, decisión 021 que reemplaza 018, docs. CI verde y Preview probado. | Claude |
| **R1 Producción nueva** | Pausar test, crear, `db push`, comparar, reiniciar, copiar 2 usuarios. | Usuario crea y corre el CLI; Claude todo lo demás |
| **R3 Corte** | Variables, *Redeploy*, verificación funcional, reinicio, latencia después. | Usuario (secretos y prueba) + Claude |
| **R4 Cierre** | Pausar la vieja, reactivar test, `env-check`, merge, alinear versión de test, borrar la vieja, conectores y docs. | Usuario + Claude |

## Checklist completo

Lo que dice **(usuario)** solo se hace desde un panel o tu máquina; Claude da el
paso a paso exacto en ese momento. Ningún secreto se pega en el chat ni en el
repo.

### R0 — Antes de empezar (todo activo, sin cambios)

- [ ] **(usuario)** Supabase → New project → lista de regiones: existe
      `us-east-2` y no hay México.
- [ ] **(usuario)** Vercel → Project Settings → Functions → Function Region:
      `cle1` disponible en tu plan.
- [ ] **(usuario)** Reautenticar el conector de Vercel de Claude con acceso al
      team `eduardoterwogts-projects`. Claude confirma que ya puede leer las
      variables de producción, sin descifrarlas.
- [ ] Claude: confirmar en la documentación de Supabase que un proyecto pausado
      no cuenta para el límite de 2 activos y cuánto tarda en reactivarse.
- [ ] **(usuario)** Capturas de la vieja:
      - Settings → API / Data API: esquemas expuestos, *max rows*, *extra search
        path* y exposición automática de tablas nuevas.
      - Settings → JWT: expiración.
      - Realtime → Settings.
      - Database → Settings: SSL y restricciones de red.
- [ ] Claude, huella completa de la vieja en el scratchpad:
      - `esquema-huella.sql`;
      - GRANTs por tabla y rol;
      - extensiones con esquema y versión;
      - políticas de `realtime.messages`;
      - RLS por tabla;
      - `pg_db_role_setting`;
      - conteo de filas por tabla.
- [ ] **(usuario)** Línea base de latencia (B5): 5 cargas de `/cuentas` y 5 de
      una cotización, con los tiempos de DevTools → Network. Claude te dice qué
      columnas anotar.

### R2 — PR de código (test activo)

- [ ] `vercel.json`: `"regions": ["cle1"]`.
- [ ] `docs/decisions/021-region-ohio.md` (con la medición de B5 al cerrar) y la
      018 marcada como reemplazada.
- [ ] `ARCHITECTURE.md` (región), `docs/ENV.md` y `CLAUDE.md` si menciona la región.
- [ ] CI en verde (`test`, `fresh-db`, `smoke-and-critical`, `live`).
- [ ] Claude: el Preview del PR quedó en `cle1` y responde login y `/cuentas`
      contra test.

### R1 — Producción nueva

- [ ] Claude pausa `serenata-erp-test` (MCP). No correr CI hasta R4.
- [ ] **(usuario)** Crear `serenata-erp` en el panel: región **`us-east-2`**,
      organización "App develop", plan Free, Data API y exposición automática
      **igual que en la vieja**. Guardar la contraseña de la base en tu gestor.
- [ ] **(usuario)** Settings → API: existen las llaves legacy `anon` y
      `service_role` y el JWT Secret legacy. Si no, **se detiene**.
- [ ] Claude: versión de Postgres, arquitectura y extensiones disponibles,
      comparadas con test (A6).
- [ ] **(usuario)** Correr en tu máquina el comando que Claude deja listo:
      `node scripts/build-supabase-migrations.mjs` + `npx supabase db push`
      con la URL del *session pooler* del proyecto nuevo (Connect → Session
      pooler). Pega aquí solo la salida, nunca la URL con la contraseña.
- [ ] Claude: el historial tiene las 141 migraciones.
- [ ] Claude, comparación **en vivo** vieja ↔ nueva, todo en 0 diferencias o
      explicado:
      - huella;
      - GRANTs (`service_role` 245);
      - extensiones;
      - políticas de `realtime.messages`;
      - RLS;
      - ajustes de roles.
- [ ] Claude: `plpgsql-check.sql` = 0 errores; advisors con solo los INFO esperados.
- [ ] **(usuario)** Replicar los ajustes capturados en R0; Claude compara.
- [ ] Claude: reinicio (vacía todo salvo `usuarios`, `tipos_proyecto`,
      `tipo_proyecto_etapas` y `tipo_proyecto_tarea_default`, y deja
      `folio_contadores` vacío). Corre en una transacción que se verifica sola.
- [ ] Claude: tipos y etapas con el mismo contenido que la vieja (B1).
- [ ] Claude: copiar los 2 usuarios con sus ids. Los hashes no se escriben en
      ningún archivo.
- [ ] Claude: conteo de filas por tabla nueva = vieja;
      `auditar_consistencia()` = 0; `preview_next_folio` = `SH001`.
- [ ] Congelamiento: nadie usa producción desde aquí hasta el corte.

### R3 — Corte

- [ ] **(usuario)** Vercel → Environment Variables → **Production** y
      **Development**: pegar `SUPABASE_SERVICE_ROLE_KEY` y
      `SUPABASE_JWT_SECRET` del proyecto nuevo. Anotar los viejos en tu gestor.
- [ ] Claude (o usuario si el conector sigue sin acceso):
      `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production
      y Development. **Preview no se toca.**
- [ ] Claude (o usuario): *Redeploy* de producción **sin caché de build**;
      Claude confirma `READY`.
- [ ] Verificación funcional en producción:
  - [ ] Login y logout de los 2 usuarios de staff.
  - [ ] Crear una cotización: folio `SH001`; partidas guardadas; Claude
        confirma las filas en **la base nueva**.
  - [ ] Colaboración en vivo con dos sesiones: aparece "X está editando".
  - [ ] PDF generado y subido a Drive (carpeta de producción).
  - [ ] Proveedor con acceso al Portal: login en el Portal y extracción con AI.
  - [ ] Aprobar la cotización: aparecen sus cuentas en `/cuentas` (periodo,
        resumen, opciones y avisos).
  - [ ] Admin → `auditar_consistencia()` = 0.
  - [ ] Cron `/api/keep-alive` con `CRON_SECRET` responde OK.
- [ ] Claude: reinicio otra vez → `SH001`, conteos = los de R1,
      `auditar_consistencia()` = 0.
- [ ] **(usuario)** Borrar de Drive los PDFs de la verificación.
- [ ] **(usuario)** Medición después: la misma de R0 (B5).
- [ ] **(usuario)** Avisar a los usuarios que recarguen la app. Recomendado:
      que los 2 cambien su contraseña.

### R4 — Cierre

- [ ] Claude pausa la vieja (`fwmyoqokcjtldiofuxdg`) y reactiva test (MCP).
- [ ] Claude: commit con el ref nuevo en `app/api/internal/env-check/route.ts`
      (los dos refs mientras exista la vieja) y su test; CI en verde; merge.
      Claude confirma el deploy de producción en `cle1`.
- [ ] Si producción quedó con un Postgres más nuevo que test: **(usuario)**
      actualizar test desde su panel.
- [ ] `escala.yml` una vez, como línea base nueva.
- [ ] Decisión 021 con la medición antes y después.
- [ ] A los 7 días: **(usuario)** borrar la vieja; Claude quita su ref de
      `env-check` (PR chico).
- [ ] **(usuario)** Conector `supabase-prod` en claude.ai, si tiene ref fijo, y
      `.env.local` de tu máquina si apunta a producción. Claude ajusta
      `CLAUDE.md`, `.claude/rules/migraciones.md` y `docs/inventario-tablas.md`.
- [ ] El proyecto Vercel aislado de carga toma `cle1` la próxima vez que se fije
      `loadtest-target`; apunta a test, sin cambios.
- [ ] `docs/ACTIVE_WORK.md`, `docs/ROADMAP.md`, cerrar #124, archivar este plan.

### Lo que no cambia (verificado)

Google OAuth y Drive (mismo dominio), `ANTHROPIC_API_KEY`, `AUTH_SECRET` (las
sesiones abiertas siguen válidas: mismos ids y `session_version`),
`CRON_SECRET`, el cron de Vercel, los secretos de GitHub Actions (todos de test),
la CSP (`*.supabase.co`), el entorno Preview de Vercel y la base de test.

## Riesgos

| Riesgo | Cómo queda cubierto |
|---|---|
| Sin llaves legacy | Se detecta en R1, antes de tocar datos o Vercel. |
| Permisos o ajustes distintos | Comparación en vivo y capturas (A2). |
| Migración que falla en Supabase real | Mismo motor que CI (B2); la vieja sigue sirviendo (A3). |
| Copia de datos con conflicto | Solo 2 usuarios; el resto lo siembran las migraciones (B1). |
| Corte fallido | Rollback por variables más *Redeploy*, en minutos. |
| Datos de prueba que quedan en producción | Reinicio transaccional antes y después de la verificación. |
| CI bloqueado o pasos en orden imposible | Orden corregido (A1, B4). |
| No saber si mejoró | Medición antes y después (B5). |

## Tracker

| Bloque | Estado |
|---|---|
| R0 Verificaciones, capturas y línea base | Pendiente |
| R2 PR de código | Pendiente |
| R1 Producción nueva | Pendiente |
| R3 Corte y verificación | Pendiente |
| R4 Cierre | Pendiente |
