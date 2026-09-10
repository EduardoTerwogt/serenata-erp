import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { formatDateDisplay } from '@/lib/format-date'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'
import type { useProyectoDocumentos } from '@/app/components/proyectos/hooks/useProyectoDocumentos'
import type { MiembroEquipoProyecto, ProyectoDocumento } from '@/lib/types'

interface TabReporteCierreProps {
  proyectoId: string
  documentos: ProyectoDocumento[]
  equipo: MiembroEquipoProyecto[]
  documentosApi: ReturnType<typeof useProyectoDocumentos>
}

interface HitoComparado {
  titulo: string
  planeado: string | null
  real: string | null
}

export function TabReporteCierre({ proyectoId, documentos, equipo, documentosApi }: TabReporteCierreProps) {
  const documento = documentos.find((d) => d.tipo === 'REPORTE_CIERRE')

  if (!documento) {
    return (
      <div className="rounded-panel border border-hairline bg-card p-[19px] text-center">
        <p className="text-subtext text-content">
          No disponible aún -- este reporte se genera automáticamente cuando el proyecto llega a su etapa final.
        </p>
      </div>
    )
  }

  return (
    <ReporteCierreContenido
      key={documento.id}
      proyectoId={proyectoId}
      documento={documento}
      equipo={equipo}
      documentosApi={documentosApi}
    />
  )
}

interface ReporteCierreContenidoProps {
  proyectoId: string
  documento: ProyectoDocumento
  equipo: MiembroEquipoProyecto[]
  documentosApi: ReturnType<typeof useProyectoDocumentos>
}

function ReporteCierreContenido({ proyectoId, documento, equipo, documentosApi }: ReporteCierreContenidoProps) {
  const contenido = documento.contenido as {
    fecha_cierre?: string
    financiero?: { total_cotizado?: number; total_cobrado?: number; total_pagado?: number }
    hitos?: HitoComparado[]
    incidencias?: string
  }

  const [incidencias, setIncidencias] = useState(contenido.incidencias ?? '')
  const [guardando, setGuardando] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardarIncidencias = async () => {
    setGuardando(true)
    setError(null)
    try {
      await documentosApi.actualizarDocumento(documento.id, { contenido: { ...contenido, incidencias } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const descargarPdf = async () => {
    setDescargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/proyectos/${proyectoId}/reporte-cierre/pdf`)
      if (!res.ok) throw new Error('Error al generar el PDF')
      const buffer = await res.arrayBuffer()
      const blob = new Blob([buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Reporte de Cierre.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar el PDF')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5 bg-approved-bg border border-approved-fg/30 text-approved-fg rounded-control px-4 py-3 text-content">
        <span>✓</span>
        <span className="flex-1">Proyecto finalizado el {formatDateDisplay(contenido.fecha_cierre ?? null)} -- este reporte se generó solo, en automático.</span>
        <button
          type="button"
          onClick={descargarPdf}
          disabled={descargando}
          className="flex items-center gap-1.5 py-1.5 px-3 border border-hairline bg-input hover:bg-row-alt disabled:opacity-50 text-body rounded-control font-semibold text-content transition-colors"
        >
          <Icon name="download" size={14} />
          {descargando ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-control border border-cancelled-fg/30 bg-cancelled-bg">
          <p className="text-cancelled-fg text-content">{error}</p>
        </div>
      )}

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="rounded-panel border border-hairline bg-card p-[18px]">
          <p className="text-eyebrow uppercase tracking-wide text-subtext">Cotizado (total)</p>
          <p className="mt-1.5 text-h3 font-bold text-ink">${formatCuentasCurrency(contenido.financiero?.total_cotizado ?? 0)}</p>
        </div>
        <div className="rounded-panel border border-hairline bg-card p-[18px]">
          <p className="text-eyebrow uppercase tracking-wide text-subtext">Cobrado real</p>
          <p className="mt-1.5 text-h3 font-bold text-accent">${formatCuentasCurrency(contenido.financiero?.total_cobrado ?? 0)}</p>
        </div>
        <div className="rounded-panel border border-hairline bg-card p-[18px]">
          <p className="text-eyebrow uppercase tracking-wide text-subtext">Pagado a proveedores</p>
          <p className="mt-1.5 text-h3 font-bold text-ink">${formatCuentasCurrency(contenido.financiero?.total_pagado ?? 0)}</p>
        </div>
      </div>

      <div className="rounded-panel border border-hairline bg-card p-5">
        <h3 className="text-content font-semibold text-ink mb-3.5">Equipo y proveedores participantes</h3>
        {equipo.length === 0 ? (
          <p className="text-faint text-content italic">Sin equipo registrado.</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {equipo.map((m) => (
              <div key={m.proveedor_id} className="flex items-center gap-2 bg-row border border-hairline rounded-pill py-1.5 pl-1.5 pr-3.5">
                <Avatar initials={m.nombre.slice(0, 2)} size={26} />
                <span className="text-content font-semibold text-body">{m.nombre}</span>
                {m.roles.length > 0 && <span className="text-eyebrow text-faint">· {m.roles.join(', ')}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-panel border border-hairline bg-card p-5">
        <h3 className="text-content font-semibold text-ink mb-3.5">Cronograma real vs. planeado (hitos)</h3>
        {!contenido.hitos || contenido.hitos.length === 0 ? (
          <p className="text-faint text-content italic">Sin hitos registrados.</p>
        ) : (
          <table className="w-full table-fixed text-[length:var(--text-md)]">
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead>
              <tr className="h-9 border-b border-hairline">
                <th className="sn-table-head truncate text-left px-[var(--row-pad-x)] align-middle">Hito</th>
                <th className="sn-table-head truncate text-left px-[var(--row-pad-x)] align-middle">Planeado</th>
                <th className="sn-table-head truncate text-left px-[var(--row-pad-x)] align-middle">Real</th>
                <th className="sn-table-head truncate text-left px-[var(--row-pad-x)] align-middle">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {contenido.hitos.map((h, i) => {
                const aTiempo = h.planeado && h.real && h.planeado === h.real
                return (
                  <tr key={i} className="h-[46px] odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt">
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-ink">{h.titulo}</td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{formatDateDisplay(h.planeado)}</td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{formatDateDisplay(h.real)}</td>
                    <td className={`truncate px-[var(--row-pad-x)] align-middle font-semibold ${aTiempo ? 'text-approved-fg' : 'text-cancelled-fg'}`}>
                      {aTiempo ? 'A tiempo' : h.real && h.planeado ? 'Con diferencia' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-panel border border-hairline bg-card p-5">
        <h3 className="text-content font-semibold text-ink mb-3.5">Incidencias / lecciones aprendidas</h3>
        <textarea
          value={incidencias}
          onChange={(e) => setIncidencias(e.target.value)}
          rows={4}
          placeholder="Describe incidencias, aprendizajes o notas de cierre..."
          className="w-full bg-input border border-hairline rounded-control px-3 py-2 text-content text-body focus:outline-none focus:border-accent resize-none"
        />
        <div className="flex items-center justify-between mt-2.5">
          <p className="text-eyebrow text-accent">✎ Este campo es manual -- todo lo demás del reporte se generó solo.</p>
          <button
            type="button"
            onClick={guardarIncidencias}
            disabled={guardando}
            className="py-1.5 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control font-bold text-content transition-colors"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
