'use client'

import { CuentaCobrar, CuentaPagar } from '@/lib/types'

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

interface TabInformacionCobrarProps {
  tipo: 'cobrar'
  cuenta: CuentaCobrar
  resumen?: { total_pagado: number; saldo_pendiente: number }
}

interface TabInformacionPagarProps {
  tipo: 'pagar'
  cuenta: CuentaPagar
  resumen?: { monto_pagado: number; saldo_pendiente: number }
}

type TabInformacionProps = TabInformacionCobrarProps | TabInformacionPagarProps

export function TabInformacion(props: TabInformacionProps) {
  if (props.tipo === 'cobrar') {
    const { cuenta, resumen } = props
    const montoPagado = resumen?.total_pagado ?? cuenta.monto_pagado ?? 0
    const saldoPendiente = resumen?.saldo_pendiente ?? (cuenta.monto_total - montoPagado)

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Informacion de la Cuenta</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-sm">Folio</p>
            <p className="text-white font-medium font-mono">{cuenta.folio || cuenta.cotizacion_id}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Cliente</p>
            <p className="text-white font-medium">{cuenta.cliente}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Proyecto</p>
            <p className="text-white font-medium">{cuenta.proyecto}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Fecha Factura</p>
            <p className="text-white font-medium">{cuenta.fecha_factura || '\u2014'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Fecha Vencimiento</p>
            <p className="text-yellow-400 font-medium">{cuenta.fecha_vencimiento || '\u2014'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Monto Total</p>
            <p className="text-white font-bold">${fmt(cuenta.monto_total)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Monto Pagado</p>
            <p className="text-green-400 font-bold">${fmt(montoPagado)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Saldo Pendiente</p>
            <p className={`font-bold ${saldoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              ${fmt(saldoPendiente)}
            </p>
          </div>
        </div>
        {cuenta.notas && (
          <div className="pt-4 border-t border-gray-800">
            <p className="text-gray-400 text-sm mb-1">Notas</p>
            <p className="text-gray-300 text-sm">{cuenta.notas}</p>
          </div>
        )}
      </div>
    )
  }

  // Pagar
  const { cuenta, resumen } = props
  const montoPagado = resumen?.monto_pagado ?? cuenta.monto_pagado ?? 0
  const saldoPendiente = resumen?.saldo_pendiente ?? (cuenta.x_pagar - montoPagado)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Informacion de la Cuenta</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-400 text-sm">Folio</p>
          <p className="text-white font-medium font-mono">{cuenta.folio || cuenta.cotizacion_id}</p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Responsable</p>
          <p className="text-white font-medium">{cuenta.responsable_nombre}</p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Proyecto</p>
          <p className="text-white font-medium">{cuenta.proyecto_nombre || '\u2014'}</p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-400 text-sm">Descripcion Item</p>
          <p className="text-white font-medium">{cuenta.item_descripcion || '\u2014'}</p>
          {cuenta.cantidad > 1 && <p className="text-gray-500 text-xs mt-1">Cantidad: {cuenta.cantidad}</p>}
        </div>
        <div>
          <p className="text-gray-400 text-sm">Monto x Pagar</p>
          <p className="text-white font-bold">${fmt(cuenta.x_pagar)}</p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Monto Pagado</p>
          <p className="text-green-400 font-bold">${fmt(montoPagado)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-400 text-sm">Saldo Pendiente</p>
          <p className={`font-bold ${saldoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
            ${fmt(saldoPendiente)}
          </p>
        </div>

        {/* Contacto */}
        <div className="col-span-2 pt-4 border-t border-gray-800">
          <p className="text-gray-400 text-sm mb-2">Informacion de Contacto</p>
          <div className="text-sm text-gray-300 space-y-1">
            {cuenta.correo && <p>Correo: {cuenta.correo}</p>}
            {cuenta.telefono && <p>Tel: {cuenta.telefono}</p>}
            {cuenta.banco && <p>Banco: {cuenta.banco}</p>}
            {cuenta.clabe && <p>CLABE: {cuenta.clabe}</p>}
            {!cuenta.correo && !cuenta.telefono && !cuenta.banco && (
              <p className="text-gray-500 italic">Sin informacion de contacto</p>
            )}
          </div>
        </div>
      </div>
      {cuenta.notas && (
        <div className="pt-4 border-t border-gray-800">
          <p className="text-gray-400 text-sm mb-1">Notas</p>
          <p className="text-gray-300 text-sm">{cuenta.notas}</p>
        </div>
      )}
    </div>
  )
}
