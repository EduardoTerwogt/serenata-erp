import { describe, expect, it } from 'vitest'


import { AVISOS_POR_CATEGORIA, agruparAvisos, derivarAvisos } from '../avisos'
import { construirOpciones, construirPeriodo, construirProyectos, normalizarBusqueda, pendientesPorAnio, ultimoMesConDatos, type ParametrosPeriodo } from '../periodo'
import { decodificarCuentasAnio, type CuentasAnioRaw } from '../periodo-crudo'
import { SIN_PROYECTO_ID } from '@/lib/shared/cuentas/periodo-tipos'

const HOY = '2026-09-24'
const validado = (fecha = '2026-09-01 10:00:00', metodo: 'PUE' | 'PPD' | null = 'PUE') => ({ estado_validacion: 'validado' as const, fecha_carga: fecha, metodo_pago: metodo })

/** Filas posicionales tal como las devuelve cuentas_por_proyecto(p_year). */
function rpc(): unknown {
  return {
    proyectos: [
      // id, nombre, cliente, cliente_id, fecha_entrega, margen, fee, utilidad, iva
      ['SH061', 'Lanzamiento Aurora', 'Grupo Modelo', null, '2026-09-18', 20000, 5000, 25000, 16000],
      ['SH062', 'Sesión Otoño', 'Zara', null, '2026-09-10', 1000, 0, 1000, 160],
      ['SH050', 'Documental Oaxaca', 'FEMSA', null, '2026-06-12', 0, 0, 0, 0],
      ['SH099', 'Sin fecha', 'Cliente X', null, null, 0, 0, 0, 0],
    ],
    cobros: [
      // id, cotizacion_id, proyecto_id, folio, cliente, cliente_id, proyecto, monto_total, monto_pagado, fecha_vencimiento, fecha_factura, facturas_xml, pagos
      ['cc-1', 'SH061', 'SH061', 'CC-1', 'Grupo Modelo', null, 'Aurora', 348000, 174000, '2026-10-02', '2026-09-01', [validado()], [{ id: 'p1', monto: 174000, fecha_pago: '2026-09-05' }]],
      ['cc-2', 'SH061-C1', 'SH061', 'CC-2', 'Grupo Modelo', null, 'Aurora', 52200, 0, '2026-09-10', null, null, null],
      ['cc-3', 'SH062', 'SH062', 'CC-3', 'Zara', null, 'Otoño', 64960, 64960, null, '2026-09-01', [validado()], [{ id: 'p2', monto: 64960, fecha_pago: '2026-09-20' }]],
      ['cc-4', 'SH050', 'SH050', 'CC-4', 'FEMSA', null, 'Oaxaca', 1000, 0, null, null, null, null],
      ['cc-5', 'SH099', 'SH099', 'CC-5', 'Cliente X', null, 'X', 100, 0, null, null, null, null],
      ['cc-6', 'SHX', null, 'CC-6', 'Suelto', null, 'X', 50, 0, null, null, null, null],
    ],
    pagos: [
      // id, cotizacion_id, proyecto_id, grupo_id, responsable_id, responsable_nombre, item_descripcion, x_pagar, monto_pagado, total_a_transferir, monto_transferido, orden_pago_id, regimen, facturas, comprobantes, pagos_realizados
      ['cp-3', 'SH061', 'SH061', null, null, 'Sin asignar', 'Van', 15600, 0, null, 0, null, null, null, null, null],
    ],
    grupos: [
      // id, proyecto_id, responsable_id, responsable_nombre, regimen, monto_total, monto_pagado, total_a_transferir, monto_transferido, orden_pago_id, facturas, comprobantes, pagos_realizados, n_items, descripcion
      ['g-1', 'SH061', 'prov-1', 'Iluminación Pro', 'moral', 46800, 0, 54288, 0, null, [{ estado_validacion: 'validado', fecha_carga: '2026-09-02 10:00:00' }], null, null, 2, 'Paquete ARRI'],
      ['g-2', 'SH062', 'prov-2', 'Estudio Luz', 'moral', 18500, 18500, 21460, 21460, null, [{ estado_validacion: 'validado', fecha_carga: '2026-09-11 10:00:00' }], [{ fecha_carga: '2026-09-21 10:00:00' }], [{ fecha: '2026-09-21', monto: 21460 }], 1, 'Renta'],
    ],
  }
}

