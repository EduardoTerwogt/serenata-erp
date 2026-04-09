import { requireAnySection } from '@/lib/api-auth'
import { driveService } from '@/lib/integrations/google/drive'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const { response } = await requireAnySection(['cotizaciones'])
  if (response) return response

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

  // Look up cotización and its current drive_file_id (server-side source of truth)
  const { data: cotizacion, error: fetchError } = await supabaseAdmin
    .from('cotizaciones')
    .select('id, drive_file_id')
    .eq('id', cotizacionId)
    .single()

  if (fetchError || !cotizacion) {
    return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  try {
    let result

    if (cotizacion.drive_file_id) {
      // Update existing file in Drive (avoids duplicates)
      result = await driveService.updateFile({
        fileId: cotizacion.drive_file_id,
        contentBase64,
      })
      // If update fails (file deleted from Drive), fall back to new upload
      if (!result) {
        result = await driveService.uploadPdf({ fileName, contentBase64 })
      }
    } else {
      result = await driveService.uploadPdf({ fileName, contentBase64 })
    }

    if (!result) {
      return Response.json({ error: 'Google Drive no está configurado' }, { status: 503 })
    }

    // Persist drive_file_id on the cotización
    const { error: updateError } = await supabaseAdmin
      .from('cotizaciones')
      .update({ drive_file_id: result.fileId })
      .eq('id', cotizacionId)

    if (updateError) {
      console.error('Error saving drive_file_id:', updateError)
      // File was uploaded but DB not updated — return result anyway
      // (next upload will create a new file, but won't lose the current one)
    }

    return Response.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('Drive upload error:', message)
    return Response.json({ error: 'Error subiendo archivo a Google Drive' }, { status: 500 })
  }
}
