'use client'

import { useState } from 'react'
import { DocCard } from '@/app/components/proyectos/documentos/DocCard'
import { DocumentoModal } from '@/app/components/proyectos/documentos/DocumentoModal'
import { resolveDocState } from '@/app/components/proyectos/documentos/doc-state'
import type { useProyectoDocumentos } from '@/app/components/proyectos/hooks/useProyectoDocumentos'
import type { ProyectoDocumento, TipoProyectoDocumento } from '@/lib/types'

interface TabDocumentosProps {
  documentosApi: ReturnType<typeof useProyectoDocumentos>
}

const DOC_ORDEN: TipoProyectoDocumento[] = [
  'BRIEF', 'STAKEHOLDERS_RACI', 'RUTA_CRITICA', 'ROADMAP', 'CHARTER',
  'RIESGOS', 'PLAN_COMUNICACION', 'STATUS_REPORT', 'REPORTE_CIERRE',
]

const DOC_META: Record<TipoProyectoDocumento, { emoji: string; nota: string }> = {
  BRIEF: { emoji: '📄', nota: 'Cliente, fechas y locación ya llenos desde la cotización. Falta objetivo y mensaje clave.' },
  STAKEHOLDERS_RACI: { emoji: '👥', nota: 'Equipo del proyecto ya cargado. Falta asignar rol RACI y contraparte del cliente.' },
  RUTA_CRITICA: { emoji: '🛤️', nota: 'Hitos definidos desde el tablero de tareas. Se actualiza solo al marcar/agregar hitos.' },
  ROADMAP: { emoji: '🗓️', nota: 'Vista panorámica por semana, generada a partir de los hitos. Editable si quieres agregar contexto narrativo.' },
  CHARTER: { emoji: '📋', nota: 'Objetivo, fechas y presupuesto ya llenos. Falta justificación de negocio y criterios de éxito.' },
  RIESGOS: { emoji: '⚠️', nota: 'Sin riesgos capturados todavía -- se llena a mano (probabilidad, impacto, mitigación).' },
  PLAN_COMUNICACION: { emoji: '📣', nota: 'Lista de stakeholders traída del RACI. Falta definir frecuencia y canal por stakeholder.' },
  STATUS_REPORT: { emoji: '📊', nota: 'Snapshot de avance (tareas, presupuesto ejercido) cada vez que pides uno nuevo. Es el único documento repetible.' },
  REPORTE_CIERRE: { emoji: '🔒', nota: 'Aparece automáticamente cuando el proyecto pasa a su etapa final.' },
}

const NOMBRE: Record<TipoProyectoDocumento, string> = {
  BRIEF: 'Brief',
  STAKEHOLDERS_RACI: 'Stakeholders / RACI',
  RUTA_CRITICA: 'Ruta crítica',
  ROADMAP: 'Roadmap',
  CHARTER: 'Project Charter',
  RIESGOS: 'Registro de riesgos',
  PLAN_COMUNICACION: 'Plan de comunicación',
  STATUS_REPORT: 'Status reports',
  REPORTE_CIERRE: 'Reporte de cierre',
}

export function TabDocumentos({ documentosApi }: TabDocumentosProps) {
  const [modal, setModal] = useState<{ tipo: TipoProyectoDocumento; documento: ProyectoDocumento | null } | null>(null)
  const [creandoStatusReport, setCreandoStatusReport] = useState(false)

  const docsPorTipo = (tipo: TipoProyectoDocumento) => documentosApi.documentos.filter((d) => d.tipo === tipo)

  const abrir = (tipo: TipoProyectoDocumento) => {
    const docs = docsPorTipo(tipo)
    setModal({ tipo, documento: docs[0] ?? null })
  }

  const nuevoStatusReport = async () => {
    setCreandoStatusReport(true)
    try {
      const creado = await documentosApi.crearDocumento('STATUS_REPORT', null, {})
      const generado = await documentosApi.regenerarDocumento(creado.id)
      setModal({ tipo: 'STATUS_REPORT', documento: generado })
    } finally {
      setCreandoStatusReport(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold text-ink">Documentación del proyecto</h2>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {DOC_ORDEN.map((tipo) => {
          const docs = docsPorTipo(tipo)
          return (
            <DocCard
              key={tipo}
              emoji={DOC_META[tipo].emoji}
              nombre={NOMBRE[tipo]}
              nota={DOC_META[tipo].nota}
              estado={resolveDocState(tipo, docs)}
              onAbrir={tipo === 'STATUS_REPORT' ? nuevoStatusReport : () => abrir(tipo)}
            />
          )
        })}
      </div>

      {creandoStatusReport && <p className="text-faint text-content">Generando status report...</p>}

      {modal && (
        <DocumentoModal
          tipo={modal.tipo}
          documento={modal.documento}
          documentosApi={documentosApi}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
