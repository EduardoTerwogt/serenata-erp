'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { TextField } from '@/components/ui/TextField'
import { fmtMoney } from '@/lib/quotations/format'
import type { PreviewFactura } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { ProyectoSelector, RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { plural } from '../formato'
import { Aviso } from '../detalle/TabPago'
import { Cap } from './compartido'
import { AltaProveedor } from './AltaProveedor'
import type { DestinoProveedor as Destino, ModoDestino } from './destino-proveedor'
import { SelectorContraparte } from './SelectorContraparte'
import { SelectorProyectos } from './SelectorProyectos'
import type { ContraparteLista } from './useAcciones'

interface Props {
  factura: PreviewFactura
  /** Proveedor existente (por RFC o elegido a mano); null si el emisor no existe. */
  contraparte: { id: string; nombre: string } | null
  destino: Destino
  onDestino: (d: Destino) => void
  /** Elegir a un proveedor que ya existe ("es este proveedor", o el buscador). */
  onElegirProveedor: (c: ContraparteLista) => void
  /** Lista de proyectos del proveedor (la de siempre): se pinta en el modo `grupo`. */
  listaGrupos: ReactNode
}

const MODOS: { value: ModoDestino; label: string }[] = [
  { value: 'grupo', label: 'Proyecto del proveedor' },
  { value: 'renglones', label: 'Asignar renglones' },
  { value: 'gasto', label: 'Gasto extra' },
]

/**
 * A qué se liga la factura de un proveedor (#130). Tres operaciones: un proyecto donde ya tiene renglones (como hoy),
 * asignar renglones al emisor (por asignar o de otro proveedor, de UN proyecto), o un gasto extra fuera de cotización.
 * Si el emisor no existe, aquí mismo se elige "es este proveedor" o se da de alta con los datos del XML.
 */
export function DestinoProveedor({ factura, contraparte, destino, onDestino, onElegirProveedor, listaGrupos }: Props) {
  const emisor = factura.emisor
  const nuevo = destino.nuevo
  const tiene = Boolean(contraparte) || nuevo
  const modo: ModoDestino = nuevo && destino.modo === 'grupo' ? 'renglones' : destino.modo
  const subtotal = factura.cfdi.subtotal ?? 0
  const propuesta = factura.propuesta[0] ?? null
  const propuestaAplicada = propuesta && destino.proyectoRenglones === propuesta.proyecto_id && propuesta.renglones.every((id) => destino.renglones.includes(id)) && destino.renglones.length === propuesta.renglones.length

  const alternarRenglon = (p: ProyectoSelector, r: RenglonSelector) => {
    const mismo = destino.proyectoRenglones === p.proyecto_id
    const actuales = mismo ? destino.renglones : []
    const siguientes = actuales.includes(r.cuenta_id) ? actuales.filter((x) => x !== r.cuenta_id) : [...actuales, r.cuenta_id]
    onDestino({ ...destino, modo: 'renglones', renglones: siguientes, proyectoRenglones: siguientes.length > 0 ? p.proyecto_id : null })
  }

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
                <Button key={c.id} variant="secondary" size="md" onClick={() => onElegirProveedor({ id: c.id, nombre: c.nombre })}>
                  {c.nombre}
                </Button>
              ))}
            </div>
          )}
          <SelectorContraparte lado="proveedor" valor={null} onElegir={onElegirProveedor} />
          {emisor?.regimen_sugerido && (
            <div>
              <Button variant="secondary" size="md" iconLeft="plus" onClick={() => onDestino({ ...destino, nuevo: true, modo: 'renglones' })}>
                Crear proveedor nuevo
              </Button>
            </div>
          )}
          {!emisor?.regimen_sugerido && <div className="text-[12px] text-subtext">El XML no trae un RFC válido para dar de alta al proveedor; elige uno existente.</div>}
        </div>
      )}

      {nuevo && emisor && (
        <>
          <Cap
            derecha={
              <button type="button" onClick={() => onDestino({ ...destino, nuevo: false })} className="text-[12.5px] font-medium text-accent hover:underline">
                Elegir uno existente
              </button>
            }
          >
            Proveedor nuevo · datos del XML
          </Cap>
          <AltaProveedor emisor={emisor} valor={destino.alta} onChange={(alta) => onDestino({ ...destino, alta })} />
        </>
      )}

      {tiene && (
        <>
          <FilterTabs
            tabs={nuevo ? MODOS.slice(1) : MODOS}
            value={modo}
            onChange={(m) => onDestino({ ...destino, modo: m })}
          />

          {modo === 'grupo' && listaGrupos}

          {modo === 'renglones' && (
            <div className="flex flex-col gap-3">
              {propuesta ? (
                <Aviso icono="circle-check" tono="ok">
                  <b>Cuadra con el XML:</b> los {plural(propuesta.renglones.length, 'renglón por asignar', 'renglones por asignar')} de {propuesta.proyecto ?? propuesta.proyecto_id} suman {fmtMoney(propuesta.neto)}, el neto del XML (tolerancia {fmtMoney(factura.tolerancia)}). Revisa que sean los correctos.
                  {!propuestaAplicada && (
                    <>
                      {' '}
                      <button type="button" className="font-medium text-accent hover:underline" onClick={() => onDestino({ ...destino, modo: 'renglones', renglones: propuesta.renglones, proyectoRenglones: propuesta.proyecto_id })}>
                        Marcarlos
                      </button>
                    </>
                  )}
                </Aviso>
              ) : (
                <Aviso icono="info" tono="neutro">
                  Ningún proyecto tiene renglones por asignar que sumen {fmtMoney(subtotal)} (neto del XML). Marca los renglones a mano o registra un gasto extra.
                </Aviso>
              )}
              <Cap derecha={<span className="text-[11.5px] text-subtext">Una factura es de un solo proyecto</span>}>Renglones</Cap>
              <SelectorProyectos
                modo="renglones"
                contraparte={contraparte?.id ?? null}
                busquedaInicial={propuesta?.proyecto_id ?? ''}
                seleccion={destino.renglones}
                proyectoSeleccionado={destino.proyectoRenglones}
                onToggleRenglon={alternarRenglon}
              />
              <div className="text-[11px] text-subtext">Los renglones de otro proveedor pasan al emisor mientras su grupo siga abierto, sin pagos ni orden de pago.</div>
            </div>
          )}

          {modo === 'gasto' && (
            <div className="flex flex-col gap-3">
              <Aviso icono="info" tono="neutro">
                Un gasto extra no está en la cotización: entra a los egresos del proyecto y resta de su utilidad. La cotización aprobada no cambia.
              </Aviso>
              <Cap>Proyecto del gasto</Cap>
              <SelectorProyectos
                modo="proyecto"
                contraparte={contraparte?.id ?? null}
                proyectoSeleccionado={destino.gasto.proyecto_id}
                onElegirProyecto={(p) => onDestino({ ...destino, modo: 'gasto', gasto: { ...destino.gasto, proyecto_id: p.proyecto_id, proyecto: p.proyecto } })}
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <TextField label="Concepto" value={destino.gasto.concepto} onChange={(e) => onDestino({ ...destino, gasto: { ...destino.gasto, concepto: e.target.value } })} autoComplete="off" />
                <TextField
                  label="Costo neto al proveedor"
                  value={destino.gasto.costo}
                  onChange={(e) => onDestino({ ...destino, gasto: { ...destino.gasto, costo: e.target.value } })}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={subtotal > 0 ? subtotal.toFixed(2) : '0.00'}
                  hint={subtotal > 0 ? `Subtotal del XML: ${fmtMoney(subtotal)}` : undefined}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
