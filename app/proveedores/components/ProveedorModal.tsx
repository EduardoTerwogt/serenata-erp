'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Proveedor, HistorialResponsable, RegimenFiscal, PortalEstado } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'
import { Modal } from '@/components/ui/Modal'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { StatusBadge, StatusTone } from '@/components/ui/StatusBadge'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Icon } from '@/components/ui/Icon'

type PortalKey = PortalEstado | 'sin_acceso'

const PORTAL_TONE: Record<PortalKey, StatusTone> = {
  sin_acceso: 'draft',
  pendiente_confirmacion: 'issued',
  activo: 'approved',
}
const PORTAL_LABEL: Record<PortalKey, string> = {
  sin_acceso: 'Sin acceso',
  pendiente_confirmacion: 'Pendiente de confirmación',
  activo: 'Activo',
}

interface ProveedorFormValues {
  nombre: string
  telefono: string
  correo: string
  banco: string
  clabe: string
  notas: string
}

interface Props {
  proveedor: Proveedor | null
  onClose: () => void
  onSaved: (proveedor: Proveedor) => void
}

const INPUT_CLASS = 'w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent'
const LABEL_CLASS = 'block text-sm text-subtext mb-1.5'

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export function ProveedorModal({ proveedor, onClose, onSaved }: Props) {
  const esNuevo = !proveedor
  const [roles, setRoles] = useState<string[]>(proveedor?.roles || [])
  const [rolInput, setRolInput] = useState('')
  const [regimenFiscal, setRegimenFiscal] = useState<'' | RegimenFiscal>(proveedor?.regimen_fiscal || '')
  const [activo, setActivo] = useState(proveedor?.activo ?? true)
  const [historial, setHistorial] = useState<HistorialResponsable[]>([])
  const [historialError, setHistorialError] = useState<string | null>(null)
  const [loadingHistorial, setLoadingHistorial] = useState(!esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkCopiado, setLinkCopiado] = useState(false)

  const portalKey: PortalKey = proveedor?.portal_estado ?? 'sin_acceso'
  const portalPath = proveedor?.portal_estado ? '/portal/login' : '/portal/signup'

  const handleCopyPortalLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${portalPath}`)
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 2000)
    } catch {
      // Clipboard API puede no estar disponible (permisos, contexto no seguro) -- no bloquea nada más.
    }
  }

  const { register, handleSubmit, formState: { errors } } = useForm<ProveedorFormValues>({
    defaultValues: {
      nombre: proveedor?.nombre || '',
      telefono: proveedor?.telefono || '',
      correo: proveedor?.correo || '',
      banco: proveedor?.banco || '',
      clabe: proveedor?.clabe || '',
      notas: proveedor?.notas || '',
    },
  })

  useEffect(() => {
    if (!proveedor) return
    fetch(`/api/proveedores/${proveedor.id}/historial`)
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        return json
      })
      .then(data => setHistorial(Array.isArray(data) ? data : []))
      .catch(e => setHistorialError(String(e)))
      .finally(() => setLoadingHistorial(false))
  }, [proveedor])

  const agregarRol = () => {
    const rol = rolInput.trim()
    if (rol && !roles.includes(rol)) {
      setRoles(prev => [...prev, rol])
      setRolInput('')
    }
  }

  const onSubmit = async (data: ProveedorFormValues) => {
    setGuardando(true)
    setError(null)
    try {
      const payload = { ...data, roles, regimen_fiscal: regimenFiscal || null, ...(esNuevo ? {} : { activo }) }
      const res = await fetch(esNuevo ? '/api/proveedores' : `/api/proveedores/${proveedor!.id}`, {
        method: esNuevo ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const saved = await res.json()
      onSaved(saved)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const totalGanado = historial.reduce((s, h) => s + (h.x_pagar || 0), 0)

  return (
    <Modal
      onClose={onClose}
      title={esNuevo ? 'Nuevo proveedor' : proveedor!.nombre}
      subtitle={esNuevo ? 'Agrega un nuevo colaborador' : (roles.length > 0 ? roles.join(' · ') : undefined)}
      size="3xl"
      headerExtra={!esNuevo ? (
        <FilterTabs
          tabs={[{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }]}
          value={activo ? 'activo' : 'inactivo'}
          onChange={(v) => setActivo(v === 'activo')}
        />
      ) : undefined}
    >
      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      {!esNuevo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-hairline bg-row px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-subtext">Portal de proveedores</span>
            <StatusBadge tone={PORTAL_TONE[portalKey]}>{PORTAL_LABEL[portalKey]}</StatusBadge>
          </div>
          <button
            type="button"
            onClick={handleCopyPortalLink}
            className="flex items-center gap-1.5 rounded-control border border-hairline bg-input px-3 py-1.5 text-sm text-body transition-colors hover:bg-row-alt"
          >
            <Icon name={linkCopiado ? 'check' : 'link'} size={14} />
            {linkCopiado ? 'Enlace copiado' : 'Copiar enlace del portal'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={LABEL_CLASS}>Nombre completo *</label>
            <input
              {...register('nombre', { required: 'El nombre es requerido' })}
              className={INPUT_CLASS}
              placeholder="Nombre y apellido"
            />
            {errors.nombre && <p className="text-cancelled-fg text-xs mt-1">{errors.nombre.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Teléfono</label>
            <input {...register('telefono')} className={INPUT_CLASS} placeholder="55 1234 5678" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Correo</label>
            <input type="email" {...register('correo')} className={INPUT_CLASS} placeholder="correo@ejemplo.com" />
          </div>
        </div>

        <div>
          <p className="sn-label mb-2.5">Roles</p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={rolInput}
              onChange={e => setRolInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarRol() } }}
              className={`flex-1 ${INPUT_CLASS}`}
              placeholder="Ej. Director de Fotografía"
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Banco</label>
            <input {...register('banco')} className={INPUT_CLASS} placeholder="Nombre del banco" />
          </div>
          <div>
            <label className={LABEL_CLASS}>CLABE interbancaria</label>
            <input {...register('clabe')} className={`${INPUT_CLASS} font-mono`} placeholder="18 dígitos" maxLength={18} />
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Régimen fiscal</label>
          <select
            value={regimenFiscal}
            onChange={e => setRegimenFiscal(e.target.value as '' | RegimenFiscal)}
            className={INPUT_CLASS}
          >
            <option value="">Aún no se sabe (se asume moral / 16% sin retención)</option>
            <option value="moral">Persona moral (IVA 16%, sin retención)</option>
            <option value="fisica">Persona física con honorarios (retención IVA 2/3 + ISR 10%)</option>
          </select>
          <p className="text-faint text-xs mt-1.5">Se usa para estimar impuestos en Cotizaciones y Cuentas por Pagar. Actualízalo cuando llegue la constancia de situación fiscal.</p>
        </div>

        <div>
          <label className={LABEL_CLASS}>Notas</label>
          <textarea {...register('notas')} rows={2} className={`${INPUT_CLASS} resize-none`} placeholder="Acuerdos, condiciones, equipo propio…" />
        </div>

        {!esNuevo && (
          <div>
            <div className="flex items-baseline gap-3 mb-2.5">
              <span className="sn-label">Historial de proyectos</span>
              <div className="flex-1" />
              {totalGanado > 0 && (
                <>
                  <span className="text-subtext text-sm">Total acumulado</span>
                  <span className="sn-display text-h3 text-accent">${fmt(totalGanado)}</span>
                </>
              )}
            </div>
            {historialError && <StatusBanner tone="error">Error cargando historial: {historialError}</StatusBanner>}
            <div className="rounded-panel border border-hairline overflow-hidden">
              <ResponsiveTableCard<HistorialResponsable>
                theme="tokens"
                data={historial}
                columns={[
                  { key: 'proyecto', label: 'Proyecto' },
                  { key: 'fecha', label: 'Fecha del evento' },
                  { key: 'rol', label: 'Rol' },
                  { key: 'monto', label: 'X pagar', align: 'right' },
                ]}
                renderDesktopRow={(h) => (
                  <>
                    <td className="px-4 py-3">
                      <p className="text-ink font-medium">{h.proyecto_nombre}</p>
                      <p className="text-faint text-xs">{h.cliente}</p>
                    </td>
                    <td className="px-4 py-3 text-subtext">{formatDateDisplay(h.fecha_evento)}</td>
                    <td className="px-4 py-3 text-body">{h.rol_en_proyecto || '—'}</td>
                    <td className="px-4 py-3 text-right text-approved-fg font-medium">${fmt(h.x_pagar)}</td>
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
                emptyMessage={loadingHistorial ? 'Cargando historial...' : 'Todavía no participa en ningún proyecto'}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="flex-1 rounded-control border border-hairline bg-input px-4 py-2.5 text-sm font-medium text-body hover:bg-row-alt transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-pressed transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : esNuevo ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
