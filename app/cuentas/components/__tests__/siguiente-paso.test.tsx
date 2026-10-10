// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConceptoVista } from '@/lib/shared/cuentas/periodo-tipos'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { sections: ['cuentas'] } } }) }))

import { SiguientePaso, TablaConceptos } from '../Conceptos'

const concepto = (o: Partial<ConceptoVista> = {}): ConceptoVista => ({
  estado: 'sin_factura', etiqueta: 'Sin factura', tono: 'borrador', paso: 'subir_factura', paso_etiqueta: 'Subir factura', paso_urgente: false, saldo: 0, vencimiento: null,
  resuelto: false, fecha_resuelto: null, metodo_desconocido: false, complementos: [],
  key: 'g:1', tipo: 'pago', objetivo: 'grupo', id: '1', proyecto_id: 'SH001', cotizacion_id: null, folio: null, contraparte: 'Prov A', contraparte_id: 'p1',
  concepto: 'Stage', items: 1, total: 100, neto: 100, pagado: 0, total_estimado: true, regimen_fiscal: null, orden_pago_id: null, fecha_vencimiento: null,
  ...o,
})

describe('SiguientePaso', () => {
  it('con onAccion es un botón que no abre la fila', () => {
    const onAccion = vi.fn()
    const onFila = vi.fn()
    render(
      <div onClick={onFila}>
        <SiguientePaso c={concepto()} onAccion={onAccion} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Subir factura' }))
    expect(onAccion).toHaveBeenCalledTimes(1)
    expect(onFila).not.toHaveBeenCalled()
  })

  it.each([
    ['sin onAccion (Lista, histórico)', concepto(), undefined],
    ['conceptos sin proyecto', concepto({ proyecto_id: null }), vi.fn()],
    ['en orden de pago (sin destino)', concepto({ paso: 'en_orden', paso_etiqueta: 'En orden de pago' }), vi.fn()],
  ])('sin botón: %s', (_caso, c, onAccion) => {
    render(<SiguientePaso c={c} onAccion={onAccion} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(c.paso_etiqueta as string)).toBeTruthy()
  })

  it('cobro pagado sin factura va en alerta (rojo)', () => {
    const c = concepto({ tipo: 'cobro', paso: 'emitir_factura', paso_etiqueta: 'Subir factura', pagado: 500 })
    render(<SiguientePaso c={c} onAccion={vi.fn()} />)
    expect(screen.getByRole('button').className).toContain('text-cancelled-fg')
  })
})

describe('TablaConceptos', () => {
  it('el total estimado lleva «~» y el botón del paso no dispara onAbrir', () => {
    const onAbrir = vi.fn()
    const onAccion = vi.fn()
    render(<TablaConceptos tipo="pago" conceptos={[concepto()]} onAbrir={onAbrir} onAccion={onAccion} />)
    expect(screen.getAllByText(/~\$100\.00/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Subir factura' })[0])
    expect(onAccion).toHaveBeenCalledTimes(1)
    expect(onAbrir).not.toHaveBeenCalled()
  })

  it('sin onAccion no hay botones', () => {
    render(<TablaConceptos tipo="pago" conceptos={[concepto()]} onAbrir={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Subir factura' })).toBeNull()
  })
})
