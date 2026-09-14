import { requireAnySection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

// EF-3 3B-12: el conteo (incompleta/conErrores) se mueve a la RPC
// proveedor_documentos_resumen (db/migrations/20260914_proveedor_documentos_resumen.sql)
// -- antes traía todas las filas de proveedor_documentos y cruzaba con
// getProveedores() en Node. Paridad 100% verificada en vivo contra
// serenata-erp-test, incluidos los casos de documentos duplicados del
// mismo tipo, documentada en el PR.
export async function GET() {
  const authResult = await requireAnySection(['responsables', 'cotizaciones'])
  if (authResult.response) return authResult.response

  try {
    const { data, error } = await supabaseAdmin.rpc('proveedor_documentos_resumen')
    if (error) throw error

    return Response.json(data)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo resumen de documentación' }, { status: 500 })
  }
}
