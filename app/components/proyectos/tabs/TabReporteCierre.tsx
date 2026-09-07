import { Avatar } from '@/components/ui/Avatar'
import { formatDateDisplay } from '@/lib/format-date'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'
import type { MiembroEquipoProyecto, ProyectoDocumento } from '@/lib/types'

interface TabReporteCierreProps {
  documentos: ProyectoDocumento[]
  equipo: MiembroEquipoProyecto[]
}

interface HitoComparado {
  titulo: string
  planeado: string | null
  real: string | null
}

// La generación automática de REPORTE_CIERRE (al llegar a la etapa final
// del proyecto) es Bloque 4 -- no construido todavía. Este tab solo
// renderiza un documento ya existente, de forma defensiva
// (contenido?.campo ?? '—') ya que la forma exacta se confirma cuando
// exista el generador real.
// TODO(Bloque 4): confirmar la forma exacta de REPORTE_CIERRE.contenido
// una vez que exista el generador automático, y ajustar los accesos de
// abajo si difiere.
export function TabReporteCierre({ documentos, equipo }: TabReporteCierreProps) {
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

  const contenido = documento.contenido as {
    fecha_cierre?: string
    financiero?: { total_cotizado?: number; total_cobrado?: number; total_pagado?: number }
    hitos?: HitoComparado[]
    incidencias?: string
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 bg-approved-bg/[0.18] border border-approved-bg text-approved-fg rounded-control px-4 py-3 text-content">
        <span>✓</span>
        <span>Proyecto finalizado el {formatDateDisplay(contenido.fecha_cierre ?? null)} -- este reporte se generó solo, en automático.</span>
      </div>

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
          <table className="w-full text-content">
            <thead>
              <tr className="border-b border-hairline">
                <th className="text-left py-2 text-eyebrow text-subtext font-semibold">Hito</th>
                <th className="text-left py-2 text-eyebrow text-subtext font-semibold">Planeado</th>
                <th className="text-left py-2 text-eyebrow text-subtext font-semibold">Real</th>
                <th className="text-left py-2 text-eyebrow text-subtext font-semibold">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {contenido.hitos.map((h, i) => {
                const aTiempo = h.planeado && h.real && h.planeado === h.real
                return (
                  <tr key={i}>
                    <td className="py-2 text-body">{h.titulo}</td>
                    <td className="py-2 text-subtext">{formatDateDisplay(h.planeado)}</td>
                    <td className="py-2 text-subtext">{formatDateDisplay(h.real)}</td>
                    <td className={`py-2 font-semibold ${aTiempo ? 'text-approved-fg' : 'text-cancelled-fg'}`}>
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
        <p className="text-body text-content whitespace-pre-wrap">{contenido.incidencias || 'Sin incidencias registradas.'}</p>
        <p className="mt-2 text-eyebrow text-accent">✎ Este campo es manual -- todo lo demás del reporte se generó solo.</p>
      </div>
    </div>
  )
}