const params = (over: Partial<ParametrosPeriodo> = {}): ParametrosPeriodo => ({
  anio: 2026, mes: 9, estado: 'todas', tipo: 'todo', vista: 'proyectos', page: 1, page_size: 60, ...over,
})

function proyectos(data: unknown = rpc()) {
  return construirProyectos(decodificarCuentasAnio(data), HOY)
}

describe('decodificarCuentasAnio', () => {
  it('convierte filas posicionales a objetos, con null = ninguno', () => {
    const raw: CuentasAnioRaw = decodificarCuentasAnio(rpc())
    expect(raw.proyectos[0]).toMatchObject({ id: 'SH061', fecha_entrega: '2026-09-18', margen_total_proyecto: 20000, iva_total_proyecto: 16000 })
    expect(raw.cobros[1]).toMatchObject({ id: 'cc-2', facturas_xml: [], pagos: [] })
    expect(raw.pagos[0]).toMatchObject({ id: 'cp-3', grupo_id: null, total_a_transferir: null, comprobantes: [], pagos_realizados: [] })
    expect(raw.grupos[0]).toMatchObject({ total_a_transferir: 54288, regimen_fiscal: 'moral' })
    expect(raw.grupos[1].pagos_realizados).toEqual([{ fecha: '2026-09-21', monto: 21460 }])
    expect(raw.grupos[0]).toMatchObject({ n_items: 2, descripcion: 'Paquete ARRI' })
  })

  it('un grupo saldado con factura y comprobante cierra en la fecha de su último evento (S19)', () => {
    const g2 = proyectos().find((p) => p.id === 'SH062')!.conceptos.find((c) => c.key === 'g:g-2')!
    expect(g2).toMatchObject({ estado: 'pagado', paso: null, fecha_resuelto: '2026-09-21' })
  })

  it('una respuesta vacía no truena', () => {
    expect(decodificarCuentasAnio(null)).toEqual({ proyectos: [], cobros: [], pagos: [], grupos: [] })
  })
})

describe('construirProyectos', () => {
  it('un grupo es un concepto en total a transferir; una suelta sin proveedor pide asignarlo (T2)', () => {
    const sh061 = proyectos().find((p) => p.id === 'SH061')!
    const grupo = sh061.conceptos.find((c) => c.key === 'g:g-1')!
    expect(grupo).toMatchObject({ tipo: 'pago', items: 2, concepto: '2 conceptos', total: 54288, pagado: 0, total_estimado: false, estado: 'facturado', paso: 'pagar' })
    const suelta = sh061.conceptos.find((c) => c.key === 's:cp-3')!
    expect(suelta).toMatchObject({ contraparte: 'Sin asignar', estado: 'sin_proveedor', total_estimado: true, total: 18096 })
  })

  it('cobros: principal y complementaria, parcial y vencido sin factura', () => {
    const sh061 = proyectos().find((p) => p.id === 'SH061')!
    expect(sh061.conceptos.find((c) => c.key === 'c:cc-1')).toMatchObject({ concepto: 'Cotización SH061', estado: 'parcial', paso: 'cobrar', saldo: 174000 })
    expect(sh061.conceptos.find((c) => c.key === 'c:cc-2')).toMatchObject({ concepto: 'Complementaria SH061-C1', estado: 'vencido', paso: 'emitir_factura' })
    expect(sh061.cuentas).toMatchObject({ cerradas: false, pendientes: 4, hay_vencidos: true })
  })

  it('proyecto resuelto: cuentas cerradas con la fecha del último evento (D17, S19)', () => {
    const sh062 = proyectos().find((p) => p.id === 'SH062')!
    expect(sh062.cuentas).toMatchObject({ cerradas: true, pendientes: 0, fecha_cierre: '2026-09-21' })
    expect(sh062.totales).toEqual({ cobros_total: 64960, cobrado: 64960, por_cobrar: 0, pagos_total: 21460, pagado: 21460, por_pagar: 0 })
  })

  it('el cierre usa el grupo con su snapshot (H10), no cada renglón', () => {
    const sh061 = proyectos().find((p) => p.id === 'SH061')!
    const quien = sh061.cierre.quien_cuanto_cuando
    expect(quien.find((q) => q.proveedor_id === 'prov-1')).toMatchObject({ neto: 46800, total_a_transferir: 54288, total_es_snapshot: true })
    expect(sh061.cierre.utilidad_bruta).toBe(25000)
  })

  it('"Sin fecha" y "Sin proyecto" (S17, supuesto 11)', () => {
    const todos = proyectos()
    expect(todos.find((p) => p.id === 'SH099')).toMatchObject({ sin_fecha: true, mes: null, anio: null })
    expect(todos.find((p) => p.id === SIN_PROYECTO_ID)).toMatchObject({ sin_proyecto: true, sin_fecha: true, nombre: 'Sin proyecto' })
  })
})

