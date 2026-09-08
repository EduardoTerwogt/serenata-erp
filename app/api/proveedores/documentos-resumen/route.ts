import { requireAnySection } from '@/lib/api-auth'
import { getProveedores, getAllProveedorDocumentos } from '@/lib/db'
import { TipoDocumentoProveedor } from '@/lib/types'

// Mismo catálogo que TIPOS_VALIDOS en app/api/portal/documentos/route.ts --
// un proveedor tiene documentación "completa" cuando subió los 4.
const TIPOS_REQUERIDOS: TipoDocumentoProveedor[] = [
  'CONSTANCIA_SITUACION_FISCAL',
  'INE',
  'COMPROBANTE_DOMICILIO',
  'COMPROBANTE_BANCARIO',
]

export async function GET() {
  const authResult = await requireAnySection(['responsables', 'cotizaciones'])
  if (authResult.response) return authResult.response

  try {
    const [proveedores, documentos] = await Promise.all([
      getProveedores(),
      getAllProveedorDocumentos(),
    ])

    const documentosPorProveedor = new Map<string, typeof documentos>()
    for (const doc of documentos) {
      const actuales = documentosPorProveedor.get(doc.proveedor_id) ?? []
      actuales.push(doc)
      documentosPorProveedor.set(doc.proveedor_id, actuales)
    }

    let incompleta = 0
    let conErrores = 0

    for (const proveedor of proveedores) {
      // Solo cuenta a quien ya inició el registro en el portal -- "sin
      // registrar" ya se muestra aparte con portal_estado.
      if (!proveedor.portal_estado) continue

      const docs = documentosPorProveedor.get(proveedor.id) ?? []
      const tiposSubidos = new Set(docs.map(d => d.tipo))
      const completa = TIPOS_REQUERIDOS.every(tipo => tiposSubidos.has(tipo))
      if (!completa) incompleta++
      if (docs.some(d => d.estado_validacion === 'revision')) conErrores++
    }

    return Response.json({ incompleta, conErrores })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo resumen de documentación' }, { status: 500 })
  }
}
