/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, O1, U1, D4, D9, D12, S17): lectura
 * por periodo.
 *
 * Derivación de referencia en TS: sobre los conceptos crudos se deriva con
 * `concepto.ts` y después se filtra, busca, cuenta por mes, se arman los
 * totales con `calcularCierreProyecto` y se pagina.
 *
 * Desde O1b la ruta del periodo usa la versión SQL (`cuentas_periodo`) para
 * no mover el año crudo; esta sigue armando el proyecto seleccionado (sobre
 * la lectura de ese solo proyecto), alimenta los mocks e2e y es la referencia
 * del test de paridad (tests/e2e/live/cuentas-paridad-sql.spec.ts). Un cambio
 * de regla va en los dos lados. Módulo puro: la BD vive en `periodo-rpc.ts`.
 */
import { calcularCierreProyecto, type CuentaPagarCierreInput } from '@/lib/shared/cierre-proyecto'
import { calcularCierreMensual } from '@/lib/shared/cuentas/cierre-mensual'
import {
  derivarCobro,
  derivarCuentasProyecto,
  derivarPago,
  type ConceptoDerivado,
} from '@/lib/shared/cuentas/concepto'
import {
  SIN_PROYECTO_ID,
  type ConceptoLista,
  type ConceptoVista,
  type FiltroEstado,
  type FiltroTipo,
  type MesPeriodo,
  type MesResumen,
  type PeriodoRespuesta,
  type ProyectoDetalle,
  type TarjetaProyecto,
  type TotalesPeriodo,
  type TotalesProyecto,
  type VistaCuentas,
} from '@/lib/shared/cuentas/periodo-tipos'
import { round2 } from '@/lib/shared/decimal'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'
import type { CuentasAnioRaw, GrupoAnioRaw, PagoAnioRaw } from './periodo-crudo'

// ── Derivación del año ─────────────────────────────────────────────────────

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/
const ORDEN_ES = new Intl.Collator('es')

function sumar<T>(items: T[], f: (x: T) => number): number {
  return round2(items.reduce((s, x) => s + f(x), 0))
}

function vista(base: Omit<ConceptoVista, keyof ConceptoDerivado>, derivado: ConceptoDerivado): ConceptoVista {
  return { ...derivado, ...base }
}

function conceptoGrupo(grupo: GrupoAnioRaw): ConceptoVista {
  const estimado = grupo.total_a_transferir == null
  const total = estimado ? calcularEjemploFactura(grupo.monto_total, grupo.regimen_fiscal).total : round2(grupo.total_a_transferir!)
  const pagado = round2(grupo.monto_transferido)
  const derivado = derivarPago({
    tipo: 'pago',
    total,
    pagado,
    tiene_proveedor: true,
    orden_pago_id: grupo.orden_pago_id,
    facturas_xml: grupo.facturas_xml,
    comprobantes: grupo.comprobantes,
    fechas_pago: grupo.pagos_realizados.map((p) => p.fecha),
  })
  return vista(
    {
      key: `g:${grupo.id}`,
      tipo: 'pago',
      objetivo: 'grupo',
      id: grupo.id,
      proyecto_id: grupo.proyecto_id,
      cotizacion_id: null,
      folio: null,
      contraparte: grupo.responsable_nombre ?? 'Proveedor',
      contraparte_id: grupo.responsable_id,
      concepto: grupo.n_items === 1 ? (grupo.descripcion ?? 'Concepto') : `${grupo.n_items} conceptos`,
      items: grupo.n_items,
      total,
      pagado,
      total_estimado: estimado,
      regimen_fiscal: grupo.regimen_fiscal,
      orden_pago_id: grupo.orden_pago_id,
      fecha_vencimiento: null,
    },
    derivado
  )
}

