import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar, createPagoComprobante, getPagosComprobantesByCuenta, createDocumentoCuentaCobrar } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { calcularEstadoCuentaCobrarDetallado, calcularSaldoPendiente } from '@/lib/server/cuentas/status'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const monto = parseFloat(formData.get('monto') as string)
    const tipoPago = formData.get('tipo_pago') as string
    const fechaPago = formData.get('fecha_pago') as string
    const comprobante = formData.get('comprobante') as File | null
    const notas = formData.get('notas') as string | null

    if (!monto || monto <= 0) {
      return Response.json({ error: 'Monto debe ser mayor a 0' }, { status: 400 })
    }

    if (!tipoPago || !['TRANSFERENCIA', 'EFECTIVO'].includes(tipoPago)) {
      return Response.json({ error: 'Tipo de pago inválido (TRANSFERENCIA o EFECTIVO)' }, { status: 400 })
    }

    if (!fechaPago) {
      return Response.json({ error: 'Fecha de pago requerida' }, { status: 400 })
    }

    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    }

    const pagosActuales = await getPagosComprobantesByCuenta(id)
    const totalPagado = pagosActuales.reduce((sum, p) => sum + p.monto, 0)
    const nuevoTotal = totalPagado + monto

    if (nuevoTotal > cuenta.monto_total) {
      return Response.json(
        { error: `Monto excede el total de la cuenta. Total: $${cuenta.monto_total}, ya pagado: $${totalPagado}, nuevo: $${nuevoTotal}` },
        { status: 400 }
      )
    }

    let comprobanteUrl = null
    if (comprobante) {
      const googleEnv = getGoogleEnv()
      if (!googleEnv) {
        return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
      }

      const folderPath = `/Por Cobrar/${cuenta.folio || cuenta.cotizacion_id}`
      const ext = comprobante.name.includes('.') ? comprobante.name.split('.').pop() : 'pdf'
      const fileName = `comprobante_pago_${new Date().getTime()}.${ext}`
      comprobanteUrl = await uploadFileToDrive(comprobante, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

      await createDocumentoCuentaCobrar({
        cuentas_cobrar_id: id,
        tipo: 'OTRO',
        archivo_url: comprobanteUrl,
        archivo_nombre: comprobante.name,
        archivo_size: comprobante.size,
      })
    }

    const pagoCobrar = await createPagoComprobante({
      cuentas_cobrar_id: id,
      monto,
      tipo_pago: tipoPago as any,
      fecha_pago: fechaPago,
      comprobante_url: comprobanteUrl || '',
      archivo_nombre: comprobante?.name || `pago_${fechaPago}`,
      notas,
    })

    const nuevoEstado = calcularEstadoCuentaCobrarDetallado({
      montoPagado: nuevoTotal,
      montoTotal: cuenta.monto_total,
      fechaVencimiento: cuenta.fecha_vencimiento,
      isFacturada: true,
    })

    const cuentaActualizada = await updateCuentaCobrar(id, {
      estado: nuevoEstado,
      monto_pagado: nuevoTotal,
      fecha_pago: nuevoEstado === 'PAGADO' ? fechaPago : cuenta.fecha_pago,
    })

    triggerSheetsSync('cuentas_cobrar')

    return Response.json({
      success: true,
      pago: pagoCobrar,
      cuenta: cuentaActualizada,
      resumen: {
        monto_pagado_total: nuevoTotal,
        monto_pendiente: calcularSaldoPendiente(cuenta.monto_total, nuevoTotal),
        estado_nuevo: nuevoEstado,
      },
    })
  } catch (error) {
    console.error('[cuentas-cobrar/registrar-pago]', error)
    return Response.json({ error: 'Error registrando pago' }, { status: 500 })
  }
}
