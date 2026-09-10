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
      <table className="w-full text-[length:var(--text-md)]">
        <thead>
          <tr className="h-9 border-b border-hairline">
            <th className="sn-table-head text-left px-[var(--row-pad-x)] align-middle">Stakeholder</th>
            <th className="sn-table-head text-left px-[var(--row-pad-x)] align-middle">Frecuencia</th>
            <th className="sn-table-head text-left px-[var(--row-pad-x)] align-middle">Canal</th>
          </tr>
        </thead>
        <tbody>
          {contenido.stakeholders.map((s) => (
            <tr key={s.proveedor_id} className="h-[46px] odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt">
              <td className="px-[var(--row-pad-x)] align-middle text-ink">{s.nombre}</td>
              <td className="px-[var(--row-pad-x)] align-middle">
                <input
                  value={s.frecuencia}
                  onChange={(e) => actualizar(s.proveedor_id, { frecuencia: e.target.value })}
                  className="w-full px-2 py-1 bg-input border border-hairline rounded-control text-body text-[length:var(--text-md)] placeholder-faint focus:outline-none focus:border-accent"
                  placeholder="Ej. Semanal"
                />
              </td>
              <td className="px-[var(--row-pad-x)] align-middle">
                <input
                  value={s.canal}
                  onChange={(e) => actualizar(s.proveedor_id, { canal: e.target.value })}
                  className="w-full px-2 py-1 bg-input border border-hairline rounded-control text-body text-[length:var(--text-md)] placeholder-faint focus:outline-none focus:border-accent"
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
