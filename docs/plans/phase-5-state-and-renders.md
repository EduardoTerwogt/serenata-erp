# FASE 5 — Reducir estado innecesario y renders evitables

## Objetivo
Reducir complejidad reactiva sin alterar rutas, contratos, estados de negocio ni UX visible.

## Qué cambió

### Cuentas
- Se estabilizaron las APIs cliente de cuentas con callbacks memoizados y retorno memoizado.
- `useCuentasPage` ahora consume métodos estables de los hooks de cuentas.
- La lógica derivada de búsqueda, filas tipadas, conteos y totales se movió a `app/components/cuentas/selectors.ts`.
- Los totales y filtros quedan memoizados y separados de la orquestación de carga.

### Nueva cotización
- `useQuotationForm` dejó de guardar en estado varias estructuras derivadas:
  - sugerencias de cliente
  - proyectos del cliente
  - sugerencias de producto por fila
- Esas estructuras ahora se derivan con `useMemo` desde:
  - catálogos cargados
  - texto capturado
  - `watchedItems`

## Por qué fue seguro
- No se cambiaron rutas ni endpoints.
- No se cambiaron payloads ni nombres públicos.
- No se tocaron SQL, RPC, schema ni integraciones externas.
- La UI sigue consumiendo las mismas props funcionales; solo bajó estado duplicado y trabajo reactivo.

## Resultado
- Menos riesgo de desincronización entre inputs, sugerencias y formulario.
- Menos recreación innecesaria de callbacks/objetos en hooks críticos.
- Filtros y agregados de cuentas quedan más claros y rastreables.

## Compatibilidad esperada con checks remotos
- Vercel - Deployment has completed: OK
- E2E / smoke-and-critical (push): OK
- Test Suite / test (push): OK
