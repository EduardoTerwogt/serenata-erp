# FASE 3 — Decomponer páginas y componentes gigantes

## Objetivo
Reducir complejidad de pantallas críticas sin reescribir lógica ni cambiar UX.

## Qué cambió

### Cuentas
- `app/components/cuentas/CuentasPage.tsx` ahora funciona como container de UI.
- La lógica de carga, filtros, alertas, historial y estados derivados se movió a `app/components/cuentas/useCuentasPage.ts`.
- Los tipos específicos de la pantalla se movieron a `app/components/cuentas/types.ts`.
- El formato monetario se movió a `app/components/cuentas/utils.ts`.

### Nueva cotización
- `app/cotizaciones/nueva/page.tsx` quedó reducido a composición de secciones y wiring visual.
- La lógica de inicialización, carga diferida, estado del formulario y acciones de guardado/generación se movió a `app/cotizaciones/nueva/useNuevaCotizacionPage.ts`.

## Por qué fue seguro
- No se cambiaron rutas, payloads ni contratos.
- La lógica fue extraída, no reinventada.
- Los componentes renderizan la misma estructura funcional.
- Los hooks nuevos encapsulan exactamente la lógica previa.

## Resultado
- Archivos principales más pequeños y legibles.
- Mejor rastreo de responsabilidades.
- Base más limpia para continuar con la fase 4.

## Compatibilidad esperada con checks remotos
- Vercel - Deployment has completed: OK
- E2E / smoke-and-critical (push): OK
- Test Suite / test (push): OK
