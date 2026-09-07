import { Icon } from '@/components/ui/Icon'
import type { RiesgoItem, RiesgosContenido } from './contenido-types'

const PROBABILIDADES: RiesgoItem['probabilidad'][] = ['baja', 'media', 'alta']
const IMPACTOS: RiesgoItem['impacto'][] = ['bajo', 'medio', 'alto']

interface RiesgosFormProps {
  contenido: RiesgosContenido
  onChange: (patch: Partial<RiesgosContenido>) => void
}

export function RiesgosForm({ contenido, onChange }: RiesgosFormProps) {
  const actualizar = (id: string, patch: Partial<RiesgoItem>) => {
    onChange({ riesgos: contenido.riesgos.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  }

  const agregar = () => {
    const nuevo: RiesgoItem = {
      id: `riesgo-${Date.now()}`,
      descripcion: '',
      probabilidad: 'media',
      impacto: 'medio',
      mitigacion: '',
      responsable_id: null,
    }
    onChange({ riesgos: [...contenido.riesgos, nuevo] })
  }

  const eliminar = (id: string) => {
    onChange({ riesgos: contenido.riesgos.filter((r) => r.id !== id) })
  }

  return (
    <div className="space-y-3">
      {contenido.riesgos.length === 0 && (
        <p className="text-faint text-content italic">Sin riesgos capturados todavía.</p>
      )}

      {contenido.riesgos.map((riesgo) => (
        <div key={riesgo.id} className="bg-row border border-hairline rounded-control p-3.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <textarea
              value={riesgo.descripcion}
              onChange={(e) => actualizar(riesgo.id, { descripcion: e.target.value })}
              rows={1}
              className="flex-1 px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
              placeholder="Descripción del riesgo"
            />
            <button type="button" onClick={() => eliminar(riesgo.id)} className="text-faint hover:text-cancelled-fg flex-none mt-2">
              <Icon name="trash" size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-eyebrow text-subtext mb-1">Probabilidad</label>
              <select
                value={riesgo.probabilidad}
                onChange={(e) => actualizar(riesgo.id, { probabilidad: e.target.value as RiesgoItem['probabilidad'] })}
                className="w-full px-2 py-1.5 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
              >
                {PROBABILIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-eyebrow text-subtext mb-1">Impacto</label>
              <select
                value={riesgo.impacto}
                onChange={(e) => actualizar(riesgo.id, { impacto: e.target.value as RiesgoItem['impacto'] })}
                className="w-full px-2 py-1.5 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
              >
                {IMPACTOS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-eyebrow text-subtext mb-1">Mitigación</label>
            <input
              value={riesgo.mitigacion}
              onChange={(e) => actualizar(riesgo.id, { mitigacion: e.target.value })}
              className="w-full px-2 py-1.5 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
              placeholder="¿Cómo se mitiga?"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={agregar}
        className="w-full border border-dashed border-hairline rounded-control p-2.5 text-center text-faint text-content hover:text-body hover:border-body transition-colors"
      >
        + Agregar riesgo
      </button>
    </div>
  )
}
