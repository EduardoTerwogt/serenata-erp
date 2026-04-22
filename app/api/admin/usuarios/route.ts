import { requireSection } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth-utils'
import { createUsuario, getUsuarios } from '@/lib/server/repositories/usuarios'

export async function GET() {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  try {
    const usuarios = await getUsuarios()
    return Response.json(usuarios)
  } catch (e) {
    console.error('[admin/usuarios] GET error:', e)
    return Response.json({ error: 'Error al obtener usuarios' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  let body: { email?: string; name?: string; password?: string; sections?: string[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { email, name, password, sections } = body

  if (!email || !name || !password || !Array.isArray(sections)) {
    return Response.json({ error: 'email, name, password y sections son requeridos' }, { status: 400 })
  }

  if (password.length < 8) {
    return Response.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
  }

  try {
    const password_hash = await hashPassword(password)
    const usuario = await createUsuario({ email: email.toLowerCase().trim(), name: name.trim(), password_hash, sections })
    return Response.json(usuario, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return Response.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
    }
    console.error('[admin/usuarios] POST error:', e)
    return Response.json({ error: 'Error al crear usuario' }, { status: 500 })
  }
}
