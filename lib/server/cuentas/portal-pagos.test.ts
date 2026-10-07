import { describe, expect, it } from 'vitest'
import type { EstadoCuentaRespuesta } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { pagosPorGrupo } from './portal-pagos'

const concepto = (id: string, proyecto: string) => ({
  key: `g:${id}`,
  objetivo: 'grupo' as const,
  id,
  proyecto_id: proyecto,
  proyecto_nombre: proyecto,
  cotizacion_id: proyecto,
  folio: null,
  concepto: proyecto,
  total: 100,
  pagado: 100,
  saldo: 0,
  estado: 'pagado',
  paso: null,
  venc_dias: null,
  fecha_vencimiento: null,
  resuelto: true,
})
const factura = (id: string, archivo: string, metodo: 'PUE' | 'PPD', grupo: string, proyecto: string) => ({
  id,
  uuid_cfdi: null,
  total_cfdi: 100,
  metodo_pago: metodo,
  estado_validacion: 'validado',
  detalle_validacion: null,
  archivo_url: null,
  archivo_nombre: archivo,
  fecha_carga: null,
  fecha_factura: '2026-09-01',
  fecha_vencimiento: null,
  total: 100,
  pagado: 100,
  saldo: 0,
  conceptos: [concepto(grupo, proyecto)],
})
const pago = (id: string, fecha: string, destinos: [string, string][], complementos: { factura_id: string }[] = [], anulado = false) => ({
  id,
  fecha_pago: fecha,
  tipo_pago: 'TRANSFERENCIA',
  comprobante_url: null,
  archivo_nombre: null,
  notas: null,
  anulado,
  anulado_motivo: null,
  monto: destinos.length * 100,
  aplicaciones: destinos.map(([destino, factura_id]) => ({ destino_id: destino, factura_id, folio: null, cotizacion_id: null, monto: 100 })),
  complementos: complementos.map((c, i) => ({ id: `c${i}`, tipo: 'COMPLEMENTO_PAGO' as const, estado: 'validado', factura_id: c.factura_id, archivo_url: null, monto_pagado: 100 })),
})

const estado = (facturas: ReturnType<typeof factura>[], pagos: ReturnType<typeof pago>[]): EstadoCuentaRespuesta => ({
  lado: 'proveedor',
  hoy: '2026-10-01',
  contraparte: { id: 'p1', nombre: 'Distrito Sonoro', rfc: null },
  resumen: { total: 0, pagado: 0, saldo: 0, vencido: 0, facturas: facturas.length, sin_factura: 0, sin_factura_saldo: 0 },
  facturas,
  sin_factura: [],
  pagos,
})

describe('pagosPorGrupo (Portal, solo lectura)', () => {
  const f1 = factura('f1', 'DS-0412.xml', 'PPD', 'g1', 'SH001')
  const f2 = factura('f2', 'DS-0415.xml', 'PUE', 'g2', 'SH003')

  it('un pago que cubrió varias facturas dice cuáles, para cada grupo que toca', () => {
    const r = pagosPorGrupo(estado([f1, f2], [pago('pg1', '2026-09-26', [['g1', 'f1'], ['g2', 'f2']])]))
    expect(r.get('g1')).toHaveLength(1)
    expect(r.get('g1')![0].cubre).toEqual([
      { grupo_id: 'g1', proyecto_id: 'SH001', factura: 'DS-0412', monto: 100 },
      { grupo_id: 'g2', proyecto_id: 'SH003', factura: 'DS-0415', monto: 100 },
    ])
    expect(r.get('g2')![0].cubre).toHaveLength(2)
  })

  it('el complemento solo aplica a facturas PPD: pendiente hasta que llega, recibido cuando ya está ligado', () => {
    const sin = pagosPorGrupo(estado([f1, f2], [pago('pg1', '2026-09-26', [['g1', 'f1'], ['g2', 'f2']])]))
    expect(sin.get('g1')![0].complemento).toBe('pendiente')
    expect(sin.get('g2')![0].complemento).toBe('no_aplica')
    const con = pagosPorGrupo(estado([f1, f2], [pago('pg1', '2026-09-26', [['g1', 'f1'], ['g2', 'f2']], [{ factura_id: 'f1' }])]))
    expect(con.get('g1')![0].complemento).toBe('recibido')
  })

  it('un complemento de otra factura no cuenta, y los pagos anulados no se muestran', () => {
    const r = pagosPorGrupo(estado([f1, f2], [pago('pg1', '2026-09-26', [['g1', 'f1']], [{ factura_id: 'otra' }]), pago('pg2', '2026-09-27', [['g1', 'f1']], [], true)]))
    expect(r.get('g1')).toHaveLength(1)
    expect(r.get('g1')![0].complemento).toBe('pendiente')
  })

  it('ordena del pago más reciente al más antiguo y un grupo sin pagos no aparece', () => {
    const r = pagosPorGrupo(estado([f1, f2], [pago('a', '2026-09-01', [['g1', 'f1']]), pago('b', '2026-09-20', [['g1', 'f1']])]))
    expect(r.get('g1')!.map((p) => p.pago_id)).toEqual(['b', 'a'])
    expect(r.has('g2')).toBe(false)
  })
})
