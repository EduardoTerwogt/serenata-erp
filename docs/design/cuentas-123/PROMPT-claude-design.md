# Prompt opcional para Claude Design — #123

Úsalo solo si se quiere refinar el diseño en Claude Design antes de B5. Si no,
`cuentas-acciones.html` ya es el diseño final.

**Adjuntar:** `docs/design/cuentas-123/cuentas-acciones.html` (base y
contenido), y del diseño vigente `docs/design/cuentas/capturas/` y
`docs/design/cuentas/codigo-fuente/` (o abrir el proyecto original de Cuentas
en Claude Design, que ya tiene el design system cargado). Activar el design
system de Serenata.

```
Refina tres ventanas nuevas de Cuentas de Serenata. No es un rediseño: la
pantalla de Cuentas y todo lo que ya existe se conserva tal cual.

## Base obligatoria
- cuentas-acciones.html: recreación fiel de Cuentas en producción con el menú
  "Acciones" y las tres ventanas. Contenido, casos y reglas son finales;
  puedes mejorar jerarquía, espaciado y detalle visual.
- Capturas y código del diseño vigente de Cuentas: mismos tokens, Modal
  (820 px; hoja inferior al 92 % en móvil), botones, FilterTabs, pills de 4
  tonos, moneda $174,000.00 y fechas "12 sep 2026".

## Qué resuelve
Una factura puede cubrir varias cotizaciones del mismo cliente; un pago
(depósito o transferencia) puede cubrir varias facturas, también parcial; cada
documento se sube una sola vez y queda ligado a lo que cubre.

## Ventanas (desde el menú Acciones del encabezado; Avisos queda afuera)
1. Subir factura: detecta por RFC si es de cliente o proveedor y acepta
   complementos (CFDI tipo P). Casos: folios preseleccionados, concepto
   genérico, factura de proveedor, complemento, descuadre "En revisión" con el
   detalle exacto.
2. Registrar pago: cobro de cliente / pago a proveedor; facturas cerradas que
   se expanden para editar el reparto por cotización; sugerir "la más antigua
   primero"; aplicado / por aplicar; bloqueo si no cuadra.
3. Estado de cuenta: cliente o proveedor; resumen; facturas; pagos; aviso de
   complemento PPD faltante; documento resaltado al abrir desde un chip.

## Restricciones
Solo los 4 tonos de estado; componentes existentes; español de México, sin
emojis ni signos de exclamación; escritorio y móvil, claro y oscuro.

## Entregables
Prototipo HTML con todos los casos, capturas PNG (escritorio 1353×882, móvil
390×844), lista corta de cambios frente a cuentas-acciones.html y dudas.
```

Al terminar, reemplazar `cuentas-acciones.html` (o agregar el export al lado)
y anotar en `docs/PLAN.md` que la referencia de B5 cambió.
