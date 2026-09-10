'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { SectionLoading } from '@/components/ui/SectionLoading'
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
    <span className="whitespace-nowrap rounded-pill border border-hairline bg-row-alt px-2.5 py-0.5 text-[length:var(--text-xs)] text-subtext">
      {children}
    </span>
  )
}

export function AdminUsuarios() {
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
    <div className="flex flex-col gap-[19px]">
      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      <SectionCard
        title="Usuarios"
        borderedHeader
        contentClassName="p-0"
        actions={
          <Button onClick={openCreate} iconLeft="plus" size="md">
            Nuevo usuario
          </Button>
        }
      >
        {loading ? (
          <SectionLoading className="min-h-[240px]" />
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
                      ? <span className="text-[length:var(--text-xs)] text-faint">Sin secciones</span>
                      : u.sections.map(s => <SeccionPill key={s}>{s}</SeccionPill>)}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <StatusBadge tone={u.active ? 'approved' : 'draft'}>{u.active ? 'Activo' : 'Inactivo'}</StatusBadge>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center justify-end gap-[var(--space-sm)]">
                    <Button variant="ghost" size="md" onClick={() => openEdit(u)}>Editar</Button>
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={u.id === currentUserId}
                      onClick={() => toggleActive(u)}
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                </td>
              </>
            )}
            renderMobileCard={(u) => (
              <div className="rounded-card border border-hairline bg-row p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">
                    {u.name}
                    {u.id === currentUserId && <span className="ml-1.5 text-faint font-normal">(tú)</span>}
                  </span>
                  <StatusBadge tone={u.active ? 'approved' : 'draft'}>{u.active ? 'Activo' : 'Inactivo'}</StatusBadge>
                </div>
                <p className="mb-2 text-[length:var(--text-base)] text-subtext">{u.email}</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {u.sections.map(s => <SeccionPill key={s}>{s}</SeccionPill>)}
                </div>
                <div className="flex items-center gap-2 border-t border-hairline pt-2">
                  <Button variant="ghost" size="md" className="flex-1" onClick={() => openEdit(u)}>Editar</Button>
                  {u.id !== currentUserId && (
                    <Button variant="secondary" size="md" className="flex-1" onClick={() => toggleActive(u)}>
                      {u.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </SectionCard>

      <p className="text-[length:var(--text-md)] text-faint">
        No puedes desactivar tu propio usuario. No hay registro público: las cuentas se crean aquí.
      </p>

      {modalOpen && (
        <Modal onClose={closeModal} title={editTarget ? 'Editar usuario' : 'Nuevo usuario'} size="lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-[19px]">
            <TextField
              label="Nombre"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre completo"
            />
            <TextField
              label="Correo"
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="correo@ejemplo.com"
            />
            <TextField
              label={editTarget ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              type="password"
              required={!editTarget}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder={editTarget ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
              hint="Mínimo 8 caracteres"
            />

            <div>
              <p className="sn-label mb-2.5">Secciones habilitadas</p>
              <div className="grid grid-cols-2 gap-2.5">
                {ALL_SECTIONS.map(section => (
                  <label key={section.id} className="flex cursor-pointer select-none items-center gap-2 text-[length:var(--text-base)] text-body">
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
              <Button variant="ghost" size="lg" className="flex-1" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" size="lg" className="flex-1" disabled={saving}>
                {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
