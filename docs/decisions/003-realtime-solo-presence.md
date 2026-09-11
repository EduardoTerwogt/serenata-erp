# 003 — Realtime del navegador es solo Presence, nunca autoridad

## Contexto

Se usa Supabase Realtime para saber quién está trabajando en una cotización. La
tentación natural es usar ese mismo canal para propagar los cambios de datos.

## Decisión

Desde el navegador, Realtime solo emite **Presence**. Los avisos son best-effort:
si el canal no está unido, `channel.send()` cae a REST, devuelve 403 y el error se
traga — medido, no supuesto. La convergencia real la da la **reconciliación contra
la base**. La política RLS de INSERT sobre `realtime.messages` solo permite
`presence` a `authenticated`; Broadcast desde el navegador está cerrado a nivel base.

## Razón

Si los avisos fueran la garantía de convergencia, una pérdida silenciosa de canal
dejaría a un usuario con datos viejos sin que nada lo detectara. Con la base como
garantía, el canal solo acelera.

## Alternativas descartadas

- **`postgres_changes` desde el navegador** — exigiría políticas RLS de lectura que
  expondrían todas las cotizaciones a la llave anónima.
- **Broadcast cliente→cliente con datos persistentes** — existió hasta la Fase 6 y
  se retiró; ver el archivo histórico.

## Consecuencias

- Todo reconnect debe limpiar listeners, timers y cadenas de refresco de token
  anteriores — su ausencia causó fugas reales, ya corregidas.
- La infraestructura genérica vive en `lib/realtime/useRealtimeChannel.ts`;
  `useQuotationPresence` es un wrapper fino.
- Un módulo nuevo que necesite colaboración **reutiliza esa infraestructura**, no
  crea un segundo lifecycle.
