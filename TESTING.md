# Testing

## Regla de oro

**No se pushea con tests en rojo.** Si algo falla: diagnosticar la causa raíz,
arreglarla y volver a correr. Un test solo se modifica cuando un cambio de producto
lo justifica — nunca para que deje de fallar.

## Los niveles

| Nivel | Comando | Qué prueba | Dónde corre |
|---|---|---|---|
| Unit | `npm test` | Vitest sobre `lib/**/__tests__/*.test.ts` — cálculos, mappers, estados, repositorios. | Local y CI |
| E2E smoke | `npm run test:e2e:smoke` | Navegación y carga de pantallas, con las APIs **mockeadas**. | Local y CI |
| E2E critical | `npm run test:e2e:critical` | Flujos de negocio completos, con las APIs **mockeadas**. | Local y CI |
| E2E live | `npm run test:e2e:live` | Servidor Next real contra **Supabase y Drive de prueba reales**. | **Solo CI** |
| E2E escala | `npm run test:e2e:escala` | Latencia de las lecturas de Cuentas contra el dataset de carga (miles de proyectos). Aparte del gate de PR (D18). | **Solo CI**, manual y semanal (`escala.yml`) |
| Consistencia de datos | `select auditar_consistencia()` / Admin → "Consistencia de datos" | 27 guardas permanentes del modelo (dinero, renglones, K4, folios); cron diario en `/api/keep-alive`. `plpgsql_check` en CI revisa las funciones. Generador, medición e índices: `scripts/db/escala-*.sql`, `indices-sin-uso.sql`. | Producción y test, a demanda |
| Cuenta de proyecto (SQL) | `psql -d <bd> -v ON_ERROR_STOP=1 -f scripts/db/cuenta-proyecto-prueba.sql` | #140: invariante `cobrado = a transferir + SAT + utilidad` (`cuadre_diferencia`), retención de IVA real dentro/fuera de tolerancia, tres regímenes y cierre mensual sin ISR/proveedores. Sobre la fixture de `cuentas-equivalencia.sql`; termina en `ROLLBACK`. | Local y test, a demanda |
| Migrations | workflow `Migrations` | Que `db/migrations/*.sql` reconstruye el schema completo desde un Postgres vacío (Fase 4.5) — via Supabase CLI, sin tocar ningún proyecto real. | **Solo CI** |

Además: `npx tsc --noEmit` y `npm run lint` antes de cualquier commit que toque
código.

- **Guardias de la API:** `__tests__/api-route-guards.test.ts` (corre con `npm test`) exige que cada método de cada
  `app/api/**/route.ts` llame `await requireSection/requireAnySection(...)` antes de leer el body o la base, y que toda ruta
  que el proxy deja pasar sin sesión (portal, `keep-alive`, `internal`, OAuth de Drive) esté declarada con su guardia propia.
  Una ruta nueva que no cumpla falla el test; si de verdad es pública o solo pide sesión, se declara en `PUBLICAS` / `SOLO_SESION`.
- **Un push de solo `.md` a `main` no dispara CI** (`paths-ignore` en `e2e.yml`, `test.yml` y `migrations.yml`, solo en `push`).
  En `pull_request` no se filtra por ruta: un check omitido queda pendiente y bloquea el merge.

## Por qué el nivel live importa

Los niveles mockeados responden siempre 200: no pueden decir si el servidor y la
base se comportan como se espera. Los tres defectos de persistencia y colaboración
arreglados el 2026-09-09 (ids de partidas recreados en cada guardado, PATCH que
pisaba el campo del otro, partidas sin `ORDER BY`) los cazó **solo** el nivel live.

`live` corre en cada evento de Pull Request y en cada push a `main` (igual que
`test` y `smoke-and-critical`), y **falla el workflow** — ya no es informativo. El
deploy a Vercel no se bloquea por eso: lo dispara el push, no este workflow. Como
corre también en el PR, ya da señal real antes del merge — no hay que esperar a que
el cambio llegue a `main` para saber si `live` sigue en verde.

## Correr live: qué hace falta

No corre en local sin credenciales; `liveEnabled` lo salta entero. En CI se
configura con secretos de GitHub Actions (Settings → Secrets and variables →
Actions):