function conceptoSuelta(cuenta: PagoAnioRaw): ConceptoVista {
  const estimado = cuenta.total_a_transferir == null
  const total = estimado ? calcularEjemploFactura(cuenta.x_pagar, cuenta.regimen_fiscal).total : round2(cuenta.total_a_transferir!)
  const pagado = round2(cuenta.monto_transferido)
  const derivado = derivarPago({
    tipo: 'pago',
    total,
    pagado,
    tiene_proveedor: Boolean(cuenta.responsable_id),
    orden_pago_id: cuenta.orden_pago_id,
    facturas_xml: cuenta.facturas_xml,
    comprobantes: cuenta.comprobantes,
    fechas_pago: cuenta.pagos_realizados.map((p) => p.fecha),
  })
  return vista(
    {
      key: `s:${cuenta.id}`,
      tipo: 'pago',
      objetivo: 'cuenta',
      id: cuenta.id,
      proyecto_id: cuenta.proyecto_id,
      cotizacion_id: cuenta.cotizacion_id,
      folio: null,
      contraparte: cuenta.responsable_id ? (cuenta.responsable_nombre ?? 'Proveedor') : 'Sin asignar',
      contraparte_id: cuenta.responsable_id,
      concepto: cuenta.item_descripcion ?? 'Concepto',
      items: 1,
      total,
      pagado,
      total_estimado: estimado,
      regimen_fiscal: cuenta.regimen_fiscal,
      orden_pago_id: cuenta.orden_pago_id,
      fecha_vencimiento: null,
    },
    derivado
  )
}

function totalesDe(conceptos: ConceptoVista[]): TotalesProyecto {
  const cobros = conceptos.filter((c) => c.tipo === 'cobro')
  const pagos = conceptos.filter((c) => c.tipo === 'pago')
  return {
    cobros_total: sumar(cobros, (c) => c.total),
    cobrado: sumar(cobros, (c) => Math.min(c.pagado, c.total)),
    por_cobrar: sumar(cobros, (c) => c.saldo),
    pagos_total: sumar(pagos, (c) => c.total),
    pagado: sumar(pagos, (c) => Math.min(c.pagado, c.total)),
    por_pagar: sumar(pagos, (c) => c.saldo),
  }
}

/**
 * Deriva todos los proyectos del año (más "Sin fecha" y "Sin proyecto") con
 * sus conceptos, el estado de sus cuentas (D17), sus totales y su cierre.
 */
