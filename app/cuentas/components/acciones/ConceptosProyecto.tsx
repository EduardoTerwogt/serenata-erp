'use client'

import { useEffect, useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/Checkbox'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { plural } from '../formato'
import { fmtMoney } from '@/lib/quotations/format'
import type { RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { BarraSeleccion, Enlace } from './compartido'
import { useProyectosSelector } from './useAcciones'

interface Props {
  proyectoId: string
  /** Proveedor de la factura: sus conceptos salen como "Proveedor actual". */
  proveedorId: string | null
  /** #140 (Asignar proveedor): solo los conceptos que aún no tienen proveedor. */
  soloPorAsignar?: boolean
  seleccion: string[]
  /** Los conceptos del proyecto llegaron (marca inicial y grupo exacto). */
  onCargado: (conceptos: RenglonSelector[]) => void
  onAlternar: (conceptos: RenglonSelector[], concepto: RenglonSelector) => void
  /** «Marcar todos / Quitar todos»: deja marcados exactamente estos conceptos (nunca los bloqueados). */
  onMarcar: (conceptos: RenglonSelector[], ids: string[]) => void
}

/**
 * Conceptos de un proyecto agrupados por proveedor (#131, paso 2 de la factura de proveedor). De quién son decide si se
 * pueden mover: los de otro proveedor sin factura se reasignan; los que ya tienen factura o pagos quedan bloqueados.
 * Se leen con el mismo `cuentas_proyectos_selector` que el selector de proyectos.
 */
export function ConceptosProyecto({ proyectoId, proveedorId, soloPorAsignar, seleccion, onCargado, onAlternar, onMarcar }: Props) {
  const [verBloqueados, setVerBloqueados] = useState(false)
  const { proyectos, cargando, error } = useProyectosSelector({ modo: 'renglones', lado: 'proveedor', q: proyectoId, contraparte: proveedorId, soloPendientes: false }, true)
  const todos = proyectos.find((p) => p.proyecto_id === proyectoId)?.renglones ?? null
  const conceptos = useMemo(() => (soloPorAsignar ? (todos?.filter((r) => !r.responsable_id) ?? null) : todos), [todos, soloPorAsignar])

  useEffect(() => {
    if (conceptos) onCargado(conceptos)
    // `onCargado` cambia en cada render; solo importa cuando llegan los conceptos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptos])

  if (error) return <div className="rounded-panel border border-hairline px-3.5 py-3 text-[12.5px] text-subtext">{error}</div>
  if (cargando || !conceptos) return <div className="rounded-panel border border-hairline px-3.5 py-3 text-[12.5px] text-subtext">Buscando…</div>
  if (conceptos.length === 0) return <div className="rounded-panel border border-hairline px-3.5 py-3 text-[12.5px] text-subtext">Sin conceptos.</div>

  // Se agrupan por proveedor, como en la maqueta.
  const grupos = new Map<string, RenglonSelector[]>()
  for (const r of conceptos) grupos.set(r.responsable_id ?? '', [...(grupos.get(r.responsable_id ?? '') ?? []), r])

  const movibles = conceptos.filter((r) => !r.bloqueado)
  const marcados = movibles.filter((r) => seleccion.includes(r.cuenta_id))
  const bloqueados = conceptos.filter((r) => r.bloqueado)

  return (
    <div className="overflow-hidden rounded-panel border border-hairline bg-row">
      <BarraSeleccion
        resumen={`${marcados.length} de ${movibles.length} ${movibles.length === 1 ? 'marcado' : 'marcados'} · ${fmtMoney(marcados.reduce((a, r) => a + r.costo_total, 0))}`}
        onTodas={() => onMarcar(conceptos, movibles.map((r) => r.cuenta_id))}
        onNinguna={() => onMarcar(conceptos, [])}
        etiquetaTodas="Marcar todos"
        etiquetaNinguna="Quitar todos"
      />
      {Array.from(grupos.values()).map((rs) => {
        const dueno = rs[0].responsable
        const todosBloqueados = rs.every((r) => r.bloqueado)
        // Los conceptos de otro proveedor con factura o pagos no se pueden mover: van en una sola fila, plegada.
        if (todosBloqueados && !verBloqueados) return null
        const esActual = proveedorId !== null && rs[0].responsable_id === proveedorId
        const estado = !dueno ? 'por asignar' : rs[0].grupo_estado === 'ABIERTO' ? 'grupo abierto' : rs[0].grupo_estado === 'PAGADO' ? 'pagado' : rs[0].grupo_estado === 'EN_PROCESO_PAGO' ? 'en pago' : 'con factura'
        return (
          <div key={rs[0].responsable_id ?? 'libres'}>
            <div className="flex items-center gap-3 border-t border-hairline bg-row-alt px-3.5 py-1.5 first:border-t-0">
              <span className="sn-caption min-w-0 flex-1 truncate">
                {dueno ?? 'Sin proveedor'} · {estado}
              </span>
              {todosBloqueados && <StatusBadge tone="draft">No se puede mover</StatusBadge>}
              {!todosBloqueados && esActual && <StatusBadge tone="issued">Proveedor actual</StatusBadge>}
              {!todosBloqueados && !esActual && !dueno && <StatusBadge tone="draft">Por asignar</StatusBadge>}
            </div>
            {rs.map((r) => (
              <div key={r.cuenta_id} className="flex items-center gap-3 border-t border-hairline px-3.5 py-2 text-[12.5px]">
                <Checkbox checked={seleccion.includes(r.cuenta_id)} disabled={r.bloqueado} onChange={() => onAlternar(conceptos, r)} label={`Incluir ${r.descripcion}`} />
                <span className={`min-w-0 flex-1 truncate ${r.bloqueado ? 'text-faint' : 'text-ink'}`}>
                  {r.descripcion}
                  {r.gasto_extra && <span className="text-faint"> · gasto extra</span>}
                </span>
                <span className={`whitespace-nowrap font-semibold ${r.bloqueado ? 'text-faint' : 'text-ink'}`}>{fmtMoney(r.costo_total)}</span>
              </div>
            ))}
          </div>
        )
      })}
      {bloqueados.length > 0 && (
        <div className="flex items-center gap-3 border-t border-hairline bg-row-alt px-3.5 py-2 text-[12.5px] text-subtext">
          <span className="min-w-0 flex-1 truncate">{plural(bloqueados.length, 'concepto de otro proveedor con factura', 'conceptos de otros proveedores con factura')}</span>
          <StatusBadge tone="draft">No se puede mover</StatusBadge>
          <Enlace onClick={() => setVerBloqueados((v) => !v)}>{verBloqueados ? 'Ocultar' : 'Ver'}</Enlace>
        </div>
      )}
    </div>
  )
}
