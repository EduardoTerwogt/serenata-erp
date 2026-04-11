import { requireSection } from '@/lib/api-auth'
import { ServiceTemplateRepository } from '@/lib/server/repositories/service-templates'
import { ServiceTemplateUpdateSchema, validate } from '@/lib/validation/schemas'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const template = await ServiceTemplateRepository.getById(id)

    if (!template) {
      return Response.json(
        { error: 'Plantilla no encontrada' },
        { status: 404 }
      )
    }

    return Response.json(template)
  } catch (error) {
    console.error('Error fetching service template:', error)
    return Response.json(
      { error: 'Error obteniendo plantilla de servicios' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()

    const validation = validate(ServiceTemplateUpdateSchema, body)
    if (!validation.ok) {
      return Response.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }

    const { nombre, descripcion, items } = validation.data

    if (!nombre || !items) {
      return Response.json(
        { error: 'Nombre e items son requeridos' },
        { status: 400 }
      )
    }

    const template = await ServiceTemplateRepository.update(id, nombre, descripcion || null, items)

    return Response.json(template)
  } catch (error) {
    console.error('Error updating service template:', error)
    return Response.json(
      { error: 'Error actualizando plantilla de servicios' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    await ServiceTemplateRepository.delete(id)

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error deleting service template:', error)
    return Response.json(
      { error: 'Error eliminando plantilla de servicios' },
      { status: 500 }
    )
  }
}
