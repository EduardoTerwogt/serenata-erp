// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BottomSheet } from '../BottomSheet'
import { Checkbox } from '../Checkbox'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { Modal } from '../Modal'
import { ProgressBar } from '../ProgressBar'
import { ListaRadio, SearchableSelect } from '../SearchableSelect'
import { Switch } from '../Switch'
import { ResponsiveTableCard } from '../../ResponsiveTableCard'

afterEach(cleanup)

describe('ProgressBar', () => {
  it('recorta el valor a 0–100 y lo expone por aria', () => {
    render(<ProgressBar value={140} label="Avance" />)
    expect(screen.getByRole('progressbar', { name: 'Avance' }).getAttribute('aria-valuenow')).toBe('100')
  })
})

describe('Field', () => {
  it('pinta la etiqueta y "—" sin valor', () => {
    render(<Field label="Proyecto" />)
    expect(screen.getByText('Proyecto')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('Checkbox y Switch', () => {
  it('Checkbox cambia su valor sin propagar el clic a la fila', () => {
    const onChange = vi.fn()
    const onFila = vi.fn()
    render(
      <div onClick={onFila}>
        <Checkbox checked={false} onChange={onChange} label="Incluir" />
      </div>
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir' }))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(onFila).not.toHaveBeenCalled()
  })

  it('Switch alterna', () => {
    const onChange = vi.fn()
    render(<Switch checked label="Agrupar por mes" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Agrupar por mes' }))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})

describe('BottomSheet, Drawer y Modal', () => {
  it('Escape cierra solo la capa superior y el fondo deja de hacer scroll mientras está abierta', () => {
    const cerrarAbajo = vi.fn()
    const cerrarArriba = vi.fn()
    const { unmount } = render(
      <>
        <BottomSheet title="Proyecto" onClose={cerrarAbajo}>
          abajo
        </BottomSheet>
        <BottomSheet title="Detalle" onClose={cerrarArriba}>
          arriba
        </BottomSheet>
      </>
    )
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(cerrarArriba).toHaveBeenCalledTimes(1)
    expect(cerrarAbajo).not.toHaveBeenCalled()
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('Drawer lleva el regreso "‹ Cuentas" para móvil', () => {
    const onClose = vi.fn()
    render(
      <Drawer title="Avisos" backLabel="Cuentas" onClose={onClose}>
        contenido
      </Drawer>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cuentas' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Modal: los modales viejos no cierran con Escape; los nuevos sí, con header y footer fijos', () => {
    const viejo = vi.fn()
    const { unmount } = render(
      <Modal title="Viejo" onClose={viejo}>
        x
      </Modal>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(viejo).not.toHaveBeenCalled()
    unmount()

    const nuevo = vi.fn()
    render(
      <Modal title="Detalle" eyebrow="Cuenta por cobrar" size="780" mobile="sheet" closeOnEscape header={<span>avance</span>} footer={<span>pie</span>} onClose={nuevo}>
        cuerpo
      </Modal>
    )
    expect(screen.getByText('Cuenta por cobrar')).toBeTruthy()
    expect(screen.getByText('avance')).toBeTruthy()
    expect(screen.getByText('pie')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(nuevo).toHaveBeenCalled()
  })
})

describe('ListaRadio y SearchableSelect', () => {
  it('filtra sin acentos y marca la opción activa', () => {
    const onChange = vi.fn()
    render(<ListaRadio opciones={[{ value: 'Coca', label: 'Coca-Cola FEMSA' }, { value: 'Pal', label: 'El Palacio de Hierro' }]} value="" todos="Todos" buscar onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'palacio' } })
    expect(screen.queryByRole('radio', { name: 'Coca-Cola FEMSA' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'El Palacio de Hierro' }))
    expect(onChange).toHaveBeenCalledWith('Pal')
  })

  it('SearchableSelect muestra el valor, se abre con buscador y se cierra al elegir', () => {
    const onChange = vi.fn()
    render(<SearchableSelect label="Cliente" opciones={['Liverpool', 'Zara México']} value="" todos="Todos los clientes" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Todos los clientes' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Zara México' }))
    expect(onChange).toHaveBeenCalledWith('Zara México')
    expect(screen.queryByPlaceholderText('Buscar')).toBeNull()
  })
})

describe('ResponsiveTableCard (S11)', () => {
  it('agrupa con encabezado por grupo y en móvil pinta una tarjeta por grupo', () => {
    const onRow = vi.fn()
    render(
      <ResponsiveTableCard
        data={[]}
        groups={[
          { key: 'jul', label: 'Julio 2026', sub: '1 concepto', items: [{ id: 'a' }] },
          { key: 'sep', label: 'Septiembre 2026', sub: '1 concepto', items: [{ id: 'b' }] },
        ]}
        mobileLayout="list"
        onRowClick={onRow}
        columns={[{ key: 'id', label: 'Id' }]}
        keyExtractor={(x) => x.id}
        renderDesktopRow={(x) => <td>fila {x.id}</td>}
        renderMobileCard={(x) => <span>tarjeta {x.id}</span>}
      />
    )
    expect(screen.getAllByText('Julio 2026')).toHaveLength(2)
    fireEvent.click(screen.getByText('fila b'))
    expect(onRow).toHaveBeenCalledWith({ id: 'b' })
  })

  it('sin grupos se comporta como antes', () => {
    render(
      <ResponsiveTableCard
        data={[{ id: 'a' }]}
        columns={[{ key: 'id', label: 'Id' }]}
        keyExtractor={(x) => x.id}
        renderDesktopRow={(x) => <td>fila {x.id}</td>}
        renderMobileCard={(x) => <span>tarjeta {x.id}</span>}
      />
    )
    expect(screen.getByText('fila a')).toBeTruthy()
    expect(screen.getByText('tarjeta a')).toBeTruthy()
  })
})
