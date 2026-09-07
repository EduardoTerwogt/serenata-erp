'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getJson, sendJson } from '@/lib/client/api'
import { StatusBadge, toneForCuentaEstado } from '@/components/ui/StatusBadge'

interface MeResponse {
  id: string
  nombre: string
  correo: string | null
  portal_estado: 'pendiente_confirmacion' | 'activo'
}

interface CuentaPortal {
  id: string
  proyecto_nombre: string | null
  item_descripcion: string | null
  x_pagar: number
  estado: string
  monto_pagado: number
  saldo_pendiente: number
  fecha_factura: string | null
}

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export default function PortalDashboardPage() {
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [cuentas, setCuentas] = useState<CuentaPortal[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getJson<MeResponse>('/api/portal/me', 'No se pudo cargar tu cuenta')
      .then(data => {
        if (data.portal_estado === 'pendiente_confirmacion') {
          router.replace('/portal/confirmar-identidad')
          return
        }
        setMe(data)
        return getJson<{ cuentas: CuentaPortal[] }>('/api/portal/cuentas', 'No se pudieron cargar tus cuentas')
      })
      .then(res => res && setCuentas(res.cuentas))
      .catch(() => router.replace('/portal/login'))
      .finally(() => setLoading(false))
  }, [router])

  const cerrarSesion = async () => {
    await sendJson('/api/portal/logout', {}, 'Error al cerrar sesión')
    router.replace('/portal/login')
  }

  if (loading || !me) return <p className="text-center text-subtext">Cargando...</p>

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Hola, {me.nombre}</h1>
          <p className="text-content text-subtext">{me.correo}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/portal/documentos"
            className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-2 rounded-control text-sm transition-colors"
          >
            Documentos
          </Link>
          <button
            type="button"
            onClick={cerrarSesion}
            className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-2 rounded-control text-sm transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="rounded-panel border border-hairline bg-card">
        <div className="p-4 md:p-6 border-b border-hairline">
          <h2 className="text-h3 font-semibold text-ink">Tus cuentas con Serenata</h2>
        </div>
        <div className="p-4 md:p-6">
          {!cuentas?.length ? (
            <p className="text-content text-faint">
              Todavía no tienes cuentas registradas. Cuando Serenata te asigne a un proyecto, aparecerán aquí.
            </p>
          ) : (
            <div className="space-y-3">
              {cuentas.map(cuenta => (
                <Link
                  key={cuenta.id}
                  href={`/portal/cuentas/${cuenta.id}`}
                  className="flex items-center justify-between rounded-control border border-hairline bg-row p-3.5 hover:border-body transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium truncate">{cuenta.proyecto_nombre || cuenta.item_descripcion || 'Proyecto'}</p>
                    <p className="text-content text-subtext truncate">{cuenta.item_descripcion}</p>
                  </div>
                  <div className="flex-none text-right">
                    <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
                    <p className="mt-1 text-content text-body">{formatMoney(cuenta.saldo_pendiente)} pendiente</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
