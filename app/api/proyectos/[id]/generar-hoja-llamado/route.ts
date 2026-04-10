import { requireSection } from '@/lib/api-auth'
import { getProyectoDetalle } from '@/lib/server/projects/service'
import { getResponsables } from '@/lib/db'
import { generateHojaDeLlamadoPdf } from '@/lib/server/pdf/hoja-llamado-pdf'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params

    // Fetch proyecto data with items
    const proyecto = await getProyectoDetalle(id)
    if (!proyecto) {
      return new Response('Proyecto no encontrado', { status: 404 })
    }

    // Fetch responsables separately
    const responsables = await getResponsables()

    // Transform proyecto data to PDF format
    const pdfData = {
      proyecto: proyecto.proyecto,
      cliente: proyecto.cliente,
      fecha_entrega: proyecto.fecha_entrega || null,
      locacion: proyecto.locacion || null,
      horarios: proyecto.horarios || null,
      punto_encuentro: proyecto.punto_encuentro || null,
      notas: proyecto.notas || null,
      items: (proyecto.items || []).map((item: any) => ({
        id: item.id,
        descripcion: item.descripcion,
        categoria: item.categoria,
        cantidad: item.cantidad,
        responsable_id: item.responsable_id || null,
        responsable_nombre: item.responsable_nombre || null,
        notas: item.notas || null,
      })),
      responsables: responsables.map((resp: any) => ({
        id: resp.id,
        nombre: resp.nombre,
        telefono: resp.telefono || null,
      })),
    }

    // Generate PDF
    const pdfBuffer = generateHojaDeLlamadoPdf(pdfData)

    // Return PDF response
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${proyecto.proyecto} - ${proyecto.cliente} - Hoja de Llamado.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('[proyectos/generar-hoja-llamado]', error)
    return new Response('Error al generar hoja de llamado', { status: 500 })
  }
}
