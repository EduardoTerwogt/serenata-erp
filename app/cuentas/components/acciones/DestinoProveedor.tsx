'use client'

import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Switch } from '@/components/ui/Switch'
import { TextField } from '@/components/ui/TextField'
import { fmtMoney } from '@/lib/quotations/format'
import type { PreviewFactura } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { plural } from '../formato'
import { Aviso } from '../detalle/TabPago'
import { Cap, Enlace, Paso } from './compartido'
import { AltaProveedor } from './AltaProveedor'
import { ConceptosProyecto } from './ConceptosProyecto'
import { grupoExacto, marcaInicial, montoDeTexto, type DestinoProveedor as Destino, type ProyectoRef } from './destino-proveedor'
import { SelectorContraparte } from './SelectorContraparte'
import { SelectorProyectos } from './SelectorProyectos'
import type { ContraparteLista } from './useAcciones'

interface Props {
  factura: PreviewFactura
  /** Proveedor existente (por RFC o elegido a mano); null si el emisor no existe. */
  contraparte: { id: string; nombre: string } | null
  destino: Destino
  /** Actualiza con la forma funcional: lo escrito y lo marcado no se pisan aunque lleguen datos del servidor a mitad de la captura. */
  onDestino: Dispatch<SetStateAction<Destino>>
  /** Elegir a un proveedor que ya existe ("es este proveedor", o el desplegable). */
  onElegirProveedor: (c: ContraparteLista) => void
  /** Cuadre que calcula SQL cuando lo marcado es exactamente el grupo del proveedor; null si no aplica. */
  avisoCuadre: ReactNode
}

