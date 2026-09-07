'use client'

import { useEffect, useState, use } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Proveedor, HistorialResponsable } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Avatar } from '@/components/ui/Avatar'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Icon } from '@/components/ui/Icon'

interface ProveedorForm {
  nombre: string
  telefono: string
  correo: string
  banco: string
  clabe: string
  notas: string
}

function initialsFromName(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')) || nombre.slice(0, 2)
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export default function ProveedorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [historial, setHistorial] = useState<HistorialResponsable[]>([])
  const [historialError, setHistorialError] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [rolInput, setRolInput] = useState('')
  const [regimenFiscal, setRegimenFiscal] = useState<'' | 'moral' | 'fisica'>('')
  const [activo, setActivo] = useState(true)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { register, handleSubmit, reset } = useForm<ProveedorForm>()

  useEffect(() => {
    Promise.all([
      fetch(`/api/proveedores/${id}`).then(r => r.json()),
      fetch(`/api/proveedores/${id}/historial`).then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        return json
      }).catch(e => { setHistorialError(String(e)); return [] }),
    ]).then(([data, hist]) => {
      setProveedor(data)
      setRoles(data.roles || [])
      setRegimenFiscal(data.regimen_fiscal || '')
      setActivo(data.activo)
      setHistorial(Array.isArray(hist) && hist.length > 0 ? hist : (data.historial_responsable || []))
      reset({
        nombre: data.nombre,
        telefono: data.telefono || '',
        correo: data.correo || '',
        banco: data.banco || '',
        clabe: data.clabe || '',
        notas: data.notas || '',
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id, reset])

  const agregarRol = () => {
    const rol = rolInput.trim()
    if (rol && !roles.includes(rol)) {
      setRoles(prev => [...prev, rol])
      setRolInput('')
    }
  }

  const onSubmit = async (data: ProveedorForm) => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/proveedores/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, roles, activo, regimen_fiscal: regimenFiscal || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setProveedor(updated)
      setSuccess('Proveedor actualizado correctamente')
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-faint">Cargando...</div>
  if (!proveedor) return <div className="p-8 text-center text-faint">Proveedor no encontrado</div>

  const totalGanado = historial.reduce((s, h) => s + (h.x_pagar || 0), 0)

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-3xl flex flex-col gap-6">
      <div>
        <button type="button" onClick={() => router.push('/proveedores')} className="inline-flex items-center gap-1.5 text-sm text-faint hover:text-body transition-colors">
          <Icon name="arrow-left" size={14} />
          Proveedores
        </button>
        <div className="flex items-center gap-4 mt-3">
          <Avatar initials={initialsFromName(proveedor.nombre)} size={56} tone={activo ? 'accent' : 'neutral'} className="text-2xl" />
          <div>
            <h1 className="sn-display text-2xl text-ink">{proveedor.nombre}</h1>
            {roles.length > 0 && (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {roles.map(rol => (
                  <span key={rol} className="text-xs rounded-pill border border-hairline bg-row-alt px-2.5 py-0.5 text-body">{rol}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      {success && <StatusBanner tone="success">{success}</StatusBanner>}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="rounded-panel border border-hairline bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-h3 font-semibold text-ink">Información personal</h2>
            <FilterTabs
              tabs={[{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }]}
              value={activo ? 'activo' : 'inactivo'}
              onChange={(v) => setActivo(v === 'activo')}
            />
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-subtext mb-1.5">Nombre completo</label>
              <input
                {...register('nombre', { required: true })}
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-subtext mb-1.5">Teléfono</label>
                <input
                  {...register('telefono')}
                  className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-subtext mb-1.5">Correo</label>
                <input
                  type="email"
                  {...register('correo')}
                  className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Roles</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={rolInput}
              onChange={e => setRolInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarRol() } }}
              className="flex-1 bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
              placeholder="Nuevo rol..."
            />
            <button type="button" onClick={agregarRol} className="rounded-control border border-hairline bg-input hover:bg-row-alt text-body px-4 py-2.5 text-sm transition-colors">
              Agregar
            </button>
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {roles.map(rol => (
                <span key={rol} className="flex items-center gap-1.5 rounded-pill border border-hairline bg-row-alt text-body text-sm pl-3 pr-2 py-1">
                  {rol}
                  <button type="button" onClick={() => setRoles(prev => prev.filter(r => r !== rol))} aria-label={`Quitar ${rol}`} className="text-faint hover:text-body transition-colors flex">
                    <Icon name="close" size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Datos bancarios</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-subtext mb-1.5">Banco</label>
              <input
                {...register('banco')}
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-subtext mb-1.5">CLABE</label>
              <input
                {...register('clabe')}
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body font-mono focus:outline-none focus:border-accent"
                maxLength={18}
              />
            </div>
          </div>
        </div>

        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Fiscal</h2>
          <div>
            <label className="block text-sm text-subtext mb-1.5">Régimen fiscal</label>
            <select
              value={regimenFiscal}
              onChange={e => setRegimenFiscal(e.target.value as '' | 'moral' | 'fisica')}
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
            >
              <option value="">Aún no se sabe (se asume moral / 16% sin retención)</option>
              <option value="moral">Persona moral (IVA 16%, sin retención)</option>
              <option value="fisica">Persona física con honorarios (retención IVA 2/3 + ISR 10%)</option>
            </select>
            <p className="text-faint text-xs mt-1.5">Se usa para estimar impuestos en Cotizaciones y Cuentas por Pagar. Actualízalo cuando llegue la constancia de situación fiscal.</p>
          </div>
        </div>

        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Notas</h2>
          <textarea
            {...register('notas')}
            rows={3}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-control bg-accent hover:bg-accent-pressed text-accent-ink px-6 py-3 font-medium transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      <SectionCard
        title="Historial de proyectos"
        actions={totalGanado > 0 ? <span className="text-approved-fg font-bold sn-display text-h3">${fmt(totalGanado)}</span> : undefined}
        contentClassName="p-0"
      >
        {historialError && (
          <div className="mx-6 mt-4"><StatusBanner tone="error">Error cargando historial: {historialError}</StatusBanner></div>
        )}
        <div className="relative">
          <ResponsiveTableCard<HistorialResponsable>
            theme="tokens"
            data={historial}
            columns={[
              { key: 'proyecto', label: 'Proyecto' },
              { key: 'fecha', label: 'Fecha del evento' },
              { key: 'rol', label: 'Rol' },
              { key: 'monto', label: 'Monto', align: 'right' },
            ]}
            renderDesktopRow={(h) => (
              <>
                <td className="px-6 py-3">
                  <p className="text-ink font-medium">{h.proyecto_nombre}</p>
                  <p className="text-faint text-xs">{h.cliente}</p>
                </td>
                <td className="px-6 py-3 text-subtext">{formatDateDisplay(h.fecha_evento)}</td>
                <td className="px-6 py-3 text-body">{h.rol_en_proyecto || '—'}</td>
                <td className="px-6 py-3 text-right text-approved-fg font-medium">${fmt(h.x_pagar)}</td>
              </>
            )}
            renderMobileCard={(h) => (
              <div className="rounded-card border border-hairline bg-row p-4">
                <div className="mb-2">
                  <p className="text-ink font-medium text-[15px]">{h.proyecto_nombre}</p>
                  <p className="text-subtext text-sm">{h.cliente}</p>
                </div>
                <div className="space-y-2 text-sm">
                  {h.fecha_evento && (
                    <div className="flex justify-between">
                      <span className="text-subtext">Fecha:</span>
                      <span className="text-body">{formatDateDisplay(h.fecha_evento)}</span>
                    </div>
                  )}
                  {h.rol_en_proyecto && (
                    <div className="flex justify-between">
                      <span className="text-subtext">Rol:</span>
                      <span className="text-body">{h.rol_en_proyecto}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-hairline mt-3">
                  <span className="text-subtext">Monto:</span>
                  <span className="text-approved-fg font-medium">${fmt(h.x_pagar)}</span>
                </div>
              </div>
            )}
            keyExtractor={(h) => h.id}
            emptyMessage="Aún no hay proyectos registrados"
          />

          {historial.length > 0 && (
            <div className="md:hidden p-4">
              <div className="flex justify-between items-center rounded-control border border-hairline bg-row p-4">
                <span className="text-subtext font-medium">Total ganado</span>
                <span className="text-approved-fg font-bold text-lg">${fmt(totalGanado)}</span>
              </div>
            </div>
          )}

          {historial.length > 0 && (
            <div className="hidden md:block border-t border-hairline">
              <div className="px-6 py-3 flex justify-end">
                <div className="flex gap-12">
                  <span className="text-subtext font-medium">Total:</span>
                  <span className="text-approved-fg font-bold">${fmt(totalGanado)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
