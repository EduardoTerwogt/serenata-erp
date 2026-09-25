'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { FiltroEstado, FiltroTipo, MesPeriodo, VistaCuentas } from '@/lib/shared/cuentas/periodo-tipos'

export type HojaCuentas = 'periodo' | 'filtros' | 'buscar'
export type PantallaCuentas = 'avisos' | 'ordenes'

export interface EstadoCuentas {
  anio: number | null
  /** null = el que decida el servidor (mes actual, o el último con datos, S16). */
  mes: MesPeriodo | null
  estado: FiltroEstado
  tipo: FiltroTipo
  cliente: string
  proveedor: string
  q: string
  vista: VistaCuentas
  agrupar: boolean
  page: number
  proyecto: string | null
  /** Concepto abierto (ConceptoVista.key) y su pestaña. */
  det: string | null
  tab: string | null
  sheet: HojaCuentas | null
  pantalla: PantallaCuentas | null
}

const DEFAULTS: EstadoCuentas = {
  anio: null,
  mes: null,
  estado: 'todas',
  tipo: 'todo',
  cliente: '',
  proveedor: '',
  q: '',
  vista: 'proyectos',
  agrupar: true,
  page: 1,
  proyecto: null,
  det: null,
  tab: null,
  sheet: null,
  pantalla: null,
}

function leer(sp: URLSearchParams): EstadoCuentas {
  const num = (k: string) => {
    const v = Number(sp.get(k))
    return Number.isInteger(v) && v > 0 ? v : null
  }
  const mesRaw = sp.get('mes')
  const mes: MesPeriodo | null = mesRaw === 'todo' ? 'todo' : num('mes') && num('mes')! <= 12 ? num('mes') : null
  const uno = <T extends string>(k: string, ok: readonly T[], def: T): T => (ok.includes(sp.get(k) as T) ? (sp.get(k) as T) : def)
  return {
    anio: num('anio'),
    mes,
    estado: uno('estado', ['todas', 'pendientes', 'cerradas'] as const, 'todas'),
    tipo: uno('tipo', ['todo', 'cobro', 'pago'] as const, 'todo'),
    cliente: sp.get('cliente') ?? '',
    proveedor: sp.get('proveedor') ?? '',
    q: sp.get('q') ?? '',
    vista: uno('vista', ['proyectos', 'lista'] as const, 'proyectos'),
    agrupar: sp.get('agrupar') !== '0',
    page: num('page') ?? 1,
    proyecto: sp.get('proyecto'),
    det: sp.get('det'),
    tab: sp.get('tab'),
    sheet: (['periodo', 'filtros', 'buscar'] as const).find((h) => h === sp.get('sheet')) ?? null,
    pantalla: (['avisos', 'ordenes'] as const).find((p) => p === sp.get('page_m')) ?? null,
  }
}

function escribir(e: EstadoCuentas): string {
  const sp = new URLSearchParams()
  if (e.anio) sp.set('anio', String(e.anio))
  if (e.mes !== null) sp.set('mes', String(e.mes))
  if (e.estado !== DEFAULTS.estado) sp.set('estado', e.estado)
  if (e.tipo !== DEFAULTS.tipo) sp.set('tipo', e.tipo)
  if (e.cliente) sp.set('cliente', e.cliente)
  if (e.proveedor) sp.set('proveedor', e.proveedor)
  if (e.q) sp.set('q', e.q)
  if (e.vista !== DEFAULTS.vista) sp.set('vista', e.vista)
  if (!e.agrupar) sp.set('agrupar', '0')
  if (e.page > 1) sp.set('page', String(e.page))
  if (e.proyecto) sp.set('proyecto', e.proyecto)
  if (e.det) sp.set('det', e.det)
  if (e.tab) sp.set('tab', e.tab)
  if (e.sheet) sp.set('sheet', e.sheet)
  if (e.pantalla) sp.set('page_m', e.pantalla)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

// Capas abiertas con push en esta sesión, con la URL que había antes de
// abrirlas. Cerrar una capa regresa en el historial (igual que "atrás") solo
// si nada más cambió mientras estuvo abierta; si cambió algo (otro año en la
// hoja Periodo, un filtro), se reemplaza la URL para no perder el cambio.
const pila: { url: string; base: string }[] = []
// El router de Next actualiza window.location en diferido: la última URL a
// la que navegamos manda hasta que el navegador la alcance o el usuario use
// "atrás"/"adelante".
let pendiente: string | null = null
const enNavegador = () => `${window.location.pathname}${window.location.search}`
const actual = () => pendiente ?? enNavegador()

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    pendiente = null
  })
}

/**
 * Estado de la vista en la URL (supuesto 8, S15): año, mes, filtros,
 * búsqueda, proyecto, concepto abierto, hoja y pantalla empujada. Cambiar
 * filtros o periodo hace `replace`; abrir algo hace `push`, así "atrás"
 * cierra la hoja en móvil en vez de salir de la app.
 */
export function useCuentasUrl() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const estado = useMemo(() => leer(new URLSearchParams(sp.toString())), [sp])
  // Cuando el navegador alcanza la URL pendiente (o se entra a Cuentas desde
  // otra sección), manda otra vez window.location.
  useEffect(() => {
    if (pendiente === null || pendiente === enNavegador() || !pendiente.startsWith(pathname)) pendiente = null
  }, [sp, pathname])

  const destino = useCallback(
    (cambios: Partial<EstadoCuentas>) => {
      const desde = actual()
      const busqueda = desde.includes('?') ? desde.slice(desde.indexOf('?')) : ''
      return `${pathname}${escribir({ ...leer(new URLSearchParams(busqueda)), ...cambios })}`
    },
    [pathname]
  )

  const navegar = useCallback(
    (url: string, modo: 'push' | 'replace') => {
      const desde = actual()
      if (url === desde) return
      pendiente = url
      if (modo === 'push') {
        pila.push({ url, base: desde })
        router.push(url, { scroll: false })
        return
      }
      const tope = pila[pila.length - 1]
      if (tope && tope.url === desde) tope.url = url
      router.replace(url, { scroll: false })
    },
    [router]
  )

  /** Cambia filtros/periodo (replace) y regresa a la página 1. */
  const filtrar = useCallback((cambios: Partial<EstadoCuentas>) => navegar(destino({ page: 1, ...cambios }), 'replace'), [destino, navegar])
  /** Abre proyecto, concepto, hoja o pantalla (push). */
  const abrir = useCallback((cambios: Partial<EstadoCuentas>) => navegar(destino(cambios), 'push'), [destino, navegar])
  /** Cierra la capa superior con los cambios indicados (y los que haya junto). */
  const cerrar = useCallback(
    (cambios: Partial<EstadoCuentas>) => {
      const url = destino(cambios)
      const tope = pila[pila.length - 1]
      if (tope && tope.url === actual()) {
        pila.pop()
        if (url === tope.base) {
          pendiente = url
          router.back()
          return
        }
      }
      navegar(url, 'replace')
    },
    [destino, navegar, router]
  )

  return { estado, filtrar, abrir, cerrar }
}
