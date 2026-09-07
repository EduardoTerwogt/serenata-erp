// Formas de `proyecto_documentos.contenido` -- espejo en el frontend de
// los builders de lib/server/projects/documentos-autofill.ts (Fase 5.2
// Bloque 2). RIESGOS no tiene builder server-side (es 100% manual, la API
// acepta cualquier JSON en `contenido`) -- su forma se define aquí mismo,
// ver decisión 12 del plan de Bloque 3.

export interface BriefContenido {
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  folio_cotizacion: string | null
  objetivo: string
  mensaje_clave: string
}

export interface StakeholderRaci {
  proveedor_id: string
  nombre: string
  roles: string[]
  rol_raci: 'R' | 'A' | 'C' | 'I' | null
}

export interface StakeholdersRaciContenido {
  equipo: StakeholderRaci[]
  contraparte_cliente: string
}

export interface RutaCriticaHito {
  tarea_id: string
  titulo: string
  fecha_limite: string | null
  estado: string
}

export interface RutaCriticaContenido {
  hitos: RutaCriticaHito[]
}

export interface RoadmapHito {
  tarea_id: string
  titulo: string
  fecha_limite: string | null
}

export interface RoadmapSemana {
  semana_inicio: string
  hitos: RoadmapHito[]
}

export interface RoadmapContenido {
  semanas: RoadmapSemana[]
  narrativa: string
}

export interface CharterContenido {
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  presupuesto_cotizado: number
  justificacion_negocio: string
  criterios_exito: string
}

export interface PlanComunicacionStakeholder {
  proveedor_id: string
  nombre: string
  frecuencia: string
  canal: string
}

export interface PlanComunicacionContenido {
  stakeholders: PlanComunicacionStakeholder[]
}

export interface ResumenFinanciero {
  total_cotizado: number
  total_comprometido_pagar: number
  total_pagado: number
}

export interface StatusReportContenido {
  generado_en: string
  tareas_completadas: number
  tareas_en_progreso: number
  tareas_pendientes: number
  tareas_bloqueadas: { tarea_id: string; titulo: string }[]
  proximos_hitos: { tarea_id: string; titulo: string; fecha_limite: string | null }[]
  financiero: ResumenFinanciero
  comentario_riesgos: string
}

// Frontend-only -- ver nota arriba.
export interface RiesgoItem {
  id: string
  descripcion: string
  probabilidad: 'baja' | 'media' | 'alta'
  impacto: 'bajo' | 'medio' | 'alto'
  mitigacion: string
  responsable_id: string | null
}

export interface RiesgosContenido {
  riesgos: RiesgoItem[]
}