export function construirProyectos(raw: CuentasAnioRaw, hoy: string): ProyectoDetalle[] {
  const porProyecto = <T extends { proyecto_id: string | null }>(items: T[]) => {
    const mapa = new Map<string, T[]>()
    for (const item of items) {
      const k = item.proyecto_id ?? SIN_PROYECTO_ID
      const lista = mapa.get(k)
      if (lista) lista.push(item)
      else mapa.set(k, [item])
    }
    return mapa
  }
  const cobros = porProyecto(raw.cobros)
  const pagos = porProyecto(raw.pagos)
  const grupos = porProyecto(raw.grupos)

  const bases = raw.proyectos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cliente: p.cliente,
    fecha_entrega: p.fecha_entrega && FECHA_VALIDA.test(p.fecha_entrega) ? p.fecha_entrega : null,
    margen: p.margen_total_proyecto,
    fee: p.fee_agencia_proyecto,
    iva: p.iva_total_proyecto,
    sin_proyecto: false,
  }))
  if (cobros.has(SIN_PROYECTO_ID) || pagos.has(SIN_PROYECTO_ID) || grupos.has(SIN_PROYECTO_ID)) {
    bases.push({ id: SIN_PROYECTO_ID, nombre: 'Sin proyecto', cliente: null, fecha_entrega: null, margen: 0, fee: 0, iva: 0, sin_proyecto: true })
  }

  return bases.map((b) => {
    const cobrosP = cobros.get(b.id) ?? []
    const pagosP = pagos.get(b.id) ?? []
    const gruposP = grupos.get(b.id) ?? []


    const conceptos: ConceptoVista[] = [
      ...cobrosP.map((cc) =>
        vista(
          {
            key: `c:${cc.id}`,
            tipo: 'cobro',
            objetivo: 'cobro',
            id: cc.id,
            proyecto_id: cc.proyecto_id,
            cotizacion_id: cc.cotizacion_id,
            folio: cc.folio,
            contraparte: cc.cliente ?? b.cliente ?? 'Cliente',
            contraparte_id: cc.cliente_id,
            concepto: !cc.proyecto_id || cc.cotizacion_id === cc.proyecto_id ? `Cotización ${cc.cotizacion_id}` : `Complementaria ${cc.cotizacion_id}`,
            items: 1,
            total: round2(cc.monto_total),
            pagado: round2(cc.monto_pagado),
            total_estimado: false,
            regimen_fiscal: null,
            orden_pago_id: null,
            fecha_vencimiento: cc.fecha_vencimiento,
          },
          derivarCobro(
            {
              tipo: 'cobro',
              total: cc.monto_total,
              pagado: cc.monto_pagado,
              fecha_vencimiento: cc.fecha_vencimiento,
              fecha_factura: cc.fecha_factura,
              facturas_xml: cc.facturas_xml,
              pagos: cc.pagos,
            },
            hoy
          )
        )
      ),
      ...gruposP.map(conceptoGrupo),
      ...pagosP.map(conceptoSuelta),
    ]

    // El cierre agrupa por grupo con el monto del grupo y su snapshot (H10):
    // un renglón por grupo (su monto_total manda) y uno por suelta.
    const cierreInput: CuentaPagarCierreInput[] = [
      ...gruposP.map((g) => ({
        id: g.id,
        grupo_id: g.id,
        x_pagar: g.monto_total,
        responsable_id: g.responsable_id,
        responsable_nombre: g.responsable_nombre ?? 'Proveedor',
        grupo_monto_total: g.monto_total,
        grupo_total_a_transferir: g.total_a_transferir,
        total_a_transferir: null,
        proveedor_regimen_fiscal: g.regimen_fiscal,
      })),
      ...pagosP.map((cp) => ({
        id: cp.id,
        grupo_id: null,
        x_pagar: cp.x_pagar,
        responsable_id: cp.responsable_id,
        responsable_nombre: cp.responsable_nombre ?? 'Proveedor',
        grupo_monto_total: null,
        grupo_total_a_transferir: null,
        total_a_transferir: cp.total_a_transferir,
        proveedor_regimen_fiscal: cp.regimen_fiscal,
      })),
    ]

    const cierre = calcularCierreProyecto(cierreInput, b.margen, b.fee, b.iva)
    const pagosProveedor: Record<string, { fecha: string; monto: number }[]> = {}
    for (const g of gruposP) pagosProveedor[g.id] = g.pagos_realizados
    for (const cp of pagosP) pagosProveedor[cp.id] = cp.pagos_realizados

    const fecha = b.fecha_entrega
    return {
      id: b.id,
      nombre: b.nombre,
      cliente: b.cliente,
      fecha_entrega: fecha,
      anio: fecha ? Number(fecha.slice(0, 4)) : null,
      mes: fecha ? Number(fecha.slice(5, 7)) : null,
      sin_fecha: !fecha,
      sin_proyecto: b.sin_proyecto,
      conceptos,
      cuentas: derivarCuentasProyecto(conceptos),
      totales: totalesDe(conceptos),
      cierre,
      cierre_mensual: calcularCierreMensual({
        cierre,
        cobros: cobrosP.map((cc) => ({ total: cc.monto_total, pagos: cc.pagos.map((pg) => ({ fecha: pg.fecha_pago, monto: pg.monto })) })),
        pagosProveedor,
      }),
    }
  })
}

// ── Periodo ────────────────────────────────────────────────────────────────

export interface ParametrosPeriodo {
  anio: number
  mes: MesPeriodo
  estado: FiltroEstado
  tipo: FiltroTipo
  cliente?: string | null
  proveedor?: string | null
  q?: string | null
  vista: VistaCuentas
  proyecto?: string | null
  page: number
  page_size: number
}

export function normalizarBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function tarjeta(p: ProyectoDetalle): TarjetaProyecto {
  // Sin los conceptos ni el cierre: la tarjeta solo lleva lo que pinta.
  const { conceptos: _conceptos, cierre: _cierre, cierre_mensual: _mensual, ...resto } = p
  void _conceptos
  void _cierre
  void _mensual
  return resto
}

