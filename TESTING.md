# Testing

## Regla de oro

**No se pushea con tests en rojo.** Si algo falla: diagnosticar la causa raíz,
arreglarla y volver a correr. Un test solo se modifica cuando un cambio de producto
lo justifica — nunca para que deje de fallar.

## Los cuatro niveles

| Nivel | Comando | Qué prueba | Dónde corre |
|---|---|---|---|
| Unit | `npm test` | Vitest sobre `lib/**/__tests__/*.test.ts` — cálculos, mappers, estados, repositorios. 351 tests / 45 archivos. | Local y CI |
| E2E smoke | `npm run test:e2e:smoke` | Navegación y carga de pantallas, con las APIs **mockeadas**. | Local y CI |
| E2E critical | `npm run test:e2e:critical` | Flujos de negocio completos, con las APIs **mockeadas**. | Local y CI |
| E2E live | `npm run test:e2e:live` | Servidor Next real contra **Supabase y Drive de prueba reales**. | **Solo CI** |

Además: `npx tsc --noEmit` y `npm run lint` antes de cualquier commit que toque
código.

## Por qué el nivel live importa

Los niveles mockeados responden siempre 200: no pueden decir si el servidor y la
base se comportan como se espera. Los tres defectos de persistencia y colaboración
arreglados el 2026-09-09 (ids de partidas recreados en cada guardado, PATCH que
pisaba el campo del otro, partidas sin `ORDER BY`) los cazó **solo** el nivel live.

`live` corre en cada push a `main` y **falla el workflow** — ya no es informativo.
El deploy a Vercel no se bloquea por eso: lo dispara el push, no este workflow.

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
