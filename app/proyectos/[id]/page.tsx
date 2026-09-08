'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { EstadoProyecto, ItemCotizacion, Proveedor, Proyecto } from '@/lib/types'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'
import {
  buildItemNotasMap,
  buildProjectFormDefaults,
  fetchProjectDetailBundle,
  updateProjectDetail,
  updateProjectItemResponsable,
} from '@/lib/services/project-service'
import { SectionCard } from '@/components/ui/SectionCard'
import { DateField } from '@/components/ui/DateField'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs'
import { StatusBadge, toneForEtapaPosicion, toneForProyectoEstado } from '@/components/ui/StatusBadge'
import { ProyectoDetalle, ProyectoFormValues } from '@/lib/projects/types'
import { useProyectoDetallePM } from '@/app/components/proyectos/useProyectoDetallePM'
import { TipoAsignacionPrompt } from '@/app/components/proyectos/TipoAsignacionPrompt'
import { EtapaSelector } from '@/app/components/proyectos/EtapaSelector'
import { TabTareas } from '@/app/components/proyectos/tabs/TabTareas'
import { TabCronograma } from '@/app/components/proyectos/tabs/TabCronograma'
import { TabDocumentos } from '@/app/components/proyectos/tabs/TabDocumentos'
import { TabReporteCierre } from '@/app/components/proyectos/tabs/TabReporteCierre'
import type { ProyectoDetailTab } from '@/app/components/proyectos/types'

const ESTADOS: EstadoProyecto[] = ['PREPRODUCCION', 'RODAJE', 'POSTPRODUCCION', 'FINALIZADO']

const TABS: FilterTab<ProyectoDetailTab>[] = [
  { value: 'informacion', label: 'Información' },
  { value: 'tareas', label: 'Tablero de tareas' },
  { value: 'cronograma', label: 'Cronograma' },
  { value: 'documentos', label: '9 documentos PM' },
  { value: 'cierre', label: 'Reporte de cierre' },
]

