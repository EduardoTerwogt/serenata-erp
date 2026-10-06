# Archivo — #124: Producción y Vercel a Ohio (`us-east-2` / `cle1`)

**Archivado el 2026-10-06** para liberar `docs/PLAN.md` para #123. La
iniciativa está ejecutada (producción en Ohio desde el 2026-10-06); lo que
falta de R4 depende de fechas, no de código, y se sigue en
`docs/ACTIVE_WORK.md` ("Siguiente paso"): vigilancia y borrado de la base vieja
el 2026-10-13, PR que quita su ref de `env-check` y borra
`db-push-una-vez.yml`, cerrar el issue #124 y su resumen en `docs/ROADMAP.md`
→ "Cerrado". Este archivo conserva el plan, las auditorías y la bitácora tal
como quedaron.

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

## Auditoría 3 (Dev Sr + Data Sr, 2026-10-02)

No quedan fallas graves. Son mejoras que reducen riesgo residual y trabajo
manual; ya están en el checklist.

| # | Severidad | Hallazgo (verificado) | Corrección |
|---|---|---|---|
| C1 | P1 | **Escrituras silenciosas a la base vieja:** después del corte, una pestaña con el JavaScript viejo seguiría guardando en la vieja hasta R4. Esos datos se perderían sin aviso. | Pausar la vieja **en cuanto el deploy nuevo está `READY`**, antes de la verificación: una pestaña vieja falla a la vista (principio 4) en vez de escribir donde nadie mira. Eso libera el lugar para reactivar test de inmediato. El rollback sigue igual: reactivar la vieja (minutos) y restaurar las variables. |
| C2 | P1 | Lo de las llaves legacy dependía solo de mirar el panel. | Comprobación objetiva: el header de la llave `anon` legacy (`get_publishable_keys`) debe decir `alg: HS256`, firmada con el JWT secret legacy. Si dice ES256 o RS256, el proyecto firma con llaves asimétricas y **se detiene**. En la verificación funcional, Realtime va primero para fallar rápido. |
| C3 | P2 | El CLI registra cada migración con versión `000001…000141` y nombre `20260101_…` (conserva la fecha). `check-schema-parity.mjs` quita la fecha solo del lado local, así que contra la producción nueva reportaría las 141 como faltantes. | En el PR de R2, normalizar también el nombre remoto (quitar `^\d{8}_`). |
| C4 | P2 | El comando del CLI con la contraseña dentro de la URL queda en el historial de la terminal. | El comando pide la contraseña con `read -s` y arma la URL en una variable que no queda en el historial. |
| C5 | P1 | El checklist decía que Claude verificaría el Preview, pero desde esta sesión no hay salida de red a `*.vercel.app`. | Claude dispara `preview-latency.yml` (GitHub Actions, ya existe: hace login con las credenciales de test y mide p95 por ruta) contra un Preview actual (`sfo1`) y contra el Preview del PR (`cle1`). Es la **misma base de test** en los dos, así que la diferencia mide solo la región: comparación A/B automática y objetiva. La medición en producción con DevTools queda como confirmación opcional, más el header `x-vercel-id` (muestra la región que respondió). |
| C6 | P2 | Falta confirmar si reactivar un proyecto pausado lo pasa a una imagen de Postgres más nueva (afecta la paridad de test, A6). | Se agrega a la consulta de documentación de R0. |

**Conclusión:** el método es el correcto. Cada riesgo tiene una comprobación
antes del punto de no retorno, y el único paso irreversible (borrar la vieja)
ocurre 7 días después del corte. Una cuarta ronda tendría rendimientos
marginales: lo que falta por descubrir solo aparece ejecutando, y para eso están
los puntos de parada (llaves, migraciones, comparación, verificación).

## Auditoría externa (2026-10-02): análisis y decisión

Revisada punto por punto contra el código y la documentación vigente. Ningún
punto se integró sin verificarlo.

