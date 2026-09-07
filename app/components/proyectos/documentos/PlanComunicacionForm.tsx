import type { PlanComunicacionContenido } from './contenido-types'

interface PlanComunicacionFormProps {
  contenido: PlanComunicacionContenido
  onChange: (patch: Partial<PlanComunicacionContenido>) => void
}

export function PlanComunicacionForm({ contenido, onChange }: PlanComunicacionFormProps) {
  const actualizar = (proveedorId: string, patch: Partial<PlanComunicacionContenido['stakeholders'][number]>) => {
    onChange({
      stakeholders: contenido.stakeholders.map((s) => (s.proveedor_id === proveedorId ? { ...s, ...patch } : s)),
    })
  }

  if (contenido.stakeholders.length === 0) {
    return <p className="text-faint text-content italic">Sin stakeholders todavía -- se toman del equipo del proyecto (Stakeholders/RACI).</p>
  }

  return (
    <div className="rounded-control border border-hairline overflow-hidden">
      <table className="w-full text-content">
        <thead className="bg-row-alt">
          <tr>
            <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Stakeholder</th>
            <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Frecuencia</th>
            <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Canal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {contenido.stakeholders.map((s) => (
            <tr key={s.proveedor_id}>
              <td className="px-3 py-2 text-body">{s.nombre}</td>
              <td className="px-3 py-2">
                <input
                  value={s.frecuencia}
                  onChange={(e) => actualizar(s.proveedor_id, { frecuencia: e.target.value })}
                  className="w-full px-2 py-1 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
                  placeholder="Ej. Semanal"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={s.canal}
                  onChange={(e) => actualizar(s.proveedor_id, { canal: e.target.value })}
                  className="w-full px-2 py-1 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
                  placeholder="Ej. WhatsApp"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
