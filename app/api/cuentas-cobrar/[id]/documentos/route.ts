import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, getDocumentosCuentaCobrar, getPagosComprobantesByCuenta } from '@/lib/db'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params

    // Obtener cuenta
    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por cobrar no encontrada' },
        { status: 404 }
      )
    }

    // Obtener documentos
    const documentos = await getDocumentosCuentaCobrar(id)

    // Obtener comprobantes de pago
    const pagos = await getPagosComprobantesByCuenta(id)

    // Organizar respuesta
    const respuesta = {
      cuenta: {
        id: cuenta.id,
        folio: cuenta.folio,
        cliente: cuenta.cliente,
        proyecto: cuenta.proyecto,
        monto_total: cuenta.monto_total,
        estado: cuenta.estado,
      },
      documentos: documentos.map(d => ({
        id: d.id,
        tipo: d.tipo,
        archivo_url: d.archivo_url,
        archivo_nombre: d.archivo_nombre,
        archivo_size: d.archivo_size,
        fecha_carga: d.fecha_carga,
      })),
      pagos: pagos.map(p => ({
        id: p.id,
        monto: p.monto,
        tipo_pago: p.tipo_pago,
        fecha_pago: p.fecha_pago,
        comprobante_url: p.comprobante_url,
        archivo_nombre: p.archivo_nombre,
        notas: p.notas,
        created_at: p.created_at,
      })),
      resumen: {
        total_pagado: pagos.reduce((sum, p) => sum + p.monto, 0),
        saldo_pendiente: cuenta.monto_total - (cuenta.monto_pagado || 0),
      },
    }

    return Response.json(respuesta)
  } catch (error) {
    console.error('[cuentas-cobrar/documentos]', error)
    return Response.json(
      { error: 'Error obteniendo documentos' },
      { status: 500 }
    )
  }
}
