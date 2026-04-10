# FASE 2 — Separación por dominio server-side

## Objetivo
Eliminar `lib/db.ts` como punto central excesivo sin cambiar contratos, rutas, schema, SQL ni RPC.

## Qué cambió
- Se extrajo la implementación de acceso a datos a repositorios server-side por dominio:
  - `lib/server/repositories/quotations.ts`
  - `lib/server/repositories/responsables.ts`
  - `lib/server/repositories/proyectos.ts`
  - `lib/server/repositories/cuentas-pagar.ts`
  - `lib/server/repositories/cuentas-cobrar.ts`
- `lib/db.ts` quedó reducido a una fachada de compatibilidad que reexporta esos módulos.

## Por qué fue seguro
- No se tocaron tablas, schema, SQL ni RPC.
- No se cambiaron nombres públicos de funciones exportadas.
- Los imports existentes desde `@/lib/db` siguen resolviendo.
- La lógica funcional se movió, no se rediseñó.

## Resultado
- Menos acoplamiento.
- Responsabilidades claras por dominio.
- `lib/db.ts` deja de ser un god file operativo.
- Se mantiene compatibilidad exacta con el código existente.

## Compatibilidad esperada con checks remotos
- Vercel - Deployment has completed: OK
- E2E / smoke-and-critical (push): OK
- Test Suite / test (push): OK