export default function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [proyecto, setProyecto] = useState<ProyectoDetalle | null>(null)
  const [items, setItems] = useState<ItemCotizacion[]>([])
  const [responsables, setResponsables] = useState<Proveedor[]>([])
  const [itemNotas, setItemNotas] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, reset, handleSubmit, watch } = useForm<ProyectoFormValues>()

  const onProyectoActualizado = useCallback((actualizado: Proyecto) => {
    setProyecto((prev) => (prev ? { ...prev, ...actualizado } : prev))
  }, [])

  const pm = useProyectoDetallePM(id, proyecto?.tipo_proyecto_id, onProyectoActualizado)

  useEffect(() => {
    fetchProjectDetailBundle(id)
      .then(({ proyecto: proy, responsables: resp }) => {
        setProyecto(proy)
        setResponsables(resp)
        setItems(proy.items || [])
        setItemNotas(buildItemNotasMap(proy.items || []))
        reset(buildProjectFormDefaults(proy))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id, reset])

  const guardar = async (data: ProyectoFormValues) => {
    setGuardando(true)
    setError(null)
    try {
      const updated = await updateProjectDetail(id, data, items, itemNotas)
      setProyecto(updated)
      setItems(updated.items || [])
      setItemNotas(buildItemNotasMap(updated.items || []))
      reset(buildProjectFormDefaults(updated))
      setSuccess('Proyecto actualizado correctamente')
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const actualizarResponsableItem = async (itemId: string, responsableId: string) => {
    const previousItems = items
    const responsable = responsables.find(r => r.id === responsableId)
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, responsable_id: responsableId, responsable_nombre: responsable?.nombre || null }
        : item
    ))

    try {
      await updateProjectItemResponsable(itemId, responsableId, responsables)
      setSuccess('Responsable actualizado')
      setTimeout(() => setSuccess(null), 2000)
    } catch (e: unknown) {
      setItems(previousItems)
      setError(e instanceof Error ? e.message : 'Error de red al actualizar responsable')
    }
  }

  if (loading) return <div className="text-center text-faint">Cargando...</div>
  if (!proyecto) return <div className="text-center text-faint">Proyecto no encontrado</div>

  const etapaActual = pm.tipoAsignado?.etapas.find((e) => e.id === proyecto.etapa_id) ?? null
  const etapaIndex = etapaActual ? pm.tipoAsignado!.etapas.slice().sort((a, b) => a.orden - b.orden).findIndex((e) => e.id === etapaActual.id) : -1

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6 flex-col md:flex-row gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/proyectos" className="text-faint hover:text-body text-sm">← Proyectos</Link>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold text-ink break-words">{proyecto.proyecto}</h1>
            {etapaActual ? (
              <StatusBadge tone={toneForEtapaPosicion(etapaIndex, etapaActual.es_etapa_final)}>{etapaActual.nombre}</StatusBadge>
            ) : (
              <StatusBadge tone={toneForProyectoEstado(proyecto.estado)}>{proyecto.estado}</StatusBadge>
            )}
          </div>
          <p className="text-subtext mt-1 break-words">{proyecto.cliente}</p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-3">
          {pm.tipoAsignado && (
            <EtapaSelector etapas={pm.tipoAsignado.etapas} etapaActualId={proyecto.etapa_id} onCambiar={pm.cambiarEtapa} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto md:flex md:flex-row md:flex-wrap md:justify-end">
            <button
              onClick={async () => {
                try {
                  const pdfRes = await fetch(`/api/proyectos/${id}/generar-hoja-llamado`)
                  if (!pdfRes.ok) {
                    setError('Error al generar hoja de llamado')
                    return
                  }

                  const pdfArrayBuffer = await pdfRes.arrayBuffer()
                  const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${proyecto.proyecto} - ${proyecto.cliente} - Hoja de Llamado.pdf`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Error al generar PDF')
                }
              }}
              className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-sm transition-colors min-h-[44px] flex items-center justify-center text-center"
            >
              📋 Hoja de Llamado
            </button>
            <button
              onClick={() => {
                setSuccess('Próximamente: integración con Google Calendar')
                setTimeout(() => setSuccess(null), 3000)
              }}
              className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-sm transition-colors min-h-[44px] flex items-center justify-center text-center"
            >
              📅 Google Calendar
            </button>
            <Link
              href={`/cotizaciones/nueva?complementaria_de=${id}&cliente=${encodeURIComponent(proyecto.cliente)}&proyecto=${encodeURIComponent(proyecto.proyecto)}&locacion=${encodeURIComponent(proyecto.locacion || '')}&fecha_entrega=${encodeURIComponent(proyecto.fecha_entrega || '')}`}
              className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-sm transition-colors min-h-[44px] flex items-center justify-center text-center sm:col-span-2 md:col-span-1"
            >
              + Cotización complementaria
            </Link>
          </div>
        </div>
      </div>

      {error && <StatusBanner tone="error" className="mb-4">{error}</StatusBanner>}
      {success && <StatusBanner tone="success" className="mb-4">{success}</StatusBanner>}

      <div className="mb-6">
        <FilterTabs tabs={TABS} value={pm.tab} onChange={pm.setTab} />
      </div>

      {pm.tab === 'informacion' && (
        <>
          <SectionCard title="Información General" className="mb-6" contentClassName="p-4 md:p-6">
            <form onSubmit={handleSubmit(guardar)}>
              <div className="grid grid-cols-1 gap-3 md:gap-4 mb-3 md:mb-4">
                <div>
                  <label className="block text-content font-medium text-body mb-1">Estado</label>
                  <select {...register('estado')} className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 md:py-2 text-content text-body focus:outline-none focus:border-accent">
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-content font-medium text-body mb-1">Fecha de Entrega</label>
                  <DateField {...register('fecha_entrega')} value={watch('fecha_entrega')} className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 md:py-2 text-content text-body focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-content font-medium text-body mb-1">Locación</label>
                  <input {...register('locacion')} className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 md:py-2 text-content text-body focus:outline-none focus:border-accent" placeholder="Lugar del evento" />
                </div>
                <div>
                  <label className="block text-content font-medium text-body mb-1">Horarios</label>
                  <input {...register('horarios')} className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 md:py-2 text-content text-body focus:outline-none focus:border-accent" placeholder="Ej. 08:00 - 20:00" />
                </div>
                <div>
                  <label className="block text-content font-medium text-body mb-1">Punto de Encuentro</label>
                  <input {...register('punto_encuentro')} className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 md:py-2 text-content text-body focus:outline-none focus:border-accent" placeholder="Dirección o referencia" />
                </div>
              </div>
              <div className="mb-3 md:mb-4">
                <label className="block text-content font-medium text-body mb-1">Notas</label>
                <textarea {...register('notas')} rows={3} className="w-full bg-input border border-hairline rounded-control px-3 py-2 text-content text-body focus:outline-none focus:border-accent resize-none" placeholder="Notas adicionales..." />
              </div>
              <button type="submit" disabled={guardando} className="bg-accent hover:bg-accent-pressed text-accent-ink px-6 py-2.5 md:py-3 rounded-control font-medium transition-colors disabled:opacity-50 min-h-[44px] w-full md:w-auto">
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Partidas del Proyecto" description="Asigna responsables y agrega notas por partida" borderedHeader>
            <ResponsiveTableCard<ItemCotizacion>
              theme="tokens"
              data={items}
              columns={[
                { key: 'descripcion', label: 'Descripción' },
                { key: 'categoria', label: 'Categoría' },
                { key: 'cantidad', label: 'Cant.' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'notas', label: 'Notas' },
              ]}
              renderDesktopRow={(item) => (
                <>
                  <td className="px-6 py-3 text-body">{item.descripcion}</td>
                  <td className="px-6 py-3 text-subtext">{item.categoria}</td>
                  <td className="px-6 py-3 text-body">{item.cantidad}</td>
                  <td className="px-6 py-3">
                    <select value={item.responsable_id || ''} onChange={e => actualizarResponsableItem(item.id, e.target.value)} className="w-full bg-input border border-hairline rounded-control px-2 py-1.5 text-body text-sm focus:outline-none focus:border-accent">
                      <option value="">Sin asignar</option>
                      {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <input type="text" value={itemNotas[item.id] ?? ''} onChange={e => setItemNotas(prev => ({ ...prev, [item.id]: e.target.value }))} className="w-full bg-input border border-hairline rounded-control px-2 py-1.5 text-body text-sm focus:outline-none focus:border-accent" placeholder="Notas..." />
                  </td>
                </>
              )}
              renderMobileCard={(item) => (
                <div className="bg-row border border-hairline rounded-panel p-4">
                  <div className="mb-3">
                    <p className="text-ink font-medium text-[15px] mb-1">{item.descripcion}</p>
                    <p className="text-subtext text-sm">{item.categoria}</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[13px] text-subtext mb-1.5">Responsable</label>
                      <select value={item.responsable_id || ''} onChange={e => actualizarResponsableItem(item.id, e.target.value)} className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-base text-body focus:outline-none focus:border-accent">
                        <option value="">Sin asignar</option>
                        {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[13px] text-subtext mb-1.5">Notas</label>
                      <input type="text" value={itemNotas[item.id] ?? ''} onChange={e => setItemNotas(prev => ({ ...prev, [item.id]: e.target.value }))} className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-base text-body focus:outline-none focus:border-accent" placeholder="Notas..." />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-subtext pt-2 border-t border-hairline">
                      <span>{item.cantidad}x</span>
                      <span className="text-ink">•</span>
                      <span>Cant: {item.cantidad}</span>
                    </div>
                  </div>
                </div>
              )}
              keyExtractor={(item) => item.id}
              emptyMessage="No hay partidas. Las partidas se cargan desde la cotización aprobada."
            />
          </SectionCard>
        </>
      )}

      {pm.tab !== 'informacion' && !pm.tipoAsignado && (
        <TipoAsignacionPrompt tipos={pm.tiposApi.tipos} onAsignar={pm.asignarTipo} />
      )}

      {pm.tab === 'tareas' && pm.tipoAsignado && (
        <TabTareas tareasApi={pm.tareasApi} />
      )}

      {pm.tab === 'cronograma' && pm.tipoAsignado && (
        <TabCronograma tareas={pm.tareasApi.tareas} />
      )}

      {pm.tab === 'documentos' && pm.tipoAsignado && (
        <TabDocumentos documentosApi={pm.documentosApi} onVerReporteCierre={() => pm.setTab('cierre')} />
      )}

      {pm.tab === 'cierre' && pm.tipoAsignado && (
        <TabReporteCierre
          proyectoId={id}
          documentos={pm.documentosApi.documentos}
          equipo={pm.equipoApi.equipo}
          documentosApi={pm.documentosApi}
        />
      )}
    </div>
  )
}
