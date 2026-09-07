'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getJson } from '@/lib/client/api'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { StatusBadge, toneForCuentaEstado } from '@/components/ui/StatusBadge'

interface CuentaPortal {
  id: string
  proyecto_nombre: string | null
  item_descripcion: string | null
  x_pagar: number
  estado: string
  saldo_pendiente: number
}

interface EjemploFactura {
  subtotal: number
  iva_trasladado: number
  iva_retenido: number
  isr_retenido: number
  total: number
  explicacion: string
}

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export default function PortalCuentaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [cuenta, setCuenta] = useState<CuentaPortal | null>(null)
  const [loading, setLoading] = useState(true)
  const [xml, setXml] = useState<File | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ejemplo, setEjemplo] = useState<EjemploFactura | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getJson<{ cuentas: CuentaPortal[] }>('/api/portal/cuentas', 'Error al cargar tu cuenta')
      .then(res => {
        const encontrada = res.cuentas.find(c => c.id === id)
        if (!encontrada) {
          router.replace('/portal')
          return
        }
        setCuenta(encontrada)
      })
      .catch(() => router.replace('/portal/login'))
      .finally(() => setLoading(false))
  }, [id, router])

  const subirFactura = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!xml || !pdf) {
      setError('Sube el XML y el PDF de tu factura')
      return
    }
    setSubiendo(true)
    setError(null)
    setEjemplo(null)
    try {
      const formData = new FormData()
      formData.set('factura_xml', xml)
      formData.set('factura_pdf', pdf)
      // fetch directo (no sendFormData) -- necesitamos leer el body completo
      // del error (incluye `ejemplo`), no solo el mensaje.
      const response = await fetch(`/api/portal/cuentas/${id}/factura`, { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Error al subir tu factura')
        if (data.ejemplo) setEjemplo(data.ejemplo)
        return
      }
      setSuccess(true)
    } catch {
      setError('Error al subir tu factura')
    } finally {
      setSubiendo(false)
    }
  }

  if (loading) return <p className="text-center text-subtext">Cargando...</p>
  if (!cuenta) return null

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Link href="/portal" className="text-faint hover:text-body text-sm">← Tus cuentas</Link>

      <div className="rounded-panel border border-hairline bg-card p-4 md:p-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-h3 font-semibold text-ink">{cuenta.proyecto_nombre || cuenta.item_descripcion}</h1>
          <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
        </div>
        <p className="text-content text-subtext">{cuenta.item_descripcion}</p>
        <p className="mt-2 text-content text-body">Saldo pendiente: {formatMoney(cuenta.saldo_pendiente)}</p>
      </div>

      {success ? (
        <StatusBanner tone="success">Tu factura se subió correctamente. Serenata la revisará para procesar tu pago.</StatusBanner>
      ) : (
        <form onSubmit={subirFactura} className="rounded-panel border border-hairline bg-card p-4 md:p-6 space-y-4">
          <h2 className="text-h3 font-semibold text-ink">Sube tu factura</h2>
          <div>
            <label className="block text-content font-medium text-body mb-1">Archivo XML</label>
            <input
              type="file"
              accept="text/xml,application/xml,.xml"
              onChange={e => setXml(e.target.files?.[0] ?? null)}
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body file:mr-3 file:rounded-control file:border-0 file:bg-row file:px-3 file:py-1.5 file:text-body"
            />
          </div>
          <div>
            <label className="block text-content font-medium text-body mb-1">Archivo PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setPdf(e.target.files?.[0] ?? null)}
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body file:mr-3 file:rounded-control file:border-0 file:bg-row file:px-3 file:py-1.5 file:text-body"
            />
          </div>

          {error && <StatusBanner tone="error">{error}</StatusBanner>}

          {ejemplo && (
            <div className="rounded-control border border-hairline bg-row p-3.5">
              <p className="text-content font-medium text-body mb-2">Así debe quedar tu factura:</p>
              <dl className="space-y-1 text-content text-subtext">
                <div className="flex justify-between"><dt>Subtotal</dt><dd className="text-body">{formatMoney(ejemplo.subtotal)}</dd></div>
                <div className="flex justify-between"><dt>IVA trasladado (16%)</dt><dd className="text-body">{formatMoney(ejemplo.iva_trasladado)}</dd></div>
                {ejemplo.iva_retenido > 0 && (
                  <div className="flex justify-between"><dt>IVA retenido</dt><dd className="text-body">-{formatMoney(ejemplo.iva_retenido)}</dd></div>
                )}
                {ejemplo.isr_retenido > 0 && (
                  <div className="flex justify-between"><dt>ISR retenido</dt><dd className="text-body">-{formatMoney(ejemplo.isr_retenido)}</dd></div>
                )}
                <div className="flex justify-between border-t border-hairline pt-1 mt-1"><dt className="text-body font-medium">Total</dt><dd className="text-body font-medium">{formatMoney(ejemplo.total)}</dd></div>
              </dl>
              <p className="mt-3 text-content text-faint">{ejemplo.explicacion}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={subiendo}
            className="w-full bg-accent hover:bg-accent-pressed text-accent-ink py-2.5 rounded-control font-medium transition-colors disabled:opacity-50"
          >
            {subiendo ? 'Subiendo...' : 'Subir factura'}
          </button>
        </form>
      )}
    </div>
  )
}
