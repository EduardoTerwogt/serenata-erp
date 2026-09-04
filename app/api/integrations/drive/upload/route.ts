import { requireAnySection } from '@/lib/api-auth'
import { driveService } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { supabaseAdmin } from '@/lib/supabase'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function POST(req: Request) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const { response } = await requireAnySection(['cotizaciones'])
  if (response) {
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

  // ── 3. Check Google configuration ────────────────────────────────────────
  const googleEnv = getGoogleEnv()
  if (!googleEnv) {
    console.error('[Drive/upload] Google not configured — getGoogleEnv() returned null. Check env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID')
    return Response.json({ error: 'Google Drive no está configurado (env vars faltantes)' }, { status: 503 })
  }

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

  // ── 5. Upload or update in Drive ─────────────────────────────────────────
  const isNewUpload = !cotizacion.drive_file_id
  try {
    let result

    if (cotizacion.drive_file_id) {
      result = await driveService.updateFile({
        fileId: cotizacion.drive_file_id,
        contentBase64,
      })
      // Fallback: file may have been deleted manually from Drive
      if (!result) {
        result = await driveService.uploadPdf({ fileName, contentBase64 })
      }
    } else {
      result = await driveService.uploadPdf({ fileName, contentBase64 })
    }

    if (!result) {
      console.error('[Drive/upload] driveService returned null — credentials may be invalid or folder inaccessible')
      return Response.json({ error: 'Drive upload returned null — revisar credenciales y permisos de carpeta' }, { status: 503 })
    }

    // ── 6. Persist drive_file_id ──────────────────────────────────────────
    // For new uploads: only set if still null — prevents duplicate Drive files
    // in the rare case of concurrent uploads for the same cotización.
    const baseQuery = supabaseAdmin.from('cotizaciones').update({ drive_file_id: result.fileId }).eq('id', cotizacionId)
    const { error: updateError } = isNewUpload
      ? await baseQuery.is('drive_file_id', null)
      : await baseQuery

    if (updateError) {
      console.error('[Drive/upload] Supabase update failed:', updateError.message)
      return Response.json(
        { error: 'PDF subido a Drive pero no se pudo guardar el enlace en la base de datos. Intenta generar el PDF de nuevo.' },
        { status: 500 }
      )
    }

    triggerSheetsSync('cotizaciones')
    return Response.json(result)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[Drive/upload] Exception:', message)
    if (stack) console.error('[Drive/upload] Stack:', stack)
    return Response.json({ error: message }, { status: 500 })
  }
}
