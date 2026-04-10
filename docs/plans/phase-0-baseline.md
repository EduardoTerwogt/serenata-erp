# FASE 0 — Baseline y red de seguridad

## Alcance
Esta fase congela el comportamiento actual y establece una línea base antes de refactors de performance/arquitectura.
No se modifica lógica funcional, contratos, rutas ni integraciones externas.

## Flujos críticos congelados
1. Login y redirección por autenticación (`/login`, middleware y callback URL).
2. Navegación principal y shell global (`SidebarLayout`, dashboard y secciones principales).
3. Cotización nueva (`/cotizaciones/nueva`), detalle y guardado (`/cotizaciones/[id]`).
4. Cuentas por cobrar y por pagar (`/cuentas`) incluyendo:
   - documentos
   - registro de pagos
   - generación de orden de pago
5. Responsables (`/responsables`, `/responsables/[id]`, `/responsables/nueva`).
6. Proyectos (`/proyectos`, `/proyectos/[id]`).
7. Generación y manejo de PDFs (cotización, orden de pago, hoja de llamado).
8. Integraciones activas de Drive/Sheets.

## Hotspots técnicos (prioridad para siguientes fases)

### Archivos grandes/acoplados
- `lib/db.ts` (~617 líneas): punto central con responsabilidades cruzadas entre dominios.
- `app/components/cuentas/CuentasPage.tsx` (~312 líneas): componente client-heavy con múltiples responsabilidades (carga, filtros, tabs, acciones).
- `app/cotizaciones/[id]/page.tsx` (~331 líneas): mezcla de carga, transformación y presentación.
- `app/cotizaciones/nueva/page.tsx`: alto acoplamiento de estado + side effects + guardado/generación.
- `lib/server/pdf/cotizacion-pdf.ts` (~423 líneas): construcción PDF extensa, alta sensibilidad a regresiones.

### Superficies client-heavy relevantes
- `app/components/cuentas/*` (tabs/modales/tablas) con múltiples estados y fetches.
- `components/quotations/QuotationItemsSection.tsx` (lista dinámica compleja).
- `app/proyectos/[id]/page.tsx`, `app/responsables/[id]/page.tsx` con lógica combinada UI + datos.

### Riesgos detectados
1. **Riesgo de regresión en cuentas** por estados derivados y operaciones encadenadas (documentos/pagos/ordenes).
2. **Riesgo de regresión en cotizaciones** por mezcla de cálculos, persistencia y side effects (PDF + Drive).
3. **Riesgo de acoplamiento server-side** por `lib/db.ts` como “god file”.
4. **Riesgo de performance percibida** en vistas client-heavy por carga de catálogos y renders amplios.

## Cobertura de regresión agregada en FASE 0
Se refuerza la red de seguridad E2E para cubrir explícitamente un flujo crítico faltante:

- Nuevo smoke test de **nueva cotización**:
  - carga inicial de pantalla
  - carga de folio
  - disponibilidad de acciones principales (guardar borrador / generar cotización)
- Se utilizan mocks de API para mantener estabilidad y rapidez del test sin depender de servicios externos.

## Resultado de FASE 0
- Baseline documentado.
- Flujos congelados explícitos.
- Hotspots/riesgos priorizados para fases 1..7.
- Cobertura E2E ampliada en flujo crítico de cotizaciones sin alterar comportamiento.