| # | Punto de la auditoría externa | Decisión | Por qué |
|---|---|---|---|
| X1 | El rollback no distingue datos: volver a la vieja después de escrituras reales las pierde. | **Se integra (P0).** | Es correcto y el plan lo tenía ambiguo ("rollback hasta borrar la vieja"). Ahora hay dos ventanas formales y un GO/NO-GO (abajo). |
| X2 | Estados formales `FREEZE_START` y `GO_LIVE`. | **Se integra.** | No cuesta nada y quita interpretación. Se agrega un detalle que la auditoría no vio: el cron `/api/keep-alive` corre a las 08:00 UTC (02:00 CDMX) y escribe en la base; la ventana no puede cruzarlo. |
| X3 | R1 debe dar un GO/NO-GO único y verificable, no diez revisiones sueltas. | **Se integra**, reutilizando lo que existe. | En vez de un sistema nuevo, se extiende `esquema-huella.sql` con GRANTs, extensiones, políticas de `realtime.messages` y RLS por tabla. Así `check-schema-parity --esquema` lo cubre para siempre, también para test ↔ producción (principio 7). El gate es una tabla PASS/FAIL. |
| X4 | Las llaves legacy se retiran a fin de 2026; dejarlo como deuda posterior. | **Se integra, con más urgencia que la propuesta.** | Verificado en la documentación de Supabase: "The legacy `anon` and `service_role` keys keep working until the end of 2026". Quedan ~3 meses y aplica a **toda** la app, no solo al proyecto nuevo. Se abrió **#125** como iniciativa propia. Coincido en **no** mezclarla con el corte de región (dos cambios a la vez impiden saber qué falló). Pero su lugar en la cola (antes o después de #124) es decisión del usuario, y en cualquier caso va antes de #123 y #110. Test, creado el 2026-09-04, todavía trae la `anon` legacy `HS256` habilitada junto a la publishable (verificado), así que el riesgo de que el proyecto nuevo nazca sin llaves legacy es bajo, aunque no cero: la comprobación C2 sigue siendo punto de parada. |
| X5 | Comprobar que el historial remoto sea exactamente el conjunto esperado, con un SHA conocido. | **Se integra.** | Barato: 141 nombres contra `_manifest.json` del SHA desde el que se corre `db push`. |
| X6 | Si `cle1` no está disponible, STOP antes de tocar Supabase. | **Se integra.** | Ya estaba en R0 como verificación; queda como punto de parada explícito. |
| X7 | Evitar que los hashes de contraseña pasen por el contexto de Claude. | **Se integra.** | Hay alternativa barata: el usuario corre en el SQL Editor de la vieja una consulta que arma el `INSERT` y lo pega en el SQL Editor de la nueva (2 minutos). Claude verifica sin ver los hashes: compara `md5(hash)` entre ambas bases. Cambiar las contraseñas después queda como recomendación. |
| X8 | Medir mediana, p95 y máximo, no solo p95; y la primera petición en frío. | **Se integra la mediana y el máximo; lo de "en frío" no.** | `preview-latency.yml` hoy solo reporta p95; agregar mediana y máximo es un cambio chico en el PR de R2. La primera petición en frío mide el arranque de la función de Vercel, que no depende de la región, y metería ruido en el A/B. |
| X9 | Antes de pausar test, que no haya workflows corriendo ni en cola. | **Se integra.** | Claude lo revisa con la API de GitHub. Además se evita la ventana de `escala.yml` (domingos 09:17 UTC). |

Lo demás de la auditoría externa (Ohio, `db push`, no clonar, comparación de
esquema, Realtime primero, A/B de latencia, la vieja viva 7 días) confirma
decisiones ya tomadas.

## Auditoría 4: ¿lista para implementar? (Dev Sr + Data Sr, 2026-10-02)