| Secreto | Para qué |
|---|---|
| `TEST_SUPABASE_URL` / `TEST_SUPABASE_ANON_KEY` / `TEST_SUPABASE_SERVICE_ROLE_KEY` | Proyecto Supabase de prueba (`serenata-erp-test`), aislado de producción |
| `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` | Usuario de prueba |
| `DRIVE_TEST_FOLDER_ID` | Carpeta de Drive exclusiva de pruebas: `1cofExiUSPDRq9CeH6oU-WSBev1I56m-a` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Mismos valores que Vercel |
| `GOOGLE_DRIVE_REFRESH_TOKEN_TEST` | Token separado del de producción (mínimo privilegio y cuota aparte) |

El job de `live` exporta `GOOGLE_DRIVE_FOLDER_ID` y `GOOGLE_DRIVE_FOLDER_ID_CUENTAS`
con el valor de `DRIVE_TEST_FOLDER_ID` **solo dentro de ese job**, así que no existe
ruta de código por la que un test pueda escribir en las carpetas reales.

### El guard que evita el falso verde

Si faltara una credencial, Playwright marcaría todo como *skipped* y el job quedaría
**verde sin haber probado nada**. Por eso el job define `PLAYWRIGHT_LIVE_REQUIRED=true`
y `tests/e2e/live/cotizaciones-colaboracion.spec.ts` falla explícitamente nombrando
lo que falta. No quitar esa variable.

### Seed de Cuentas en `serenata-erp-test`

`scripts/seed-cuentas-test.sql` crea las formas de datos de producción que
Cuentas tiene que manejar: orden vieja sin pagar, sueltas sin factura y sin
proveedor, grupo con pago parcial, cobro PPD en dos pagos, facturas en
`pendiente` y `revision`, anticipo sin factura, principal con complementarias
y cuentas sin proyecto. Todo lleva el prefijo `SEEDCU` y el script es
idempotente: borra lo suyo y lo recrea. Se corre pegándolo en el SQL Editor de
`serenata-erp-test` (o con `psql -f`) y se niega a correr en una base sin la
tabla `loadtest_runs`, que solo existe en test. Los tests no lo necesitan;
sirve para revisar pantallas y RPCs contra datos con forma real.

El seed también carga (si no hay una vigente) la **constancia fiscal de prueba de
Serenata** (`datos_fiscales_serenata`, RFC `SHO100101AB1`, el que usan los fixtures de
XML): las rutas de Subir factura leen de ahí el RFC propio y, sin constancia, fallan
explícito (#123, B6a). Ya no hay variable `SERENATA_RFC` en los jobs de CI.

### Specs de #123 (facturas y pagos ligados)

Con mocks (escritorio y móvil), en `tests/e2e/critical/`: `cuentas-acciones.spec.ts` (menú,
Registrar pago con el caso del issue, Subir factura y complemento, Estado de cuenta, chips),
`cuentas-detalle.spec.ts` (el detalle abre las ventanas, P22), `admin-datos-fiscales.spec.ts` y
el caso de pagos del Portal en `portal-factura.spec.ts`. Unitarios: reparto en centavos
(`app/cuentas/components/acciones/__tests__/`), servicios de `lib/server/cuentas/`
(`facturas`, `datos-fiscales`, `constancia-serenata`, `portal-pagos`) y las rutas nuevas en
`app/api/__tests__/`. Los specs `live` de concurrencia cubren doble clic, la misma cuenta en
dos facturas, pagos simultáneos y el ABBA de órdenes de pago.

## Modo bypass (solo smoke y critical)

Con `PLAYWRIGHT_E2E_BYPASS=true` más la cookie `e2e-bypass=1` que pone
`tests/e2e/utils/auth.ts`, se salta el login real. Nunca se activa en el nivel live:
ahí se entra con credenciales de verdad, y `login()` acepta un usuario distinto para
poder abrir dos sesiones simultáneas en las pruebas de colaboración.

## Orden recomendado

```bash
npx tsc --noEmit
npm run lint
npm test
npm run test:e2e:smoke
npm run test:e2e:critical
npm run build     # si el cambio toca TS/TSX, rutas o config de Next
```

Y después del push, **confirmar que CI quedó en verde de verdad** — incluido el job
`live`. Que el push tenga éxito no prueba nada.

## Limitación del sandbox

En el entorno de agente actual el nivel live no se puede correr en local: la salida
de red hacia `*.supabase.co` está bloqueada. Mientras eso no cambie, cada iteración
sobre un test live cuesta ~20 min de CI. Reproducir primero en la suite mockeada
(segundos) siempre que el escenario lo permita.
