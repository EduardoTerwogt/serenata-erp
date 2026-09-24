---
paths:
  - "lib/realtime/**"
  - "hooks/useQuotationPresence.ts"
  - "app/api/realtime/**"
---

- **PostgreSQL es la autoridad.** Presence nunca decide conflictos.
- Desde el navegador solo se emite **Presence**. Broadcast cliente→cliente no
  transporta datos persistentes — la política RLS de `realtime.messages` lo cierra.
- Los avisos son best-effort: `channel.send()` cae a REST si el canal no está unido,
  devuelve 403 y el error se traga. La convergencia la garantiza la reconciliación
  contra la base, no el canal.
- Todo reconnect debe limpiar listeners, timers y cadenas de refresco de token
  anteriores. Su ausencia causó fugas reales ya corregidas.
- La infraestructura genérica vive en `lib/realtime/useRealtimeChannel.ts`. Un módulo
  nuevo que necesite colaboración la **reutiliza**; no crea un segundo lifecycle.
- La reconciliación no pisa lo que el usuario está escribiendo: conserva filas en
  edición, agrega con `append`, y al reconstruir restaura foco y cursor.
- Contexto completo: `docs/decisions/002-*` y `docs/decisions/003-*`.
- **Presence solo vía `publishPresence`** (`lib/realtime/presence-publisher.ts`),
  nunca `channel.track()` directo: el servidor cierra el canal con > 5 eventos de
  Presence por cliente en 30 s. `@supabase/realtime-js` está fijado en 2.112.0 —
  no subirlo sin leer `docs/decisions/016-*`.