function FilaProyecto({ p, marcado, motivo, onCambio }: { p: ProyectoRef; marcado: boolean; motivo?: string; onCambio: (marcado: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-hairline bg-row-alt px-3.5 py-2.5">
      <Checkbox checked={marcado} onChange={onCambio} label={`Proyecto ${p.proyecto_id}`} />
      <span className="sn-folio w-[64px] flex-none text-[11px] text-accent">{p.proyecto_id}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{p.proyecto ?? '—'}</span>
      {motivo && <StatusBadge tone="issued">{motivo}</StatusBadge>}
    </div>
  )
}

/** Desplegable para elegir a mano el proyecto cuando la sugerencia no es la correcta (mismo selector paginado de SQL). */
function ElegirProyecto({ etiqueta, proveedorId, elegido, onElegir }: { etiqueta: string; proveedorId: string | null; elegido: string | null; onElegir: (p: ProyectoRef) => void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`flex h-[var(--control-height-lg)] w-full min-w-0 items-center gap-2 rounded-control border bg-input px-3.5 text-left text-[length:var(--text-md)] hover:bg-row-alt ${abierto ? 'border-accent-quiet' : 'border-hairline'}`}
      >
        <span className="min-w-0 flex-1 truncate text-subtext">{etiqueta}</span>
        <Icon name={abierto ? 'chevron-up' : 'chevron-down'} size={15} className="flex-none text-subtext" />
      </button>
      {abierto && (
        <div className="mt-1.5">
          <SelectorProyectos
            modo="proyecto"
            contraparte={proveedorId}
            proyectoSeleccionado={elegido}
            onElegirProyecto={(p) => {
              onElegir({ proyecto_id: p.proyecto_id, proyecto: p.proyecto })
              setAbierto(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * A qué se liga la factura de un proveedor (#131). Una factura es de un solo proyecto: se elige el proyecto, luego los
 * conceptos que cubre (los del proveedor ya vienen marcados; los libres o de otro proveedor sin factura se le asignan)
 * o, con el interruptor, un gasto extra fuera de cotización. Si el emisor no existe, aquí mismo se elige "es este
 * proveedor" o se da de alta con los datos del XML.
 */
export function DestinoProveedor({ factura, contraparte, destino, onDestino, onElegirProveedor, avisoCuadre }: Props) {
  const emisor = factura.emisor
  const nuevo = destino.nuevo
  const tiene = Boolean(contraparte) || nuevo
  const proveedorId = contraparte?.id ?? null
  const proyecto = destino.proyecto
  const gasto = destino.modo === 'gasto'
  const subtotal = factura.cfdi.subtotal ?? 0
  const propuesta = factura.propuesta.find((p) => p.proyecto_id === proyecto?.proyecto_id) ?? null
  const propuestaAplicada = propuesta && destino.renglones.length === propuesta.renglones.length && propuesta.renglones.every((id) => destino.renglones.includes(id))

  const sugerido = destino.sugerido
  const otro = proyecto && proyecto.proyecto_id !== sugerido?.ref.proyecto_id ? proyecto : null
  const elegirProyecto = (p: ProyectoRef) => onDestino((d) => ({ ...d, proyecto: p, renglones: [], grupoId: null, marcado: false }))
  const quitarProyecto = () => onDestino((d) => ({ ...d, proyecto: null, renglones: [], grupoId: null, marcado: false }))
  const conceptosCargados = (rs: RenglonSelector[]) =>
    onDestino((d) => {
      if (d.marcado) return d
      const renglones = marcaInicial(rs, proveedorId, propuesta?.renglones ?? null)
      return { ...d, renglones, grupoId: grupoExacto(rs, renglones, proveedorId), marcado: true }
    })
  const alternar = (rs: RenglonSelector[], r: RenglonSelector) =>
    onDestino((d) => {
      const renglones = d.renglones.includes(r.cuenta_id) ? d.renglones.filter((x) => x !== r.cuenta_id) : [...d.renglones, r.cuenta_id]
      return { ...d, modo: 'renglones', renglones, grupoId: grupoExacto(rs, renglones, proveedorId), marcado: true }
    })
  // «Marcar todos / Quitar todos»: reemplaza lo marcado (el grupo exacto se vuelve a calcular).
  const marcarVarios = (rs: RenglonSelector[], ids: string[]) => onDestino((d) => ({ ...d, modo: 'renglones', renglones: ids, grupoId: grupoExacto(rs, ids, proveedorId), marcado: true }))
  // Un gasto extra propone el neto del XML como costo; se puede corregir.
  const cambiarGasto = (activo: boolean) =>
    onDestino((d) => ({ ...d, modo: activo ? 'gasto' : 'renglones', gasto: activo && d.gasto.costo === '' && subtotal > 0 ? { ...d.gasto, costo: subtotal.toFixed(2) } : d.gasto }))

  return (
    <div className="flex flex-col gap-4">
      {!tiene && (
        <div className="flex flex-col gap-3">
          <Aviso icono="warning" tono="acento">
            No hay un proveedor con el RFC {factura.rfc_contraparte ?? 'del XML'}.
            {factura.coincidencias_nombre.length > 0 ? ' Hay proveedores con un nombre parecido; elige uno o crea el proveedor.' : ' Elige quién es o crea el proveedor.'}
          </Aviso>
          {factura.coincidencias_nombre.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-subtext">Es este proveedor:</span>
              {factura.coincidencias_nombre.map((c) => (
                <Button key={c.id} variant="secondary" size="md" className="max-w-full" onClick={() => onElegirProveedor({ id: c.id, nombre: c.nombre })}>
                  <span className="min-w-0 truncate">{c.nombre}</span>
                </Button>
              ))}
            </div>
          )}
          <SelectorContraparte
            lado="proveedor"
            pendiente="factura"
            valor={null}
            onElegir={onElegirProveedor}
            accion={
              emisor?.regimen_sugerido ? (
                <Button variant="secondary" size="md" iconLeft="plus" onClick={() => onDestino((d) => ({ ...d, nuevo: true, modo: 'renglones' }))}>
                  Proveedor nuevo
                </Button>
              ) : undefined
            }
          />
          {!emisor?.regimen_sugerido && <div className="text-[12px] text-subtext">El XML no trae un RFC válido para dar de alta al proveedor; elige uno existente.</div>}
        </div>
      )}

      {nuevo && emisor && (
        <>
          <Cap derecha={<Enlace onClick={() => onDestino((d) => ({ ...d, nuevo: false }))}>Elegir uno existente</Enlace>}>Proveedor nuevo · datos del XML</Cap>
          <AltaProveedor emisor={emisor} valor={destino.alta} onChange={(parche) => onDestino((d) => ({ ...d, alta: { ...d.alta, ...parche } }))} />
        </>
      )}

      {tiene && (
        <>
          <Paso n={2} titulo="¿Qué cubre?">
            <div className="sn-caption">Proyecto</div>
            {sugerido && <FilaProyecto p={sugerido.ref} marcado={proyecto?.proyecto_id === sugerido.ref.proyecto_id} motivo={sugerido.motivo} onCambio={(m) => (m ? elegirProyecto(sugerido.ref) : quitarProyecto())} />}
            {otro && <FilaProyecto p={otro} marcado onCambio={quitarProyecto} />}
            <ElegirProyecto etiqueta={sugerido || otro ? 'Elegir otro proyecto' : 'Elegir proyecto'} proveedorId={proveedorId} elegido={proyecto?.proyecto_id ?? null} onElegir={elegirProyecto} />

            {proyecto && (
              <>
                <Switch checked={gasto} onChange={cambiarGasto} label="Esta factura no está en la cotización (gasto extra)" />

                {gasto ? (
                  <>
                    <div className="sn-caption mt-1">Gasto extra</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <TextField label="Concepto" requerido value={destino.gasto.concepto} onChange={(e) => { const v = e.target.value; onDestino((d) => ({ ...d, gasto: { ...d.gasto, concepto: v } })) }} autoComplete="off" />
                      <TextField
                        label="Costo neto al proveedor"
                        requerido
                        value={destino.gasto.costo}
                        onChange={(e) => { const v = e.target.value; onDestino((d) => ({ ...d, gasto: { ...d.gasto, costo: v } })) }}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                      />
                    </div>
                    {montoDeTexto(destino.gasto.costo) !== null && (
                      <Aviso icono="info" tono="neutro">
                        Resta de la utilidad de {proyecto.proyecto_id}: {fmtMoney(montoDeTexto(destino.gasto.costo) ?? 0)} (neto). La cotización aprobada no cambia.
                      </Aviso>
                    )}
                  </>
                ) : (
                  <>
                    <div className="sn-caption mt-1">Conceptos</div>
                    {propuesta && (
                      <Aviso icono="circle-check" tono="ok">
                        <b>Cuadra con el XML:</b> {plural(propuesta.renglones.length, 'concepto por asignar', 'conceptos por asignar')} de {propuesta.proyecto_id} suman {fmtMoney(propuesta.neto)}, el neto del XML (tolerancia {fmtMoney(factura.tolerancia)}).
                        {!propuestaAplicada && (
                          <>
                            {' '}
                            <button type="button" className="font-medium underline" onClick={() => onDestino((d) => ({ ...d, modo: 'renglones', renglones: propuesta.renglones, grupoId: null, marcado: true }))}>
                              Marcarlos
                            </button>
                          </>
                        )}
                      </Aviso>
                    )}
                    <ConceptosProyecto proyectoId={proyecto.proyecto_id} proveedorId={proveedorId} seleccion={destino.renglones} onCargado={conceptosCargados} onAlternar={alternar} onMarcar={marcarVarios} />
                  </>
                )}
              </>
            )}
          </Paso>
          {proyecto && !gasto && avisoCuadre && <Paso n={3} titulo="Confirmar">{avisoCuadre}</Paso>}
        </>
      )}
    </div>
  )
}
