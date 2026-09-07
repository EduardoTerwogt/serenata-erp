import { requireSection } from '@/lib/api-auth'
import { getProyectoById } from '@/lib/db'
import { getDocumentoSingleton } from '@/lib/server/repositories/proyecto-documentos'
import { getEquipoDeProyecto } from '@/lib/server/projects/equipo'
import { generateReporteCierrePdf, ReporteCierrePdfData } from '@/lib/server/pdf/reporte-cierre-pdf'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params

    const documento = await getDocumentoSingleton(id, 'REPORTE_CIERRE')
    if (!documento) {
      return new Response('Reporte de cierre no disponible aún', { status: 404 })
    }

    const [proyecto, equipo] = await Promise.all([
      getProyectoById(id),
      getEquipoDeProyecto(id),
    ])

    const contenido = documento.contenido as {
      fecha_cierre?: string
      financiero?: { total_cotizado?: number; total_cobrado?: number; total_pagado?: number }
      hitos?: { titulo: string; planeado: string | null; real: string | null }[]
      incidencias?: string
    }

    const pdfData: ReporteCierrePdfData = {
      proyecto: proyecto.proyecto,
      cliente: proyecto.cliente,
      fecha_cierre: contenido.fecha_cierre ?? '',
      financiero: {
        total_cotizado: contenido.financiero?.total_cotizado ?? 0,
        total_cobrado: contenido.financiero?.total_cobrado ?? 0,
        total_pagado: contenido.financiero?.total_pagado ?? 0,
      },
      hitos: contenido.hitos ?? [],
      incidencias: contenido.incidencias ?? '',
      equipo: equipo.map((m) => ({ nombre: m.nombre, roles: m.roles })),
    }

    const pdfBuffer = generateReporteCierrePdf(pdfData)

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${proyecto.proyecto} - ${proyecto.cliente} - Reporte de Cierre.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('[proyectos/reporte-cierre/pdf]', error)
    return new Response('Error al generar reporte de cierre', { status: 500 })
  }
}
