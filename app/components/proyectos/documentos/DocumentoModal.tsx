'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { BriefForm } from './BriefForm'
import { StakeholdersRaciForm } from './StakeholdersRaciForm'
import { RutaCriticaView } from './RutaCriticaView'
import { RoadmapForm } from './RoadmapForm'
import { CharterForm } from './CharterForm'
import { RiesgosForm } from './RiesgosForm'
import { PlanComunicacionForm } from './PlanComunicacionForm'
import { StatusReportView } from './StatusReportView'
import type { useProyectoDocumentos } from '@/app/components/proyectos/hooks/useProyectoDocumentos'
import type { ProyectoDocumento, TipoProyectoDocumento } from '@/lib/types'

const NOMBRE: Record<TipoProyectoDocumento, string> = {
  BRIEF: 'Brief',
  STAKEHOLDERS_RACI: 'Stakeholders / RACI',
  RUTA_CRITICA: 'Ruta crítica',
  ROADMAP: 'Roadmap',
  CHARTER: 'Project Charter',
  RIESGOS: 'Registro de riesgos',
  PLAN_COMUNICACION: 'Plan de comunicación',
  STATUS_REPORT: 'Status report',
  REPORTE_CIERRE: 'Reporte de cierre',
}

const TIPOS_SIN_REGENERAR: readonly TipoProyectoDocumento[] = ['RIESGOS', 'REPORTE_CIERRE']

interface DocumentoModalProps {
  tipo: TipoProyectoDocumento
  documento: ProyectoDocumento | null
  documentosApi: ReturnType<typeof useProyectoDocumentos>
  onClose: () => void
}

export function DocumentoModal({ tipo, documento, documentosApi, onClose }: DocumentoModalProps) {
  const [contenido, setContenido] = useState<Record<string, unknown>>(
    documento?.contenido ?? (tipo === 'RIESGOS' ? { riesgos: [] } : {})
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onChange = (patch: Record<string, unknown>) => setContenido((prev) => ({ ...prev, ...patch }))

  const guardar = async () => {
    setBusy(true)
    setError(null)
    try {
      if (documento) {
        await documentosApi.actualizarDocumento(documento.id, { contenido })
      } else {
        await documentosApi.crearDocumento(tipo, null, contenido)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const regenerar = async (force = false) => {
    if (!documento) return
    setBusy(true)
    setError(null)
    try {
      const actualizado = await documentosApi.regenerarDocumento(documento.id, force)
      setContenido(actualizado.contenido)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      if (!force && message.includes('editado a mano') && window.confirm(`${message}\n\n¿Sobrescribir de todas formas?`)) {
        await regenerar(true)
        return
      }
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const puedeRegenerar = documento && !TIPOS_SIN_REGENERAR.includes(tipo)
  const soloLectura = tipo === 'RUTA_CRITICA'

  return (
    <Modal onClose={onClose} title={NOMBRE[tipo]} size="3xl">
      {tipo === 'BRIEF' && <BriefForm contenido={contenido as never} onChange={onChange} />}
      {tipo === 'STAKEHOLDERS_RACI' && <StakeholdersRaciForm contenido={contenido as never} onChange={onChange} />}
      {tipo === 'RUTA_CRITICA' && <RutaCriticaView contenido={contenido as never} />}
      {tipo === 'ROADMAP' && <RoadmapForm contenido={contenido as never} onChange={onChange} />}
      {tipo === 'CHARTER' && <CharterForm contenido={contenido as never} onChange={onChange} />}
      {tipo === 'RIESGOS' && <RiesgosForm contenido={contenido as never} onChange={onChange} />}
      {tipo === 'PLAN_COMUNICACION' && <PlanComunicacionForm contenido={contenido as never} onChange={onChange} />}
      {tipo === 'STATUS_REPORT' && <StatusReportView contenido={contenido as never} onChange={onChange} />}

      {error && (
        <div className="p-3 rounded-control border border-cancelled-fg/30 bg-cancelled-bg">
          <p className="text-cancelled-fg text-content">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {!soloLectura && (
          <button
            type="button"
            onClick={guardar}
            disabled={busy}
            className="flex-1 py-2.5 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control font-medium transition-colors"
          >
            {busy ? 'Guardando...' : 'Guardar'}
          </button>
        )}
        {puedeRegenerar && (
          <button
            type="button"
            onClick={() => regenerar(false)}
            disabled={busy}
            className="py-2.5 px-4 border border-hairline bg-input hover:bg-row-alt text-body rounded-control font-medium transition-colors"
          >
            Regenerar
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`${soloLectura ? 'flex-1' : ''} py-2.5 px-4 border border-hairline bg-input hover:bg-row-alt text-body rounded-control font-medium transition-colors`}
        >
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
