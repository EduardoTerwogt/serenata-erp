'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { SectionHero } from '@/components/ui/SectionHero'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Icon } from '@/components/ui/Icon'

interface ProveedorForm {
  nombre: string
  telefono: string
  correo: string
  banco: string
  clabe: string
  notas: string
}

export default function NuevoProveedorPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<string[]>([])
  const [rolInput, setRolInput] = useState('')
  const [regimenFiscal, setRegimenFiscal] = useState<'' | 'moral' | 'fisica'>('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<ProveedorForm>()

  const agregarRol = () => {
    const rol = rolInput.trim()
    if (rol && !roles.includes(rol)) {
      setRoles(prev => [...prev, rol])
      setRolInput('')
    }
  }

  const eliminarRol = (rol: string) => {
    setRoles(prev => prev.filter(r => r !== rol))
  }

  const onSubmit = async (data: ProveedorForm) => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, roles, regimen_fiscal: regimenFiscal || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const proveedor = await res.json()
      router.push(`/proveedores/${proveedor.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <SectionHero title="Nuevo proveedor" subtitle="Agrega un nuevo colaborador" />

      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Datos principales */}
        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Datos personales</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-subtext mb-1.5">Nombre completo *</label>
              <input
                {...register('nombre', { required: 'El nombre es requerido' })}
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
                placeholder="Nombre del proveedor"
              />
              {errors.nombre && (
                <p className="text-cancelled-fg text-xs mt-1">{errors.nombre.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-subtext mb-1.5">Teléfono</label>
                <input
                  {...register('telefono')}
                  className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
                  placeholder="55 1234 5678"
                />
              </div>
              <div>
                <label className="block text-sm text-subtext mb-1.5">Correo</label>
                <input
                  type="email"
                  {...register('correo')}
                  className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
                  placeholder="correo@ejemplo.com"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Roles</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={rolInput}
              onChange={e => setRolInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarRol() } }}
              className="flex-1 bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
              placeholder="Ej. Director de Fotografía"
            />
            <button
              type="button"
              onClick={agregarRol}
              className="rounded-control border border-hairline bg-input hover:bg-row-alt text-body px-4 py-2.5 text-sm transition-colors"
            >
              Agregar
            </button>
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {roles.map(rol => (
                <span
                  key={rol}
                  className="flex items-center gap-1.5 rounded-pill border border-hairline bg-row-alt text-body text-sm pl-3 pr-2 py-1"
                >
                  {rol}
                  <button
                    type="button"
                    onClick={() => eliminarRol(rol)}
                    aria-label={`Quitar ${rol}`}
                    className="text-faint hover:text-body transition-colors flex"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Datos bancarios */}
        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Datos bancarios</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-subtext mb-1.5">Banco</label>
              <input
                {...register('banco')}
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
                placeholder="Nombre del banco"
              />
            </div>
            <div>
              <label className="block text-sm text-subtext mb-1.5">CLABE interbancaria</label>
              <input
                {...register('clabe')}
                className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body font-mono focus:outline-none focus:border-accent"
                placeholder="18 dígitos"
                maxLength={18}
              />
            </div>
          </div>
        </div>

        {/* Fiscal */}
        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Fiscal</h2>
          <div>
            <label className="block text-sm text-subtext mb-1.5">Régimen fiscal</label>
            <select
              value={regimenFiscal}
              onChange={e => setRegimenFiscal(e.target.value as '' | 'moral' | 'fisica')}
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
            >
              <option value="">Aún no se sabe (se asume moral / 16% sin retención)</option>
              <option value="moral">Persona moral (IVA 16%, sin retención)</option>
              <option value="fisica">Persona física con honorarios (retención IVA 2/3 + ISR 10%)</option>
            </select>
            <p className="text-faint text-xs mt-1.5">Se captura una sola vez aquí — se usa para estimar impuestos en Cotizaciones y Cuentas por Pagar. Actualízalo cuando llegue la constancia de situación fiscal.</p>
          </div>
        </div>

        {/* Notas */}
        <div className="rounded-panel border border-hairline bg-card p-6">
          <h2 className="text-h3 font-semibold text-ink mb-4">Notas</h2>
          <textarea
            {...register('notas')}
            rows={3}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent resize-none"
            placeholder="Notas adicionales sobre el proveedor..."
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-control bg-accent hover:bg-accent-pressed text-accent-ink px-6 py-3 font-medium transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Crear proveedor'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-subtext hover:text-body px-4 py-3 rounded-control transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
