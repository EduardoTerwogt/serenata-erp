# TESTING

## Objetivo
Este documento describe cómo validar el repo y qué tipo de cobertura existe hoy.

## Scripts disponibles
Según `package.json`, los scripts activos son:
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run test:e2e:smoke`
- `npm run test:e2e:critical`
- `npm run test:e2e:live`
- `npm run test:e2e:headed`
- `npm run test:e2e:ui`
- `npm run build`

## Niveles de validación
### 1. Build
`npm run build`
Valida compilación de Next.js y typecheck. Cuando se trabaja directo contra GitHub, este paso suele reflejarse en el build de Vercel.

### 2. Lint
`npm run lint`
Valida reglas de ESLint del repo.

### 3. Unit / integration liviano
`npm test`
Corre Vitest.

### 4. E2E smoke
`npm run test:e2e:smoke`
Cubre humo básico de flujos críticos. Hoy incluye al menos nueva cotización con mocks de APIs iniciales.

### 5. E2E critical
`npm run test:e2e:critical`
Se usa para validar rutas críticas del negocio con mayor cuidado antes de dar una fase por cerrada.

### 6. E2E live
`npm run test:e2e:live`
Pensado para escenarios conectados o más cercanos a integración real. No debe ser la primera barrera para refactors mecánicos.

## Utilidades E2E relevantes
`tests/e2e/utils/auth.ts` permite dos modos:
- login real con credenciales Playwright
- bypass con cookie `e2e-bypass` cuando `PLAYWRIGHT_E2E_BYPASS=true`

## Orden recomendado de validación
Para cambios normales:
1. `npm run lint`
2. `npm test`
3. `npm run test:e2e:smoke`
4. `npm run test:e2e:critical`
5. `npm run build`

Para cambios de bajo riesgo puramente documentales:
- `npm run build` y checks remotos suelen ser suficientes si el trabajo fue directo contra GitHub sin entorno local.

## Criterio de cierre de una fase
Una fase se considera cerrada solo cuando:
- el commit real ya existe en `main`
- los checks remotos quedan verdes
- no se introdujeron cambios fuera del alcance congelado
- el resultado es compatible con Vercel, smoke-and-critical y test suite

## Nota operativa importante
Cuando el trabajo se hace directo en GitHub real, puede no existir validación local intermedia. En ese caso, el control de calidad real pasa a ser:
- build de Vercel
- checks automáticos del repo
- revisión puntual del diff
