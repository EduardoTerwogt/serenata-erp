'use client'

import { createContext, useContext } from 'react'
import type { ConceptoVista } from '@/lib/shared/cuentas/periodo-tipos'

/** Abre el Estado de cuenta de la contraparte del concepto con ese documento resaltado (P20). */
export type AbrirCompartido = (c: ConceptoVista, doc: string) => void

/** Lo provee `CuentasApp`; fuera de Cuentas (o sin proveedor) los chips no se muestran. */
export const CompartidoContexto = createContext<AbrirCompartido | null>(null)

/**
 * #123 (P20): una factura que cubre varias cotizaciones, o un pago que cubre varias cuentas, se marca con un chip en la
 * lista ("Factura · 4 cot.", "Pago · 3 cuentas"). Tocarlo abre el Estado de cuenta en ese documento; no abre el detalle
 * del concepto (la fila entera sí lo abre, por eso el clic no se propaga).
 */
export function ChipsCompartidos({ c }: { c: ConceptoVista }) {
  const abrir = useContext(CompartidoContexto)
  const compartido = c.compartido
  if (!abrir || !compartido || !c.contraparte_id) return null
  const chips: { clave: string; texto: string; doc: string }[] = []
  if (compartido.factura_id && compartido.facturas_cuentas > 1) {
    chips.push({ clave: 'f', texto: `Factura · ${compartido.facturas_cuentas} cot.`, doc: compartido.factura_id })
  }
  const pago = compartido.pagos.find((p) => p.lineas > 1)
  if (pago) chips.push({ clave: 'p', texto: `Pago · ${pago.lineas} ${c.tipo === 'cobro' ? 'cuentas' : 'proyectos'}`, doc: pago.pago_id })
  if (chips.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1 pt-0.5">
      {chips.map((x) => (
        <button
          key={x.clave}
          type="button"
          aria-label={`${x.texto}: abrir estado de cuenta de ${c.contraparte}`}
          onClick={(e) => {
            e.stopPropagation()
            abrir(c, x.doc)
          }}
          className="inline-flex flex-none items-center whitespace-nowrap rounded-pill border border-hairline bg-row-alt px-2 py-0.5 text-[10.5px] font-medium text-subtext hover:border-accent-quiet hover:text-accent"
        >
          {x.texto}
        </button>
      ))}
    </span>
  )
}
