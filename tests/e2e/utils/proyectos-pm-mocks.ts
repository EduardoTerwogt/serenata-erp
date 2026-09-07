import { Page } from '@playwright/test'
import { fulfillJson } from './http'
import { PROYECTO_E2E_ID } from './proyectos-mocks'

export const TIPO_GRABACION_ID = 'tipo-grabacion-e2e'
export const ETAPA_PREPROD_ID = 'etapa-preprod-e2e'
export const ETAPA_RODAJE_ID = 'etapa-rodaje-e2e'

export function buildTipoGrabacion() {
  return {
    id: TIPO_GRABACION_ID,
    nombre: 'Grabación',
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    etapas: [
      { id: ETAPA_PREPROD_ID, tipo_proyecto_id: TIPO_GRABACION_ID, nombre: 'Preproducción', orden: 1, es_etapa_final: false, created_at: '2026-01-01T00:00:00Z' },
      { id: ETAPA_RODAJE_ID, tipo_proyecto_id: TIPO_GRABACION_ID, nombre: 'Rodaje', orden: 2, es_etapa_final: false, created_at: '2026-01-01T00:00:00Z' },
    ],
  }
}

// Mocks para la pantalla "Tipos de proyecto" (Fase 5.2 Bloque 3.2) --
// complementa mockProyectosApis (proyectos-mocks.ts) con /api/tipos-proyecto
// y sus sub-rutas de etapas.
export async function mockTiposProyectoApis(page: Page) {
  const tipos = [buildTipoGrabacion()]

  await page.route('**/api/proyectos', async (route) => {
    await fulfillJson(route, [
      { id: PROYECTO_E2E_ID, cliente: 'Cervezas del Bravo', proyecto: 'Spot Verano E2E', estado: 'PREPRODUCCION', tipo_proyecto_id: TIPO_GRABACION_ID, etapa_id: ETAPA_PREPROD_ID, created_at: '2026-01-01T00:00:00Z' },
    ])
  })

  await page.route('**/api/tipos-proyecto', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { nombre: string }
      const nuevo = { id: 'tipo-nuevo-e2e', nombre: body.nombre, activo: true, created_at: '2026-01-01T00:00:00Z', etapas: [] }
      tipos.push(nuevo)
      await fulfillJson(route, nuevo, 201)
      return
    }
    await fulfillJson(route, tipos)
  })

  await page.route(`**/api/tipos-proyecto/${TIPO_GRABACION_ID}/etapas/${ETAPA_PREPROD_ID}`, async (route) => {
    await fulfillJson(route, tipos[0].etapas[0])
  })

  await page.route(`**/api/tipos-proyecto/${TIPO_GRABACION_ID}/etapas/${ETAPA_RODAJE_ID}`, async (route) => {
    await fulfillJson(route, tipos[0].etapas[1])
  })

  await page.route(`**/api/tipos-proyecto/${TIPO_GRABACION_ID}/etapas`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { nombre: string; orden: number; es_etapa_final?: boolean }
      const nueva = { id: 'etapa-nueva-e2e', tipo_proyecto_id: TIPO_GRABACION_ID, nombre: body.nombre, orden: body.orden, es_etapa_final: body.es_etapa_final ?? false, created_at: '2026-01-01T00:00:00Z' }
      tipos[0].etapas.push(nueva)
      await fulfillJson(route, nueva, 201)
      return
    }
    await fulfillJson(route, tipos[0].etapas)
  })

  return { tipos }
}

// Mocks para el detalle de un proyecto SIN tipo asignado -- prueba el
// prompt de asignación de tipo (Fase 5.2 Bloque 3.3). No usa
// mockProyectosApis porque necesita `proyecto.tipo_proyecto_id` ausente y
// asserts sobre el PUT de asignación.
export async function mockProyectoDetallePMSinTipo(page: Page, proyectoId: string) {
  const tipo = buildTipoGrabacion()
  const proyecto: Record<string, unknown> = {
    id: proyectoId,
    cliente: 'Cervezas del Bravo',
    proyecto: 'Spot Verano E2E',
    fecha_entrega: '2026-06-15',
    locacion: 'CDMX',
    horarios: '08:00 - 20:00',
    punto_encuentro: 'Estudio Central',
    estado: 'PREPRODUCCION',
    notas: '',
    created_at: '2026-05-01T00:00:00Z',
    tipo_proyecto_id: null,
    etapa_id: null,
    items: [],
  }

  await page.route('**/api/tipos-proyecto', async (route) => {
    await fulfillJson(route, [tipo])
  })

  await page.route(`**/api/proyectos/${proyectoId}`, async (route) => {
    await fulfillJson(route, proyecto)
  })

  await page.route(`**/api/proyectos/${proyectoId}/tareas`, async (route) => {
    await fulfillJson(route, [])
  })
  await page.route(`**/api/proyectos/${proyectoId}/documentos`, async (route) => {
    await fulfillJson(route, [])
  })
  await page.route(`**/api/proyectos/${proyectoId}/equipo`, async (route) => {
    await fulfillJson(route, [])
  })

  await page.route(`**/api/proyectos/${proyectoId}/tipo`, async (route) => {
    const body = route.request().postDataJSON() as { tipo_proyecto_id: string }
    proyecto.tipo_proyecto_id = body.tipo_proyecto_id
    proyecto.etapa_id = tipo.etapas[0].id
    await fulfillJson(route, proyecto)
  })

  await page.route(`**/api/proyectos/${proyectoId}/etapa`, async (route) => {
    const body = route.request().postDataJSON() as { etapa_id: string }
    proyecto.etapa_id = body.etapa_id
    await fulfillJson(route, proyecto)
  })

  await page.route('**/api/proveedores', async (route) => {
    await fulfillJson(route, [])
  })

  return { tipo, proyecto }
}

