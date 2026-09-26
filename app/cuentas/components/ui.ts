'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useSession } from 'next-auth/react'
import { getUserSections } from '@/lib/authz'
import type { StatusTone } from '@/components/ui/StatusBadge'
import type { TonoEstado } from '@/lib/shared/cuentas/concepto'
import type { TarjetaProyecto } from '@/lib/shared/cuentas/periodo-tipos'

export const TONO: Record<TonoEstado, StatusTone> = {
  aprobada: 'approved',
  emitida: 'issued',
  borrador: 'draft',
  cancelada: 'cancelled',
}

/** Chip del proyecto (README): "Cerrada", "Reabierta" o "N pendientes" (rojo si hay vencidos). */
export function chipProyecto(p: Pick<TarjetaProyecto, 'cuentas'>): { label: string; tone: StatusTone; corto: string } {
  const c = p.cuentas
  if (c.cerradas) return { label: 'Cerrada', tone: 'approved', corto: 'Cerrada' }
  if (c.reabiertas && c.pendientes === 0) return { label: 'Reabierta', tone: 'issued', corto: 'Reabierta' }
  return {
    label: `${c.pendientes} pendiente${c.pendientes === 1 ? '' : 's'}`,
    tone: c.hay_vencidos ? 'cancelled' : 'issued',
    corto: String(c.pendientes),
  }
}

function useMedia(query: string) {
  const suscribir = useCallback(
    (avisar: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', avisar)
      return () => mq.removeEventListener('change', avisar)
    },
    [query]
  )
  return useSyncExternalStore(suscribir, () => window.matchMedia(query).matches, () => false)
}

/** El sistema pide reducir movimiento: las animaciones pasan a un fundido corto. */
export const useReducirMovimiento = () => useMedia('(prefers-reduced-motion: reduce)')
/** ≥ md (768px): escritorio; por debajo, el diseño móvil (supuesto 19). */
export const useEsEscritorio = () => useMedia('(min-width: 768px)')
/** ≥ xl (1280px): maestro-detalle lado a lado (S14). */
export const useEsAncho = () => useMedia('(min-width: 1280px)')

/** B7 (D6, supuesto 10): reabrir y corregir son solo de la sección admin (la ruta lo vuelve a validar). */
export function useEsAdmin() {
  const { data } = useSession()
  return getUserSections(data?.user as { sections?: string[] } | undefined).includes('admin')
}
