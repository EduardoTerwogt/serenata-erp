import type { Page } from '@playwright/test'
import { fulfillJson } from './http'
import { derivarAvisos } from '@/lib/server/cuentas/avisos'
import { construirOpciones, construirPeriodo, construirProyectos, pendientesPorAnio, ultimoMesConDatos } from '@/lib/server/cuentas/periodo'
import { decodificarCuentasAnio } from '@/lib/server/cuentas/periodo-crudo'
import type { FiltroEstado, FiltroTipo, MesPeriodo, ProyectoDetalle, VistaCuentas } from '@/lib/shared/cuentas/periodo-tipos'

/**
 * Rediseño de Cuentas (B4–B6): mocks de la lectura por periodo con los
 * datos de ejemplo del handoff (cuentas-data.js). La respuesta sale de la
 * derivación REAL del servidor (construirProyectos/construirPeriodo) sobre
 * filas crudas como las que devuelve cuentas_por_proyecto(p_year): así el
 * e2e prueba la UI contra lo que la ruta de verdad mandaría.
 */
export const HOY_E2E = '2026-09-24'

type EstadoCobro = 'cobrado' | 'sin_complemento' | 'vencido' | 'parcial' | 'facturado' | 'sin_factura'
type EstadoPago = 'pagado' | 'en_orden' | 'sin_factura' | 'facturado'

export interface ProyectoFixture {
  id: string
  nombre: string
  cliente: string
  evento: string | null
  margen: number
  cobros: [string, number, number, EstadoCobro, string?][]
  pagos: [string, string, number, EstadoPago, number?][]
}

export const PROYECTOS: ProyectoFixture[] = [
  { id: 'SH012', nombre: 'Spot Día del Padre', cliente: 'Liverpool', evento: '2024-06-08', margen: 60000, cobros: [['Producción spot 30s', 164000, 164000, 'cobrado']], pagos: [['Mario Hernández', 'Director de fotografía', 36000, 'pagado'], ['Foros Churubusco', 'Renta Foro 2', 41000, 'pagado']] },
  { id: 'SH018', nombre: 'Convención Anual', cliente: 'BBVA México', evento: '2024-11-14', margen: 110000, cobros: [['Producción de evento', 298000, 298000, 'cobrado']], pagos: [['Iluminación Pro CDMX', 'Iluminación escénica', 64000, 'pagado'], ['Catering La Mesa', 'Catering 120 personas', 38000, 'pagado']] },
  { id: 'SH050', nombre: 'Documental Oaxaca', cliente: 'Coca-Cola FEMSA', evento: '2026-06-12', margen: 90000, cobros: [['Documental 15 min', 281880, 281880, 'cobrado']], pagos: [['Mario Hernández', 'Director de fotografía (8 jornadas)', 100000, 'pagado'], ['Transportes Ágiles', 'Traslado equipo CDMX–Oaxaca', 24800, 'pagado']] },
  { id: 'SH055', nombre: 'Aniversario Palacio', cliente: 'El Palacio de Hierro', evento: '2026-07-30', margen: 55000, cobros: [['Producción de evento', 139200, 139200, 'sin_complemento']], pagos: [['Ana Lucía Rivas', 'Dirección de arte y utilería', 31000, 'pagado'], ['Transportes Ágiles', 'Van de producción', 12600, 'pagado']] },
  { id: 'SH058', nombre: 'Campaña Día de Muertos', cliente: 'Liverpool', evento: '2026-08-21', margen: 80000, cobros: [['Producción campaña', 211700, 0, 'vencido', '2026-09-09']], pagos: [['Ana Lucía Rivas', 'Dirección de arte y utilería', 28500, 'pagado'], ['José García', 'Backline y audio en locación', 16400, 'en_orden'], ['Transportes Ágiles', 'Van de producción con chofer', 15600, 'sin_factura']] },
  { id: 'SH059', nombre: 'Sesiones en vivo', cliente: 'Spotify México', evento: '2026-08-28', margen: 40000, cobros: [['Serie de 4 sesiones', 92800, 46400, 'parcial', '2026-09-30']], pagos: [['Mario Hernández', 'Director de fotografía', 18000, 'facturado']] },
  { id: 'SH062', nombre: 'Sesión de fotos Otoño', cliente: 'Zara México', evento: '2026-09-10', margen: 30000, cobros: [['Sesión editorial', 64960, 64960, 'cobrado']], pagos: [['Estudio Luz Norte', 'Renta de estudio', 18500, 'pagado']] },
  {
    id: 'SH061',
    nombre: 'Lanzamiento Aurora 2026',
    cliente: 'Grupo Modelo',
    evento: '2026-09-18',
    margen: 150000,
    cobros: [['Producción · anticipo y finiquito', 348000, 174000, 'parcial', '2026-10-02'], ['Cambio de alcance', 52200, 0, 'facturado', '2026-10-15']],
    pagos: [['Iluminación Pro CDMX', 'Paquete de iluminación ARRI SkyPanel', 68400, 'facturado', 3], ['Mario Hernández', 'Director de fotografía', 42000, 'sin_factura'], ['Foros Churubusco', 'Renta Foro 4 (2 días)', 76000, 'en_orden'], ['Catering La Mesa', 'Catering 45 personas × 3 días', 37800, 'pagado']],
  },
  { id: 'SH063', nombre: 'Spot Navidad Bimbo', cliente: 'Grupo Bimbo', evento: '2026-10-08', margen: 50000, cobros: [['Producción spot 30s', 156600, 0, 'sin_factura', '2026-10-26']], pagos: [] },
  { id: 'SH065', nombre: 'Gala Fin de Año', cliente: 'BBVA México', evento: '2026-11-20', margen: 70000, cobros: [['Producción de gala', 240000, 0, 'sin_factura']], pagos: [['Foros Churubusco', 'Renta Foro 1', 58000, 'sin_factura']] },
  { id: 'SH070', nombre: 'Podcast sin fecha', cliente: 'Grupo Modelo', evento: null, margen: 10000, cobros: [['Temporada piloto', 58000, 0, 'facturado']], pagos: [] },
]