// Mocks para el detalle de un proyecto YA con tipo asignado -- usados por
// los specs de tareas/documentos/cronograma (Bloque 3.4+), que no
// necesitan ejercitar el flujo de asignación en sí.
export async function mockProyectoDetallePMConTipo(page: Page, proyectoId: string, extraDocumentos: Record<string, unknown>[] = []) {
  const tipo = buildTipoGrabacion()
  const proyecto: Record<string, unknown> = {
    id: proyectoId,
    cliente: 'Cervezas del Bravo',
    proyecto: 'Spot Verano E2E',
    fecha_entrega: '2026-06-15',
    locacion: 'CDMX',
    horarios: '08:00 - 20:00',
    punto_encuentro: 'Estudio Central',
    estado: 'PREPRODUCCION',
    notas: '',
    created_at: '2026-05-01T00:00:00Z',
    tipo_proyecto_id: TIPO_GRABACION_ID,
    etapa_id: ETAPA_PREPROD_ID,
    items: [],
  }

  let tareas: Record<string, unknown>[] = [
    {
      id: 'tarea-1', proyecto_id: proyectoId, titulo: 'Confirmar permiso de locación', descripcion: null,
      estado: 'PENDIENTE', asignado_a: null, asignado_a_nombre: null, es_hito: false, origen: 'plantilla',
      fecha_limite: '2026-04-20', fecha_completada: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'tarea-2', proyecto_id: proyectoId, titulo: 'Grabación día 1', descripcion: null,
      estado: 'EN_PROGRESO', asignado_a: null, asignado_a_nombre: 'José García', es_hito: true, origen: 'plantilla',
      fecha_limite: '2026-04-25', fecha_completada: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
  ]

  await page.route('**/api/tipos-proyecto', async (route) => {
    await fulfillJson(route, [tipo])
  })

  await page.route(`**/api/proyectos/${proyectoId}`, async (route) => {
    await fulfillJson(route, proyecto)
  })

  let documentos: Record<string, unknown>[] = [
    {
      id: 'doc-brief', proyecto_id: proyectoId, tipo: 'BRIEF', titulo: null,
      contenido: { cliente: proyecto.cliente, proyecto: proyecto.proyecto, fecha_entrega: proyecto.fecha_entrega, locacion: proyecto.locacion, folio_cotizacion: proyectoId, objetivo: '', mensaje_clave: '' },
      archivo_url: null, archivo_nombre: null, auto_generado_at: '2026-01-01T00:00:00Z', editado_manualmente: false,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    ...extraDocumentos,
  ]

  await page.route(`**/api/proyectos/${proyectoId}/documentos/*/regenerar`, async (route) => {
    const url = route.request().url()
    const id = url.split('/documentos/')[1]?.split('/')[0]
    const doc = documentos.find((d) => d.id === id)
    if (doc) {
      // Misma forma que buildStatusReportContenido -- el único tipo que
      // este helper regenera hoy es STATUS_REPORT (los demás docs ya
      // vienen precargados desde buildTipoGrabacion/documentos iniciales).
      doc.contenido = {
        generado_en: '2026-04-20T00:00:00Z',
        tareas_completadas: 0,
        tareas_en_progreso: 1,
        tareas_pendientes: 1,
        tareas_bloqueadas: [],
        proximos_hitos: [],
        financiero: { total_cotizado: 0, total_comprometido_pagar: 0, total_pagado: 0 },
        comentario_riesgos: '',
      }
      doc.editado_manualmente = false
    }
    await fulfillJson(route, doc)
  })

  await page.route(`**/api/proyectos/${proyectoId}/documentos/*`, async (route) => {
    const url = route.request().url()
    const id = url.split('/documentos/')[1]?.split('/')[0]
    const method = route.request().method()
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      documentos = documentos.map((d) => (d.id === id ? { ...d, ...body, editado_manualmente: true } : d))
      await fulfillJson(route, documentos.find((d) => d.id === id))
      return
    }
    await fulfillJson(route, documentos.find((d) => d.id === id))
  })

  await page.route(`**/api/proyectos/${proyectoId}/documentos`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { tipo: string; titulo?: string | null; contenido?: Record<string, unknown> }
      const nuevo = {
        id: `doc-${documentos.length + 1}`, proyecto_id: proyectoId, titulo: body.titulo ?? null,
        contenido: body.contenido ?? {}, archivo_url: null, archivo_nombre: null, auto_generado_at: null,
        editado_manualmente: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        ...body,
      }
      documentos.push(nuevo)
      await fulfillJson(route, nuevo, 201)
      return
    }
    await fulfillJson(route, documentos)
  })

  await page.route(`**/api/proyectos/${proyectoId}/equipo`, async (route) => {
    await fulfillJson(route, [])
  })

  await page.route(`**/api/proyectos/${proyectoId}/tareas/*/checklist/*`, async (route) => {
    const method = route.request().method()
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      await fulfillJson(route, { id: 'item-1', tarea_id: 'tarea-2', texto: 'Checklist item', orden: 0, completado: false, ...body })
      return
    }
    await fulfillJson(route, { success: true })
  })

  await page.route(`**/api/proyectos/${proyectoId}/tareas/*/checklist`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { texto: string; orden?: number }
      await fulfillJson(route, { id: 'item-nuevo', tarea_id: 'tarea-2', texto: body.texto, orden: body.orden ?? 0, completado: false }, 201)
      return
    }
    await fulfillJson(route, [])
  })

  await page.route(`**/api/proyectos/${proyectoId}/tareas/*`, async (route) => {
    const url = route.request().url()
    const id = url.split('/tareas/')[1]?.split('/')[0]
    const method = route.request().method()

    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      tareas = tareas.map((t) => (t.id === id ? { ...t, ...body, updated_at: new Date().toISOString() } : t))
      await fulfillJson(route, tareas.find((t) => t.id === id))
      return
    }
    if (method === 'DELETE') {
      tareas = tareas.filter((t) => t.id !== id)
      await fulfillJson(route, { success: true })
      return
    }
    await fulfillJson(route, tareas.find((t) => t.id === id))
  })

  await page.route(`**/api/proyectos/${proyectoId}/tareas`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      const nueva = {
        id: `tarea-${tareas.length + 1}`, proyecto_id: proyectoId, descripcion: null, estado: 'PENDIENTE',
        asignado_a: null, asignado_a_nombre: null, es_hito: false, origen: 'manual', fecha_limite: null,
        fecha_completada: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        ...body,
      }
      tareas.push(nueva)
      await fulfillJson(route, nueva, 201)
      return
    }
    await fulfillJson(route, tareas)
  })

  await page.route('**/api/proveedores', async (route) => {
    await fulfillJson(route, [])
  })

  return { tipo, proyecto, tareas: () => tareas }
}

