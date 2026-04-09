import { requireSection } from '@/lib/api-auth'
import { getCuentasPagar, getDocumentosCuentaPagar } from '@/lib/db'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params

    // Obtener cuenta
    const cuentas = await getCuentasPagar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por pagar no encontrada' },
        { status: 404 }
      )
    }

    // Obtener documentos
    const documentos = await getDocumentosCuentaPagar(id)

    return Response.json({
      cuenta: {
        id: cuenta.id,
        folio: cuenta.folio,
        responsable_nombre: cuenta.responsable_nombre,
        x_pagar: cuenta.x_pagar,
        estado: cuenta.estado,
      },
      documentos: documentos.map(d => ({
        id: d.id,
        tipo: d.tipo,
        archivo_url: d.archivo_url,
        archivo_nombre: d.archivo_nombre,
        fecha_carga: d.fecha_carga,
      })),
      resumen: {
        monto_pagado: cuenta.monto_pagado || 0,
        saldo_pendiente: cuenta.x_pagar - (cuenta.monto_pagado || 0),
      },
    })
  } catch (error) {
    console.error('[cuentas-pagar/documentos]', error)
    return Response.json(
      { error: 'Error obteniendo documentos' },
      { status: 500 }
    )
  }
}
