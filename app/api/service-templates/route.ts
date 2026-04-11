import { requireSection } from '@/lib/api-auth'
import { ServiceTemplateRepository } from '@/lib/server/repositories/service-templates'
import { ServiceTemplateCreateSchema, ServiceTemplateUpdateSchema, validate } from '@/lib/validation/schemas'

export async function GET() {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const templates = await ServiceTemplateRepository.getAll()
    return Response.json(templates)
  } catch (error) {
    console.error('Error fetching service templates:', error)
    return Response.json(
      { error: 'Error obteniendo plantillas de servicios' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()

    const validation = validate(ServiceTemplateCreateSchema, body)
    if (!validation.ok) {
      return Response.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }

    const { nombre, descripcion, items } = validation.data
    const template = await ServiceTemplateRepository.create(nombre, descripcion || null, items)

    return Response.json(template, { status: 201 })
  } catch (error) {
    console.error('Error creating service template:', error)
    return Response.json(
      { error: 'Error creando plantilla de servicios' },
      { status: 500 }
    )
  }
}
