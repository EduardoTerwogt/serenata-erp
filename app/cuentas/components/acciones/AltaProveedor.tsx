'use client'

import { Select } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import type { EmisorPreview } from '@/lib/shared/cuentas/factura-preview-tipos'
import { erroresAlta, type AltaForm } from './destino-proveedor'

const REGIMEN: Record<string, string> = { moral: 'Persona moral', fisica: 'Persona física', resico: 'RESICO' }

interface Props {
  /** Datos del XML (solo lectura); sin XML (#140, asignar proveedor) RFC, nombre y régimen se capturan aquí. */
  emisor?: EmisorPreview
  valor: AltaForm
  onChange: (parche: Partial<AltaForm>) => void
}

/**
 * Alta de un proveedor desde Subir factura (#130, Q3) o Asignar proveedor (#140). Con XML, RFC, nombre y régimen vienen de él (solo lectura); teléfono,
 * correo, banco y CLABE son obligatorios (la orden de pago necesita la CLABE y el Portal el correo). La validación de
 * verdad es la de Zod y SQL; aquí solo se marcan correo y CLABE mal escritos.
 */
export function AltaProveedor({ emisor, valor, onChange }: Props) {
  const errores = erroresAlta(valor)
  const set = (campo: keyof AltaForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [campo]: e.target.value })
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {emisor ? (
        <>
          <TextField label="RFC" value={emisor.rfc ?? ''} readOnly className="font-mono" />
          <TextField label="Nombre o razón social" value={emisor.nombre ?? ''} readOnly />
          <TextField label="Régimen fiscal" value={emisor.regimen_sugerido ? REGIMEN[emisor.regimen_sugerido] : 'No se pudo determinar'} readOnly />
        </>
      ) : (
        <>
          <TextField label="Nombre o razón social" requerido value={valor.nombre ?? ''} onChange={set('nombre')} autoComplete="off" />
          <TextField label="RFC" requerido value={valor.rfc ?? ''} onChange={set('rfc')} autoComplete="off" className="font-mono uppercase" />
          <label className="flex w-full flex-col gap-1.5">
            <span className="sn-label">
              Régimen fiscal<span className="ml-0.5 text-accent">*</span>
            </span>
            <Select value={valor.regimen ?? ''} onChange={(e) => onChange({ regimen: e.target.value as AltaForm['regimen'] })}>
              <option value="">Elegir</option>
              <option value="moral">Persona moral</option>
              <option value="fisica">Persona física con honorarios</option>
              <option value="resico">Persona física RESICO</option>
            </Select>
          </label>
        </>
      )}
      <TextField label="Teléfono" requerido value={valor.telefono} onChange={set('telefono')} inputMode="tel" autoComplete="off" />
      <TextField label="Correo" requerido value={valor.correo} onChange={set('correo')} inputMode="email" autoComplete="off" error={errores.correo} />
      <TextField label="Banco" requerido value={valor.banco} onChange={set('banco')} autoComplete="off" />
      <div className="md:col-span-2">
        <TextField label="CLABE" requerido value={valor.clabe} onChange={set('clabe')} inputMode="numeric" autoComplete="off" className="font-mono" error={errores.clabe} placeholder="18 dígitos" />
      </div>
    </div>
  )
}
