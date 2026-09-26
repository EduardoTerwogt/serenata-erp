'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { sendJson } from '@/lib/client/api'
import type { ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { plural } from './formato'
import { useEsAdmin } from './ui'

const ruta = (id: string, accion: 'reabrir' | 'cerrar') => `/api/cuentas/proyectos/${encodeURIComponent(id)}/${accion}`

/**
 * B7 (D5, D6): Reabrir y Volver a cerrar, solo admin. Se reabre con o sin
 * pendientes (sesión 20) y con motivo obligatorio. Con pendientes, terminar
 * la reapertura se llama "Terminar correcciones": las cuentas se cierran
 * solas al resolverlos (D17).
 */
export function AccionesReapertura({ p, onCambio, bloque }: { p: ProyectoDetalle; onCambio: () => void; bloque?: boolean }) {
  const esAdmin = useEsAdmin()
  const [abierto, setAbierto] = useState(false)
  if (!esAdmin || p.sin_proyecto) return null

  const reabiertas = p.cuentas.reabiertas
  const etiqueta = !reabiertas ? 'Reabrir' : p.cuentas.pendientes === 0 ? 'Volver a cerrar' : 'Terminar correcciones'
  return (
    <>
      <Button variant="secondary" size="md" iconLeft={reabiertas ? 'lock' : 'rotate-ccw'} onClick={() => setAbierto(true)} className={bloque ? 'w-full' : 'flex-none'}>
        {etiqueta}
      </Button>
      {abierto && (
        <ModalReapertura
          p={p}
          titulo={etiqueta}
          onClose={() => setAbierto(false)}
          onHecho={() => {
            setAbierto(false)
            onCambio()
          }}
        />
      )}
    </>
  )
}

function ModalReapertura({ p, titulo, onClose, onHecho }: { p: ProyectoDetalle; titulo: string; onClose: () => void; onHecho: () => void }) {
  const reabrir = !p.cuentas.reabiertas
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listo = !reabrir || motivo.trim().length >= 3

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!listo || enviando) return
    setEnviando(true)
    setError(null)
    try {
      if (reabrir) await sendJson(ruta(p.id, 'reabrir'), { motivo: motivo.trim() }, 'No se pudieron reabrir las cuentas')
      else await sendJson(ruta(p.id, 'cerrar'), {}, 'No se pudieron cerrar las cuentas')
      onHecho()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setEnviando(false)
    }
  }

  const texto = reabrir
    ? 'Reabrir habilita las correcciones: anular pagos, quitar o reemplazar documentos, editar fechas y notas y reasignar el proveedor de un concepto pagado. No borra datos y queda registro de quién, cuándo y por qué.'
    : p.cuentas.pendientes === 0
      ? 'Las cuentas quedan cerradas y se desactivan las correcciones.'
      : `Se desactivan las correcciones. Quedan ${plural(p.cuentas.pendientes, 'concepto', 'conceptos')} por resolver; las cuentas se cerrarán solas cuando estén resueltos.`

  return (
    <Modal title={titulo} eyebrow={`Cuentas · ${p.id}`} subtitle={p.nombre} mobile="sheet" closeOnEscape onClose={onClose} bodyClassName="px-4 pb-7 pt-4 md:px-[22px] md:pb-6">
      <form className="flex flex-col gap-4" onSubmit={enviar}>
        <p className="text-[13px] leading-normal text-body">{texto}</p>
        {reabrir && (
          <TextFieldMotivo value={motivo} onChange={setMotivo} placeholder="Ej. la factura del proveedor tiene el RFC equivocado" />
        )}
        {error && <StatusBanner tone="error">{error}</StatusBanner>}
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="md" disabled={!listo || enviando}>
            {enviando ? 'Guardando…' : titulo}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Motivo obligatorio (D6); lo reutilizan las correcciones del detalle. */
export function TextFieldMotivo({ value, onChange, placeholder, label = 'Motivo' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="sn-label">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={500}
        required
        className="h-[72px] w-full resize-y rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 py-2.5 text-[13.5px] text-body outline-none focus:border-accent-quiet"
      />
    </label>
  )
}
