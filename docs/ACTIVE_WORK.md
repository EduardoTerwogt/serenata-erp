# Trabajo activo

**Última actualización:** 2026-09-25 (sesión 10 — plan del rediseño de Cuentas escrito)

## Estado

**`docs/PLAN.md` — Borrador en refinamiento: "Rediseño de la sección
Cuentas".** El diseño final (`Cuentas-v2`) se recibió y auditó en la sesión
10. El plan tiene 9 decisiones confirmadas (D1–D9), 8 supuestos por confirmar
y 9 bloques (B0–B8). Falta la aprobación del usuario.
**Colaboración en vivo de Cotizaciones: cerrada** por decisión del usuario
tras la prueba manual del PR #93. Todo está en `main`.

## Completado en la sesión 8

- **Aviso "X está editando" pegado — resuelto.** PR
  [#93](https://github.com/EduardoTerwogt/serenata-erp/pull/93) (`3487981`).
  Dos causas raíz: (1) `@supabase/realtime-js` 2.100.0 no aplicaba las bajas
  de Presence; (2) el servidor cerraba el canal por > 5 eventos de Presence
  en 30 s (heartbeat de 15 s + `track()` por tecla; 427 cierres en 24 h en
  test). Cambios: `realtime-js` fijado en 2.112.0 (`overrides`), presupuesto
  de Presence (`lib/realtime/presence-publisher.ts`), sin heartbeat, aviso
  separado del bloqueo de datos (se quita solo al salir de la sección/celda),
  reconexión sin fallos silenciosos.

## Decisiones nuevas

- [`docs/decisions/016`](decisions/016-presence-realtime-js-fijado-y-presupuesto.md):
  `realtime-js` fijado en 2.112.0 (≥ 2.113 reemplaza nuestro JWT de Realtime
  por la anon key), presupuesto de Presence en el cliente, sin heartbeat, y el
  aviso de edición se quita solo al salir (decisión del usuario).

## Tests ejecutados

- Local: `tsc` limpio, lint 0 errores (8 warnings previos), `npm test`
  979/979, `npm run build` OK, e2e smoke 26/26, e2e critical 80/80.
- CI del PR #93: `test`, `fresh-db`, `smoke-and-critical`, `live` (58/58,
  incluidos los 3 tests nuevos de Presence) y Previews de Vercel en verde.
- Logs de Realtime de `serenata-erp-test` durante la corrida de `live`:
  **0 `ClientPresenceRateLimitReached`** (antes, 427 en 24 h).
- Prueba manual del usuario en el Preview con `prueba-manual@` y
  `prueba-manual-2@serenata.test`: OK.

## Pendiente del usuario

- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).

## Deuda técnica

- **`realtime-js` fijo en 2.112.0.** Para subir: pasar el JWT de Realtime con
  la opción `accessToken` de `createClient` (`lib/supabase-browser.ts`) y
  revisar los reintentos de postgrest. La guarda
  `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso.
- Presence tarda hasta 15 s en reflejar un cambio en ráfagas (presupuesto del
  servidor). Si algún día se quiere más fluidez: el límite por cliente es
  configurable por proyecto (`max_client_presence_events_per_window`) — ver
  ROADMAP → "Después".
- Drive apagado en Preview a propósito. Si hace falta: token vía
  `/api/integrations/drive/authorize` con una cuenta de pruebas + carpeta de
  test accesible con scope `drive.file`.
- Las secuencias `seq_cc_2026`/`seq_cp_2026` quedaron sin uso tras #92
  (se pueden eliminar en una limpieza futura).
- **Job `live` inestable en `main` (visto tras #92):** fallos intermitentes
  en el test causal de `bulk` y en el de escala. Hipótesis: el cierre de
  canales por límite de Presence (resuelto en #93) hacía perder eventos
  `*_confirmed`. Vigilar si se repite ahora.
- El MCP de Vercel no tiene alcance de team para logs de runtime ni para
  abrir URLs de deployment (403).
- **El build depende de descargar Inter de Google Fonts** (`app/fonts.ts`,
  `next/font/google`). El 2026-09-24 `Test Suite` falló en `c10c30b` (commit
  solo de docs) únicamente en `next build`, con "Can't resolve
  …/font/google/font"; el mismo código pasó antes y después. Si se repite,
  migrar a `next/font/local` con el archivo de la fuente en el repo.
- CI de `main` tras #93 (`e010b7a`): `Test Suite`, `Migrations` y `E2E`
  (smoke-and-critical + `live`) en verde. El `Migrations` del commit de merge
  falló antes de correr tests (rate limit al resolver el CLI de Supabase).

## Siguiente paso

El usuario revisa `docs/PLAN.md`: confirma la sección 4 (supuestos) y aprueba
los bloques. Con la aprobación se marca "Aprobado" y se empieza por B0. El zip
del diseño está en el chat de la sesión 10; B0 lo copia a
`docs/design/cuentas-v2/`. Si una sesión nueva no tiene el zip, pedirlo al
usuario.
