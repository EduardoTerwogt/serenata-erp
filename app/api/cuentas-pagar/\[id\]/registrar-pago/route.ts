import { requireSection } from '@/lib/api-auth'
import { getCuentasPagar, updateCuentaPagar, createDocumentoCuentaPagar } from '@/lib/db'
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
    const comprobante = formData.get('comprobante') as File | null

    // Validaciones
    if (!monto || monto <= 0) {
      return Response.json(
        { error: 'Monto debe ser mayor a 0' },
        { status: 400 }
      )
    }

    // Obtener cuenta
    const cuentas = await getCuentasPagar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por pagar no encontrada' },
        { status: 404 }
      )
    }

    // Validar que no exceda el monto
    const totalPagado = (cuenta.monto_pagado || 0) + monto
    if (totalPagado > cuenta.x_pagar) {
      return Response.json(
        { error: `Monto excede el total a pagar. Total: $${cuenta.x_pagar}, ya pagado: $${cuenta.monto_pagado || 0}, nuevo: $${totalPagado}` },
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

      const folderPath = `/Por Pagar/${cuenta.folio || id}`
      const fileName = `comprobante_pago_${new Date().getTime()}.${comprobante.type.split('/')[1]}`
      comprobanteUrl = await uploadFileToDrive(comprobante, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

      // Crear documento en BD
      await createDocumentoCuentaPagar({
        cuentas_pagar_id: id,
        tipo: 'COMPROBANTE_PAGO',
        archivo_url: comprobanteUrl,
        archivo_nombre: comprobante.name,
      })
    }

    // Determinar nuevo estado
    const nuevoEstado = totalPagado >= cuenta.x_pagar ? 'PAGADO' : cuenta.estado

    // Actualizar cuenta
    const cuentaActualizada = await updateCuentaPagar(id, {
      estado: nuevoEstado,
      monto_pagado: totalPagado,
      fecha_pago: nuevoEstado === 'PAGADO' ? new Date().toISOString().split('T')[0] : cuenta.fecha_pago,
    })

    // Trigger sincronización
    triggerSheetsSync('cuentas_pagar')

    return Response.json({
      success: true,
      cuenta: cuentaActualizada,
      resumen: {
        monto_pagado_total: totalPagado,
        saldo_pendiente: cuenta.x_pagar - totalPagado,
        estado_nuevo: nuevoEstado,
        comprobante_url: comprobanteUrl,
      },
    })
  } catch (error) {
    console.error('[cuentas-pagar/registrar-pago]', error)
    return Response.json(
      { error: 'Error registrando pago' },
      { status: 500 }
    )
  }
}