Revisión de preparación con el orden definitivo (#124 → #125). El diseño no
cambia. Siete hallazgos de ejecución; ninguno es P0. El plan queda listo para
aprobar con estos ajustes, ya aplicados en el checklist.

| # | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| D1 | **P1, prerrequisito** | El paso del CLI (B2) supone que el usuario tiene **el repo clonado y Node** en su máquina. Nunca se confirmó: si no los tiene, R1 se atora a mitad de la ventana. | R0 lo confirma: `git clone`/`git pull` y `node -v` ≥ 20. Si no hay máquina, alternativa decidida **antes** de empezar: un workflow de GitHub Actions de un solo uso (`workflow_dispatch`) que corre el mismo `db push` con la URL del pooler como secreto temporal, que se borra junto con el workflow al terminar. |
| D2 | P1 | El plan no dice **cuánto dura la ventana ni que el usuario debe estar presente** en R1–R3: crear el proyecto, el CLI, la copia de usuarios, los secretos y la prueba funcional. | Ventana única estimada de **2–3 h** con el usuario disponible, agendada fuera de las 08:00 UTC y del domingo 09:17 UTC. Si se corta a la mitad, el estado seguro es la ventana A (la vieja sirve; la nueva es descartable). |
| D3 | P1 | Comparar la huella de dos bases por MCP devuelve miles de filas (una por objeto) al contexto: es lento y propenso a error. | Comparación en dos niveles: primero **un md5 por categoría** (columnas, índices, restricciones, triggers, políticas, funciones, GRANTs, extensiones, RLS) en cada base. Solo si una categoría difiere se baja al detalle de esa categoría. |
| D4 | P2 | El criterio "Extensiones: mismas" fallaría por una diferencia de **versión** que es normal entre imágenes de Postgres. | Mismo nombre y esquema = PASS; versión distinta = WARN registrado (como la versión de Postgres). |
| D5 | P2 | Error en el checklist: `x-vercel-id` muestra la región de Vercel, **no** qué base respondió. | Corregido: `x-vercel-id` confirma la región; que la base es la nueva lo confirma Claude con las filas creadas en la verificación. |
| D6 | P1 | No había **vigilancia después de `GO_LIVE`**: sin Observability Plus, un error esporádico (Realtime, timeouts) solo se vería si un usuario lo reporta. | Claude revisa los logs de la base nueva por MCP (`query_logs`: API, Postgres y Realtime) al pasar a `GO_LIVE`, a las 24 h y antes de borrar la vieja. El usuario revisa la pestaña Functions de Vercel (gratis) en los mismos tres puntos. |
| D7 | P2 | El issue #124 y el comentario de #125 todavía describen el orden anterior (#125 primero). | Actualizados: #124 sin dependencia de #125; #125 con nota del orden final. |

**Resolución de D1 (2026-10-02):** el usuario **no tiene repo ni Node** en su
máquina. Se usa la alternativa: workflow de un solo uso (ver **R2b** en el
checklist).

**Veredicto:**
- **Diseño:** el más seguro y eficiente disponible en el plan Free para llegar a
  Ohio. Cuatro auditorías internas y una externa lo confirman, y cada riesgo
  tiene un punto de parada antes de lo irreversible.
- **Pendientes antes de ejecutar:** solo los de R0, que son verificaciones por
  diseño (regiones, `cle1`, límites del Free, máquina para el CLI, ventana
  agendada) y no se pueden resolver en papel.
- **No queda ninguna decisión de diseño abierta.**

## Ventanas de rollback y GO/NO-GO (X1, X2)

- **`FREEZE_START`** (inicio de R1, antes de pausar test): nadie usa
  producción, no hay operaciones manuales ni scripts que escriban, y la ventana
  no cruza el cron de las 08:00 UTC ni `escala.yml`.
- **Ventana A, antes de `GO_LIVE`:** la vieja está intacta (solo pausada) y la
  nueva es **descartable**. Rollback seguro, sin pérdida de datos:
  - reactivar la vieja;
  - Vercel → Deployments → **Instant Rollback** al deploy de producción
    anterior, que conserva las variables viejas;
  - después, restaurar las 4 variables en Settings para que el siguiente deploy
    no vuelva a apuntar a la nueva.
- **GO/NO-GO de R1:** la nueva no recibe tráfico si una fila no da PASS:

  | Comprobación | Criterio |
  |---|---|
  | Historial de migraciones | 141 nombres = `_manifest.json` del SHA usado |
  | Esquema (huella extendida) | 0 diferencias contra la vieja: columnas, índices, restricciones, triggers, funciones |
  | GRANTs de tablas | iguales por tabla y rol (`service_role` 245) |
  | RLS y políticas | iguales, incluidas las de `realtime.messages` |
  | Extensiones | mismo nombre y esquema (versión distinta: WARN, D4) |
  | Ajustes de roles | `authenticator`: `safeupdate`, 8 s, 8 s; `anon` 3 s; `authenticated` 8 s |
  | Llaves | `anon` legacy `HS256` habilitada y JWT secret legacy disponible |
  | Datos sembrados | tipos y etapas con el mismo contenido que la vieja |
  | Usuarios | 2 filas, mismos ids, `md5(hash)` igual |
  | Conteo de filas | igual por tabla |
  | Consistencia | `auditar_consistencia()` = 0; `preview_next_folio` = `SH001` |
  | Postgres | versión ≥ test (si es mayor: WARN, se alinea test en R4) |

- **GO/NO-GO de R3:** verificación funcional completa + reinicio + conteos
  iguales a R1. Al pasar se marca **`GO_LIVE`** y se avisa a los usuarios.
- **Ventana B, después de `GO_LIVE`:** la nueva es la única fuente de verdad.
  Ante un problema se hace **forward-fix sobre la nueva**. Volver a la vieja ya
  no es rollback: solo se considera en emergencia y **después de pasar a la vieja
  las filas escritas en la nueva** (con el volumen de hoy, unas cuantas filas por
  SQL), con aprobación explícita del usuario. La vieja queda 7 días solo como
  respaldo de infraestructura.

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
5. Crear en GitHub el secreto temporal `PROD_NUEVA_DB_URL`. Claude dispara el
   workflow de un solo uso que aplica las 141 migraciones (R2b) y, al final,
   borras el secreto.
6. Copiar los 2 usuarios con dos pegados en el SQL Editor (X7) y pegar 2
   secretos en Vercel (Production y Development).
7. Verificación funcional con dos navegadores (~15 min) y borrar de Drive los
   PDFs de prueba. La latencia la mide Claude (C5); la de producción con
   DevTools es opcional.
8. A los 7 días, borrar la vieja desde el panel.

## Estrategia de corte

1. **R0** verificar, capturar y medir la latencia base, con todo activo.
2. **R2** PR (`vercel.json` → `cle1`, decisión 021, docs) con test activo; CI
   verde; el Preview prueba `cle1` contra test. No se mergea. **R2b**: PR del
   workflow de un solo uso, que **sí** se mergea antes de R1.
3. **R1** pausar test → el usuario crea el proyecto → `db push` por el workflow → comparación en
   vivo contra la vieja → reinicio → copiar 2 usuarios → conteos iguales.
4. **R3** variables en Vercel → *Redeploy* (sin merge) → `READY` → **pausar la
   vieja y reactivar test** (C1) → verificación funcional (Realtime primero) →
   reinicio.
5. **R4** commit con el ref nuevo en `env-check` → CI verde → merge (`cle1`) →
   7 días → borrar la vieja.

**Rollback:** ver "Ventanas de rollback y GO/NO-GO". Antes de `GO_LIVE` es
seguro; después, forward-fix.

## Bloques

| Bloque | Qué | Quién |
|---|---|---|
| **R0 Verificaciones, capturas y línea base** | Regiones, límites del plan Free, capturas, huella completa de la vieja, latencia antes. | Usuario + Claude |
| **R2 PR de código** | `vercel.json` → `cle1`, decisión 021 que reemplaza 018, docs. CI verde y Preview probado. | Claude |
| **R1 Producción nueva** | Pausar test, crear, `db push`, comparar, reiniciar, copiar 2 usuarios. | Usuario crea y corre el CLI; Claude todo lo demás |
| **R3 Corte** | Variables, *Redeploy*, pausar la vieja y reactivar test (C1), verificación funcional, reinicio. | Usuario (secretos y prueba) + Claude |
| **R4 Cierre** | `env-check`, merge (`cle1`), alinear versión de test, borrar la vieja a los 7 días, conectores y docs. | Usuario + Claude |

## Checklist completo

Lo que dice **(usuario)** solo se hace desde un panel o tu máquina; Claude da el
paso a paso exacto en ese momento. Ningún secreto se pega en el chat ni en el
repo.

### R0 — Antes de empezar (todo activo, sin cambios)

- [x] **(usuario)** Supabase → New project → lista de regiones: existe
      `us-east-2` y no hay México. Confirmado por el usuario el 2026-10-05.
- [x] **(usuario)** Vercel → Project Settings → Functions → Function Region:
      `cle1` disponible en tu plan. **Si no: STOP, no se toca Supabase** (X6).
      Confirmado el 2026-10-02: `cle1` aparece y el plan de Vercel es **Hobby**.
      En Hobby, Instant Rollback solo vuelve al deploy de producción
      inmediatamente anterior, que es justo el que necesita la ventana A: no se
      hace ningún otro deploy de producción entre el *Redeploy* del corte y
      `GO_LIVE`.
- [x] **(usuario)** Reautenticar el conector de Vercel de Claude con acceso al
      team `eduardoterwogts-projects`. Confirmado por Claude el 2026-10-02: el
      conector ve el team y los 2 proyectos, y lista las variables de
      producción sin descifrarlas (sin 403).
- [x] Claude: confirmar en la documentación de Supabase que un proyecto pausado
      no cuenta para el límite de 2 activos y cuánto tarda en reactivarse.
      Hecho 2026-10-02: Free permite pausados sin límite y se restauran hasta 90
      días después (un clic); el tiempo depende del tamaño y llega correo al
      terminar (ambos proyectos son chicos).
- [x] **(usuario)** Capturas de la vieja (recibidas 2026-10-05; valores en
      "Línea base de la vieja"):
      - Settings → API / Data API: esquemas expuestos, *max rows*, *extra search
        path* y exposición automática de tablas nuevas.
      - Settings → JWT: expiración.
      - Realtime → Settings.
      - Database → Settings: SSL y restricciones de red.
- [x] Claude, huella completa de la vieja en el scratchpad (hecho 2026-10-02;
      valores en "Línea base de la vieja" abajo):
      - `esquema-huella.sql`;
      - GRANTs por tabla y rol;
      - extensiones con esquema y versión;
      - políticas de `realtime.messages`;
      - RLS por tabla;
      - `pg_db_role_setting`;
      - conteo de filas por tabla.
- [x] Claude: línea base (B5, C5) con `preview-latency.yml` sobre un Preview
      actual (`sfo1` → test). Hecho 2026-10-05, junto con la medición `cle1`;
      tabla en la decisión 021.
- [x] **(usuario, opcional)** 5 cargas de `/cuentas` en producción con
      DevTools → Network, anotando la mediana. Hecho 2026-10-05: mediana
      `periodo` 443 ms (decisión 021).
- [x] Claude: confirmar en la documentación de Supabase si reactivar un
      proyecto pausado cambia su imagen de Postgres (C6). Sí puede: la
      documentación dice que pausar y restaurar deja el proyecto con las
      funciones más recientes. Test ya está en `17.6.1.166`; al reactivarlo en
      R3 se vuelve a comparar versión.
- [x] **(usuario)** Máquina para el CLI (D1): **no hay**. Se usa R2b.
- [ ] **(usuario)** Agendar la ventana de R1–R3 (D2): 2–3 h, con tu presencia,
      fuera de las 08:00 UTC y del domingo 09:17 UTC.

### R2 — PR de código (test activo)

- [ ] `vercel.json`: `"regions": ["cle1"]`.
- [ ] `docs/decisions/021-region-ohio.md` (con la medición de B5 al cerrar) y la
      018 marcada como reemplazada.
- [ ] `ARCHITECTURE.md` (región), `docs/ENV.md` y `CLAUDE.md` si menciona la región.
- [ ] `scripts/check-schema-parity.mjs`: normalizar también el nombre remoto
      (C3).
- [ ] `scripts/db/esquema-huella.sql`: agregar GRANTs de tablas, extensiones,
      políticas de `realtime.messages` y RLS por tabla (X3). Comprobar que test
      ↔ producción vieja siga en 0 o que las diferencias tengan explicación.
- [ ] `.github/workflows/preview-latency.yml`: reportar mediana y máximo además
      del p95 (X8).
- [ ] CI en verde (`test`, `fresh-db`, `smoke-and-critical`, `live`).
- [ ] Claude: `preview-latency.yml` sobre el Preview del PR (`cle1` → test):
      login OK, rutas OK y p95 comparado contra la línea base (C5).

### R2b — Workflow de un solo uso para `db push` (D1)

- [ ] Claude: PR chico con `.github/workflows/db-push-una-vez.yml`, que hace:
      - checkout del SHA de `main`;
      - `node scripts/build-supabase-migrations.mjs`;
      - `supabase db push --db-url "$URL"`;
      - escribe en el log el SHA y el conteo de migraciones aplicadas.

      Detalles:
      - Solo `workflow_dispatch`, sin otros disparadores.
      - Lee la URL del secreto `PROD_NUEVA_DB_URL`. Si el secreto no existe o
        apunta al ref de producción vieja (`fwmyoqokcjtldiofuxdg`) o de test
        (`ozrtsludmcguvgqdjicn`), se niega a correr.
      - Un `workflow_dispatch` solo aparece si el archivo ya está en `main`: por
        eso se mergea **antes** de R1, con CI en verde. No toca nada hasta que
        alguien lo dispara.
- [ ] En R1, **(usuario)** crea el secreto `PROD_NUEVA_DB_URL` (GitHub → Settings
      → Secrets and variables → Actions) con la URL del *session pooler* del
      proyecto nuevo. Claude dispara el workflow y lee su salida.
- [ ] En R4: Claude borra el workflow (PR) y **(usuario)** borra el secreto.

### R1 — Producción nueva

- [ ] **`FREEZE_START`** (X2): fuera de las 08:00 UTC y de la ventana de
      `escala.yml`.
- [ ] Claude: ningún workflow de GitHub corriendo ni en cola (X9).
- [ ] Claude pausa `serenata-erp-test` (MCP). No correr CI hasta R4.
- [ ] **(usuario)** Crear `serenata-erp` en el panel: región **`us-east-2`**,
      organización "App develop", plan Free, Data API y exposición automática
      **igual que en la vieja**. Guardar la contraseña de la base en tu gestor.
- [ ] **(usuario)** Settings → API: existen las llaves legacy `anon` y
      `service_role` y el JWT Secret legacy. Claude confirma que la `anon`
      legacy es `HS256` (C2). Si algo falla, **se detiene**.
- [ ] Claude: versión de Postgres, arquitectura y extensiones disponibles,
      comparadas con test (A6).
- [ ] **(usuario)** Crear el secreto `PROD_NUEVA_DB_URL` con la URL del
      *session pooler* del proyecto nuevo (Connect → Session pooler, con la
      contraseña). Claude dispara `db-push-una-vez.yml` y revisa su salida (R2b).
      La URL nunca pasa por el chat.
- [ ] Claude: el historial tiene exactamente los 141 nombres de `_manifest.json`
      del SHA usado (X5).
- [ ] Claude, comparación **en vivo** vieja ↔ nueva, primero un md5 por
      categoría y solo el detalle de lo que difiera (D3), todo en 0 diferencias o
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
- [ ] **(usuario)** Copiar los 2 usuarios por SQL Editor (X7). Claude da la
      consulta para la vieja, que arma el `INSERT`; tú lo pegas en la nueva.
      Claude verifica ids y `md5(hash)` sin ver los hashes.
- [ ] Claude: **tabla GO/NO-GO de R1** completa, todo en PASS. Si algo falla:
      NO-GO, se corrige o se descarta la nueva; producción sigue en la vieja.
- [ ] Congelamiento: nadie usa producción desde aquí hasta el corte.

### R3 — Corte

- [ ] **(usuario)** Vercel → Environment Variables → **Production**: pegar
      `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET` del proyecto nuevo.
      Según la documentación de Vercel (2026-10-02), las variables
      *Sensitive* no se pueden volver a leer y solo existen en Production y
      Preview. Por eso:
      - no hace falta anotar los valores viejos: el rollback es **Instant
        Rollback** al deploy de producción anterior, que conserva sus
        variables;
      - **Development no se toca:** el usuario no tiene máquina local, así que
        nadie la usa; en R4 se borran sus entradas que apunten a la vieja.
- [ ] Claude (o usuario si el conector sigue sin acceso):
      `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
      Production. **Preview y Development no se tocan.**
- [ ] Claude (o usuario): *Redeploy* de producción **sin caché de build**;
      Claude confirma `READY`.
- [ ] Claude pausa la vieja y reactiva test (C1).
- [ ] Verificación funcional en producción (Realtime primero, C2):
  - [ ] Colaboración en vivo con dos sesiones: aparece "X está editando".
  - [ ] Header `x-vercel-id` de una respuesta: región `sfo1` hasta el merge
        de R4, `cle1` después (D5). Que la base es la nueva lo confirma Claude
        con las filas de la verificación.
  - [ ] Login y logout de los 2 usuarios de staff.
  - [ ] Crear una cotización: folio `SH001`; partidas guardadas; Claude
        confirma las filas en **la base nueva**.
  - [ ] PDF generado y subido a Drive (carpeta de producción).
  - [ ] Proveedor con acceso al Portal: login en el Portal y extracción con AI.
  - [ ] Aprobar la cotización: aparecen sus cuentas en `/cuentas` (periodo,
        resumen, opciones y avisos).
  - [ ] Admin → `auditar_consistencia()` = 0.
  - [ ] Cron `/api/keep-alive` con `CRON_SECRET` responde OK.
- [ ] Claude: reinicio otra vez → `SH001`, conteos = los de R1,
      `auditar_consistencia()` = 0.
- [ ] **GO/NO-GO de R3 → `GO_LIVE`.** Desde aquí: forward-fix, no rollback
      (X1).
- [ ] Vigilancia (D6): Claude revisa los logs de API, Postgres y Realtime de la
      base nueva por MCP; **(usuario)** revisa la pestaña Functions de Vercel.
      Se repite a las 24 h.
- [ ] **(usuario)** Borrar de Drive los PDFs de la verificación.
- [ ] **(usuario, opcional)** Medición en producción con DevTools, como en R0.
- [ ] **(usuario)** Avisar a los usuarios que recarguen la app. Recomendado:
      que los 2 cambien su contraseña.

### R4 — Cierre

- [x] Claude: commit con el ref nuevo en `app/api/internal/env-check/route.ts`
      (los dos refs mientras exista la vieja) y su test; CI en verde; merge.
      Claude confirma el deploy de producción en `cle1`. (PR #126, `9891c57`;
      deploy `dpl_AH6znhRz…` READY en `cle1`, alias `serenata-erp.vercel.app`.)
- [x] Si producción quedó con un Postgres más nuevo que test: **(usuario)**
      actualizar test desde su panel. (Hecho 2026-10-06: test en `17.11.0.002`.)
- [x] `escala.yml` una vez, como línea base nueva. (Verde, run 37401207282.)
- [x] Decisión 021 con la medición antes y después. (Mediana 443 → 409 ms, dentro
      del ruido; el beneficio es la alineación de regiones. Ver la decisión.)
- [ ] A los 7 días, con la vigilancia de D6 limpia: **(usuario)** borrar la
      vieja; Claude quita su ref de `env-check` (PR chico).
- [ ] Siguiente iniciativa: **#123**. **#125** (llaves) quedó al final de la cola
      (2026-10-06), con fecha límite interna 2026-12-01 y revisión el 2026-11-01.
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

## Línea base de la vieja (R0, 2026-10-02)

Huella con `esquema-huella-resumen.sql` en `fwmyoqokcjtldiofuxdg`: columnas 341
`7a1f983e`, funciones 81 `d1e50d05`, índices 111 `4b266a11`, políticas 1
`c501722e`, restricciones 134 `18f33b6c`, triggers 10 `0b9c949c`.

Categorías extendidas (X3), idénticas en test y en la vieja: GRANTs 136 filas
(tabla × rol) `a7f8d1ba` (`service_role` 245 privilegios), extensiones 7
`d953a615`, políticas de `realtime.messages` 2 `73905557`, RLS 34 tablas
`e8b8ddf6`. Filas por tabla: `usuarios` 2, `tipos_proyecto` 3,
`tipo_proyecto_etapas` 12, el resto 0. Postgres `17.6.1.084` (aarch64).

Ajustes de roles: `anon` 3 s, `authenticated` 8 s, `authenticator` con
`statement_timeout=8s`, `lock_timeout=8s` y `session_preload_libraries`
**`safeupdate`** (en test: `supautils, safeupdate`). El proyecto nuevo
probablemente traiga `supautils, safeupdate`: para el GO/NO-GO cuenta como PASS
(imagen más nueva, igual que test); falta `safeupdate` = NO-GO.
Llave `anon` legacy de la vieja: `HS256`, activa, junto a la publishable.

Capturas del panel de la vieja (2026-10-05), para comparar con la nueva en R1:
- **Data API:** 2 de 2 esquemas expuestos, 33 de 35 tablas y 14 de 80
  funciones expuestas; exposición automática de tablas nuevas **ON**; *extra
  search path* `public, extensions`; *max rows* 1000; *pool size* automático.
- **Realtime:** servicio activo; acceso público a canales **ON**; pools de 2 y 2
  conexiones; 200 clientes concurrentes; 100 eventos/s, 20 presencias/s y
  256 KB de payload (topes del plan Free).
- **Database:** SSL no forzado; red abierta a todas las IP.
- **Llaves y JWT:** existen llaves publishable y secret nuevas y la pestaña
  legacy. Llave de firma actual **ECC P-256**; la HS256 legacy figura como
  "previous key" y el JWT secret legacy "solo verifica". La app firma los
  tokens de Realtime con ese secret legacy y funciona. En la nueva hay que
  comprobar el mismo estado (C2). JWT expiry no aplica: Auth no se usa.

**Cuidado con la ventana A:** en Vercel, todo push a `main` (incluso solo `.md`)
crea un deploy de producción. Entre el *Redeploy* del corte y `GO_LIVE` **no se
hace ningún push a `main`**; el Instant Rollback de Hobby solo vuelve al deploy
inmediatamente anterior.

## Bitácora de la ejecución (2026-10-05/06)

- **R1:** la nueva se creó con el nombre `Serenata-ERP` (`ytlyphlgyhgztkfxwojt`,
  `us-east-2`, Postgres `17.11.0.002`). `db push` por `db-push-una-vez.yml` (SHA
  `f714bff`): 141 migraciones en 22 s, historial = `_manifest.json`. Huellas de
  esquema y de las categorías extendidas idénticas a la vieja.
- **Diferencias que el plan no previó, corregidas en la nueva:**
  1. La migración `20260915_loadtest_runs.sql` crea `loadtest_runs` en cualquier
     base nueva; la vieja nunca la tuvo y `seed-cuentas-test.sql`,
     `escala-generador.sql` y `escala-limpiar.sql` la usan para decidir "esto es
     test". Se quitó con `DROP TABLE` (corrido por el usuario en el SQL Editor,
     porque la confirmación de borrado por MCP expiró). **Al aplicar migraciones
     futuras a producción, esa no va.**
  2. `folio_contadores` traía 2 filas sembradas (CC y CP 2026, último 0): se
     borraron para que quede como la vieja.
- **Usuarios:** copiados con el `INSERT` armado en la vieja (`jsonb_populate_recordset`);
  ids y md5 de cada fila idénticos, sin pasar los hashes por Claude.
- **R3:** variables de Producción en Vercel (las dos `NEXT_PUBLIC_*` por MCP, las
  dos secretas por el usuario); cada entrada es compartida con Development, que
  también quedó apuntando a la nueva. *Redeploy* `dpl_9eYDk5k5…` (`sfo1`, sin
  caché) → `READY`; la vieja se pausó y test se reactivó (misma versión
  `17.6.1.166`: reactivar no cambió la imagen, C6).
- **Reinicio posterior a la verificación:** el script viejo no se pudo leer
  (bloqueo del permiso); se usó un `DO $$` con guardas (se niega si existe
  `loadtest_runs` o si los conteos de usuarios/tipos/etapas no son 2/3/12),
  `TRUNCATE` de todas las tablas salvo las 4 conservadas, en una transacción.
- **Pendiente de la vigilancia (D6):** un error aislado `no partition of relation
  "messages" found for row` en Realtime a las 00:50 UTC, no repetido; confirmar a
  las 24 h que las particiones diarias de `realtime.messages` se siguen creando.

## Riesgos

| Riesgo | Cómo queda cubierto |
|---|---|
| Sin llaves legacy | Se detecta en R1, antes de tocar datos o Vercel. Si pasa, #125 se adelanta a #124. |
| No hay máquina para el CLI | Se resuelve en R0 (D1), antes de la ventana. |
| Error esporádico después del corte | Vigilancia de logs en `GO_LIVE`, a las 24 h y antes de borrar la vieja (D6). |
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
| R0 Verificaciones, capturas y línea base | Hecho salvo agendar la ventana (usuario) |
| R2 PR de código | PR #126: CI verde en cada commit previo, en re-corrida tras R3; merge en R4. Medición A/B hecha |
| R2b Workflow de un solo uso (`db push`) | Hecho: PR #127 mergeado 2026-10-02 |
| R1 Producción nueva | **Hecho 2026-10-05**: proyecto `ytlyphlgyhgztkfxwojt` (`us-east-2`), GO/NO-GO en PASS |
| R3 Corte y verificación | **Hecho**: `GO_LIVE` 2026-10-06 ~01:05 UTC (19:05 CDMX). Pendiente: vigilancia a las 24 h y cron de las 08:00 UTC |
| R4 Cierre | En curso: `cle1` en producción, test en 17.11, `escala` en verde y decisión 021 hechos. Pendiente: vigilancia de 24 h (08:00 UTC), 7 días con la vieja pausada, borrarla, quitar su ref y `db-push-una-vez.yml`, cerrar #124 y archivar este plan |
