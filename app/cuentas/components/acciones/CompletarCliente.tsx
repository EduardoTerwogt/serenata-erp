'use client'

import { Icon } from '@/components/ui/Icon'
import { TextField } from '@/components/ui/TextField'
import { ACCEPT_COMPROBANTE, BotonArchivo } from '../detalle/TabDocumentos'
import { Enlace } from './compartido'

export interface ClienteForm {
  contacto: string
  telefono: string
  correo: string
  constancia: File | null
}

export const CLIENTE_VACIO: ClienteForm = { contacto: '', telefono: '', correo: '', constancia: null }

interface Props {
  rfc: string | null
  nombre: string
  /** El cliente ya tiene una constancia guardada: subirla otra vez es opcional. */
  tieneConstancia: boolean
  valor: ClienteForm
  onChange: (v: ClienteForm) => void
  onRechazo: (mensaje: string) => void
}

/**
 * Completar la ficha de un cliente al facturarle por primera vez (#130, Q9). El cliente ya existe (nace con la
 * cotización, sin RFC): se guardan el RFC del XML, los datos de contacto y la constancia fiscal, que se pide antes de
 * facturar. Una sola ficha; no se crea un cliente paralelo.
 */
export function CompletarCliente({ rfc, nombre, tieneConstancia, valor, onChange, onRechazo }: Props) {
  const set = (campo: 'contacto' | 'telefono' | 'correo') => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...valor, [campo]: e.target.value })
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField label="RFC" value={rfc ?? ''} readOnly className="font-mono" />
        <TextField label="Cliente" value={nombre} readOnly />
        <TextField label="Persona de contacto" value={valor.contacto} onChange={set('contacto')} autoComplete="off" />
        <TextField label="Teléfono" value={valor.telefono} onChange={set('telefono')} inputMode="tel" autoComplete="off" />
        <div className="md:col-span-2">
          <TextField label="Correo" value={valor.correo} onChange={set('correo')} inputMode="email" autoComplete="off" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-panel border border-hairline px-3.5 py-2.5">
        <Icon name="file-text" size={18} className="flex-none text-subtext" />
        <div className="min-w-[160px] flex-1">
          <div className="truncate text-[13px] font-medium text-ink">{valor.constancia?.name ?? 'Constancia de situación fiscal'}</div>
          <div className={`text-[11.5px] ${!valor.constancia && !tieneConstancia ? 'text-cancelled-fg' : 'text-subtext'}`}>{valor.constancia ? 'PDF o imagen' : tieneConstancia ? 'Opcional' : 'Requerida'}</div>
        </div>
        {valor.constancia ? (
          <Enlace onClick={() => onChange({ ...valor, constancia: null })}>Quitar</Enlace>
        ) : (
          <BotonArchivo etiqueta="Adjuntar constancia" accept={ACCEPT_COMPROBANTE} onArchivo={(f) => onChange({ ...valor, constancia: f })} onRechazo={onRechazo} />
        )}
      </div>
    </div>
  )
}
