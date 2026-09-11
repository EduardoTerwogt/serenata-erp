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
