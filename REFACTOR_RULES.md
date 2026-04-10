# REFACTOR_RULES

## Propósito
Estas reglas documentan cómo seguir modificando el repo sin romper la base dejada por las fases 0–7.

## Reglas duras
1. No mezclar refactor con cambios de negocio.
2. No tocar SQL, schema, RPC o migraciones dentro de fases que solo son de frontend, arquitectura interna o cleanup.
3. No cambiar rutas, payloads ni contratos públicos durante refactors mecánicos.
4. No introducir dependencias nuevas para resolver repetición menor.
5. No crear abstractions si no existe repetición real.
6. No convertir `lib/db.ts` otra vez en un god file.
7. No mover lógica de datos a páginas si puede vivir en hook, servicio o repositorio.

## Convenciones útiles
### Cliente
- usar `lib/client/api.ts` para fetch, errores, FormData y binary
- evitar duplicar parseo manual de errores en hooks cliente

### Server-side
- mantener acceso a datos por dominio en `lib/server/repositories/*`
- conservar `lib/db.ts` como fachada de compatibilidad

### UI
- solo extraer primitives si reducen repetición real
- preservar markup funcional y apariencia al estandarizar UI
- evitar una librería interna grande sin necesidad

### Estado y hooks
- preferir estado fuente de verdad único
- mover valores derivados a `useMemo` o selectors puros cuando no deban persistirse
- usar callbacks estables cuando un hook exporta acciones compartidas a modales o componentes pesados

## Cómo decidir si un cambio sí entra en refactor
Sí entra si:
- reduce complejidad sin cambiar comportamiento
- baja duplicación técnica clara
- mejora legibilidad o trazabilidad
- mantiene contratos exactos

No entra si:
- toca negocio
- cambia copy funcional del flujo sin motivo
- requiere migraciones o acción manual externa
- obliga a revalidar producción por razones fuera del alcance del refactor

## Regla de entrega
- una fase puede trabajarse internamente por bloques pequeños
- pero el push a `main` debe representar la fase completa
- si una fase ya no es segura como una sola unidad, hay que dividirla en nuevas fases formales, no en pushes parciales arbitrarios

## Regla de validación
Antes de dar una fase por cerrada, confirmar:
- diff acotado al alcance
- compatibilidad con build/checks
- sin contaminación de cambios fuera de la fase
- commit real en GitHub y `main` actualizado
