'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Proveedor, HistorialResponsable, ProveedorDocumento, TipoDocumentoProveedor, RegimenFiscal } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'
import { Modal } from '@/components/ui/Modal'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { StatusBadge, toneForValidacionEstado } from '@/components/ui/StatusBadge'

// Mismas etiquetas que app/portal/page.tsx (TIPO_LABEL) -- se duplica en vez
// de compartir un módulo nuevo, mismo criterio que TIPO_DOC_LABEL en
// app/components/cuentas/tabs/TabDocumentos.tsx (cada pantalla trae la suya).
const TIPO_LABEL: Record<TipoDocumentoProveedor, string> = {
  CONSTANCIA_SITUACION_FISCAL: 'Constancia de situación fiscal',
  INE: 'INE',
  COMPROBANTE_DOMICILIO: 'Comprobante de domicilio',
  COMPROBANTE_BANCARIO: 'Comprobante bancario',
}

interface ProveedorFormValues {
  nombre: string
  alias: string
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
const LABEL_CLASS = 'sn-label block mb-1.5'

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
  const [documentos, setDocumentos] = useState<ProveedorDocumento[]>([])
  const [documentosError, setDocumentosError] = useState<string | null>(null)
  const [loadingDocumentos, setLoadingDocumentos] = useState(!esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<ProveedorFormValues>({
    defaultValues: {
      nombre: proveedor?.nombre || '',
      alias: proveedor?.alias || '',
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

  const cargarDocumentos = () => {
    if (!proveedor) return
    fetch(`/api/proveedores/${proveedor.id}/documentos`)
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        return json
      })
      .then(data => setDocumentos(Array.isArray(data.documentos) ? data.documentos : []))
      .catch(e => setDocumentosError(String(e)))
      .finally(() => setLoadingDocumentos(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- cargarDocumentos se recrea cada render; solo debe correr cuando cambia `proveedor` (mismo patrón que el useEffect del historial arriba).
  useEffect(() => { cargarDocumentos() }, [proveedor])

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
          <div className="md:col-span-2">
            <label className={LABEL_CLASS}>Alias · nombre corto u operativo (opcional)</label>
            <input {...register('alias')} className={INPUT_CLASS} placeholder="Ej. Chok" />
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
            <Button type="button" variant="secondary" size="md" onClick={agregarRol}>
              Agregar
            </Button>
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {roles.map(rol => (
                <span key={rol} className="flex items-center gap-1.5 rounded-pill border border-hairline bg-row-alt text-body text-[length:var(--text-md)] pl-3 pr-2 py-1">
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
            <option value="resico">Persona física RESICO (retención IVA 2/3 + ISR 1.25%)</option>
          </select>
          <p className="text-faint text-xs mt-1.5">Se usa para estimar impuestos en Cotizaciones y Cuentas por Pagar. Actualízalo cuando llegue la constancia de situación fiscal.</p>
        </div>

        <div>
          <label className={LABEL_CLASS}>Notas</label>
          <textarea {...register('notas')} rows={2} className={`${INPUT_CLASS} resize-none`} placeholder="Acuerdos, condiciones, equipo propio…" />
        </div>

        {!esNuevo && (
          <div>
            <span className="sn-label block mb-2.5">Documentos</span>
            {documentosError && <StatusBanner tone="error">Error cargando documentos: {documentosError}</StatusBanner>}
            {!loadingDocumentos && documentos.length === 0 && (
              <p className="text-faint text-content italic py-2">Sin documentos subidos por el Portal todavía</p>
            )}
            <div className="space-y-2">
              {documentos.map(doc => (
                <DocumentoStaffRow
                  key={doc.id}
                  proveedorId={proveedor!.id}
                  documento={doc}
                  onPatched={actualizado => setDocumentos(prev => prev.map(d => (d.id === actualizado.id ? actualizado : d)))}
                />
              ))}
            </div>
          </div>
        )}

        {!esNuevo && (
          <div>
            <div className="flex items-baseline gap-3 mb-2.5">
              <span className="sn-label">Historial de proyectos</span>
              <div className="flex-1" />
              {totalGanado > 0 && (
                <>
                  <span className="text-subtext text-[length:var(--text-md)]">Total acumulado</span>
                  <span className="sn-display text-h3 text-accent">${fmt(totalGanado)}</span>
                </>
              )}
            </div>
            {historialError && <StatusBanner tone="error">Error cargando historial: {historialError}</StatusBanner>}
            <div className="rounded-panel border border-hairline overflow-hidden">
              <ResponsiveTableCard<HistorialResponsable>
                data={historial}
                columns={[
                  { key: 'proyecto', label: 'Proyecto', width: '32%' },
                  { key: 'fecha', label: 'Fecha del evento', width: '22%' },
                  { key: 'rol', label: 'Rol', width: '26%' },
                  { key: 'monto', label: 'X pagar', align: 'right', width: '20%' },
                ]}
                renderDesktopRow={(h) => (
                  <>
                    <td className="truncate px-[var(--row-pad-x)] align-middle">
                      <p className="truncate font-medium text-ink">{h.proyecto_nombre}</p>
                      <p className="truncate text-[length:var(--text-xs)] text-faint">{h.cliente}</p>
                    </td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{formatDateDisplay(h.fecha_evento)}</td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-ink">{h.rol_en_proyecto || '—'}</td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-right font-semibold text-approved-fg">${fmt(h.x_pagar)}</td>
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
          <Button variant="ghost" size="lg" className="flex-1" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={guardando}>
            {guardando ? 'Guardando...' : esNuevo ? 'Crear proveedor' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// Punto 2 (2026-09-20): auto-clasificación híbrida -- POST /api/portal/documentos
// ya clasifica con IA al subir, pero staff siempre puede corregirlo acá
// (PATCH /api/proveedores/[id]/documentos/[docId]). Fila autocontenida: cada
// documento maneja su propio estado de edición del motivo de "revisión".
function DocumentoStaffRow({
  proveedorId,
  documento,
  onPatched,
}: {
  proveedorId: string
  documento: ProveedorDocumento
  onPatched: (documento: ProveedorDocumento) => void
}) {
  const [editandoMotivo, setEditandoMotivo] = useState(false)
  const [motivo, setMotivo] = useState(documento.detalle_validacion ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = async (payload: { estado_validacion: 'validado' | 'revision'; detalle_validacion?: string | null }) => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/proveedores/${proveedorId}/documentos/${documento.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      onPatched(json.documento)
      setEditandoMotivo(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-3 bg-row rounded-control">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body text-content font-medium truncate">{TIPO_LABEL[documento.tipo]}</p>
          <a href={documento.archivo_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs truncate block mt-0.5">
            {documento.archivo_nombre}
          </a>
        </div>
        <StatusBadge tone={toneForValidacionEstado(documento.estado_validacion)}>{documento.estado_validacion}</StatusBadge>
      </div>

      {documento.estado_validacion === 'revision' && documento.detalle_validacion && !editandoMotivo && (
        <p className="mt-2 text-eyebrow text-cancelled-fg bg-cancelled-bg border border-cancelled-fg/30 rounded-control px-2.5 py-1.5">
          {documento.detalle_validacion}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-cancelled-fg">{error}</p>}

      {!editandoMotivo ? (
        <div className="flex gap-2 mt-2.5">
          {documento.estado_validacion !== 'validado' && (
            <Button variant="secondary" size="md" disabled={guardando} onClick={() => patch({ estado_validacion: 'validado' })}>
              Validar
            </Button>
          )}
          <Button variant="ghost" size="md" disabled={guardando} onClick={() => setEditandoMotivo(true)}>
            Marcar en revisión
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-2.5 sm:flex-row sm:items-center">
          <input
            type="text"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo (ej. foto borrosa, documento vencido)"
            className={`flex-1 ${INPUT_CLASS}`}
          />
          <div className="flex gap-2 flex-none">
            <Button
              variant="secondary"
              size="md"
              disabled={guardando || !motivo.trim()}
              onClick={() => patch({ estado_validacion: 'revision', detalle_validacion: motivo.trim() })}
            >
              Guardar
            </Button>
            <Button variant="ghost" size="md" disabled={guardando} onClick={() => setEditandoMotivo(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
