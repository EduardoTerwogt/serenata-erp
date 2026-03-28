'use client'

import { useEffect, useState, use } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { Responsable, HistorialResponsable } from '@/lib/types'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'

interface ResponsableForm {
  nombre: string
  telefono: string
  correo: string
  banco: string
  clabe: string
  notas: string
  activo: boolean
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export default function ResponsableDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [responsable, setResponsable] = useState<Responsable | null>(null)
  const [historial, setHistorial] = useState<HistorialResponsable[]>([])
  const [historialError, setHistorialError] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [rolInput, setRolInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { register, handleSubmit, reset } = useForm<ResponsableForm>()

  useEffect(() => {
    Promise.all([
      fetch(`/api/responsables/${id}`).then(r => r.json()),
      fetch(`/api/responsables/${id}/historial`).then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        return json
      }).catch(e => { setHistorialError(String(e)); return [] }),
    ]).then(([data, hist]) => {
      setResponsable(data)
      setRoles(data.roles || [])
      console.log('historial data:', hist)
      // Prefer dedicated historial endpoint; fallback to joined data
      setHistorial(Array.isArray(hist) && hist.length > 0 ? hist : (data.historial_responsable || []))
      reset({
        nombre: data.nombre,
        telefono: data.telefono || '',
        correo: data.correo || '',
        banco: data.banco || '',
        clabe: data.clabe || '',
        notas: data.notas || '',
        activo: data.activo,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id, reset])

  const agregarRol = () => {
    const rol = rolInput.trim()
    if (rol && !roles.includes(rol)) {
      setRoles(prev => [...prev, rol])
      setRolInput('')
    }
  }

  const onSubmit = async (data: ResponsableForm) => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/responsables/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, roles }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setResponsable(updated)
      setSuccess('Colaborador actualizado correctamente')
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>
  if (!responsable) return <div className="p-8 text-center text-gray-500">Colaborador no encontrado</div>

  const totalGanado = historial.reduce((s, h) => s + (h.x_pagar || 0), 0)

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <Link href="/responsables" className="text-gray-500 hover:text-gray-300 text-sm">
          ← Colaboradores
        </Link>
        <div className="flex items-center gap-4 mt-3">
          <div className="w-14 h-14 rounded-full bg-blue-900 flex items-center justify-center text-blue-300 font-bold text-2xl">
            {responsable.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">{responsable.nombre}</h1>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {roles.map(rol => (
                <span key={rol} className="text-xs px-2 py-0.5 bg-blue-900 text-blue-300 rounded-full">{rol}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-4">{error}</div>
      )}
      {success && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-lg px-4 py-3 mb-4">{success}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Info personal */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Información Personal</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre completo</label>
              <input
                {...register('nombre', { required: true })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Teléfono</label>
                <input
                  {...register('telefono')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Correo</label>
                <input
                  type="email"
                  {...register('correo')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Activo</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('activo')} className="w-4 h-4 accent-blue-600" />
                <span className="text-gray-300 text-sm">Colaborador activo</span>
              </label>
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
              placeholder="Nuevo rol..."
            />
            <button type="button" onClick={agregarRol} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors">
              Agregar
            </button>
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {roles.map(rol => (
                <span key={rol} className="flex items-center gap-1.5 bg-blue-900 text-blue-300 text-sm px-3 py-1 rounded-full">
                  {rol}
                  <button type="button" onClick={() => setRoles(prev => prev.filter(r => r !== rol))} className="hover:text-white">×</button>
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
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">CLABE</label>
              <input
                {...register('clabe')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
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
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>

      {/* Historial */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl mt-8">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Historial de Proyectos</h2>
          {totalGanado > 0 && (
            <span className="text-green-400 font-bold">${fmt(totalGanado)}</span>
          )}
        </div>

        {historialError && (
          <div className="mx-6 mb-4 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            Error cargando historial: {historialError}
          </div>
        )}
        {/* ✅ Usando componente responsivo compartido */}
        <div className="relative">
          <ResponsiveTableCard<HistorialResponsable>
            data={historial}
            columns={[
              { key: 'proyecto', label: 'Proyecto' },
              { key: 'fecha', label: 'Fecha del Evento' },
              { key: 'rol', label: 'Rol' },
              { key: 'monto', label: 'Monto', align: 'right' },
            ]}
            renderDesktopRow={(h) => (
              <>
                <td className="px-6 py-3">
                  <p className="text-white font-medium">{h.proyecto_nombre}</p>
                  <p className="text-gray-500 text-xs">{h.cliente}</p>
                </td>
                <td className="px-6 py-3 text-gray-400">{h.fecha_evento || '—'}</td>
                <td className="px-6 py-3 text-gray-300">{h.rol_en_proyecto || '—'}</td>
                <td className="px-6 py-3 text-right text-green-400 font-medium">${fmt(h.x_pagar)}</td>
              </>
            )}
            renderMobileCard={(h) => (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <div className="mb-2">
                  <p className="text-white font-medium text-[15px]">{h.proyecto_nombre}</p>
                  <p className="text-gray-400 text-sm">{h.cliente}</p>
                </div>
                <div className="space-y-2 text-sm">
                  {h.fecha_evento && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Fecha:</span>
                      <span className="text-gray-300">{h.fecha_evento}</span>
                    </div>
                  )}
                  {h.rol_en_proyecto && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Rol:</span>
                      <span className="text-gray-300">{h.rol_en_proyecto}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-700 mt-3">
                  <span className="text-gray-400">Monto:</span>
                  <span className="text-green-400 font-medium">${fmt(h.x_pagar)}</span>
                </div>
              </div>
            )}
            keyExtractor={(h) => h.id}
            emptyMessage="Aún no hay proyectos registrados"
          />

          {/* Total en desktop se muestra en el footer de la tabla */}
          {/* Total en mobile se muestra abajo */}
          {historial.length > 0 && (
            <div className="md:hidden bg-gray-900 border border-gray-800 rounded-xl p-4 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-medium">Total Ganado</span>
                <span className="text-green-400 font-bold text-lg">${fmt(totalGanado)}</span>
              </div>
            </div>
          )}

          {/* Footer total para desktop */}
          {historial.length > 0 && (
            <div className="hidden md:block border-t border-gray-700">
              <div className="px-6 py-3 flex justify-end">
                <div className="flex gap-12">
                  <span className="text-gray-400 font-medium">Total:</span>
                  <span className="text-green-400 font-bold">${fmt(totalGanado)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
