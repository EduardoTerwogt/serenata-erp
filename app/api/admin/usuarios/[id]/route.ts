import { requireSection } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth-utils'
import { getUsuarioById, updateUsuario } from '@/lib/server/repositories/usuarios'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  const { id } = await params
  try {
    const usuario = await getUsuarioById(id)
    if (!usuario) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    return Response.json(usuario)
  } catch (e) {
    console.error('[admin/usuarios] GET[id] error:', e)
    return Response.json({ error: 'Error al obtener usuario' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  const { id } = await params

  let body: { name?: string; email?: string; password?: string; sections?: string[]; active?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Anti-lockout: no permitir remover 'admin' del usuario activo si es él mismo
  const currentUserId = (authResult.session?.user as { id?: string })?.id
  if (currentUserId === id && Array.isArray(body.sections) && !body.sections.includes('admin')) {
    return Response.json({ error: 'No puedes quitarte la sección admin a ti mismo' }, { status: 400 })
  }
  if (currentUserId === id && body.active === false) {
    return Response.json({ error: 'No puedes desactivarte a ti mismo' }, { status: 400 })
  }

  const updates: Parameters<typeof updateUsuario>[1] = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.email !== undefined) updates.email = body.email.toLowerCase().trim()
  if (body.sections !== undefined) updates.sections = body.sections
  if (body.active !== undefined) updates.active = body.active
  if (body.password) {
    if (body.password.length < 8) {
      return Response.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }
    updates.password_hash = await hashPassword(body.password)
  }

  try {
    const usuario = await updateUsuario(id, updates)
    return Response.json(usuario)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return Response.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
    }
    console.error('[admin/usuarios] PUT error:', e)
    return Response.json({ error: 'Error al actualizar usuario' }, { status: 500 })
  }
}
