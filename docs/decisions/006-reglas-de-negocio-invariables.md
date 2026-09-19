# 006 — Reglas de negocio invariables del modelo de precios y fiscal

## Contexto

Cualquier cálculo de utilidad, margen, impuestos o cruce fiscal parte de un puñado
de reglas que el negocio no negocia. Vivían solo en el código y en el readme del
design kit, así que un feature nuevo podía reinterpretarlas sin darse cuenta.

## Decisión

**"Costo Unitario" (columna de la cotización, antes "X Pagar") es SIEMPRE el monto
neto al proveedor por unidad.** El proveedor o colaborador suma sus propios
impuestos sobre esa cifra; Serenata no se los descuenta ni se los agrega al
cotizar. El **Costo Total** del renglón es `Costo Unitario × Cantidad` — el monto
real que corresponde pagar por esa partida (Bloque 3, `docs/PLAN.md`; antes de esa
corrección, cualquier renglón con Cantidad > 1 subestimaba lo que se le debía al
proveedor).

**Modelo de precios:**
- Fee de agencia por defecto **15%** sobre el subtotal (`porcentaje_fee`, configurable
  por cotización — `lib/quotations/mappers.ts`).
- El cliente paga además **16% de IVA** sobre subtotal + fee.
- Serenata tributa como **persona moral**: ISR plano del 30% sobre utilidad.

**Cadena de totales:**
```
Importe      = Cantidad × Precio Unitario
Subtotal     = Σ Importes
Fee Agencia  = % (15% por defecto) sobre Subtotal
General      = Subtotal + Fee Agencia
IVA          = 16% sobre General
TOTAL        = General + IVA − Descuento

Costo Total (renglón) = Costo Unitario × Cantidad
Margen (renglón)      = Importe − Costo Total
Margen Total          = Σ Márgenes
Utilidad Total   = Margen Total + Fee Agencia
Margen %         = Utilidad Total ÷ Subtotal
```

**Cuentas por Pagar agrupadas por proveedor+proyecto** (`docs/decisions/011`):
un proveedor con varios renglones dentro del mismo proyecto factura y cobra
el total acumulado, no renglón por renglón.

```
monto_total_grupo = Σ Costo Total de los renglones del proveedor dentro del proyecto
```

El cruce fiscal (persona moral / persona física con honorarios, fórmulas de
abajo) se calcula sobre `monto_total_grupo`, nunca sobre el Costo Unitario de un
renglón individual, cuando el renglón pertenece a un grupo. `cuentas_pagar.x_pagar`
(la columna materializada, distinta de "Costo Unitario" de la cotización) ya
guarda el Costo Total de cada renglón desde que se aprueba la cotización.

**Modelo fiscal de proveedores** (`lib/server/validation/factura-fiscal.ts`, según
`regimen_fiscal`; `null`/`undefined` se trata como **moral**):
- **Persona moral:** IVA 16% trasladado, acreditable, sin retenciones.
- **Persona física con honorarios:** IVA 16% trasladado + retención de IVA de 2/3
  (10.6667% del subtotal) + retención de ISR del 10% del subtotal.

## Razón

Son reglas del negocio y del SAT, no decisiones técnicas. Reinterpretarlas produce
errores de dinero real y de cumplimiento fiscal, que es el peor lugar donde tener un
bug en este sistema.

## Alternativas descartadas

- **Tratar "Costo Unitario" como bruto** — se confirmó explícitamente que no; el
  proveedor suma sus impuestos encima.
- **Aplicar un tratamiento fiscal único a todos los proveedores** — no funciona: el
  régimen determina si hay retenciones.

## Consecuencias

- Toda pantalla o cálculo nuevo que toque dinero parte de estas fórmulas.
- El régimen fiscal del proveedor se usa para el cruce fiscal **real** de Cuentas.
- La validación fiscal de facturas es la implementación de referencia: reutilizarla,
  no duplicar la lógica.

## Glosario

- **Cotización:** Cliente, Proyecto, Fecha de Entrega, Locación, Fecha de Cotización,
  Partidas. Folio auto-incremental (`SH001`, `SH002`…), id = folio texto.
- **Partida:** Categoría, Descripción, Cantidad, Precio Unitario, Importe,
  Responsable, Costo Unitario (antes "X Pagar"), Costo Total (Costo Unitario ×
  Cantidad), Margen (Importe − Costo Total).
- **Tipos de cotización:** `PRINCIPAL` y `COMPLEMENTARIA`.
- **Estados de cotización:** `BORRADOR` → `EMITIDA` → `APROBADA` | `CANCELADA`.
  Al aprobar se crean Proyecto + cuentas por cobrar y por pagar en una transacción.
- **Proveedores** (antes "responsables", tabla `proveedores`): colaboradores y
  freelancers. Toda asignación resuelve a un id real, nunca texto suelto. La clave de
  permisos `AppSection` se mantiene como `'responsables'` a propósito, para no migrar
  `usuarios.sections`.
- **Grupo de facturación** (`cuentas_pagar_grupos`, `docs/decisions/011`): agrupa las
  cuentas por pagar del mismo proveedor dentro del mismo proyecto para que la
  factura y el pago se pidan/validen una sola vez, por el total acumulado. Estados:
  `ABIERTO` → `FACTURADO` → `EN_PROCESO_PAGO` → `PAGADO`.