function paginar<T>(items: T[], page: number, pageSize: number) {
  const inicio = (page - 1) * pageSize
  return { items: items.slice(inicio, inicio + pageSize), total: items.length, page, page_size: pageSize }
}

function totalesPeriodo(proyectos: { p: ProyectoDetalle; conceptos: ConceptoVista[] }[]): TotalesPeriodo {
  const todos = proyectos.flatMap((x) => x.conceptos)
  const t = totalesDe(todos)
  const cierres = proyectos.map((x) => x.p.cierre)
  const iva = sumar(cierres, (c) => c.iva_neto_a_enterar)
  const retenciones = sumar(cierres, (c) => c.iva_retenido_total + c.isr_retenido_total)
  const isr = sumar(cierres, (c) => c.isr_serenata_estimado)
  return {
    ingresos: { total: t.cobros_total, cobrado: t.cobrado, por_cobrar: t.por_cobrar },
    egresos: { total: t.pagos_total, pagado: t.pagado, por_pagar: t.por_pagar },
    utilidad: {
      bruta: sumar(cierres, (c) => c.utilidad_bruta),
      isr_estimado: isr,
      neta: sumar(cierres, (c) => c.utilidad_neta),
    },
    impuestos: { iva_a_enterar: iva, retenciones, isr_estimado: isr, total: round2(iva + retenciones + isr) },
  }
}

/**
 * Filtra, cuenta y pagina el periodo pedido. Mismas reglas que el prototipo
 * (`cuentas-data.js`, `compute`):
 * - un proyecto entra si alguno de sus conceptos pasa tipo/cliente/proveedor
 *   y la búsqueda; de él se muestran solo esos conceptos;
 * - el estado (Pendientes/Cerradas) filtra proyectos; en la Lista,
 *   "Pendientes" deja solo los conceptos con siguiente paso;
 * - los contadores de mes cuentan proyectos pendientes sin el filtro de
 *   estado; "Sin fecha" y "Sin proyecto" no suman a meses ni totales (S17).
 */
type FiltrosConcepto = Pick<ParametrosPeriodo, 'tipo' | 'cliente' | 'proveedor' | 'q'>

/** Filtro de conceptos por tipo, cliente, proveedor y búsqueda (mismo criterio que cuentas_periodo). */
function filtroConceptos(params: FiltrosConcepto) {
  const q = params.q ? normalizarBusqueda(params.q) : ''
  const conceptoOk = (c: ConceptoVista) =>
    (params.tipo === 'todo' || c.tipo === params.tipo) &&
    (!params.cliente || (c.tipo === 'cobro' && c.contraparte === params.cliente)) &&
    (!params.proveedor || (c.tipo === 'pago' && c.contraparte === params.proveedor))
  const busquedaOk = (p: ProyectoDetalle, c: ConceptoVista) =>
    !q || [p.id, p.nombre, p.cliente ?? '', c.contraparte, c.concepto].some((s) => normalizarBusqueda(s).includes(q))
  return (p: ProyectoDetalle, c: ConceptoVista) => conceptoOk(c) && busquedaOk(p, c)
}

/**
 * Proyecto abierto en el panel (B4): con sus conceptos filtrados, o todos si
 * ninguno pasa el filtro. `proyectos` puede ser el año completo o la lectura
 * cruda de ese solo proyecto (O1b).
 */
export function seleccionarProyecto(
  proyectos: ProyectoDetalle[],
  params: FiltrosConcepto & { proyecto?: string | null }
): ProyectoDetalle | null {
  if (!params.proyecto) return null
  const encontrado = proyectos.find((p) => p.id === params.proyecto)
  if (!encontrado) return null
  const pasa = filtroConceptos(params)
  const filtrados = encontrado.conceptos.filter((c) => pasa(encontrado, c))
  return { ...encontrado, conceptos: filtrados.length ? filtrados : encontrado.conceptos }
}