export const REGIMEN: Record<string, 'moral' | 'fisica' | 'resico'> = { 'Mario Hernández': 'fisica', 'Ana Lucía Rivas': 'fisica', 'José García': 'resico' }
const factura = (fecha: string, metodo: 'PUE' | 'PPD' = 'PUE') => [{ estado_validacion: 'validado', fecha_carga: `${fecha} 18:00:00`, metodo_pago: metodo }]
const r2 = (n: number) => Math.round(n * 100) / 100

export function transferir(neto: number, reg: 'moral' | 'fisica' | 'resico' = 'moral') {
  const ret = reg === 'moral' ? 0 : r2(neto * 0.16 * (2 / 3)) + r2(neto * (reg === 'fisica' ? 0.1 : 0.0125))
  return r2(neto * 1.16 - ret)
}

/** Pagos registrados durante la prueba (utils/cuentas-detalle-mocks.ts): la lista y el detalle los ven. */
export interface PagoMock {
  id: string
  monto: number
  fecha_pago: string
  tipo_pago: string
  notas: string | null
  comprobante_url: string | null
}
export const registroMock = {
  cobros: new Map<string, PagoMock[]>(),
  grupos: new Map<string, PagoMock[]>(),
  /** Grupos que entraron a una orden generada en la prueba (utils/cuentas-ordenes-mocks.ts). */
  ordenados: new Set<string>(),
  /** B7: proyectos con las cuentas reabiertas en la prueba (utils/cuentas-detalle-mocks.ts). */
  reabiertos: new Set<string>(),
}
const suma = (xs: PagoMock[]) => r2(xs.reduce((s, x) => s + x.monto, 0))

