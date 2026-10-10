// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConceptoVista } from '@/lib/shared/cuentas/periodo-tipos'
import type { RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'

const mocks = vi.hoisted(() => ({ asignar: vi.fn(), renglones: [] as RenglonSelector[] }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { sections: ['cuentas'] } } }) }))
vi.mock('../useAcciones', async (original) => ({
  ...(await original<typeof import('../useAcciones')>()),
  useContrapartes: () => ({ lista: [{ id: 'prov-1', nombre: 'Luz y Sonido', pendientes: 0 }], total: 1, error: null, cargando: false }),
  useProyectosSelector: () => ({ proyectos: [{ proyecto_id: 'SH001', proyecto: 'P', cliente: null, fecha_entrega: null, renglones: mocks.renglones }], total: 1, error: null, cargando: false, cargandoMas: false, hayMas: false, cargarMas: () => {} }),
  accionesAsignar: { asignar: mocks.asignar },
}))

import { ApiError } from '@/lib/client/api'
import { AsignarProveedor } from '../AsignarProveedor'

const renglon = (id: string, o: Partial<RenglonSelector> = {}): RenglonSelector => ({
  cuenta_id: id, descripcion: `Concepto ${id}`, costo_total: 100, gasto_extra: false, responsable_id: null, responsable: null, grupo_id: null, grupo_estado: null, bloqueado: false, ...o,
})
const concepto = { id: 'a', proyecto_id: 'SH001', concepto: 'Stage', total: 250, total_estimado: true } as ConceptoVista

beforeEach(() => {
  vi.clearAllMocks()
  mocks.renglones = [renglon('a'), renglon('b'), renglon('c', { responsable_id: 'otro', responsable: 'Otro Prov' })]
  mocks.asignar.mockResolvedValue({ proveedor_id: 'prov-1', proveedor_nombre: 'Luz y Sonido', reasignados: 2 })
})

describe('AsignarProveedor', () => {
  it('lista solo los conceptos sin proveedor, con el de origen marcado, y no asigna sin proveedor', () => {
    render(<AsignarProveedor concepto={concepto} onClose={vi.fn()} onAsignado={vi.fn()} />)
    expect(screen.getByLabelText('Incluir Concepto a').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText('Incluir Concepto b').getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByLabelText('Incluir Concepto c')).toBeNull()
    expect((screen.getByRole('button', { name: 'Asignar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Elige al proveedor')).toBeTruthy()
  })

  it('asigna a un proveedor existente los conceptos marcados y recarga', async () => {
    const onAsignado = vi.fn()
    const onClose = vi.fn()
    render(<AsignarProveedor concepto={concepto} onClose={onClose} onAsignado={onAsignado} />)
    fireEvent.click(screen.getByRole('button', { name: 'Elegir proveedor' }))
    fireEvent.click(screen.getByRole('option', { name: /Luz y Sonido/ }))
    fireEvent.click(screen.getByLabelText('Incluir Concepto b'))
    expect(screen.getByText('Asignar a 2 conceptos')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(onAsignado).toHaveBeenCalled())
    expect(mocks.asignar).toHaveBeenCalledWith(expect.objectContaining({ proveedor_id: 'prov-1', renglones: ['a', 'b'], operation_id: expect.any(String) }))
    expect(onClose).toHaveBeenCalled()
  })

  it('un rechazo del servidor se muestra y el reintento lleva otra llave', async () => {
    mocks.asignar.mockRejectedValueOnce(new ApiError('Proyecto histórico', 409, 'proyecto_historico'))
    render(<AsignarProveedor concepto={concepto} onClose={vi.fn()} onAsignado={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Elegir proveedor' }))
    fireEvent.click(screen.getByRole('option', { name: /Luz y Sonido/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    expect(await screen.findByText('Proyecto histórico')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(mocks.asignar).toHaveBeenCalledTimes(2))
    expect(mocks.asignar.mock.calls[1][0].operation_id).not.toBe(mocks.asignar.mock.calls[0][0].operation_id)
  })

  it('proveedor nuevo: pide todos los datos y manda el alta', async () => {
    render(<AsignarProveedor concepto={concepto} onClose={vi.fn()} onAsignado={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Proveedor nuevo' }))
    expect((screen.getByRole('button', { name: 'Asignar' }) as HTMLButtonElement).disabled).toBe(true)
    const campo = (nombre: string, valor: string) => fireEvent.change(screen.getByLabelText(new RegExp(`^${nombre}`)), { target: { value: valor } })
    campo('Nombre o razón social', 'Luz Nueva')
    campo('RFC', 'lnu010101ab1')
    fireEvent.change(screen.getByLabelText(/^Régimen fiscal/), { target: { value: 'fisica' } })
    campo('Teléfono', '5555555555')
    campo('Correo', 'a@b.mx')
    campo('Banco', 'BBVA')
    campo('CLABE', '0123 4567 8901 2345 67')
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(mocks.asignar).toHaveBeenCalled())
    expect(mocks.asignar.mock.calls[0][0]).toMatchObject({
      proveedor_id: null,
      proveedor: { nombre: 'Luz Nueva', rfc: 'LNU010101AB1', regimen_fiscal: 'fisica', clabe: '012345678901234567' },
      renglones: ['a'],
    })
  })
})
