# 016 — Presence: `realtime-js` fijado en 2.112.0, presupuesto de envíos y aviso separado del bloqueo de datos

## Contexto

Bug reportado en V1 (2026-09-24): en la colaboración en vivo de Cotizaciones, el
aviso "X está editando esta sección" nunca se quitaba — ni al salir de la
sección ni al salir de la cotización (seguía en "viendo"). En ambos sentidos.

Se encontraron **dos causas raíz independientes**:

1. **Bug de `@supabase/realtime-js` 2.100.0.** Al avisar a los listeners de un
   cambio de Presence, `presenceAdapter.transformState()` borraba `phx_ref` de
   los registros *ya guardados* (no de una copia). Las bajas que manda el
   servidor se buscan por `phx_ref`, así que nunca encontraban qué quitar: cada
   `track()` de A se acumulaba en B y `sectionEditors` tomaba uno viejo.
   Reproducido con el adaptador real (2.100.0 acumula, 2.112.0 limpia).
   Corregido upstream en 2.111.0.
2. **Límite de Presence del servidor.** Supabase Realtime cierra el canal
   (`ClientPresenceRateLimitReached` + `shutdown_response`) si un cliente manda
   más de **5 eventos de Presence (`track`/`untrack`) en una ventana fija de
   30 s**, contada por unión al canal — `supabase/realtime`,
   `presence_handler.ex` (`limit_client_presence_event`) y
   `realtime_channel.ex` (`max_calls: 5, window_ms: 30_000`). El heartbeat de
   15 s (2 de los 5) y un `track()` por tecla en Partidas lo excedían siempre:
   **427 cierres en 24 h** en `serenata-erp-test`. Cada cierre cortaba Presence
   *y* los broadcasts `*_confirmed` hasta reconectar. El bug 1 escondía estos
   cierres (los registros viejos quedaban pegados); con solo arreglar el bug 1,
   A habría parpadeado en B cada vez que escribía.

## Decisión

1. **`@supabase/realtime-js` fijado en 2.112.0** vía `overrides` en
   `package.json`, sin subir `@supabase/supabase-js` (2.100.0).
   - No 2.113.0+: desde esa versión, si el cliente tiene callback
     `accessToken` (supabase-js **siempre** lo configura; sin sesión de
     Supabase Auth devuelve la anon key), el callback manda sobre
     `setAuth(token)` y en cada heartbeat (~25 s) reemplaza nuestro JWT propio
     de Realtime (`lib/realtime/authorize.ts`) por la anon key → el canal
     privado deja de estar autorizado. Verificado en ejecución.
   - No subir todo `supabase-js`: trae reintentos automáticos de postgrest en
     GET (hasta ~7 s ante 503/520/red) y cambios de auth que no necesitamos.
2. **Presupuesto de Presence en el cliente** (`lib/realtime/presence-publisher.ts`),
   único camino para publicar (`publishPresence` de `useRealtimeChannel`):
   token bucket de 2 con +1 cada 15 s (≤ 4 envíos en cualquier ventana de
   30 s; demora máxima de un cambio: 15 s), cambios agrupados en 150 ms, solo
   se envía si el estado difiere de lo último enviado por ese canal, y siempre
   el estado más reciente. A nivel de módulo (compartido por la pestaña). Los
   reintentos y el `untrack` al salir también consumen presupuesto; sin
   presupuesto, el `untrack` se omite (el `phx_leave` ya borra el registro).
3. **Sin heartbeat de Presence.** Compensaba "diffs perdidos" que en realidad
   eran el bug 1. El socket es TCP; si cae, al reconectar el servidor manda el
   estado completo y el publicador vuelve a publicar en cada `SUBSCRIBED`.
4. **El aviso se separa del bloqueo de datos** (decisión del usuario: el aviso
   se quita *solo al salir* de la sección). Los timers de inactividad de 5 s
   (`SECTION_IDLE_RELEASE_MS`, `ITEM_CELL_IDLE_RELEASE_MS`) sueltan únicamente
   el bloqueo de datos (`*LockHeldRef` / `itemFocusedCellsRef`), que es lo que
   deja a la reconciliación aplicar cambios ajenos aunque el cursor siga ahí.
   El aviso de sección se quita en el blur de la sección; el de celda, en el
   blur de la celda (de inmediato, aunque su PATCH siga en vuelo).
5. **Reconexión sin fallos silenciosos:** `scheduleReconnect` usa
   `removeChannelWithRetry`, y si registrar listeners lanza (en 2.112 también
   con el canal en estado *joining*) se registra el error y se reconecta con
   backoff, en vez de dejar un `connect()` rechazado sin rastro.

## Razón

- El fix de la librería es el oficial de Supabase; fijar la versión exacta
  evita el cambio de token de 2.113 sin arrastrar el resto del diff.
- Enviar solo cuando cambia y agrupar ráfagas es lo que recomienda Supabase
  para este error. Las alternativas eran peores: quitar el resaltado de celda
  elimina una función; mandar awareness por Broadcast desde el navegador está
  cerrado por RLS (decisión 003); pasarla por una ruta API agrega carga al
  servidor en cada foco; subir el límite del proyecto no corrige el envío por
  tecla y multiplica el tráfico hacia todos los suscriptores.
- Separar aviso y bloqueo conserva exactamente la convergencia de datos de
  antes y cumple el comportamiento visual pedido.

## Consecuencias

- **Deuda controlada:** `realtime-js` queda fijo. Para subir a ≥ 2.113 hay que
  pasar primero nuestro JWT de Realtime con la opción `accessToken` de
  `createClient` en `lib/supabase-browser.ts` (y quitar el `setAuth` manual de
  `authorize.ts`), y revisar los reintentos de postgrest. La guarda
  `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso
  (y también si se vuelve a una versión con el bug de Presence).
- Nunca llamar `channel.track()` directo: siempre `publishPresence`.
- En ráfagas (cruzar varias celdas con Tab), el resaltado de celda en el otro
  navegador puede tardar hasta 15 s en mostrar la celda final. Es informativo.
- Si alguien deja el cursor en un campo y se va, el aviso sigue hasta que salga
  o cierre la pestaña (comportamiento pedido).
- Una pestaña en segundo plano mucho tiempo puede perder el socket (Chrome
  frena timers); B verá que A salió y A reaparece al volver. Antes pasaba igual
  pero el bug 1 lo escondía. No afecta datos.
- Corte abrupto de red: el servidor quita al usuario cuando detecta el socket
  muerto (decenas de segundos), no al instante.
- Criterio de salud en CI: el test live "ningún canal se cerró por el límite de
  Presence" y cero `ClientPresenceRateLimitReached` en los logs de Realtime de
  `serenata-erp-test`.
