# FASE 6 — Estandarización de UI interna sin rediseño

## Objetivo
Reducir repetición real de UI sin alterar apariencia, flujos ni markup funcional importante.

## Auditoría breve de repetición
Se detectó repetición clara y de bajo riesgo en dos patrones:
- wrappers de superficie tipo tarjeta con `bg-gray-900 border border-gray-800 rounded-xl`
- tarjetas de métricas con label gris + valor destacado

No se extrajeron más primitives para evitar convertir la fase en una mini librería interna innecesaria.

## Qué cambió
- Se creó `components/ui/AppCard.tsx` como primitive interna para superficies repetidas.
- Se creó `components/ui/MetricCard.tsx` como primitive interna para métricas repetidas.
- Se adoptaron en:
  - `app/components/cuentas/CuentasPage.tsx`
  - `components/quotations/QuotationGeneralInfoSection.tsx`
  - `components/quotations/QuotationTotalsPanels.tsx`

## Por qué fue seguro
- Se conservaron las mismas clases visuales base.
- No se cambiaron rutas ni contratos.
- No se introdujeron dependencias nuevas.
- No se alteró la lógica de negocio ni la interacción del usuario.

## Resultado
- Menos Tailwind repetido.
- Menos ruido visual en componentes críticos.
- Base interna ligeramente más consistente sin rediseño.

## Compatibilidad esperada con checks remotos
- Vercel - Deployment has completed: OK
- E2E / smoke-and-critical (push): OK
- Test Suite / test (push): OK
