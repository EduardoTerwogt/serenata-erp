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
          <table className="w-full text-content">
            <thead className="bg-row-alt">
              <tr>
                <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Nombre</th>
                <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Roles</th>
                <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">RACI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {contenido.equipo.map((m) => (
                <tr key={m.proveedor_id}>
                  <td className="px-3 py-2 text-body">{m.nombre}</td>
                  <td className="px-3 py-2 text-subtext">{m.roles.join(', ') || '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      value={m.rol_raci ?? ''}
                      onChange={(e) => actualizarRol(m.proveedor_id, (e.target.value || null) as typeof m.rol_raci)}
                      className="px-2 py-1 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
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