describe('ultimoMesConDatos (S16)', () => {
  it('toma el último mes con proyectos del año, o "todo" si no hay', () => {
    expect(ultimoMesConDatos(proyectos(), 2026)).toBe(9)
    expect(ultimoMesConDatos(proyectos(), 2025)).toBe('todo')
  })
})

describe('construirPeriodo', () => {
  it('mes: tarjetas del mes, abiertas primero, y contadores de pendientes por mes', () => {
    const r = construirPeriodo(proyectos(), params(), HOY)
    expect(r.proyectos.items.map((p) => p.id)).toEqual(['SH061', 'SH062'])
    expect(r.meses[8]).toEqual({ mes: 9, proyectos: 2, pendientes: 1, visibles: 2 })
    expect(r.meses[5]).toEqual({ mes: 6, proyectos: 1, pendientes: 1, visibles: 1 })
    expect(r.conteo).toEqual({ todas: 2, pendientes: 1, cerradas: 1 })
    expect(r.sin_fecha).toEqual([])
  })

  it('con estado "Cerradas", el mes cuenta sus proyectos visibles para atenuar la pastilla', () => {
    const r = construirPeriodo(proyectos(), params({ estado: 'cerradas' }), HOY)
    expect(r.meses[8]).toMatchObject({ proyectos: 2, pendientes: 1, visibles: 1 })
    expect(r.meses[5]).toMatchObject({ proyectos: 1, visibles: 0 })
  })

  it('el proyecto seleccionado trae su cierre por mes con el cuadre exacto (D26)', () => {
    const r = construirPeriodo(proyectos(), params({ proyecto: 'SH062' }), HOY)
    const filas = r.seleccionado!.cierre_mensual
    const iva = filas.filter((f) => f.concepto === 'iva').reduce((a, f) => a + f.monto, 0)
    expect(round(iva)).toBe(r.seleccionado!.cierre.iva_neto_a_enterar)
    expect(filas[0]).toMatchObject({ concepto: 'proveedores', monto: 21460 })
    expect(r.proyectos.items[0]).not.toHaveProperty('cierre_mensual')
  })

  it('totales del periodo (D4): cobros con IVA, pagos en total a transferir, utilidad del cierre', () => {
    const r = construirPeriodo(proyectos(), params(), HOY)
    expect(r.totales.ingresos).toEqual({ total: 465160, cobrado: 238960, por_cobrar: 226200 })
    expect(r.totales.egresos).toEqual({ total: 93844, pagado: 21460, por_pagar: 72384 })
    expect(r.totales.utilidad.bruta).toBe(26000)
    expect(r.totales.impuestos.total).toBe(round(r.totales.impuestos.iva_a_enterar + r.totales.impuestos.retenciones + r.totales.impuestos.isr_estimado))
  })

  it('"Todo el año" trae "Sin fecha" y "Sin proyecto" aparte, sin sumarlos a totales ni meses', () => {
    const r = construirPeriodo(proyectos(), params({ mes: 'todo' }), HOY)
    expect(r.proyectos.items.map((p) => p.id)).toEqual(['SH050', 'SH061', 'SH062'])
    expect(r.sin_fecha.map((p) => p.id).sort()).toEqual(['SH099', SIN_PROYECTO_ID].sort())
    expect(r.totales.ingresos.total).toBe(466160)
  })

  it('estado: pendientes deja proyectos abiertos; en la Lista, solo conceptos con siguiente paso', () => {
    const r = construirPeriodo(proyectos(), params({ estado: 'pendientes', vista: 'lista' }), HOY)
    expect(r.lista.items.every((c) => !c.resuelto)).toBe(true)
    expect(new Set(r.lista.items.map((c) => c.proyecto.id))).toEqual(new Set(['SH061']))
    expect(r.lista.proyectos).toBe(1)
  })

  it('tipo, proveedor y búsqueda sin acentos', () => {
    const porPagar = construirPeriodo(proyectos(), params({ tipo: 'pago', vista: 'lista' }), HOY)
    expect(porPagar.lista.items.every((c) => c.tipo === 'pago')).toBe(true)
    const prov = construirPeriodo(proyectos(), params({ proveedor: 'Estudio Luz', vista: 'lista' }), HOY)
    expect(prov.lista.items.map((c) => c.key)).toEqual(['g:g-2'])
    const busqueda = construirPeriodo(proyectos(), params({ q: 'SESION', vista: 'lista' }), HOY)
    expect(new Set(busqueda.lista.items.map((c) => c.proyecto.id))).toEqual(new Set(['SH062']))
    expect(normalizarBusqueda('Sesión')).toBe('sesion')
  })

  it('opciones de filtro (E6): del año, clientes y proveedores con proveedor asignado, fuera del periodo', () => {
    const r = construirOpciones(proyectos(), 2026)
    expect(r.anio).toBe(2026)
    expect(r.proveedores).toEqual(['Estudio Luz', 'Iluminación Pro'])
    expect(r.clientes).toContain('Grupo Modelo')
    expect(construirPeriodo(proyectos(), params(), HOY)).not.toHaveProperty('opciones')
  })

  it('pagina la Lista y devuelve el proyecto seleccionado con sus conceptos', () => {
    const r = construirPeriodo(proyectos(), params({ vista: 'lista', page: 2, page_size: 2, proyecto: 'SH061' }), HOY)
    expect(r.lista.page).toBe(2)
    expect(r.lista.items).toHaveLength(2)
    expect(r.lista.total).toBe(6)
    expect(r.seleccionado?.id).toBe('SH061')
    expect(r.seleccionado?.conceptos).toHaveLength(4)
    expect(r.seleccionado?.cierre.utilidad_bruta).toBe(25000)
  })

  it('pendientes por año no cuenta "Sin fecha"', () => {
    expect(pendientesPorAnio(proyectos(), 2026)).toBe(2)
  })
})

