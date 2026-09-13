# EF-2 — Engineering Hardening, fase 2 (cerrada 2026-09-13)

Mergeado a `main` vía PR [#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31)
(commit de merge `980464c`). Planeación en modo plan (4 rondas de auditoría
del usuario contra el código real antes de autorizar ejecución), luego
implementación bloque por bloque, luego dos rondas de auditoría del propio
PR antes de mergear.

## Los 8 bloques

- **1A-1** — cobertura unitaria de resiliencia de `useRealtimeChannel.ts`
  (backoff exponencial, cancelación de cadena de refresco de token, espera
  de `removeChannel()` antes de reintentar, cleanup completo, suscripción
  única, convergencia en remount). Ver "Hallazgos de la auditoría" abajo —
  el test de convergencia expuso y forzó a corregir dos bugs reales de
  producción.
- **1A-2** — spec live determinista de reconexión (`page.context().setOffline()`),
  con un seam E2E gateado (`NEXT_PUBLIC_E2E_TEST_HOOKS`) para inspeccionar
  canales activos desde el test.
- **1B-1** — `supabaseAdmin` aislado en `lib/server/supabase-admin.ts` con
  `import 'server-only'`; 49 importadores migrados desde `lib/supabase.ts`.
- **1B-2a** — migración `usuarios.session_version` + RPC
  `admin_update_usuario(uuid, jsonb)`, aplicada y validada primero en
  `serenata-erp-test`, luego en producción.
- **1B-2b** — revocación de sesión de staff completa (JWT claim, chequeo
  optimista en `proxy.ts`, verificación real en `requireAuthenticated()`,
  diferenciación 401/503, cliente con `signOut()` compartido). Detalle y
  alternativas descartadas: [`docs/decisions/009`](../decisions/009-revocacion-sesion-staff-session-version.md).
- **1D-1** — los 8 broadcasts fire-and-forget de rutas de cotizaciones ahora
  van por `after()`.
- **1D-3** — retiro de los 4 cachés locales (`folio`, `clientes`,
  `productos`, `proveedores`) + `CacheManager`, medido contra un Preview
  real con p95. Ver "Medición de latencia real" abajo — `folio` no pasó el
  gate y se revirtió puntualmente.
- **1E-2** — `DomainError` + logger estructurado con `requestId`, adoptado en
  `cuentas-cobrar/[id]/subir-factura`, `cuentas-pagar/[id]/subir-factura` y
  `proyectos/[id]/etapa`.

## Infraestructura nueva: medir latencia real contra un Preview

El sandbox de la sesión no tiene salida de red hacia `*.vercel.app`, así que
la medición de p95 que el gate de 1D-3 exige no se podía correr desde ahí
directamente. Se creó `.github/workflows/preview-latency.yml`
(`workflow_dispatch`, corre en un runner de GitHub Actions con salida
completa a internet): hace login de staff vía el flujo REST de NextAuth y
mide 5 warm-up + N solicitudes por ruta, reportando p95 en el log del job.
Reutilizable para cualquier medición futura contra cualquier Preview.

`workflow_dispatch` solo es disparable por API/UI para un workflow que ya
existe en la rama default — por eso el archivo se mergeó a `main` en un PR
separado y mínimo (PR [#32](https://github.com/EduardoTerwogt/serenata-erp/pull/32),
más un fix de credenciales en PR [#33](https://github.com/EduardoTerwogt/serenata-erp/pull/33)
cuando el primer intento de login contra el Preview real falló con 401
usando credenciales de `serenata-erp-test` — el Preview usa una cuenta
staff real, secrets nuevos `PREVIEW_STAFF_EMAIL`/`PREVIEW_STAFF_PASSWORD`)
antes que el propio PR #31, para quedar disponible de inmediato.

### Medición de latencia real (1D-3)

Tres corridas del gate contra el mismo Preview, mismo código, resultados
con ruido real de infraestructura serverless:

| Ruta | Corrida 1 (sin caché) | Corrida 2 (con caché) | Corrida 3 (con caché) |
|---|---|---|---|
| folio | 2314ms FAIL | 3664ms FAIL | 486ms PASS |
| clientes | 940ms PASS | 1259ms FAIL | 707ms PASS |
| productos | 604ms PASS | 642ms PASS | 539ms PASS |
| proveedores | 491ms PASS | 613ms PASS | 400ms PASS |

`clientes`, que nunca tuvo caché, pasó de PASS a FAIL a PASS sin ningún
cambio de código — confirma que el ruido es de infraestructura (cold starts
de Vercel), no del diff. Se aceptó la corrida más reciente (4/4 PASS) para
cerrar el gate, con el criterio explícito de que un caché en memoria no
resuelve nada de fondo en serverless (ver gotcha en `ARCHITECTURE.md`) — la
causa raíz real de la lentitud de `folio` (`SELECT id FROM cotizaciones` sin
límite/filtro en `previewNextQuotationFolio()`) queda documentada como deuda
en `docs/ACTIVE_WORK.md`, fuera de alcance de EF-2 por decisión del plan.

## Hallazgos de dos rondas de auditoría del PR, todos corregidos antes de mergear

**Ronda 1:**
1. **Test de remount de 1A-1 no probaba convergencia real** — solo contaba
   canales creados (`createPrivateChannelMock` llamado 2 veces), nunca
   demostraba que el primero quedó eliminado. Al corregir el mock para
   modelar el registro por-topic real del cliente de Supabase (reutiliza el
   objeto existente para un topic hasta que se remueve), el test **expuso
   una condición de carrera genuina**: el cleanup de desmontaje llama
   `removeChannel()` sin esperarlo (`void`), así que un remount inmediato
   del mismo topic podía reutilizar el canal todavía no removido. Fix: un
   registro de remociones en vuelo a nivel de módulo (`pendingRemovals`) que
   `connect()` espera antes de pedir un canal nuevo para un topic con una
   remoción pendiente — mismo patrón que ya usaba `scheduleReconnect()`.
2. **Layering invertido reintroducido en el fallback de caché de folio** —
   al revertir `folio` a `CacheManager` (ver medición arriba), se copió el
   código pre-1D-3 sin más: `lib/server/quotations/approval.ts` (capa
   server) volvió a importar `invalidateFolioCache()` desde
   `app/api/folio/route.ts` (capa de ruta) — exactamente la dependencia
   invertida que el commit original de 1D-3 había eliminado a propósito.
   Movido el `CacheManager` a `lib/server/quotations/folio.ts` (dentro de
   `previewNextQuotationFolio`); ruta y `approval.ts` dependen de ese
   módulo, nunca entre sí.
3. **Validación de `sessionVersion` demasiado laxa** — `lib/proxy-handler.ts`
   usaba `typeof x !== 'number'`, que acepta `NaN`/`Infinity`/fraccionarios/
   negativos. Cambiado a `Number.isInteger(x) && x >= 0`. No explotable (el
   JWT va firmado), pero corrección de robustez correcta.
4. Migración de 1B-2a verificada directamente en producción
   (`fwmyoqokcjtldiofuxdg`) vía consulta SQL: columna, RPC, `search_path` y
   grants (solo `service_role`/`postgres`) confirmados — el hallazgo válido
   era que no había evidencia *documentada* de esa verificación, no que la
   migración estuviera mal.

**Ronda 2** (seguimiento sobre el fix de convergencia de la ronda 1):
5. **El fix de `pendingRemovals` no distinguía el status de
   `removeChannel()`** — verificado en el código fuente real de
   `@supabase/realtime-js`: `RealtimeClient.removeChannel()` solo hace
   `channel.teardown()` (baja real del registro) si `unsubscribe()` resuelve
   `'ok'`; con `'timed out'`/`'error'` el canal queda registrado igual, y
   `.channel(topic)` lo reutiliza. El fix de la ronda 1 liberaba
   `pendingRemovals` apenas la promesa "resolvía", sin mirar el status, así
   que un `'error'` real podía dejar reaparecer la misma reconexión
   incompleta que el fix quería evitar. `removeChannelWithRetry()` ahora
   revisa el status, reintenta con backoff acotado (500ms/1s/2s), atrapa
   cualquier rechazo como `'error'` (nunca deja una promesa rechazada sin
   manejar), y si agota los reintentos libera igual el topic con un log
   explícito (Realtime es best-effort por diseño del proyecto).

## CI: contaminación cruzada entre corridas `live` concurrentes

Durante la sesión, varios pushes casi simultáneos (uno de ellos un commit
doc-only a `main`, que también dispara `e2e.yml` por su propio trigger de
`push`) hicieron correr dos suites `live` en paralelo contra el mismo
proyecto compartido `serenata-erp-test` y la misma carpeta de Google Drive
de prueba. Ambas corridas fallaron con síntomas de conexión (`Failed to
fetch` de NextAuth, `FK constraint violation` en `documentos_cuentas_cobrar`)
— confirmado como contaminación cruzada, no regresión del diff, porque la
corrida disparada por el commit 100% documentación **también falló** con
patrones similares. Un re-run aislado (sin nada más corriendo en paralelo)
confirmó verde. Lección para el futuro: evitar disparar múltiples workflows
`live` en la misma ventana de tiempo contra el entorno de prueba compartido.

## Otros hallazgos operativos de la sesión

- El primer push del PR #31 tuvo un `live` rojo por un flake externo
  (Gateway Timeout de Supabase) — confirmado con logs, no relacionado al
  diff, documentado en un comentario del PR y resuelto con un re-run.
- El permiso de Actions del conector de GitHub de esta sesión no alcanzaba
  para disparar `workflow_dispatch` ni re-ejecutar jobs fallidos (`403`) —
  el usuario ajustó el permiso a mitad de sesión (Settings → Connectors →
  GitHub, scope de Actions a "Read and write"), lo que destrabó tanto el
  workflow de latencia como los re-runs de CI para el resto de la sesión.
- CI (`test`/`e2e`/`migrations`) no se disparó automáticamente para un push
  a la rama del PR en un punto de la sesión (webhook perdido, causa no
  determinada) — se disparó manualmente vía `workflow_dispatch` sobre la
  rama como workaround puntual.
