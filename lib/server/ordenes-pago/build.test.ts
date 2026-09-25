import { describe, expect, it } from 'vitest'
import { buildOrdenPagoPreview } from '@/lib/server/ordenes-pago/build'
import type { CuentaPagarConJoins } from '@/lib/server/repositories/cuentas-pagar'

describe('ordenes-pago/build', () => {
  it('agrupa por responsable y evento', () => {
    const cuentas: CuentaPagarConJoins[] = [
      {
        id: '1',
        cotizacion_id: 'SH001',
        proyecto_id: 'SH001',
        proyecto_nombre: 'Evento A',
        item_id: 'i1',
        responsable_id: 'r1',
        responsable_nombre: 'José',
        item_descripcion: 'Audio',
        cantidad: 1,
        x_pagar: 1000,
        margen: 0,
        telefono: null,
        correo: null,
        clabe: null,
        banco: null,
        estado: 'PENDIENTE',
        fecha_pago: null,
        metodo_pago: null,
        notas: null,
      },
      {
        id: '2',
        cotizacion_id: 'SH001',
        proyecto_id: 'SH001',
        proyecto_nombre: 'Evento A',
        item_id: 'i2',
        responsable_id: 'r1',
        responsable_nombre: 'José',
        item_descripcion: 'Luces',
        cantidad: 2,
        x_pagar: 500,
        margen: 0,
        telefono: null,
        correo: null,
        clabe: null,
        banco: null,
        estado: 'PENDIENTE',
        fecha_pago: null,
        metodo_pago: null,
        notas: null,
      },
    ]
    const result = buildOrdenPagoPreview(cuentas)

    expect(result.resumen.responsables).toBe(1)
    expect(result.resumen.eventos).toBe(1)
    expect(result.resumen.items_totales).toBe(2)
    expect(result.resumen.total_general).toBe(1500)
    expect(result.responsables[0].eventos[0].items).toHaveLength(2)
  })

  const base = {
    cotizacion_id: 'SH002',
    proyecto_id: 'SH002',
    proyecto_nombre: 'Evento B',
    responsable_id: 'r2',
    responsable_nombre: 'Ana',
    cantidad: 1,
    margen: 0,
    telefono: null,
    correo: null,
    clabe: null,
    banco: null,
    fecha_pago: null,
    metodo_pago: null,
    notas: null,
  }

  it('B1b: la orden cubre el saldo, no el total, y omite hijas ya pagadas (supuesto 13)', () => {
    const cuentas = [
      { ...base, id: 'h1', item_id: 'i1', item_descripcion: 'Cámara', x_pagar: 1000, monto_pagado: 400, grupo_id: 'g1', estado: 'EN_PROCESO_PAGO' },
      { ...base, id: 'h2', item_id: 'i2', item_descripcion: 'Luces', x_pagar: 300, monto_pagado: 300, grupo_id: 'g1', estado: 'PAGADO' },
    ] as CuentaPagarConJoins[]
    const result = buildOrdenPagoPreview(cuentas)

    expect(result.resumen.total_general).toBe(600)
    expect(result.resumen.items_totales).toBe(1)
    expect(result.responsables[0].eventos[0].items.map((item) => item.monto)).toEqual([600])
    expect(result.cuentas_ids).toEqual(['h1'])
  })

  it('B1b: un candidato por grupo (suma del saldo de sus hijas) y uno por suelta', () => {
    const cuentas = [
      { ...base, id: 'h1', item_id: 'i1', item_descripcion: 'A', x_pagar: 100, monto_pagado: 0, grupo_id: 'g1', estado: 'PENDIENTE' },
      { ...base, id: 'h2', item_id: 'i2', item_descripcion: 'B', x_pagar: 50.1, monto_pagado: 0, grupo_id: 'g1', estado: 'PENDIENTE' },
      { ...base, id: 's1', item_id: 'i3', item_descripcion: 'C', x_pagar: 80, monto_pagado: 30, grupo_id: null, estado: 'PENDIENTE' },
    ] as CuentaPagarConJoins[]
    const result = buildOrdenPagoPreview(cuentas)

    expect(result.candidatos).toEqual([
      { tipo: 'grupo', id: 'g1', monto_esperado: 150.1 },
      { tipo: 'cuenta', id: 's1', monto_esperado: 50 },
    ])
    expect(result.resumen.total_general).toBe(200.1)
  })
})