describe('derivarAvisos', () => {
  it('agrupa en las 5 categorías con sus reglas', () => {
    const avisos = derivarAvisos(proyectos(), HOY)
    const por = Object.fromEntries(avisos.categorias.map((c) => [c.categoria, c.items.map((i) => i.key)]))
    expect(por.vencidos).toEqual(['c:cc-2'])
    expect(por.por_vencer).toEqual(['c:cc-1']) // vence en 8 días
    expect(por.por_emitir).toEqual(expect.arrayContaining(['c:cc-2', 'c:cc-4']))
    expect(por.por_emitir).not.toContain('c:cc-5') // sin fecha de evento
    expect(avisos.total).toBe(avisos.categorias.reduce((s, c) => s + c.items.length, 0))
  })

  it('por categoría viajan solo los más urgentes; el total cuenta todos', () => {
    const candidatos = Array.from({ length: AVISOS_POR_CATEGORIA + 7 }, (_, i) => ({
      categoria: 'facturas_proveedor' as const,
      key: `s:${String(i).padStart(3, '0')}`,
      proyecto_id: 'SH1', proyecto_nombre: 'X', anio: 2026, mes: 9,
      fecha_entrega: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      contraparte: 'Prov', concepto: 'Renta', monto: 10, venc_dias: null, fecha_vencimiento: null,
    }))
    const avisos = agruparAvisos(candidatos, HOY)
    const cat = avisos.categorias[0]
    expect(cat.total).toBe(AVISOS_POR_CATEGORIA + 7)
    expect(cat.items).toHaveLength(AVISOS_POR_CATEGORIA)
    expect(cat.items[0].fecha).toBe('2026-09-01')
    expect(avisos.total).toBe(AVISOS_POR_CATEGORIA + 7)
    // Candidatos ya recortados por la BD: el total viene aparte.
    expect(agruparAvisos(candidatos.slice(0, 3), HOY, { facturas_proveedor: 900 }).total).toBe(900)
  })

  it('complemento faltante en un cobro PPD parcial', () => {
    const data = rpc() as { cobros: unknown[][] }
    data.cobros[0][11] = [validado('2026-09-01 10:00:00', 'PPD')]
    data.cobros[0][10] = '2026-09-01'
    const avisos = derivarAvisos(proyectos(data), HOY)
    expect(avisos.categorias.find((c) => c.categoria === 'complementos')?.items.map((i) => i.key)).toEqual(['c:cc-1'])
  })
})

function round(n: number) {
  return Math.round(n * 100) / 100
}
