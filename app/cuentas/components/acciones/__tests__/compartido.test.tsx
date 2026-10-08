// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarraSeleccion, IndicadorCuadre, Paso, PieVentana } from '../compartido'

afterEach(cleanup)

describe('Paso', () => {
  it('muestra el número, el título y lo que va a la derecha', () => {
    render(
      <Paso n={2} titulo="¿Qué cubre?" derecha={<span>Marcadas por el folio</span>}>
        <div>contenido</div>
      </Paso>
    )
    expect(screen.getByRole('region', { name: '¿Qué cubre?' })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('Marcadas por el folio')).toBeTruthy()
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('hecho cambia el número por la palomita en tono ok', () => {
    const { container } = render(<Paso n={1} titulo="Archivos" hecho />)
    expect(screen.queryByText('1')).toBeNull()
    expect(container.querySelector('.bg-approved-bg')).toBeTruthy()
  })
})

describe('IndicadorCuadre', () => {
  it('cuadra: tono ok, con su resumen', () => {
    const { container } = render(<IndicadorCuadre cuadra titulo="Cuadra con el XML" detalle="Las 4 cotizaciones suman lo mismo." resumen="$359,600.00" />)
    expect(screen.getByText('Cuadra con el XML')).toBeTruthy()
    expect(screen.getByText('$359,600.00')).toBeTruthy()
    expect(container.firstElementChild?.className).toContain('bg-approved-bg')
  })

  it('no cuadra: tono acento y el atajo hace lo suyo', () => {
    const marcar = vi.fn()
    const { container } = render(<IndicadorCuadre cuadra={false} titulo="No cuadra: faltan $69,600.00" accion={<button onClick={marcar}>Marcar SH006</button>} />)
    expect(container.firstElementChild?.className).toContain('bg-accent/[0.07]')
    fireEvent.click(screen.getByRole('button', { name: 'Marcar SH006' }))
    expect(marcar).toHaveBeenCalledTimes(1)
  })
})

describe('BarraSeleccion', () => {
  it('«Marcar todas» y «Quitar todas» llaman a su acción', () => {
    const todas = vi.fn()
    const ninguna = vi.fn()
    render(<BarraSeleccion resumen="4 de 6 marcadas · $359,600.00" onTodas={todas} onNinguna={ninguna} />)
    expect(screen.getByText('4 de 6 marcadas · $359,600.00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todas' }))
    expect(todas).toHaveBeenCalledTimes(1)
    expect(ninguna).toHaveBeenCalledTimes(1)
  })

  it('acepta otras etiquetas (conceptos, proyectos)', () => {
    render(<BarraSeleccion resumen="2 de 3 marcados" onTodas={() => {}} onNinguna={() => {}} etiquetaTodas="Marcar todos" etiquetaNinguna="Quitar todos" />)
    expect(screen.getByRole('button', { name: 'Marcar todos' })).toBeTruthy()
  })
})

describe('PieVentana', () => {
  it('la línea de detalle toma el tono: ok verde, acento naranja y neutro por defecto', () => {
    const { rerender } = render(<PieVentana titulo="Aplicado $1 de $1" detalle="Cuadra · 1 factura" tonoDetalle="ok" botones={null} />)
    expect(screen.getByText('Cuadra · 1 factura').className).toContain('text-approved-fg')
    rerender(<PieVentana titulo="x" detalle="Por aplicar $5.00" tonoDetalle="acento" botones={null} />)
    expect(screen.getByText('Por aplicar $5.00').className).toContain('text-accent')
    rerender(<PieVentana titulo="x" detalle="Elige un XML" botones={null} />)
    expect(screen.getByText('Elige un XML').className).toContain('text-subtext')
  })
})