export function construirPeriodo(proyectos: ProyectoDetalle[], params: ParametrosPeriodo, hoy: string): PeriodoRespuesta {
  const pasa = filtroConceptos(params)
  const estadoOk = (p: ProyectoDetalle) =>
    params.estado === 'todas' || (params.estado === 'pendientes' ? !p.cuentas.cerradas : p.cuentas.cerradas)

  const decorados = proyectos
    .map((p) => ({ p, conceptos: p.conceptos.filter((c) => pasa(p, c)) }))
    .filter((x) => x.conceptos.length > 0)

  const delAnio = decorados.filter((x) => !x.p.sin_fecha && x.p.anio === params.anio)
  const sinFecha = decorados.filter((x) => x.p.sin_fecha)

  const meses: MesResumen[] = Array.from({ length: 12 }, (_, i) => {
    const delMes = delAnio.filter((x) => x.p.mes === i + 1)
    return {
      mes: i + 1,
      proyectos: delMes.length,
      pendientes: delMes.filter((x) => !x.p.cuentas.cerradas).length,
      visibles: delMes.filter((x) => estadoOk(x.p)).length,
    }
  })

  const alcance = params.mes === 'todo' ? delAnio : delAnio.filter((x) => x.p.mes === params.mes)
  const visibles = alcance
    .filter((x) => estadoOk(x.p))
    .sort((a, b) => (a.p.mes ?? 0) - (b.p.mes ?? 0) || Number(a.p.cuentas.cerradas) - Number(b.p.cuentas.cerradas))
  const sinFechaVisibles = params.mes === 'todo' ? sinFecha.filter((x) => estadoOk(x.p)) : []

  const filaOk = (c: ConceptoVista) => params.estado !== 'pendientes' || !c.resuelto
  const filas: ConceptoLista[] = [...visibles, ...sinFechaVisibles].flatMap((x) =>
    x.conceptos.filter(filaOk).map((c) => ({
      ...c,
      proyecto: { id: x.p.id, nombre: x.p.nombre, mes: x.p.mes, sin_fecha: x.p.sin_fecha },
    }))
  )
  const proyectosConFilas = new Set(filas.map((f) => f.proyecto.id)).size

  const opciones = {
    clientes: Array.from(new Set(proyectos.flatMap((p) => p.conceptos.filter((c) => c.tipo === 'cobro').map((c) => c.contraparte)))).sort(ORDEN_ES.compare),
    proveedores: Array.from(new Set(proyectos.flatMap((p) => p.conceptos.filter((c) => c.tipo === 'pago' && c.contraparte_id).map((c) => c.contraparte)))).sort(ORDEN_ES.compare),
  }

  return {
    anio: params.anio,
    mes: params.mes,
    hoy,
    meses,
    conteo: {
      todas: alcance.length,
      pendientes: alcance.filter((x) => !x.p.cuentas.cerradas).length,
      cerradas: alcance.filter((x) => x.p.cuentas.cerradas).length,
    },
    totales: totalesPeriodo(alcance),
    opciones,
    proyectos: params.vista === 'proyectos' ? paginar(visibles.map((x) => tarjeta(x.p)), params.page, params.page_size) : paginar([], 1, params.page_size),
    sin_fecha: params.vista === 'proyectos' ? sinFechaVisibles.map((x) => tarjeta(x.p)) : [],
    lista: params.vista === 'lista'
      ? { ...paginar(filas, params.page, params.page_size), proyectos: proyectosConFilas }
      : { ...paginar([], 1, params.page_size), proyectos: 0 },
    seleccionado: seleccionarProyecto(proyectos, params),
  }
}

/** Proyectos con pendientes por año (select de periodo, S4). */
export function pendientesPorAnio(proyectos: ProyectoDetalle[], anio: number): number {
  return proyectos.filter((p) => !p.sin_fecha && p.anio === anio && !p.cuentas.cerradas).length
}

/** Último mes del año con proyectos (S16); "Todo el año" si no hay ninguno. */
export function ultimoMesConDatos(proyectos: ProyectoDetalle[], anio: number): MesPeriodo {
  const meses = proyectos.filter((p) => !p.sin_fecha && p.anio === anio && p.mes).map((p) => p.mes!)
  return meses.length ? Math.max(...meses) : 'todo'
}