// Mocks para el listado general (Bloque 3.9): 2 proyectos activos con
// tipo/etapa asignados + tareas agregadas de GET /api/proyectos/tareas
// (una vencida, una no) para ejercitar los tabs Tareas y Estatus.
export async function mockProyectosListadoApis(page: Page) {
  const tipo = buildTipoGrabacion()
  const proyectos = [
    {
      id: 'SH310', cliente: 'Cliente A', proyecto: 'Activación Primavera', fecha_entrega: '2026-06-15',
      locacion: null, horarios: null, punto_encuentro: null, estado: 'RODAJE', notas: '',
      created_at: '2026-01-01T00:00:00Z', tipo_proyecto_id: TIPO_GRABACION_ID, etapa_id: ETAPA_RODAJE_ID,
    },
    {
      id: 'SH311', cliente: 'Cliente B', proyecto: 'Video Institucional', fecha_entrega: null,
      locacion: null, horarios: null, punto_encuentro: null, estado: 'PREPRODUCCION', notas: '',
      created_at: '2026-01-01T00:00:00Z', tipo_proyecto_id: null, etapa_id: null,
    },
  ]

  const tareasAgregadas = [
    {
      id: 'ta-1', proyecto_id: 'SH310', proyecto_nombre: 'Activación Primavera', proyecto_cliente: 'Cliente A',
      titulo: 'Confirmar permiso de locación', descripcion: null, estado: 'PENDIENTE', asignado_a: null,
      asignado_a_nombre: null, es_hito: false, origen: 'plantilla', fecha_limite: '2020-01-01',
      fecha_completada: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ta-2', proyecto_id: 'SH310', proyecto_nombre: 'Activación Primavera', proyecto_cliente: 'Cliente A',
      titulo: 'Enviar guion a cliente', descripcion: null, estado: 'PENDIENTE', asignado_a: null,
      asignado_a_nombre: null, es_hito: false, origen: 'manual', fecha_limite: '2030-01-01',
      fecha_completada: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
  ]

  await page.route('**/api/tipos-proyecto', async (route) => {
    await fulfillJson(route, [tipo])
  })
  await page.route('**/api/proyectos', async (route) => {
    await fulfillJson(route, proyectos)
  })
  await page.route('**/api/proyectos/tareas', async (route) => {
    await fulfillJson(route, tareasAgregadas)
  })

  return { tipo, proyectos, tareasAgregadas }
}
