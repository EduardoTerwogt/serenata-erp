'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'

interface ResponsableForm {
  nombre: string
  telefono: string
  correo: string
  banco: string
  clabe: string
  notas: string
}

export default function NuevoResponsablePage() {
  const router = useRouter()
  const [roles, setRoles] = useState<string[]>([])
  const [rolInput, setRolInput] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<ResponsableForm>()

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

  const onSubmit = async (data: ResponsableForm) => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/responsables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, roles }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const responsable = await res.json()
      router.push(`/responsables/${responsable.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Nuevo Colaborador</h1>
        <p className="text-gray-400 mt-1">Agrega un nuevo colaborador al equipo</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Datos principales */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Datos Personales</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre completo *</label>
              <input
                {...register('nombre', { required: 'El nombre es requerido' })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="Nombre del colaborador"
              />
              {errors.nombre && (
                <p className="text-red-400 text-xs mt-1">{errors.nombre.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Teléfono</label>
                <input
                  {...register('telefono')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="55 1234 5678"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Correo</label>
                <input
                  type="email"
                  {...register('correo')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="correo@ejemplo.com"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Roles</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={rolInput}
              onChange={e => setRolInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarRol() } }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="Ej. Director de Fotografía"
            />
            <button
              type="button"
              onClick={agregarRol}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Agregar
            </button>
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {roles.map(rol => (
                <span
                  key={rol}
                  className="flex items-center gap-1.5 bg-blue-900 text-blue-300 text-sm px-3 py-1 rounded-full"
                >
                  {rol}
                  <button
                    type="button"
                    onClick={() => eliminarRol(rol)}
                    className="hover:text-white transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Datos bancarios */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Datos Bancarios</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Banco</label>
              <input
                {...register('banco')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="Nombre del banco"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">CLABE interbancaria</label>
              <input
                {...register('clabe')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                placeholder="18 dígitos"
                maxLength={18}
              />
            </div>
          </div>
        </div>

        {/* Notas */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Notas</h2>
          <textarea
            {...register('notas')}
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
            placeholder="Notas adicionales sobre el colaborador..."
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Crear Colaborador'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white px-4 py-3 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
