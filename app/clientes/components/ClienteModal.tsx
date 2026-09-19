'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Cliente } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Button } from '@/components/ui/Button'

interface ClienteFormValues {
  nombre: string
  tipo: string
  contacto: string
  telefono: string
  correo: string
  notas: string
}

interface Props {
  cliente: Cliente | null
  onClose: () => void
  onSaved: (cliente: Cliente) => void
}

const INPUT_CLASS = 'w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent'
const LABEL_CLASS = 'sn-label block mb-1.5'

export function ClienteModal({ cliente, onClose, onSaved }: Props) {
  const esNuevo = !cliente
  const [activo, setActivo] = useState(cliente?.activo ?? true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<ClienteFormValues>({
    defaultValues: {
      nombre: cliente?.nombre || '',
      tipo: cliente?.tipo || '',
      contacto: cliente?.contacto || '',
      telefono: cliente?.telefono || '',
      correo: cliente?.correo || '',
      notas: cliente?.notas || '',
    },
  })

  const onSubmit = async (data: ClienteFormValues) => {
    setGuardando(true)
    setError(null)
    try {
      const payload = { ...data, ...(esNuevo ? {} : { activo }) }
      const res = await fetch(esNuevo ? '/api/clientes' : `/api/clientes/${cliente!.id}`, {
        method: esNuevo ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const saved = await res.json()
      onSaved(saved)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={esNuevo ? 'Nuevo cliente' : cliente!.nombre}
      subtitle={esNuevo ? 'Agrega un nuevo cliente' : undefined}
      headerExtra={!esNuevo ? (
        <FilterTabs
          tabs={[{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }]}
          value={activo ? 'activo' : 'inactivo'}
          onChange={(v) => setActivo(v === 'activo')}
        />
      ) : undefined}
    >
      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={LABEL_CLASS}>Nombre *</label>
            <input
              {...register('nombre', { required: 'El nombre es requerido' })}
              className={INPUT_CLASS}
              placeholder="Nombre del cliente"
            />
            {errors.nombre && <p className="text-cancelled-fg text-xs mt-1">{errors.nombre.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Tipo</label>
            <input {...register('tipo')} className={INPUT_CLASS} placeholder="Ej. Marca, Agencia" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Persona de contacto</label>
            <input {...register('contacto')} className={INPUT_CLASS} placeholder="Nombre de contacto" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Teléfono</label>
            <input {...register('telefono')} className={INPUT_CLASS} placeholder="55 1234 5678" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Correo</label>
            <input type="email" {...register('correo')} className={INPUT_CLASS} placeholder="correo@ejemplo.com" />
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Notas</label>
          <textarea {...register('notas')} rows={2} className={`${INPUT_CLASS} resize-none`} placeholder="Acuerdos, condiciones…" />
        </div>

        <div className="flex gap-3 border-t border-hairline pt-4">
          <Button variant="ghost" size="lg" className="flex-1" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={guardando}>
            {guardando ? 'Guardando...' : esNuevo ? 'Crear cliente' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
