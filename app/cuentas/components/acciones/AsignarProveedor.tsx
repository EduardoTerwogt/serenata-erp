'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { ApiError } from '@/lib/client/api'
import { fmtMoney } from '@/lib/quotations/format'
import type { ConceptoVista } from '@/lib/shared/cuentas/periodo-tipos'
import { plural } from '../formato'
import { Cap, CUERPO_VENTANA, Enlace, PieVentana } from './compartido'
import { AltaProveedor } from './AltaProveedor'
import { ConceptosProyecto } from './ConceptosProyecto'
import { ALTA_VACIA, proveedorNuevoManual, type AltaForm } from './destino-proveedor'
import { SelectorContraparte } from './SelectorContraparte'
import { accionesAsignar, type ContraparteLista } from './useAcciones'

interface Props {
  /** El concepto sin proveedor desde el que se abrió; viene marcado. Siempre tiene `proyecto_id`. */
  concepto: ConceptoVista
  onClose: () => void
  onAsignado: () => void
}

/**
 * #140: asigna un proveedor (existente o nuevo) a un concepto sin proveedor y, si se quiere, a otros del mismo proyecto
 * que tampoco lo tienen. No pide factura: `POST /api/cuentas/proveedores/asignar` es una sola transacción en SQL.
 */
export function AsignarProveedor({ concepto, onClose, onAsignado }: Props) {
  const proyectoId = concepto.proyecto_id as string
  const [elegido, setElegido] = useState<ContraparteLista | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [alta, setAlta] = useState<AltaForm>(ALTA_VACIA)
  const [marcados, setMarcados] = useState<string[]>([concepto.id])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // La misma llave hace idempotente el reintento tras un corte de red; un rechazo del servidor (4xx) pide una nueva.
  const llave = useRef(crypto.randomUUID())

  const proveedor = nuevo ? proveedorNuevoManual(alta) : null
  const falta = marcados.length === 0 ? 'Marca al menos un concepto' : nuevo ? (proveedor ? null : 'Completa los datos del proveedor') : elegido ? null : 'Elige al proveedor'

  const asignar = async () => {
    if (falta || enviando) return
    setEnviando(true)
    setError(null)
    try {
      await accionesAsignar.asignar({
        operation_id: llave.current,
        proveedor_id: nuevo ? null : elegido?.id,
        proveedor: proveedor ?? undefined,
        renglones: marcados,
      })
      onAsignado()
      onClose()
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) llave.current = crypto.randomUUID()
      setError(e instanceof Error ? e.message : 'No se pudo asignar el proveedor')
      setEnviando(false)
    }
  }

  const pie = (
    <PieVentana
      titulo={`Asignar a ${plural(marcados.length, 'concepto', 'conceptos')}`}
      detalle={falta ?? 'El monto se recalcula con el régimen del proveedor.'}
      tonoDetalle={falta ? 'acento' : 'neutro'}
      botones={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={asignar} disabled={Boolean(falta) || enviando}>
            {enviando ? 'Asignando…' : 'Asignar'}
          </Button>
        </>
      }
    />
  )

  return (
    <Modal title="Asignar proveedor" eyebrow="Acciones" size="820" mobile="sheet" sheetHeight="92%" closeOnEscape footer={pie} bodyClassName={CUERPO_VENTANA} onClose={onClose}>
      <div className="text-[13px] text-subtext">
        <b className="font-semibold text-ink">{concepto.concepto}</b> · {proyectoId} · {concepto.total_estimado ? '~' : ''}
        {fmtMoney(concepto.total)}
      </div>
      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      {nuevo ? (
        <>
          <Cap derecha={<Enlace onClick={() => setNuevo(false)}>Elegir uno existente</Enlace>}>Proveedor nuevo</Cap>
          <AltaProveedor valor={alta} onChange={(parche) => setAlta((a) => ({ ...a, ...parche }))} />
        </>
      ) : (
        <SelectorContraparte
          lado="proveedor"
          pendiente="todos"
          valor={elegido}
          onElegir={setElegido}
          accion={
            <Button variant="secondary" size="md" iconLeft="plus" onClick={() => setNuevo(true)}>
              Proveedor nuevo
            </Button>
          }
        />
      )}
      <div className="sn-caption">Conceptos sin proveedor de {proyectoId}</div>
      <ConceptosProyecto
        proyectoId={proyectoId}
        proveedorId={null}
        soloPorAsignar
        seleccion={marcados}
        onCargado={() => {}}
        onAlternar={(_, r) => setMarcados((m) => (m.includes(r.cuenta_id) ? m.filter((x) => x !== r.cuenta_id) : [...m, r.cuenta_id]))}
        onMarcar={(_, ids) => setMarcados(ids)}
      />
    </Modal>
  )
}
