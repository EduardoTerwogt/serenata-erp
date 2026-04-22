'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const ALL_SECTIONS = [
  { id: 'admin', label: 'Admin' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'responsables', label: 'Responsables' },
  { id: 'planeacion', label: 'Planeación' },
]

interface Usuario {
  id: string
  email: string
  name: string
  sections: string[]
  active: boolean
  created_at: string
}

interface FormState {
  name: string
  email: string
  password: string
  sections: string[]
}

const EMPTY_FORM: FormState = { name: '', email: '', password: '', sections: [] }

export default function UsuariosPage() {
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string })?.id

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Usuario | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchUsuarios = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/usuarios')
      if (!res.ok) throw new Error('Error al cargar usuarios')
      setUsuarios(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsuarios() }, [fetchUsuarios])

  function openCreate() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(u: Usuario) {
    setEditTarget(u)
    setForm({ name: u.name, email: u.email, password: '', sections: u.sections })
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditTarget(null)
    setFormError(null)
  }

  function toggleSection(sectionId: string) {
    setForm(f => ({
      ...f,
      sections: f.sections.includes(sectionId)
        ? f.sections.filter(s => s !== sectionId)
        : [...f.sections, sectionId],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      const isEdit = !!editTarget
      const url = isEdit ? `/api/admin/usuarios/${editTarget.id}` : '/api/admin/usuarios'
      const method = isEdit ? 'PUT' : 'POST'

      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        sections: form.sections,
      }
      if (!isEdit || form.password) body.password = form.password

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? 'Error al guardar')
        return
      }

      closeModal()
      await fetchUsuarios()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u: Usuario) {
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !u.active }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al actualizar usuario')
        return
      }
      await fetchUsuarios()
    } catch {
      setError('Error de red al actualizar usuario')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión de acceso al sistema</p>
        </div>
        <Button variant="accent" onClick={openCreate}>
          + Nuevo usuario
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-500">Cargando...</div>
      ) : usuarios.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No hay usuarios. Crea el primero.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 border-b border-gray-800/50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Correo</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Secciones</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {usuarios.map(u => (
                <tr key={u.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3 text-gray-200 font-medium">
                    {u.name}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-xs text-orange-400">(tú)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.sections.length === 0 ? (
                        <span className="text-gray-600 text-xs">Sin secciones</span>
                      ) : u.sections.map(s => (
                        <span key={s} className="px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 text-xs border border-blue-800/30">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.active
                        ? 'bg-green-900/30 text-green-400 border border-green-800/30'
                        : 'bg-gray-800/50 text-gray-500 border border-gray-700/30'
                    }`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                        Editar
                      </Button>
                      {u.id !== currentUserId && (
                        <Button
                          variant={u.active ? 'destructive' : 'secondary'}
                          size="sm"
                          onClick={() => toggleActive(u)}
                        >
                          {u.active ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 bg-gray-900 border border-gray-800/50 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-white mb-5">
              {editTarget ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nombre"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre completo"
              />
              <Input
                label="Correo"
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
              />
              <Input
                label={editTarget ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                type="password"
                required={!editTarget}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editTarget ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
                helper="Mínimo 8 caracteres"
              />

              <div>
                <p className="text-sm font-medium text-gray-200 mb-2">Secciones</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_SECTIONS.map(section => (
                    <label key={section.id} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.sections.includes(section.id)}
                        onChange={() => toggleSection(section.id)}
                        className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-orange-500 focus:ring-orange-500/30"
                      />
                      <span className="text-sm text-gray-300">{section.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" fullWidth onClick={closeModal} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="submit" variant="accent" fullWidth isLoading={saving}>
                  {editTarget ? 'Guardar cambios' : 'Crear usuario'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
