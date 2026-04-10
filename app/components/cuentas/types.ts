import { CuentaCobrar, CuentaPagar } from '@/lib/types'

export type Tab = 'cobrar' | 'pagar'

export type SelectedCuenta =
  | ({ tipo: 'cobrar' } & CuentaCobrar)
  | ({ tipo: 'pagar' } & CuentaPagar)

export interface AlertaCuentaCobrar {
  id: string
  folio?: string
  cliente: string
  proyecto: string
  monto_total: number
  monto_pagado: number
  saldo_pendiente: number
  fecha_vencimiento?: string
  alerta: 'VENCIDA' | 'POR_VENCER'
  mensaje: string
  estado: string
}
