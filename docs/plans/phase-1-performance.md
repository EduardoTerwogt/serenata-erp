# FASE 1 — Performance de mayor impacto sin cambiar UX

## Objetivo
Cerrar la fase de performance inicial sin alterar comportamiento, contratos ni flujos visibles.

## Qué quedó optimizado

### Shell global
- `SidebarLayout` memoiza el filtrado de navegación visible para evitar trabajo repetido al renderizar.

### Cuentas
- `CuentasPage` ya no liga el loading de una tab a ambas fuentes de datos.
- Las alertas de cuentas por cobrar se cargan bajo demanda cuando la tab activa realmente es **Por Cobrar**.
- El historial de órdenes se carga bajo demanda cuando la tab activa realmente es **Por Pagar**.
- Los refetches secundarios ya no se disparan de forma redundante en cada recarga de cuentas.
- `CuentaDetailModal` y `OrdenPagoModal` salen del bundle inicial y se cargan solo al abrirse.

### Nueva cotización
- `useQuotationForm` difiere la carga de catálogos no críticos.
- `app/cotizaciones/nueva/page.tsx` ahora separa la carga del folio de la carga de responsables.
- La carga de responsables se difiere hasta tiempo ocioso del navegador.
- `QuotationItemsSection` y `QuotationTotalsPanels` salen del bundle inicial y se cargan de forma diferida.

## Por qué fue seguro
- No se cambiaron rutas.
- No se cambiaron payloads.
- No se cambiaron contratos API.
- No se cambió lógica de negocio visible.
- No se tocaron integraciones externas ni configuración.

## Archivos involucrados en FASE 1
- `app/components/SidebarLayout.tsx`
- `app/components/cuentas/CuentasPage.tsx`
- `hooks/useQuotationForm.ts`
- `app/cotizaciones/nueva/page.tsx`
- `docs/plans/phase-1-performance.md`

## Cierre de fase
Con estos cambios, la carga inicial de shell, cuentas y nueva cotización hace menos trabajo de cliente y difiere piezas no críticas, manteniendo la misma UX y los mismos contratos.

## Compatibilidad esperada con checks remotos
- Vercel - Deployment has completed: OK
- E2E / smoke-and-critical (push): OK
- Test Suite / test (push): OK
