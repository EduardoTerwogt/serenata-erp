# ARCHITECTURE

## Resumen
Serenata ERP es una app en Next.js que combina UI autenticada, APIs internas y servicios de dominio para operar cotizaciones, proyectos, cuentas por cobrar, cuentas por pagar y responsables.

## Distribución principal
- `app/`: páginas, rutas y APIs del App Router.
- `app/components/`: componentes ligados a pantallas específicas.
- `components/`: componentes reutilizables de UI y secciones compartidas.
- `hooks/`: hooks cliente compartidos.
- `lib/`: utilidades, tipos, authz, servicios cliente y fachada server-side.
- `lib/server/repositories/`: acceso a datos por dominio.
- `lib/server/pdf/`: generación server-side de PDFs.
- `tests/e2e/`: smoke, critical, live y utilidades Playwright.
- `docs/plans/`: bitácora corta de fases del refactor.

## Capas actuales
### 1. Shell, auth y autorización
La navegación autenticada se protege desde `middleware.ts`, que valida sesión, secciones autorizadas y acceso a rutas API/página. La app aún usa la convención `middleware.ts`; Next.js 16 la marca como deprecada a favor de `proxy`, pero ese cambio no fue parte del refactor de fases 0–7.

### 2. UI de páginas
Las pantallas viven en `app/.../page.tsx` y delegan lógica a hooks o componentes por dominio cuando aplica. Después del refactor, páginas críticas como nueva cotización y cuentas quedaron más delgadas.

### 3. Cliente y consumo de APIs
Las llamadas desde cliente usan principalmente `lib/client/api.ts`, que centraliza lectura JSON, manejo de errores, envío JSON, FormData y binary.

### 4. Dominio server-side
`lib/db.ts` ya no concentra lógica operativa. Hoy funciona como fachada de compatibilidad y reexporta repositorios por dominio:
- quotations
- responsables
- proyectos
- cuentas-pagar
- cuentas-cobrar

### 5. PDFs server-side
La generación de PDF de cotización vive en `lib/server/pdf/`. El render principal orquesta helpers, tipos y layout derivados sin exponer cambios de contrato al resto de la app.

## Dominios críticos congelados
Los flujos que se mantuvieron funcionalmente estables durante el refactor fueron:
- login y redirección por autenticación
- navegación principal
- nueva cotización y detalle de cotización
- cuentas por cobrar y por pagar
- responsables
- proyectos
- generación y manejo de PDFs
- integraciones activas de Drive/Sheets

## Reglas de arquitectura que se respetan hoy
- no introducir lógica de datos nueva en páginas si puede vivir en hook/servicio/repositorio
- mantener `lib/db.ts` solo como fachada de compatibilidad
- no mezclar refactors de UI con cambios de schema/RPC/SQL
- mantener `lib/client/api.ts` como convención de acceso a APIs cliente
- limitar primitives de UI internas a repetición real y de bajo riesgo

## Deuda conocida explícita
- `middleware.ts` sigue vigente aunque Next 16 ya recomienda `proxy`
- existen cambios históricos de DB/RPC en el repo que no formaron parte del cierre de fases 5–7
- los checks remotos se usan como validación final real cuando se trabaja directo contra GitHub
