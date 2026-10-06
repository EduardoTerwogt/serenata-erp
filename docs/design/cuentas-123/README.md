# Diseño #123 — Facturas y pagos ligados (Cuentas)

Diseño de las pantallas nuevas de #123. El plan técnico y las decisiones de
producto están en `docs/PLAN.md` (P1–P20); esta carpeta es la **referencia
visual**.

## Archivos

| Archivo | Qué es |
|---|---|
| `cuentas-acciones.html` | **Diseño final.** Recreación de la pantalla de Cuentas tal como está en producción (`app/cuentas/`) con el menú **Acciones** y las tres ventanas nuevas. Fuente de verdad visual para B4 (UI) de `docs/PLAN.md`. |
| `exploracion-modelo.html` | Exploración previa: diagrama del modelo (factura ↔ cotizaciones ↔ pagos ↔ complementos) con el ejemplo del issue, y el mockup de **cancelar con traspaso** (fuera de #123; referencia para esa iniciativa). Su estilo visual **no** es la referencia. |
| `PROMPT-claude-design.md` | Prompt opcional para refinar el diseño en Claude Design. |

## Cómo abrirlos

Doble clic: son HTML autocontenidos (solo cargan la fuente Inter de Google
Fonts). Para ver la versión móvil, ventana angosta o modo dispositivo a 390 px.
El tema oscuro sigue la preferencia del sistema.

En `cuentas-acciones.html`:
- **Acciones** → abre el menú. Subir factura, Registrar pago y Estado de cuenta
  abren sus ventanas; Orden de pago y Avisos muestran un marcador (no cambian).
- La **barra oscura** "Estado de la maqueta" (arriba, al abrir una ventana)
  cambia entre los casos de cada ventana. **No es parte del producto.**
- Clic en un proyecto abre el panel del proyecto; el chip de periodo despliega
  la tira de meses.

## Qué copia de producción (para implementar sin reinventar)

| Pieza del diseño | Componente / archivo real |
|---|---|
| Encabezado, periodo, totales, tarjetas de proyecto | `app/cuentas/components/CuentasApp.tsx`, `Periodo.tsx`, `Totales.tsx`, `Proyectos.tsx` |
| Botones | `components/ui/Button.tsx` (primary / secondary) |
| Ventanas | `components/ui/Modal.tsx` con `size="820"`, `mobile="sheet"`, `sheetHeight="92%"`, `closeOnEscape` — igual que `ordenes/GenerarOrden.tsx` |
| Pie con resumen + monto grande + botones | pie de `ordenes/GenerarOrden.tsx` |
| Facturas expandibles en Registrar pago | tarjeta de responsable de `ordenes/GenerarOrden.tsx` |
| Campos (monto, fecha, tipo, comprobante) | `detalle/TabPago.tsx` (`TextField`, `Select`, `sn-label`) |
| Avisos naranja / verde / neutro | `Aviso` de `detalle/TabPago.tsx` |
| Filas de archivo con "Válida" / "En revisión" | `detalle/TabDocumentos.tsx` |
| Tablas de facturas y pagos | historial de pagos de `detalle/TabPago.tsx` |
| Selector cliente/proveedor y cobro/pago | `components/ui/FilterTabs.tsx` |
| Casillas | `components/ui/Checkbox.tsx` |
| Pills de estado | `components/ui/StatusBadge.tsx` (4 tonos, sin colores nuevos) |

Lo nuevo sigue el design system de Serenata (`.claude/skills/serenata-design/`)
y los tokens `--sn-*` de `app/globals.css`.

## Decisiones de UX

1. Menú **Acciones** (botón naranja con flecha) en el encabezado de Cuentas:
   Subir factura · Registrar pago · (separador) · Orden de pago · Estado de
   cuenta. **Avisos** queda afuera, a la izquierda. Solo en esa barra.
2. Móvil: campana de avisos + botón naranja que abre el mismo menú; las
   ventanas son hojas al 92 %.
3. **Subir factura** no pregunta cliente/proveedor: lo decide el RFC del XML.
   También acepta el complemento (CFDI tipo P). Casos diseñados: XML con
   folios (preseleccionadas), concepto genérico (a mano), factura de
   proveedor (se liga a su proyecto), complemento (se liga por UUID),
   descuadre (aviso con el detalle exacto, botón "Guardar en revisión").
4. **Registrar pago:** pestañas "Cobro de cliente / Pago a proveedor" +
   contraparte; facturas cerradas que se expanden para editar el reparto;
   enlace "Sugerir: la más antigua primero"; pie con aplicado / por aplicar;
   el botón se bloquea si no cuadra o si un monto pasa del saldo.
5. **Estado de cuenta:** cliente o proveedor; resumen (facturado,
   cobrado/pagado, saldo, complementos pendientes); tablas de facturas y
   pagos; aviso de complemento PPD faltante; fila resaltada cuando se abre
   desde el chip de un documento.
6. El chip de una factura o pago compartido (ej. "Factura A · 4 cot.") en la
   lista de Cuentas abre el Estado de cuenta en ese documento.

## Datos de ejemplo

Cliente Grupo Altavista S.A. de C.V. (RFC GAL120304AB1): SH001–SH006;
Factura A = SH001 + SH003 + SH004 + SH006 = $359,600.00 (PPD);
Factura B = SH002 + SH005 = $127,600.00; depósito del 30 sep 2026 de
$300,000.00 a la Factura A. Proveedor Distrito Sonoro: DS-0412, DS-0415,
DS-0419 pagadas con una transferencia de $96,280.00 (DS-0419 PPD sin
complemento). La lista de fondo usa los proyectos de ejemplo del diseño
vigente (SH061, SH062).