/** Filas crudas del año como las de cuentas_por_proyecto(p_year). */
export function filasAnio(anio: number) {
  const delAnio = PROYECTOS.filter((p) => !p.evento || Number(p.evento.slice(0, 4)) === anio)
  const proyectos: unknown[] = []
  const cobros: unknown[] = []
  const grupos: unknown[] = []
  delAnio.forEach((p) => {
    const iva = r2(p.cobros.reduce((s, c) => s + c[1], 0) * (0.16 / 1.16))
    proyectos.push([p.id, p.nombre, p.cliente, null, p.evento, p.margen, 0, p.margen, iva, registroMock.reabiertos.has(p.id)])
    const fechaFactura = p.evento ?? '2026-09-01'
    p.cobros.forEach(([concepto, total, pagado, estado, venc], k) => {
      const tieneFactura = estado !== 'sin_factura'
      const extra = registroMock.cobros.get(`${p.id}-cc${k}`) ?? []
      const lista = [
        ...(pagado > 0 ? [{ id: `${p.id}-pc${k}`, monto: pagado, fecha_pago: fechaFactura, tipo_pago: 'TRANSFERENCIA', complemento_xml: [], complemento_pdf: [] }] : []),
        ...extra.map((x) => ({ id: x.id, monto: x.monto, fecha_pago: x.fecha_pago, tipo_pago: x.tipo_pago, complemento_xml: [], complemento_pdf: [] })),
      ]
      const pagos = lista.length ? lista : null
      cobros.push([
        `${p.id}-cc${k}`,
        k === 0 ? p.id : `${p.id}-C${k}`,
        p.evento ? p.id : p.id,
        `CC-2026-${String(k + 1).padStart(5, '0')}`,
        p.cliente,
        null,
        concepto,
        total,
        r2(pagado + suma(extra)),
        venc ?? null,
        tieneFactura ? (estado === 'sin_complemento' ? '2026-07-01' : fechaFactura) : null,
        tieneFactura ? factura(fechaFactura, estado === 'sin_complemento' ? 'PPD' : 'PUE') : null,
        pagos,
      ])
    })
    p.pagos.forEach(([prov, concepto, neto, estado, items], k) => {
      const reg = REGIMEN[prov] ?? 'moral'
      const total = transferir(neto, reg)
      const pagado = estado === 'pagado'
      const extra = registroMock.grupos.get(`${p.id}-g${k}`) ?? []
      const transferido = r2((pagado ? total : 0) + suma(extra))
      const pagosG = [...(pagado ? [{ fecha: fechaFactura, monto: total }] : []), ...extra.map((x) => ({ fecha: x.fecha_pago, monto: x.monto }))]
      grupos.push([
        `${p.id}-g${k}`,
        p.id,
        `prov-${prov}`,
        prov,
        reg,
        neto,
        r2(neto * (transferido / total)),
        estado === 'sin_factura' ? null : total,
        transferido,
        estado === 'en_orden' ? 'orden-1' : registroMock.ordenados.has(`${p.id}-g${k}`) ? 'orden-nueva' : null,
        estado === 'sin_factura' ? null : [{ estado_validacion: 'validado', fecha_carga: `${fechaFactura} 19:00:00` }],
        pagado ? [{ fecha_carga: `${fechaFactura} 20:00:00` }] : null,
        pagosG.length ? pagosG : null,
        items ?? 1,
        items && items > 1 ? `${concepto}` : concepto,
      ])
    })
  })
  return { proyectos, cobros, pagos: [], grupos }
}

const ANIOS = [2026, 2024]

function proyectosAnio(anio: number): ProyectoDetalle[] {
  return construirProyectos(decodificarCuentasAnio(filasAnio(anio)), HOY_E2E)
}

export async function mockCuentasPeriodo(page: Page) {
  registroMock.cobros.clear()
  registroMock.grupos.clear()
  registroMock.ordenados.clear()
  registroMock.reabiertos.clear()
  await page.route(/\/api\/cuentas\/periodo(\?.*)?$/, async (route) => {
    const sp = new URL(route.request().url()).searchParams
    const anio = Number(sp.get('anio')) || 2026
    const proyectos = proyectosAnio(anio)
    const mesRaw = sp.get('mes')
    const mes: MesPeriodo = mesRaw === 'todo' ? 'todo' : mesRaw ? Number(mesRaw) : anio === 2026 ? 9 : ultimoMesConDatos(proyectos, anio)
    await fulfillJson(
      route,
      construirPeriodo(
        proyectos,
        {
          anio,
          mes,
          estado: (sp.get('estado') as FiltroEstado) ?? 'todas',
          tipo: (sp.get('tipo') as FiltroTipo) ?? 'todo',
          cliente: sp.get('cliente'),
          proveedor: sp.get('proveedor'),
          q: sp.get('q'),
          vista: (sp.get('vista') as VistaCuentas) ?? 'proyectos',
          proyecto: sp.get('proyecto'),
          page: Number(sp.get('page')) || 1,
          page_size: Number(sp.get('page_size')) || 60,
        },
        HOY_E2E
      )
    )
  })

  await page.route(/\/api\/cuentas\/opciones(\?.*)?$/, async (route) => {
    const anio = Number(new URL(route.request().url()).searchParams.get('anio')) || 2026
    await fulfillJson(route, construirOpciones(proyectosAnio(anio), anio))
  })

  await page.route('**/api/cuentas/resumen', async (route) => {
    const porAnio = ANIOS.map((anio) => ({ anio, proyectos: proyectosAnio(anio) }))
    const vistos = new Set<string>()
    const todos = porAnio.flatMap((a) => a.proyectos).filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
    await fulfillJson(route, {
      hoy: HOY_E2E,
      anios: porAnio.map(({ anio, proyectos }) => ({ anio, pendientes: pendientesPorAnio(proyectos, anio) })),
      avisos: derivarAvisos(todos, HOY_E2E).total,
    })
  })

  await page.route(/\/api\/cuentas\/avisos(\?.*)?$/, async (route) => {
    const vistos = new Set<string>()
    const todos = ANIOS.flatMap(proyectosAnio).filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
    await fulfillJson(route, derivarAvisos(todos, HOY_E2E))
  })
}
