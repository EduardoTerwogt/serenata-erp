import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar, createDocumentoCuentaCobrar, getDocumentosCuentaCobrar, createPagoComprobante, getPagosComprobantesByCuenta, calcularEstadoCuentaCobrar } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    // Obtener datos
    const monto = parseFloat(formData.get('monto') as string)
    const tipoPago = (formData.get('tipo_pago') as string) || 'TRANSFERENCIA'
    const fechaPago = (formData.get('fecha_pago') as string) || new Date().toISOString().split('T')[0]
    const comprobante = formData.get('comprobante') as File | null

    // Validaciones
    if (!monto || monto <= 0) {
      return Response.json(
        { error: 'Monto debe ser mayor a 0' },
        { status: 400 }
      )
    }

    // Obtener cuenta
    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por cobrar no encontrada' },
        { status: 404 }
      )
    }

    // Obtener pagos anteriores
    const pagosPrevios = await getPagosComprobantesByCuenta(id)
    const montoPagoAnterior = pagosPrevios.reduce((sum, p) => sum + p.monto, 0)
    const totalPagado = montoPagoAnterior + monto

    // Validar que no exceda el monto
    if (totalPagado > cuenta.monto_total) {
      return Response.json(
        { error: `Monto excede el total. Total: $${cuenta.monto_total}, ya pagado: $${montoPagoAnterior}, nuevo: $${totalPagado}` },
        { status: 400 }
      )
    }

    // Subir comprobante si existe
    let comprobanteUrl = null
    if (comprobante) {
      const googleEnv = getGoogleEnv()
      if (!googleEnv) {
        return Response.json(
          { error: 'Google Drive no configurado' },
          { status: 500 }
        )
      }

      const folderPath = `/Por Cobrar/${cuenta.folio || id}`
      const fileName = `comprobante_pago_${new Date().getTime()}.${comprobante.type.split('/')[1]}`
      comprobanteUrl = await uploadFileToDrive(comprobante, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)
    }

    // Crear pago
    await createPagoComprobante({
      cuentas_cobrar_id: id,
      monto,
      tipo_pago: tipoPago as any,
      fecha_pago: fechaPago,
      comprobante_url: comprobanteUrl || '',
      archivo_nombre: comprobante?.name || `pago_${fechaPago}`,
    })

    // Calcular nuevo estado
    const nuevoEstado = calcularEstadoCuentaCobrar(totalPagado, cuenta.monto_total)

    // Actualizar cuenta
    const cuentaActualizada = await updateCuentaCobrar(id, {
      estado: nuevoEstado as any,
      monto_pagado: totalPagado,
      fecha_pago: nuevoEstado === 'PAGADO' ? fechaPago : cuenta.fecha_pago,
    })

    // Trigger sincronización
    triggerSheetsSync('cuentas_cobrar')

    return Response.json({
      success: true,
      cuenta: cuentaActualizada,
      resumen: {
        monto_pagado_total: totalPagado,
        saldo_pendiente: cuenta.monto_total - totalPagado,
        estado_nuevo: nuevoEstado,
        comprobante_url: comprobanteUrl,
      },
    })
  } catch (error) {
    console.error('[cuentas-cobrar/registrar-pago]', error)
    return Response.json(
      { error: 'Error registrando pago' },
      { status: 500 }
    )
  }
}
