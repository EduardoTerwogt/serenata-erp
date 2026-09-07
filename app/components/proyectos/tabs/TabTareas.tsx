'use client'

import { useState } from 'react'
import { KanbanBoard, type KanbanColumn } from '@/app/components/proyectos/KanbanBoard'
import { TareaCard } from '@/app/components/proyectos/TareaCard'
import { TareaFormModal } from '@/app/components/proyectos/TareaFormModal'
import { ORDEN_ESTADOS, groupTareasByEstado } from '@/app/components/proyectos/kanban-helpers'
import type { useProyectoTareas } from '@/app/components/proyectos/hooks/useProyectoTareas'
import type { EstadoTareaProyecto, ProyectoTarea } from '@/lib/types'

const ESTADO_LABEL: Record<EstadoTareaProyecto, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  COMPLETADA: 'Completada',
  BLOQUEADA: 'Bloqueada',
}

const ESTADO_TONE: Record<EstadoTareaProyecto, KanbanColumn<ProyectoTarea>['tone']> = {
  PENDIENTE: 'draft',
  EN_PROGRESO: 'issued',
  COMPLETADA: 'approved',
  BLOQUEADA: 'cancelled',
}

interface TabTareasProps {
  tareasApi: ReturnType<typeof useProyectoTareas>
}

// Nota: las tarjetas no muestran la barra de avance de checklist (sí
// visible al editar la tarea) -- mostrarla en el tablero requeriría traer
// el checklist completo de cada tarea de golpe (N+1), y hoy la API no
// expone un conteo agregado. Se deja para cuando haga falta de verdad.
export function TabTareas({ tareasApi }: TabTareasProps) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [tareaSeleccionada, setTareaSeleccionada] = useState<ProyectoTarea | null>(null)

  const grupos = groupTareasByEstado(tareasApi.tareas)

  const columnas: KanbanColumn<ProyectoTarea>[] = ORDEN_ESTADOS.map((estado) => ({
    id: estado,
    label: ESTADO_LABEL[estado],
    tone: ESTADO_TONE[estado],
    items: grupos[estado],
  }))

  const abrirNueva = () => {
    setTareaSeleccionada(null)
    setModalAbierto(true)
  }

  const abrirEdicion = (tarea: ProyectoTarea) => {
    setTareaSeleccionada(tarea)
    setModalAbierto(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold text-ink">Tareas del proyecto</h2>
        <button
          type="button"
          onClick={abrirNueva}
          className="py-2 px-4 bg-accent hover:bg-accent-pressed text-accent-ink rounded-control font-medium transition-colors"
        >
          + Nueva tarea
        </button>
      </div>

      <KanbanBoard
        columns={columnas}
        keyExtractor={(tarea) => tarea.id}
        renderCard={(tarea) => <TareaCard tarea={tarea} onClick={() => abrirEdicion(tarea)} />}
        renderAddAction={(columnaId) => columnaId === 'PENDIENTE' && (
          <button
            type="button"
            onClick={abrirNueva}
            className="border border-dashed border-hairline rounded-panel p-3.5 text-center text-faint text-content hover:text-body hover:border-body transition-colors"
          >
            + Agregar tarea
          </button>
        )}
      />

      <p className="text-faint text-content">
        Sin drag-and-drop en esta primera versión -- el estado se cambia desde la tarjeta con un control, igual que en
        Cotizaciones/Cuentas. Las tareas marcadas ★ Hito son las que alimentan la Ruta Crítica y el cronograma
        real-vs-planeado del reporte de cierre.
      </p>

      {modalAbierto && (
        <TareaFormModal
          onClose={() => setModalAbierto(false)}
          tareaExistente={tareaSeleccionada}
          tareasApi={tareasApi}
        />
      )}
    </div>
  )
}
