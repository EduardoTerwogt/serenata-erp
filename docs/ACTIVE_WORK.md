# Trabajo activo

**Última actualización:** 2026-09-24 (sesión 8 — en curso)

## Estado

**`docs/PLAN.md` — Vacío.** Sesión 8: fix de Presence en la colaboración en
vivo (aviso "X está editando" pegado), en PR — rama
`claude/trusting-pasteur-rc5mij`. Plan aprobado por el usuario; diseño y
motivos en `docs/decisions/016-presence-realtime-js-fijado-y-presupuesto.md`.

## En curso — sesión 8

- **Causas raíz:** (1) `@supabase/realtime-js` 2.100.0 no aplicaba las bajas
  de Presence; (2) el servidor cerraba el canal por > 5 eventos de Presence en
  30 s (heartbeat de 15 s + `track()` por tecla; 427 cierres en 24 h en test).
- **Cambios:** `realtime-js` fijado en 2.112.0 (`overrides`), presupuesto de
  Presence (`lib/realtime/presence-publisher.ts`), sin heartbeat, aviso
  separado del bloqueo de datos (se quita solo al salir), reconexión sin
  fallos silenciosos.
- **Validación local:** `tsc` limpio, lint 0 errores (8 warnings previos),
  `npm test` 979/979, build OK, e2e smoke 26/26.
- **Pendiente para mergear:** CI completo del PR (incluido `live` con los
  tests nuevos de Presence), cero `ClientPresenceRateLimitReached` en los
  logs de Realtime de test durante la corrida, y repro manual en el Preview
  con `prueba-manual@` y `prueba-manual-2@serenata.test`.

## Completado en la sesión 7

- **Advisor de Supabase sin WARN** — PR
  [#91](https://github.com/EduardoTerwogt/serenata-erp/pull/91) (`fe5e4fe`):
  `search_path` fijo en 10 funciones vía `ALTER FUNCTION … SET` (sin
  reescribir cuerpos) y `pg_trgm` movida a `extensions`. Test y prod: 0 WARN.
- **Folios CC/CP por año** — PR
  [#92](https://github.com/EduardoTerwogt/serenata-erp/pull/92) (`410fdd8`):
  `siguiente_folio(serie, momento)` sobre `folio_contadores`; año en curso
  (hora CDMX) y consecutivo que reinicia cada año (decisión del usuario).
  2026 continúa (prod: CC 42 → 43, CP 105 → 106). Además: `LPAD` ya no
  trunca ≥ 100000 y anon/authenticated sin EXECUTE. Verificado en test y
  prod con transacciones revertidas (el contador no consume folios en
  rollback; confirmado que prod siguió en 42/105).
- **Configuración de Vercel (vía MCP)** — ver "Pasos manuales" abajo: los
  Previews apuntaban a la base de **producción**; ahora usan test.

## Tests ejecutados

- Local en ambos PRs: `tsc` limpio, lint 0 errores (8 warnings previos),
  `npm test` 963/963.
- CI de #91 y #92: `test`, `fresh-db`, `smoke-and-critical`, `live` y
  Preview de Vercel en verde.

## Pasos manuales M1/M2/V1/V2 — todos cerrados

- **M1:** `NEXTAUTH_SECRET` eliminada de Vercel en todos los entornos
  (el usuario borró la última entrada de Development; verificado vía MCP).
  Sesiones abiertas de staff y Portal sobrevivieron al redeploy.
- **M2:** los Previews usaban la base de **producción**. Estado actual de
  Vercel `serenata-erp`: Supabase (URL/anon/service_role/JWT secret) y
  Google (carpetas Drive, refresh token, Sheets, Calendar) tienen entradas
  separadas — Production+Development → prod; Preview → `serenata-erp-test`
  y la carpeta Drive de test de CI, **sin** refresh token (Drive apagado en
  Preview a propósito) ni Sheets/Calendar. `GOOGLE_CLIENT_ID/SECRET`,
  `AUTH_SECRET` y el resto siguen compartidos.
- **V1:** colaboración verificada en Preview con 2 usuarios. Bug leve de
  Presence (el aviso de edición no se quita al salir) en ROADMAP → "Después".
- **V2:** no existe login con Google (`auth.ts` solo `Credentials`); Drive de
  prod funcionando (subidas reales hasta el 21-sep).
- Usuarios de prueba **solo en `serenata-erp-test`**:
  `prueba-manual@serenata.test` y `prueba-manual-2@serenata.test`
  (contraseñas entregadas al usuario en la sesión, no en el repo).

## Pendiente del usuario

- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).

## Deuda técnica

- Drive apagado en Preview a propósito. Si hace falta: token vía
  `/api/integrations/drive/authorize` con una cuenta de pruebas + carpeta de
  test accesible con scope `drive.file`.
- Las secuencias `seq_cc_2026`/`seq_cp_2026` quedaron sin uso tras #92
  (no se borraron; se pueden eliminar en una limpieza futura).
- **Job `live` inestable en `main` (2026-09-24):** tras el merge de #92,
  `live` falló 2 veces seguidas en tests distintos con el mismo código que
  pasó en el PR — `cotizaciones-colaboracion-escala` (`ECONNRESET` del
  servidor Next local al crear la cotización) y el test causal de `bulk`
  (B recibió el evento pero no releyó dentro de la ventana de 3 s). Un solo
  re-run del job en `a904f8d` pasó completo. Si se repite, revisar
  primero la ventana de 3 s del test causal (sensible a runner lento) y
  la carga del servidor Next en el test de escala; no es regresión de
  #91/#92 (no tocan Realtime ni ese flujo). **Hipótesis (sesión 8):** el
  cierre de canales por límite de Presence (decisión 016) hacía perder
  eventos `*_confirmed`; verificar si `live` se estabiliza tras ese fix.
- El MCP de Vercel no tiene alcance de team para logs de runtime ni para
  abrir URLs de deployment (403); la verificación de Previews se hizo por
  los logs de Supabase.

## Siguiente paso

Cerrar el PR de Presence (sesión 8, arriba). Después, priorizar en Chat
(`docs/ROADMAP.md` → "Siguiente"/"Después"; incluye la decisión de borrar
`cliente_id_backfill_clasificacion`).
