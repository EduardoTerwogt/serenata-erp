import { requireSection } from '@/lib/api-auth'
import { getProyectoById } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'

const ROUTE = 'POST /api/cuentas-pagar/pagos/[pagoId]/comprobante'

const MENSAJES: Record<string, string> = {
  comprobante_existente: 'Este pago ya tiene comprobante. Reemplazarlo es una corrección con las cuentas reabiertas.',
  pago_anulado: 'El pago está anulado.',
  comprobante_requerido: 'Falta el comprobante.',
}
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']

/**
 * Rediseño de Cuentas B5 (A1, supuesto 17): adjunta el comprobante a un pago
 * a proveedor ya registrado sin él ("Adjuntar" en el historial). El archivo se
 * sube a Drive y la RPC lo guarda en el pago, solo si todavía no tenía uno.
 */
export async function POST(request: Request, props: { params: Promise<{ pagoId: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { pagoId } = await props.params
    if (!/^[0-9a-f-]{36}$/i.test(pagoId)) return Response.json({ error: 'pago_id inválido' }, { status: 400 })
    const formData = await request.formData()
    const archivo = formData.get('comprobante')
    if (!(archivo instanceof File)) return Response.json({ error: 'Se requiere el comprobante' }, { status: 400 })
    if (!TIPOS.includes(archivo.type) && !/\.(pdf|jpe?g|png|heic|heif|webp)$/i.test(archivo.name)) {
      return Response.json({ error: 'El comprobante debe ser PDF o imagen' }, { status: 400 })
    }
    if (archivo.size > MAX_FILE_SIZE) return Response.json({ error: MENSAJE_LIMITE }, { status: 400 })

    const { data: pago, error: errPago } = await supabaseAdmin
      .from('pagos_cuentas_pagar')
      .select('id, grupo_id, cuenta_pagar_id, comprobante_url, anulado_at')
      .eq('id', pagoId)
      .maybeSingle()
    if (errPago) throw errPago
    if (!pago) return Response.json({ error: 'Pago no encontrado' }, { status: 404 })
    if (pago.comprobante_url) return Response.json({ error: 'comprobante_existente', message: MENSAJES.comprobante_existente }, { status: 409 })

    const destino = pago.grupo_id
      ? await supabaseAdmin.from('cuentas_pagar_grupos').select('proyecto_id').eq('id', pago.grupo_id).maybeSingle()
      : await supabaseAdmin.from('cuentas_pagar').select('proyecto_id, cotizacion_id').eq('id', pago.cuenta_pagar_id).maybeSingle()
    if (destino.error) throw destino.error
    const proyectoId: string | null = destino.data?.proyecto_id ?? null
    const proyecto = proyectoId ? await getProyectoById(proyectoId) : null

    const googleEnv = getGoogleEnv()
    if (!googleEnv) return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    const carpeta = `/Por Pagar/${proyectoId ?? 'sin-proyecto'}${proyecto ? `-${proyecto.proyecto}` : ''}`
    const url = await uploadFileToDrive(archivo, carpeta, archivo.name, resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined))

    const { data, error } = await supabaseAdmin.rpc('adjuntar_comprobante_pago_proveedor', {
      p_pago_id: pagoId,
      p_comprobante_url: url,
      p_archivo_nombre: archivo.name,
      p_usuario: authResult.session?.user?.email ?? null,
    })
    if (error) {
      const requestId = newRequestId()
      const detail = error.message ?? ''
      const codigo = Object.keys(MENSAJES).find((k) => detail.startsWith(k))
      // El archivo ya quedó en Drive: se registra para poder limpiarlo.
      logStructured({ requestId, route: ROUTE, level: codigo ? 'warn' : 'error', message: codigo ?? 'rpc_adjuntar_comprobante_error', detail: `${detail} (archivo huérfano: ${url})` })
      if (codigo) return Response.json({ error: codigo, message: MENSAJES[codigo], requestId }, { status: 409 })
      return Response.json({ error: 'No se pudo adjuntar el comprobante', requestId }, { status: 400 })
    }
    return Response.json({ success: true, resultado: data })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
