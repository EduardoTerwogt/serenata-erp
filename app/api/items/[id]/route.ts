import { requireAnySection } from '@/lib/api-auth'
import { respuestaProyectoHistorico } from '@/lib/server/errors/domain-error'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { ItemPatchSchema, validate } from '@/lib/validation/schemas'
import { createHistorialCambioResponsableItem } from '@/lib/server/repositories/historial-cambios-responsable'
import { findOrCreateProveedorByNombre } from '@/lib/server/repositories/proveedores'

async function nombreDeProveedor(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('proveedores').select('nombre').eq('id', id).maybeSingle()
  return data?.nombre ?? null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 'cuentas': reasignar el responsable desde el detalle de Cuentas (D21).
  const authResult = await requireAnySection(['cotizaciones', 'proyectos', 'cuentas'])
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()

    const validation = validate(ItemPatchSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const parsed = validation.data
    let { responsable_id, responsable_nombre } = parsed
    const { notas } = parsed

    // Fase 5.3 Bloque 0, punto 2: un nombre de responsable por texto libre
    // (sin id) siempre debe resolver a un proveedor real, nunca quedarse
    // en solo texto suelto.
    if (responsable_nombre && !responsable_id) {
      const proveedor = await findOrCreateProveedorByNombre(responsable_nombre)
      responsable_id = proveedor.id
      responsable_nombre = proveedor.nombre
    }

    const { data: item, error: itemError } = await supabaseAdmin
      .from('items_cotizacion')
      .select('*, proveedores(nombre)')
      .eq('id', id)
      .single()

    if (itemError || !item) {
      return Response.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    if (!('responsable_id' in parsed) && !('responsable_nombre' in parsed)) {
      // Solo notas: no toca cuentas_pagar ni grupos, update directo alcanza.
      const { error: notasError } = await supabaseAdmin
        .from('items_cotizacion')
        .update({ notas: notas ?? null })
        .eq('id', id)
      if (notasError) throw notasError
      return Response.json({ ok: true })
    }

    // Cuenta por pagar ya generada para este item (cotización aprobada):
    // item_id es la llave 1:1 (UNIQUE, NOT NULL, B5b).
    const { data: cuentaPrimaria } = await supabaseAdmin
      .from('cuentas_pagar')
      .select('id')
      .eq('item_id', id)
      .maybeSingle()

    // reasignar_responsable_cuenta_pagar hace, en una sola transacción,
    // items_cotizacion (cuando la cuenta tiene item_id) + cuentas_pagar + la
    // reconciliación de cuentas_pagar_grupos -- si el grupo viejo de la
    // cuenta ya no está ABIERTO (P1412), revierte todo y esta ruta responde
    // 409 en vez de aplicar parcialmente.
    const grupoNoAbiertoResponse = Response.json(
      { error: 'grupo_no_abierto', message: 'Esta cuenta ya forma parte de un grupo facturado o pagado; no se puede reasignar el proveedor sin una corrección contable.' },
      { status: 409 }
    )

    if (cuentaPrimaria) {
      const { error: rpcError } = await supabaseAdmin.rpc('reasignar_responsable_cuenta_pagar', {
        p_cuenta_pagar_id: cuentaPrimaria.id,
        p_responsable_id: responsable_id || null,
      })
      if (rpcError) {
        if (rpcError.code === 'P1412') return grupoNoAbiertoResponse
        const historico = respuestaProyectoHistorico(rpcError)
        if (historico) return Response.json(historico.body, { status: historico.status })
        throw rpcError
      }
    } else {
      // Sin cuenta (cotización aún no aprobada): no hay nada que reconciliar,
      // se actualiza el renglón directo.
      const updateFields: Record<string, unknown> = {}
      if ('responsable_id' in parsed) updateFields.responsable_id = responsable_id || null
      const { error: updateError } = await supabaseAdmin
        .from('items_cotizacion')
        .update(updateFields)
        .eq('id', id)
      if (updateError) throw updateError
    }

    if ('notas' in parsed) {
      const { error: notasError } = await supabaseAdmin
        .from('items_cotizacion')
        .update({ notas: notas ?? null })
        .eq('id', id)
      if (notasError) throw notasError
    }

    if ('responsable_id' in parsed) {
      const nuevoResponsableId = responsable_id || null
      if (nuevoResponsableId !== item.responsable_id) {
        // D12: el nombre sale del proveedor (el renglón ya no lo guarda).
        const nuevoResponsableNombre = nuevoResponsableId
          ? (responsable_nombre || (await nombreDeProveedor(nuevoResponsableId)))
          : null
        await createHistorialCambioResponsableItem({
          item_id: id,
          cotizacion_id: item.cotizacion_id,
          responsable_anterior_id: item.responsable_id ?? null,
          responsable_anterior_nombre: (item as { proveedores?: { nombre: string | null } | null }).proveedores?.nombre ?? null,
          responsable_nuevo_id: nuevoResponsableId,
          responsable_nuevo_nombre: nuevoResponsableNombre,
          changed_by: authResult.session?.user?.email ?? null,
        })
      }
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/items/:id] Error:', e)
    return Response.json({ error: 'Error actualizando responsable' }, { status: 500 })
  }
}
