import type { StakeholdersRaciContenido } from './contenido-types'

const ROLES_RACI = ['R', 'A', 'C', 'I'] as const

interface StakeholdersRaciFormProps {
  contenido: StakeholdersRaciContenido
  onChange: (patch: Partial<StakeholdersRaciContenido>) => void
}

export function StakeholdersRaciForm({ contenido, onChange }: StakeholdersRaciFormProps) {
  const actualizarRol = (proveedorId: string, rol: StakeholdersRaciContenido['equipo'][number]['rol_raci']) => {
    onChange({
      equipo: contenido.equipo.map((m) => (m.proveedor_id === proveedorId ? { ...m, rol_raci: rol } : m)),
    })
  }

  return (
    <div className="space-y-4">
      {contenido.equipo.length === 0 ? (
        <p className="text-faint text-content italic">No hay equipo cargado todavía (se toma de items de cotización y tareas asignadas).</p>
      ) : (
        <div className="rounded-control border border-hairline overflow-hidden">
          <table className="w-full text-[length:var(--text-md)]">
            <thead>
              <tr className="h-9 border-b border-hairline">
                <th className="sn-table-head text-left px-[var(--row-pad-x)] align-middle">Nombre</th>
                <th className="sn-table-head text-left px-[var(--row-pad-x)] align-middle">Roles</th>
                <th className="sn-table-head text-left px-[var(--row-pad-x)] align-middle">RACI</th>
              </tr>
            </thead>
            <tbody>
              {contenido.equipo.map((m) => (
                <tr key={m.proveedor_id} className="h-[46px] odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt">
                  <td className="px-[var(--row-pad-x)] align-middle text-ink">{m.nombre}</td>
                  <td className="px-[var(--row-pad-x)] align-middle text-subtext">{m.roles.join(', ') || '—'}</td>
                  <td className="px-[var(--row-pad-x)] align-middle">
                    <select
                      value={m.rol_raci ?? ''}
                      onChange={(e) => actualizarRol(m.proveedor_id, (e.target.value || null) as typeof m.rol_raci)}
                      className="px-2 py-1 bg-input border border-hairline rounded-control text-body text-[length:var(--text-md)] focus:outline-none focus:border-accent"
                    >
                      <option value="">—</option>
                      {ROLES_RACI.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Contraparte del cliente</label>
        <input
          value={contenido.contraparte_cliente}
          onChange={(e) => onChange({ contraparte_cliente: e.target.value })}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
          placeholder="Nombre de la persona de contacto del cliente"
        />
      </div>
    </div>
  )
}
