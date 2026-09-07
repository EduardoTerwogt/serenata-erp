'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { SectionHero } from '@/components/ui/SectionHero'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'

const ALL_SECTIONS = [
  { id: 'admin', label: 'Admin' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'responsables', label: 'Proveedores' },
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

function SeccionPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-pill border border-hairline bg-row-alt px-2.5 py-0.5 text-xs text-subtext">
      {children}
    </span>
  )
}

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
    <div className="px-5 pt-6 pb-6 md:p-8 flex flex-col gap-6">
      <SectionHero
        title="Usuarios"
        subtitle="Gestión de acceso al sistema"
        action={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-pressed transition-colors"
          >
            <Icon name="plus" size={15} />
            Nuevo usuario
          </button>
        }
      />

      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      <SectionCard contentClassName="p-0">
        {loading ? (
          <div className="py-16 text-center text-faint">Cargando...</div>
        ) : (
          <ResponsiveTableCard<Usuario>
            theme="tokens"
            data={usuarios}
            keyExtractor={(u) => u.id}
            emptyMessage="No hay usuarios. Crea el primero."
            columns={[
              { key: 'nombre', label: 'Nombre' },
              { key: 'correo', label: 'Correo' },
              { key: 'secciones', label: 'Secciones asignadas' },
              { key: 'estado', label: 'Estado' },
              { key: 'acciones', label: '', align: 'right' },
            ]}
            renderDesktopRow={(u) => (
              <>
                <td className="px-6 py-3 font-medium text-ink">
                  {u.name}
                  {u.id === currentUserId && <span className="ml-2 text-faint font-normal">(tú)</span>}
                </td>
                <td className="px-6 py-3 text-subtext">{u.email}</td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {u.sections.length === 0
                      ? <span className="text-xs text-faint">Sin secciones</span>
                      : u.sections.map(s => <SeccionPill key={s}>{s}</SeccionPill>)}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <StatusBadge tone={u.active ? 'approved' : 'draft'}>{u.active ? 'Activo' : 'Inactivo'}</StatusBadge>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button type="button" onClick={() => openEdit(u)} className="rounded-control px-3 py-1.5 text-sm text-subtext hover:text-body hover:bg-row-alt transition-colors">
                      Editar
                    </button>
                    {u.id !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        className="rounded-control border border-hairline bg-input px-3 py-1.5 text-sm text-body hover:bg-row-alt transition-colors"
                      >
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                </td>
              </>
            )}
            renderMobileCard={(u) => (
              <div className="rounded-card border border-hairline bg-row p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-ink">
                    {u.name}
                    {u.id === currentUserId && <span className="ml-1.5 text-faint font-normal">(tú)</span>}
                  </span>
                  <StatusBadge tone={u.active ? 'approved' : 'draft'}>{u.active ? 'Activo' : 'Inactivo'}</StatusBadge>
                </div>
                <p className="text-subtext text-sm mb-2">{u.email}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {u.sections.map(s => <SeccionPill key={s}>{s}</SeccionPill>)}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-hairline">
                  <button type="button" onClick={() => openEdit(u)} className="flex-1 rounded-control px-3 py-2 text-sm text-body hover:bg-row-alt transition-colors">Editar</button>
                  {u.id !== currentUserId && (
                    <button type="button" onClick={() => toggleActive(u)} className="flex-1 rounded-control border border-hairline bg-input px-3 py-2 text-sm text-body hover:bg-row-alt transition-colors">
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </SectionCard>

      <p className="text-sm text-faint">
        No puedes desactivar tu propio usuario. No hay registro público: las cuentas se crean aquí.
      </p>

      {modalOpen && (
        <Modal onClose={closeModal} title={editTarget ? 'Editar usuario' : 'Nuevo usuario'} size="lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1.5">Nombre</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre completo"
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1.5">Correo</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1.5">
                {editTarget ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              </label>
              <input
                type="password"
                required={!editTarget}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editTarget ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-faint mt-1.5">Mínimo 8 caracteres</p>
            </div>

            <div>
              <p className="sn-label mb-2.5">Secciones habilitadas</p>
              <div className="grid grid-cols-2 gap-2.5">
                {ALL_SECTIONS.map(section => (
                  <label key={section.id} className="flex items-center gap-2 cursor-pointer select-none text-sm text-body">
                    <input
                      type="checkbox"
                      checked={form.sections.includes(section.id)}
                      onChange={() => toggleSection(section.id)}
                      className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]"
                    />
                    {section.label}
                  </label>
                ))}
              </div>
            </div>

            {formError && <StatusBanner tone="error">{formError}</StatusBanner>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="flex-1 rounded-control border border-hairline bg-input px-4 py-2.5 text-sm font-medium text-body hover:bg-row-alt transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-pressed transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
