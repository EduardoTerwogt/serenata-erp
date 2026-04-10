# FASE 4 — Unificar acceso a datos en cliente

## Objetivo
Reducir duplicación en fetch, parseo JSON y manejo de errores sin cambiar endpoints ni comportamiento visible.

## Qué cambió
- Se creó `lib/client/api.ts` como capa compartida para acceso a datos en cliente.
- La nueva capa centraliza:
  - lectura JSON exitosa
  - parseo seguro de errores
  - envío JSON
  - envío FormData
  - lectura binary/arrayBuffer
- `app/components/cuentas/hooks/useCuentasCobrar.ts` ahora usa esa convención compartida.
- `app/components/cuentas/hooks/useCuentasPagar.ts` ahora usa esa convención compartida.
- `lib/services/quotation-service.ts` ahora usa la misma convención para lecturas y mutaciones principales.

## Por qué fue seguro
- No se cambió ningún endpoint.
- No se cambió ningún contrato de respuesta esperado por la UI.
- Se conservaron los mensajes fallback ya usados por la app.
- La lógica funcional de cada hook/servicio sigue siendo la misma; solo se eliminó repetición.

## Resultado
- Menos duplicación de fetch/error parsing.
- Convención clara para llamadas API del cliente.
- Mantenimiento más barato para fases posteriores.

## Compatibilidad esperada con checks remotos
- Vercel - Deployment has completed: OK
- E2E / smoke-and-critical (push): OK
- Test Suite / test (push): OK
