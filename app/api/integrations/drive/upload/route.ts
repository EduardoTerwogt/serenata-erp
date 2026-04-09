import { requireAnySection } from '@/lib/api-auth'
import { driveService } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const { response } = await requireAnySection(['cotizaciones'])
  if (response) {
    console.log('[Drive/upload] Auth rejected — status', response.status)
    return response
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: { cotizacionId?: string; fileName?: string; contentBase64?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { cotizacionId, fileName, contentBase64 } = body

  if (!cotizacionId || !fileName || !contentBase64) {
    return Response.json(
      { error: 'Campos requeridos: cotizacionId, fileName, contentBase64' },
      { status: 400 },
    )
  }

  console.log('[Drive/upload] Received request — cotizacionId:', cotizacionId, '— fileName:', fileName, '— base64 length:', contentBase64.length)

  // ── 3. Check Google configuration ────────────────────────────────────────
  const googleEnv = getGoogleEnv()
  if (!googleEnv) {
    console.error('[Drive/upload] Google not configured — getGoogleEnv() returned null. Check env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID')
    return Response.json({ error: 'Google Drive no está configurado (env vars faltantes)' }, { status: 503 })
  }
  console.log('[Drive/upload] Google configured — folder:', googleEnv.driveFolderId)

  // ── 4. Fetch cotización ───────────────────────────────────────────────────
  const { data: cotizacion, error: fetchError } = await supabaseAdmin
    .from('cotizaciones')
    .select('id, drive_file_id')
    .eq('id', cotizacionId)
    .single()

  if (fetchError || !cotizacion) {
    console.error('[Drive/upload] Cotización not found:', fetchError?.message)
    return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  console.log('[Drive/upload] Cotización found — existing drive_file_id:', cotizacion.drive_file_id ?? 'null (new upload)')

  // ── 5. Upload or update in Drive ─────────────────────────────────────────
  try {
    let result

    if (cotizacion.drive_file_id) {
      console.log('[Drive/upload] Updating existing file:', cotizacion.drive_file_id)
      result = await driveService.updateFile({
        fileId: cotizacion.drive_file_id,
        contentBase64,
      })
      // Fallback: file may have been deleted manually from Drive
      if (!result) {
        console.log('[Drive/upload] updateFile returned null — falling back to uploadPdf')
        result = await driveService.uploadPdf({ fileName, contentBase64 })
      }
    } else {
      console.log('[Drive/upload] Uploading new file')
      result = await driveService.uploadPdf({ fileName, contentBase64 })
    }

    if (!result) {
      console.error('[Drive/upload] driveService returned null — credentials may be invalid or folder inaccessible')
      return Response.json({ error: 'Drive upload returned null — revisar credenciales y permisos de carpeta' }, { status: 503 })
    }

    console.log('[Drive/upload] Drive success — fileId:', result.fileId)

    // ── 6. Persist drive_file_id ──────────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('cotizaciones')
      .update({ drive_file_id: result.fileId })
      .eq('id', cotizacionId)

    if (updateError) {
      console.error('[Drive/upload] Supabase update failed:', updateError.message)
      // File is in Drive but DB not updated — not critical, return success anyway
    } else {
      console.log('[Drive/upload] drive_file_id saved in Supabase ✓')
    }

    return Response.json(result)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[Drive/upload] Exception:', message)
    if (stack) console.error('[Drive/upload] Stack:', stack)
    return Response.json({ error: message }, { status: 500 })
  }
}
