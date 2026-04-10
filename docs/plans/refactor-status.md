# Estado del refactor

## Punto de partida
El plan original planteaba fases de baseline, performance, separación por dominio, descomposición de páginas, capa cliente común, reducción de estado/renders, estandarización de UI interna y cleanup/documentación final.

## Estado final alcanzado en el repo
### Hecho
- FASE 0 — baseline y red de seguridad
- FASE 1 — performance inicial sin cambiar UX
- FASE 2 — separación por dominio server-side
- FASE 3 — descomposición de páginas/componentes grandes
- FASE 4 — unificación de acceso a datos en cliente
- FASE 5 — reducción de estado derivado y renders evitables
- FASE 6 — estandarización de UI interna sin rediseño
- FASE 7 — cleanup/documentación mínima y cierre del refactor

### Desviación importante registrada
Durante el proceso también quedó ejecutada una fase adicional de modularización de la capa PDF de cotización. Esa mejora se conservó, pero no sustituyó las fases 5–7 originales.

## Restricciones que se respetaron en el cierre de fases 5–7
- no cambiar rutas ni contratos públicos
- no tocar SQL, schema, RPC ni migraciones como parte de estas fases
- no introducir dependencias nuevas
- no rediseñar UI
- trabajar directo contra GitHub real con push final por fase completa

## Cambios relevantes del cierre
### FASE 5
- menos estado derivado en hooks de cuentas y cotización
- selectors puros para cuentas
- APIs cliente estabilizadas con callbacks/objetos memoizados

### FASE 6
- extracción mínima de `AppCard` y `MetricCard`
- adopción controlada en cuentas y cotización

### FASE 7
- documentación útil del estado del repo
- reglas explícitas para no reintroducir deuda del refactor
- registro final del alcance real alcanzado

## Pendientes conocidos que no formaron parte del cierre
- migrar `middleware.ts` a la convención `proxy` recomendada por Next.js 16
- revisar por separado deuda histórica de DB/RPC que no perteneció al cierre del refactor

## Resultado práctico
El repo queda con una base más clara para seguir creciendo:
- acceso a datos por dominio
- consumo cliente con convención común
- hooks críticos con menos estado duplicado
- UI interna ligeramente más consistente
- documentación mínima para orientar cambios futuros
